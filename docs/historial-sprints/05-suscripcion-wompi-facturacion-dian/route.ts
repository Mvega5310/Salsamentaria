import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyWebhookSignature } from "@/lib/billing/wompi";

/**
 * Wompi llama esta URL cuando el estado de una transacción cambia
 * (transaction.updated). Debe registrarse por separado en el dashboard de
 * Wompi para sandbox y para producción — ver docs.wompi.co/docs/colombia/eventos.
 *
 * Usa el service role porque este endpoint no tiene sesión de usuario: la
 * autenticidad la garantiza la firma de Wompi, no Supabase Auth.
 */
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const payload = await req.json();

  if (payload.event !== "transaction.updated") {
    return NextResponse.json({ received: true });
  }

  if (!verifyWebhookSignature(payload)) {
    // Firma inválida: no confiamos en este evento. Podría ser un intento de
    // simular un pago exitoso sin haber pagado.
    return NextResponse.json({ error: "Firma inválida" }, { status: 400 });
  }

  const tx = payload.data.transaction as {
    id: string;
    status: string;
    reference: string;
    amount_in_cents: number;
  };

  // Nuestras referencias de cobro llevan el patrón sub-<subscriptionId>-<ts>
  const match = tx.reference.match(/^sub-([0-9a-f-]{36})-/);
  if (!match) return NextResponse.json({ received: true });

  const subscriptionId = match[1];
  const paid = tx.status === "APPROVED";

  // El registro del cobro nace aquí — es la única escritura de verdad sobre
  // dinero recibido; el cliente nunca inserta en platform_invoices.
  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("tenant_id")
    .eq("id", subscriptionId)
    .maybeSingle();

  if (sub) {
    await supabaseAdmin.from("platform_invoices").upsert(
      {
        tenant_id: sub.tenant_id,
        subscription_id: subscriptionId,
        concept: "Suscripción mensual — cobro automático",
        amount: tx.amount_in_cents / 100,
        status: paid ? "pagado" : "fallido",
        provider_ref: tx.id,
        paid_at: paid ? new Date().toISOString() : null,
      },
      { onConflict: "provider_ref" },
    );
  }

  if (paid) {
    await supabaseAdmin
      .from("subscriptions")
      .update({
        status: "activa",
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", subscriptionId);
  } else {
    await supabaseAdmin
      .from("subscriptions")
      .update({ status: "vencida" })
      .eq("id", subscriptionId);
  }

  return NextResponse.json({ received: true });
}
