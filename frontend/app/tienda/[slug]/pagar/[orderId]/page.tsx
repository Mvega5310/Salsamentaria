import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildHostedCheckoutParams } from "@/lib/billing/wompi";
import { cop } from "@/lib/format";
import type { StorefrontOrderTotal } from "@/lib/storefront/types";

export const dynamic = "force-dynamic";

/** Escapa comillas para uso seguro dentro de atributos HTML. */
function attr(v: string) {
  return v.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

export default async function PagarPage({
  params,
}: {
  params: { slug: string; orderId: string };
}) {
  const supabase = createClient();
  const { data } = await supabase
    .rpc("get_storefront_order_total", { p_order_id: params.orderId })
    .maybeSingle();
  // El proyecto no incluye el tipo `Database` generado por Supabase, así
  // que `.rpc()` infiere `{}`; la forma real la define la migración 17.
  const order = data as StorefrontOrderTotal | null;

  if (!order || order.tenant_slug !== params.slug) notFound();

  // Ya está pagado (por ejemplo, el cliente volvió atrás y reabrió el
  // enlace) — no mostrar el checkout de nuevo, solo el estado.
  if (order.payment_status === "pagado") {
    redirect(`/tienda/${params.slug}/pedido/${params.orderId}`);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  // Cada intento de pago necesita una referencia nueva — Wompi no permite
  // reusar una referencia ya utilizada, así que un reintento tras un pago
  // fallido debe generar otra (por eso se calcula en cada carga de esta
  // página, no una sola vez al crear el pedido).
  const reference = `pwa-${params.orderId}-${Date.now()}`;

  const checkout = buildHostedCheckoutParams({
    reference,
    amountInCents: Math.round(Number(order.total) * 100),
    redirectUrl: `${siteUrl}/tienda/${params.slug}/pedido/${params.orderId}`,
  });

  // Snippet exacto que documenta Wompi (formulario + <script> con
  // data-signature:integrity) — JSX no admite nombres de atributo con ":",
  // así que se inyecta como HTML ya escapado. Todos los valores vienen del
  // servidor (RPC validado, env vars, orderId ya confirmado contra la BD),
  // nunca de texto libre del usuario.
  const widgetHtml = `
    <form>
      <script
        src="https://checkout.wompi.co/widget.js"
        data-public-key="${attr(checkout.publicKey)}"
        data-currency="${attr(checkout.currency)}"
        data-amount-in-cents="${checkout.amountInCents}"
        data-reference="${attr(checkout.reference)}"
        data-signature:integrity="${attr(checkout.signature)}"
        data-redirect-url="${attr(checkout.redirectUrl)}">
      </script>
    </form>
  `;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
        Total a pagar
      </div>
      <div className="mb-6 font-display text-[36px] font-extrabold tracking-tight text-salsa">
        {cop(Number(order.total))}
      </div>
      <div dangerouslySetInnerHTML={{ __html: widgetHtml }} />
      <p className="mt-6 max-w-[280px] text-[12px] text-muted">
        Se abre la página segura de Wompi. Cuando termines, vuelves aquí
        automáticamente.
      </p>
    </main>
  );
}
