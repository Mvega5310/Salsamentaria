import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyWebhookSignature } from "@/lib/billing/wompi";

/**
 * Wompi llama esta URL cuando el estado de una transacción cambia
 * (transaction.updated). Debe registrarse por separado en el dashboard de
 * Wompi para sandbox y para producción — ver docs.wompi.co/docs/colombia/eventos.
 *
 * Usa el service role porque este endpoint no tiene sesión de usuario: la
 * autenticidad la garantiza la firma de Wompi, no Supabase Auth.
 */
export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
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
    payment_method_type?: string;
  };

  const paid = tx.status === "APPROVED";

  // Dos tipos de referencia posibles: sub-<subscriptionId>-<ts> (cobro de
  // suscripción del SaaS) o pwa-<orderId>-<ts> (pago de un pedido de la
  // tienda pública). Cada una actualiza una parte distinta del sistema.
  const subMatch = tx.reference.match(/^sub-([0-9a-f-]{36})-/);
  const orderMatch = tx.reference.match(/^pwa-([0-9a-f-]{36})-/);

  if (orderMatch) {
    const orderId = orderMatch[1];

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("tenant_id")
      .eq("id", orderId)
      .maybeSingle();

    if (order) {
      await supabaseAdmin
        .from("orders")
        .update({ payment_status: paid ? "pagado" : "fallido" })
        .eq("id", orderId);

      // El registro del pago nace aquí — igual que con la suscripción, el
      // cliente (anon) nunca escribe en `payments` directamente.
      await supabaseAdmin.from("payments").upsert(
        {
          tenant_id: order.tenant_id,
          order_id: orderId,
          method: "wompi_online",
          amount: tx.amount_in_cents / 100,
          status: paid ? "pagado" : "fallido",
          provider_ref: tx.id,
        },
        { onConflict: "provider_ref" },
      );
    }
    return NextResponse.json({ received: true });
  }

  if (!subMatch) return NextResponse.json({ received: true });

  const subscriptionId = subMatch[1];

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
