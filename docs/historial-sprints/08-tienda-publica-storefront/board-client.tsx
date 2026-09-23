"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { BoardOrder, OrderStatus } from "@/lib/types";
import { cop } from "@/lib/format";
import { advanceOrder } from "./actions";

const BADGE: Record<OrderStatus, { label: string; bg: string; fg: string; accent: string }> = {
  recibido: { label: "Recibido", bg: "#F3E9DB", fg: "#6B5A4E", accent: "#E2D3C0" },
  confirmado: { label: "Confirmado", bg: "#FAEBD5", fg: "#96601A", accent: "#D98B2B" },
  preparando: { label: "Preparando", bg: "#F6DED6", fg: "#8A2B14", accent: "#B23A1E" },
  en_camino: { label: "En camino", bg: "#DFEAE2", fg: "#2E5340", accent: "#3E6B52" },
  entregado: { label: "Entregado", bg: "#3E6B52", fg: "#FBF6EF", accent: "#3E6B52" },
  cancelado: { label: "Cancelado", bg: "#F3E9DB", fg: "#8A7A6E", accent: "#E2D3C0" },
};

const NEXT_LABEL: Partial<Record<OrderStatus, string>> = {
  recibido: "Avanzar a Confirmado",
  confirmado: "Avanzar a Preparando",
  preparando: "Avanzar a En camino",
  en_camino: "Marcar entregado",
};

const FULFILLMENT_LABEL: Record<BoardOrder["fulfillment"], string> = {
  domicilio: "Domicilio",
  recoger: "Recoger",
  mostrador: "Mostrador",
};

export default function BoardClient({ orders }: { orders: BoardOrder[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function advance(o: BoardOrder) {
    startTransition(async () => {
      await advanceOrder(o.id, o.status);
      router.refresh();
    });
  }

  return (
    <div className="p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="font-display text-[24px] font-extrabold tracking-tight text-ink">
            Tablero de pedidos
          </h1>
          <p className="mt-1 text-[12.5px] text-muted">
            {orders.length} {orders.length === 1 ? "pedido activo" : "pedidos activos"}
          </p>
        </div>
        <button
          onClick={() => router.refresh()}
          className="rounded-full border border-borde bg-crema px-4 py-2 text-[12.5px] font-semibold text-muted hover:bg-crema2"
        >
          Actualizar
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-xl3 border border-borde bg-crema py-16 text-center text-[13px] text-muted">
          No hay pedidos activos ahora mismo.
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {orders.map((o) => {
            const b = BADGE[o.status];
            return (
              <div
                key={o.id}
                className="flex flex-col gap-3 rounded-xl2 border border-borde bg-white p-4"
                style={{ borderLeft: `5px solid ${b.accent}` }}
              >
                <div className="flex items-center justify-between">
                  <div className="font-display text-[20px] font-extrabold tracking-tight text-ink">
                    {o.code}
                  </div>
                  <span
                    className="rounded-full px-3 py-1.5 text-[11.5px] font-bold"
                    style={{ background: b.bg, color: b.fg }}
                  >
                    {b.label}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-crema2 px-2.5 py-1.5 text-[11px] font-bold text-muted">
                    {FULFILLMENT_LABEL[o.fulfillment]}
                  </span>
                  {o.channel === "pwa" ? (
                    <span className="rounded-full bg-[#DFEAE2] px-2.5 py-1.5 text-[11px] font-bold text-[#2E5340]">
                      Pedido en línea
                    </span>
                  ) : null}
                  {o.needs_invoice ? (
                    <span className="rounded-full bg-salsa px-2.5 py-1.5 text-[11px] font-bold text-crema">
                      Requiere DIAN
                    </span>
                  ) : null}
                </div>

                <div className="min-h-[34px] text-[12.5px] leading-relaxed text-muted">
                  {o.delivery_address ?? o.contact_name ?? "Venta de mostrador"}
                </div>

                <div className="flex items-baseline justify-between">
                  <span className="text-[11.5px] text-muted">
                    {o.item_count} {o.item_count === 1 ? "ítem" : "ítems"}
                  </span>
                  <span className="tabular text-[20px] font-bold text-salsa">
                    {cop(o.total)}
                  </span>
                </div>

                {NEXT_LABEL[o.status] ? (
                  <button
                    disabled={pending}
                    onClick={() => advance(o)}
                    className="h-[50px] rounded-xl2 bg-ink text-[13px] font-bold text-crema hover:bg-salsa disabled:opacity-50"
                  >
                    {NEXT_LABEL[o.status]}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
