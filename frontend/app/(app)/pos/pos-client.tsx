"use client";

import { useMemo, useState, useTransition } from "react";
import type { Category, Product, TicketLine } from "@/lib/types";
import { cop, qtyLabel, lineBreakdown } from "@/lib/format";
import { createSale, type SaleResult } from "./actions";

type PayMethod = "efectivo" | "tarjeta" | "transferencia" | "nequi";
const PAY_METHODS: { id: PayMethod; label: string }[] = [
  { id: "efectivo", label: "Efectivo" },
  { id: "tarjeta", label: "Tarjeta" },
  { id: "transferencia", label: "Transfer." },
  { id: "nequi", label: "Nequi" },
];

type BuyerDoc = { docType: "CC" | "NIT" | "CE"; docNumber: string; name: string; email: string };
const EMPTY_BUYER: BuyerDoc = { docType: "CC", docNumber: "", name: "", email: "" };

export default function PosClient({
  categories,
  products,
  dianEnabled,
  dianDisabledReason,
}: {
  categories: Category[];
  products: Product[];
  dianEnabled: boolean;
  dianDisabledReason: string | null;
}) {
  const [cat, setCat] = useState<string>("Todos");
  const [query, setQuery] = useState("");
  const [ticket, setTicket] = useState<TicketLine[]>([]);
  const [payment, setPayment] = useState<PayMethod>("efectivo");
  const [buyer, setBuyer] = useState<BuyerDoc>(EMPTY_BUYER);
  const [showBuyerForm, setShowBuyerForm] = useState(false);
  const [result, setResult] = useState<SaleResult | null>(null);
  const [pending, startTransition] = useTransition();

  const catNames = useMemo(
    () => ["Todos", ...categories.map((c) => c.name)],
    [categories],
  );
  const catById = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      const inCat = cat === "Todos" || catById.get(p.category_id ?? "") === cat;
      const inQ = !q || p.name.toLowerCase().includes(q);
      return inCat && inQ;
    });
  }, [products, cat, query, catById]);

  const totals = useMemo(() => {
    let base = 0,
      tax = 0,
      total = 0;
    for (const l of ticket) {
      const b = lineBreakdown(l.product.price, l.qty, l.product.tax_regime);
      base += b.base;
      tax += b.tax;
      total += b.total;
    }
    return { base, tax, total };
  }, [ticket]);

  function addProduct(p: Product) {
    setTicket((t) => {
      const found = t.find((l) => l.product.id === p.id);
      if (found) {
        return t.map((l) =>
          l.product.id === p.id
            ? { ...l, qty: +(l.qty + p.step).toFixed(3) }
            : l,
        );
      }
      return [...t, { product: p, qty: p.step }];
    });
  }

  function changeQty(id: string, dir: number) {
    setTicket((t) =>
      t
        .map((l) =>
          l.product.id === id
            ? { ...l, qty: +(l.qty + dir * l.product.step).toFixed(3) }
            : l,
        )
        .filter((l) => l.qty > 0),
    );
  }

  function removeLine(id: string) {
    setTicket((t) => t.filter((l) => l.product.id !== id));
  }

  function cobrar(needsInvoice: boolean) {
    if (ticket.length === 0) return;
    if (needsInvoice && !showBuyerForm) {
      setShowBuyerForm(true);
      return;
    }
    if (needsInvoice && !buyer.docNumber.trim()) return;

    startTransition(async () => {
      const res = await createSale({
        items: ticket.map((l) => ({ productId: l.product.id, qty: l.qty })),
        needsInvoice,
        paymentMethod: payment,
        buyer: needsInvoice ? buyer : undefined,
      });
      setResult(res);
      if (res.ok) {
        setTicket([]);
        setShowBuyerForm(false);
        setBuyer(EMPTY_BUYER);
      }
    });
  }

  function nuevaVenta() {
    setResult(null);
    setShowBuyerForm(false);
    setBuyer(EMPTY_BUYER);
  }

  return (
    <div className="flex h-[calc(100vh-57px)]">
      {/* Catálogo */}
      <section className="flex min-w-0 flex-1 flex-col p-5">
        <div className="mb-4 flex items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar producto…"
            className="h-[52px] flex-1 rounded-xl2 border border-borde bg-white px-4 text-[15px] outline-none focus:border-salsa"
          />
        </div>

        <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">
          {catNames.map((name) => {
            const active = cat === name;
            return (
              <button
                key={name}
                onClick={() => setCat(name)}
                className={`h-11 flex-none rounded-full border px-4 text-[13px] font-semibold ${
                  active
                    ? "border-ink bg-ink text-crema"
                    : "border-borde bg-crema text-muted"
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>

        <div className="grid flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 overflow-auto pb-4">
          {visible.map((p) => (
            <button
              key={p.id}
              onClick={() => addProduct(p)}
              className="flex flex-col overflow-hidden rounded-xl2 border border-borde bg-white text-left hover:border-salsa"
            >
              <div className="flex h-[86px] w-full items-end bg-[repeating-linear-gradient(135deg,#E9DCCB_0_8px,#F3E9DB_8px_16px)] p-2">
                <span className="text-[9px] text-[#9A8878]">
                  foto {p.slug ?? p.name.toLowerCase()}
                </span>
              </div>
              <div className="w-full p-3">
                <div className="min-h-[34px] text-[13px] font-semibold leading-tight text-ink">
                  {p.name}
                </div>
                <div className="tabular mt-1 text-[16px] font-bold text-salsa">
                  {cop(p.price)}{" "}
                  <span className="text-[10.5px] font-medium text-muted">
                    /{p.unit}
                  </span>
                </div>
              </div>
            </button>
          ))}
          {visible.length === 0 ? (
            <div className="col-span-full py-10 text-center text-[13px] text-muted">
              No hay productos que coincidan.
            </div>
          ) : null}
        </div>
      </section>

      {/* Ticket */}
      <aside className="flex w-[404px] flex-none flex-col bg-ink p-5">
        {result?.ok ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#C9B8A8]">
              Venta registrada
            </div>
            <div className="my-2 font-display text-[40px] font-extrabold tracking-tight text-crema">
              {result.code}
            </div>
            <div className="tabular text-[15px] text-[#C9B8A8]">
              Total cobrado
            </div>
            <div className="tabular font-display text-[34px] font-extrabold text-crema">
              {cop(result.total)}
            </div>
            <div className="tabular mt-1 text-[12px] text-[#C9B8A8]">
              Base {cop(result.subtotal)} · IVA {cop(result.tax)}
            </div>
            {result.dianStatus === "emitida" ? (
              <div className="mt-3 rounded-full bg-[#DFEAE2] px-4 py-1.5 text-[11.5px] font-bold text-[#2E5340]">
                Factura DIAN emitida
              </div>
            ) : result.dianStatus === "rechazada" ? (
              <div className="mt-3 max-w-[280px] rounded-xl2 bg-[#8A2B14] px-4 py-2.5 text-[11.5px] font-semibold text-crema">
                La venta se cobró, pero la factura DIAN falló. Se guardó el
                error para reintentar desde el pedido.
              </div>
            ) : null}
            <button
              onClick={nuevaVenta}
              className="mt-8 h-[54px] w-full rounded-xl2 bg-salsa font-bold text-[15px] text-crema hover:bg-curado"
            >
              Nueva venta
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-baseline justify-between">
              <div className="text-[15px] font-bold text-crema">Ticket</div>
              <div className="text-[12px] text-[#C9B8A8]">
                {ticket.length} {ticket.length === 1 ? "línea" : "líneas"}
              </div>
            </div>

            <div className="flex flex-1 flex-col gap-2 overflow-auto">
              {ticket.length === 0 ? (
                <div className="flex flex-1 items-center justify-center text-center text-[13px] text-[#8A7A6E]">
                  Toca un producto
                  <br />
                  para agregarlo al ticket
                </div>
              ) : (
                ticket.map((l) => {
                  const b = lineBreakdown(
                    l.product.price,
                    l.qty,
                    l.product.tax_regime,
                  );
                  return (
                    <div
                      key={l.product.id}
                      className="flex items-center gap-2 rounded-xl2 bg-[rgba(251,246,239,.07)] p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold text-crema">
                          {l.product.name}
                        </div>
                        <div className="tabular text-[11.5px] text-[#C9B8A8]">
                          {qtyLabel(l.qty, l.product.unit)} ×{" "}
                          {cop(l.product.price)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => changeQty(l.product.id, -1)}
                          className="h-8 w-8 rounded-lg bg-[rgba(251,246,239,.12)] text-[15px] font-bold text-crema"
                        >
                          −
                        </button>
                        <button
                          onClick={() => changeQty(l.product.id, 1)}
                          className="h-8 w-8 rounded-lg bg-[rgba(251,246,239,.12)] text-[15px] font-bold text-crema"
                        >
                          +
                        </button>
                      </div>
                      <div className="tabular w-[70px] text-right text-[14px] font-bold text-crema">
                        {cop(b.total)}
                      </div>
                      <button
                        onClick={() => removeLine(l.product.id)}
                        className="h-8 w-8 flex-none rounded-lg bg-[rgba(251,246,239,.12)] text-[15px] font-bold text-crema"
                      >
                        ×
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Medio de pago */}
            <div className="mt-4 flex gap-1.5">
              {PAY_METHODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setPayment(m.id)}
                  className={`h-9 flex-1 rounded-lg text-[11.5px] font-semibold ${
                    payment === m.id
                      ? "bg-crema text-ink"
                      : "bg-[rgba(251,246,239,.10)] text-[#C9B8A8]"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Totales */}
            <div className="mt-4 border-t border-[rgba(251,246,239,.16)] pt-4">
              <div className="tabular flex justify-between text-[13px] text-[#C9B8A8]">
                <span>Subtotal (base)</span>
                <span>{cop(totals.base)}</span>
              </div>
              <div className="tabular mt-2 flex justify-between text-[13px] text-[#C9B8A8]">
                <span>IVA incluido</span>
                <span>{cop(totals.tax)}</span>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-[15px] font-bold text-crema">Total</span>
                <span className="tabular font-display text-[34px] font-extrabold tracking-tight text-crema">
                  {cop(totals.total)}
                </span>
              </div>

              {result && !result.ok ? (
                <div className="mt-3 rounded-xl2 bg-[#8A2B14] px-4 py-2 text-[12px] font-semibold text-crema">
                  {result.error}
                </div>
              ) : null}

              {showBuyerForm ? (
                <div className="mt-3 rounded-xl2 bg-[rgba(251,246,239,.07)] p-3">
                  <div className="mb-2 text-[11.5px] font-bold text-crema">
                    Datos para la factura DIAN
                  </div>
                  <div className="flex gap-1.5">
                    <select
                      value={buyer.docType}
                      onChange={(e) => setBuyer({ ...buyer, docType: e.target.value as BuyerDoc["docType"] })}
                      className="h-9 w-[72px] rounded-lg border-none bg-[rgba(251,246,239,.12)] px-2 text-[12px] text-crema outline-none"
                    >
                      <option value="CC">CC</option>
                      <option value="NIT">NIT</option>
                      <option value="CE">CE</option>
                    </select>
                    <input
                      value={buyer.docNumber}
                      onChange={(e) => setBuyer({ ...buyer, docNumber: e.target.value })}
                      placeholder="Número de documento"
                      className="h-9 flex-1 rounded-lg border-none bg-[rgba(251,246,239,.12)] px-2.5 text-[12px] text-crema placeholder:text-[#8A7A6E] outline-none"
                    />
                  </div>
                  <input
                    value={buyer.name}
                    onChange={(e) => setBuyer({ ...buyer, name: e.target.value })}
                    placeholder="Nombre completo"
                    className="mt-1.5 h-9 w-full rounded-lg border-none bg-[rgba(251,246,239,.12)] px-2.5 text-[12px] text-crema placeholder:text-[#8A7A6E] outline-none"
                  />
                  <input
                    value={buyer.email}
                    onChange={(e) => setBuyer({ ...buyer, email: e.target.value })}
                    placeholder="Correo (opcional)"
                    className="mt-1.5 h-9 w-full rounded-lg border-none bg-[rgba(251,246,239,.12)] px-2.5 text-[12px] text-crema placeholder:text-[#8A7A6E] outline-none"
                  />
                </div>
              ) : null}

              <div className="mt-3 flex gap-2.5">
                <button
                  disabled={pending || ticket.length === 0}
                  onClick={() => cobrar(false)}
                  className="h-[62px] flex-1 rounded-xl2 bg-crema text-[14px] font-bold text-ink hover:bg-crema2 disabled:opacity-50"
                >
                  Cobrar
                  <br />
                  <span className="text-[11px] font-medium text-muted">
                    recibo interno
                  </span>
                </button>
                <button
                  disabled={pending || ticket.length === 0 || !dianEnabled}
                  onClick={() => cobrar(true)}
                  title={dianDisabledReason ?? ""}
                  className="h-[62px] flex-1 rounded-xl2 bg-salsa text-[14px] font-bold text-crema hover:bg-curado disabled:opacity-50"
                >
                  {showBuyerForm ? "Confirmar y cobrar" : "Cobrar"}
                  <br />
                  <span className="text-[11px] font-medium text-[#F6DED6]">
                    factura DIAN
                  </span>
                </button>
              </div>
              {!dianEnabled && dianDisabledReason ? (
                <div className="mt-2 text-center text-[11px] text-[#C9B8A8]">
                  {dianDisabledReason}
                </div>
              ) : null}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
