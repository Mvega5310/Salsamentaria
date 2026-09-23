import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { chargePaymentSource } from "@/lib/billing/wompi";

/**
 * Job diario de cobro de suscripciones. Protegido por CRON_SECRET — sin él,
 * cualquiera podría llamar este endpoint y disparar cobros. Configurado en
 * vercel.json para correr una vez al día; Vercel firma la llamada con este
 * mismo secreto en el header Authorization.
 *
 * Este endpoint SOLO inicia el cobro contra Wompi. Nunca marca una
 * suscripción como 'activa' — eso lo hace exclusivamente el webhook
 * (/api/webhooks/wompi) cuando Wompi confirma el resultado real. Si este
 * cron marcara el pago como exitoso por su cuenta, un cobro que Wompi
 * rechaza silenciosamente activaría el servicio sin que nadie haya pagado.
 */
// Lee el header Authorization y llama a Wompi en cada invocación — nunca
// debe optimizarse como estática (Next intentaría ejecutarla en build).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const now = new Date().toISOString();
  const results = { charged: 0, failed: 0, expiredNoPayment: 0 };

  // 1) Pruebas que vencieron sin método de pago → 'vencida', sin intentar cobrar
  const { data: expiredTrials } = await supabaseAdmin
    .from("subscriptions")
    .update({ status: "vencida" })
    .eq("status", "trialing")
    .lte("trial_ends_at", now)
    .is("provider_ref", null)
    .select("id");
  results.expiredNoPayment = expiredTrials?.length ?? 0;

  // 2) Suscripciones con método de pago que ya deben cobrarse:
  //    - en trial pero la prueba ya venció (primer cobro real)
  //    - activas o vencidas cuyo periodo ya terminó (renovación)
  const { data: due } = await supabaseAdmin
    .from("subscriptions")
    .select("id, provider_ref, plan:plans(price)")
    .eq("provider", "wompi")
    .not("provider_ref", "is", null)
    .or(
      `and(status.eq.trialing,trial_ends_at.lte.${now}),and(status.in.(activa,vencida),current_period_end.lte.${now})`,
    );

  for (const sub of due ?? []) {
    const plan = Array.isArray(sub.plan) ? sub.plan[0] : sub.plan;
    const price = Number(plan?.price ?? 0);
    if (price <= 0) continue;

    try {
      await chargePaymentSource({
        paymentSourceId: Number(sub.provider_ref),
        amountInCents: Math.round(price * 100),
        reference: `sub-${sub.id}-${Date.now()}`,
        customerEmail: "facturacion@salsapos.co",
      });
      results.charged++;
    } catch {
      // El webhook, cuando Wompi confirme el rechazo, es quien marca
      // 'vencida'. Aquí solo contamos para el resumen del job.
      results.failed++;
    }
  }

  return NextResponse.json({ ok: true, ...results, checkedAt: now });
}
