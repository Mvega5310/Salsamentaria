import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cop } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  recibido: "Recibido",
  confirmado: "Confirmado",
  preparando: "Preparando",
  en_camino: "En camino",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

export default async function OrderStatusPage({
  params,
}: {
  params: { slug: string; orderId: string };
}) {
  const supabase = createClient();
  const { data } = await supabase
    .rpc("get_storefront_order_status", { p_order_id: params.orderId })
    .maybeSingle();

  if (!data) notFound();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
        {data.tenant_name}
      </div>
      <div className="my-2 font-display text-[40px] font-extrabold tracking-tight text-ink">
        {data.code}
      </div>
      <span className="rounded-full bg-crema2 px-4 py-2 text-[13px] font-bold text-ink">
        {STATUS_LABEL[data.status] ?? data.status}
      </span>
      <div className="tabular mt-5 text-[28px] font-bold text-salsa">{cop(Number(data.total))}</div>
      <div className="mt-1 text-[12.5px] text-muted">
        {data.fulfillment === "domicilio" ? "Entrega a domicilio" : "Para recoger en tienda"}
      </div>
      <p className="mt-8 max-w-[280px] text-[12px] text-muted">
        Guarda esta página o el enlace para ver el estado de tu pedido. El
        negocio te contactará al número que dejaste.
      </p>
    </main>
  );
}
