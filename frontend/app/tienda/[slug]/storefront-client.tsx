"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CartLine, StorefrontCategory, StorefrontProduct, StorefrontTenant } from "@/lib/storefront/types";
import { cop, qtyLabel } from "@/lib/format";
import { submitOrder } from "./actions";

type Fulfillment = "domicilio" | "recoger";
type PayMethod = "efectivo" | "contra_entrega" | "transferencia" | "wompi_online";

const PAY_LABEL: Record<PayMethod, string> = {
  wompi_online: "Pagar en línea ahora",
  efectivo: "Efectivo al recoger",
  contra_entrega: "Efectivo contra entrega",
  transferencia: "Transferencia (coordinar por WhatsApp)",
};

export default function StorefrontClient({
  tenant,
  categories,
  products,
}: {
  tenant: StorefrontTenant;
  categories: StorefrontCategory[];
  products: StorefrontProduct[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [cat, setCat] = useState<string>("Todos");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  const [fulfillment, setFulfillment] = useState<Fulfillment>("domicilio");
  const [payment, setPayment] = useState<PayMethod>("wompi_online");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const catNames = useMemo(() => ["Todos", ...categories.map((c) => c.name)], [categories]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      const inCat = cat === "Todos" || catById.get(p.category_id ?? "") === cat;
      const inQ = !q || p.name.toLowerCase().includes(q);
      return inCat && inQ;
    });
  }, [products, cat, query, catById]);

  const subtotal = cart.reduce((s, l) => s + l.product.price * l.qty, 0);
  const fee = fulfillment === "domicilio" ? tenant.delivery_fee_default : 0;
  const total = subtotal + fee;
  const cartCount = cart.reduce((s, l) => s + 1, 0);

  function addToCart(p: StorefrontProduct) {
    if (!p.available) return;
    setCart((c) => {
      const found = c.find((l) => l.product.id === p.id);
      if (found) return c.map((l) => (l.product.id === p.id ? { ...l, qty: +(l.qty + p.step).toFixed(3) } : l));
      return [...c, { product: p, qty: p.step }];
    });
  }

  function changeQty(id: string, dir: number) {
    setCart((c) =>
      c
        .map((l) => (l.product.id === id ? { ...l, qty: +(l.qty + dir * l.product.step).toFixed(3) } : l))
        .filter((l) => l.qty > 0),
    );
  }

  function sendOrder() {
    setError("");
    startTransition(async () => {
      const res = await submitOrder({
        tenantSlug: tenant.slug,
        items: cart.map((l) => ({ productId: l.product.id, qty: l.qty })),
        fulfillment,
        paymentMethod: payment,
        contactName: name,
        contactPhone: phone,
        deliveryAddress: fulfillment === "domicilio" ? address : undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (payment === "wompi_online") {
        router.push(`/tienda/${tenant.slug}/pagar/${res.orderId}`);
      } else {
        router.push(`/tienda/${tenant.slug}/pedido/${res.orderId}`);
      }
    });
  }

  const brand = {
    "--brand": tenant.brand_primary,
    "--brand-ink": tenant.brand_ink,
    "--brand-bg": tenant.brand_bg,
  } as React.CSSProperties;

  return (
    <div style={brand} className="min-h-screen bg-[var(--brand-bg)]">
      {/* Encabezado con marca del negocio */}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-black/5 bg-[var(--brand-bg)]/95 px-4 py-3 backdrop-blur">
        {tenant.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tenant.logo_url} alt={tenant.name} className="h-9 w-9 rounded-full object-cover" />
        ) : (
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-extrabold text-white"
            style={{ background: "var(--brand)" }}
          >
            {tenant.name.slice(0, 1)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[16px] font-extrabold leading-tight text-[var(--brand-ink)]">
            {tenant.name}
          </div>
          {tenant.city ? <div className="text-[11px] text-[var(--brand-ink)]/60">{tenant.city}</div> : null}
        </div>
        <button
          onClick={() => setCartOpen(true)}
          className="relative h-10 w-10 flex-none rounded-full text-[18px]"
          style={{ background: "var(--brand)" }}
        >
          🛒
          {cartCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--brand-ink)] text-[10px] font-bold text-white">
              {cartCount}
            </span>
          ) : null}
        </button>
      </header>

      {/* Catálogo */}
      <main className="p-4 pb-28">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar producto…"
          className="mb-3 h-11 w-full rounded-xl2 border border-black/10 bg-white px-4 text-[14px] outline-none"
        />
        <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">
          {catNames.map((name) => (
            <button
              key={name}
              onClick={() => setCat(name)}
              className="h-9 flex-none rounded-full border px-3.5 text-[12.5px] font-semibold"
              style={
                cat === name
                  ? { background: "var(--brand-ink)", color: "white", borderColor: "var(--brand-ink)" }
                  : { borderColor: "rgba(0,0,0,.12)", color: "var(--brand-ink)" }
              }
            >
              {name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {visible.map((p) => (
            <button
              key={p.id}
              onClick={() => addToCart(p)}
              disabled={!p.available}
              className="flex flex-col overflow-hidden rounded-xl2 border border-black/10 bg-white text-left disabled:opacity-40"
            >
              <div className="flex h-[92px] w-full items-end bg-[repeating-linear-gradient(135deg,rgba(0,0,0,.04)_0_8px,transparent_8px_16px)] p-2">
                {!p.available ? (
                  <span className="rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white">
                    Agotado
                  </span>
                ) : null}
              </div>
              <div className="p-2.5">
                <div className="min-h-[32px] text-[12.5px] font-semibold leading-tight text-[var(--brand-ink)]">
                  {p.name}
                </div>
                <div className="tabular mt-1 text-[14px] font-bold" style={{ color: "var(--brand)" }}>
                  {cop(p.price)} <span className="text-[10px] font-medium text-[var(--brand-ink)]/50">/{p.unit}</span>
                </div>
              </div>
            </button>
          ))}
          {visible.length === 0 ? (
            <div className="col-span-2 py-10 text-center text-[13px] text-[var(--brand-ink)]/50">
              No hay productos que coincidan.
            </div>
          ) : null}
        </div>
      </main>

      {/* Barra flotante de carrito */}
      {cartCount > 0 && !cartOpen ? (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed inset-x-4 bottom-4 flex h-14 items-center justify-between rounded-xl2 px-5 text-[14px] font-bold text-white shadow-lg"
          style={{ background: "var(--brand)" }}
        >
          <span>Ver carrito · {cartCount} {cartCount === 1 ? "producto" : "productos"}</span>
          <span className="tabular">{cop(subtotal)}</span>
        </button>
      ) : null}

      {/* Carrito / checkout */}
      {cartOpen ? (
        <div className="fixed inset-0 z-20 flex flex-col justify-end bg-black/40">
          <div className="max-h-[88vh] overflow-auto rounded-t-[20px] bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-[16px] font-bold text-[var(--brand-ink)]">Tu pedido</div>
              <button onClick={() => setCartOpen(false)} className="text-[20px] text-[var(--brand-ink)]/50">
                ×
              </button>
            </div>

            {cart.length === 0 ? (
              <div className="py-10 text-center text-[13px] text-[var(--brand-ink)]/50">
                Tu carrito está vacío.
              </div>
            ) : (
              <>
                <div className="mb-4 flex flex-col gap-2.5">
                  {cart.map((l) => (
                    <div key={l.product.id} className="flex items-center gap-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold text-[var(--brand-ink)]">
                          {l.product.name}
                        </div>
                        <div className="tabular text-[11px] text-[var(--brand-ink)]/50">
                          {qtyLabel(l.qty, l.product.unit)}
                        </div>
                      </div>
                      <button
                        onClick={() => changeQty(l.product.id, -1)}
                        className="h-8 w-8 rounded-lg bg-black/5 text-[15px] font-bold text-[var(--brand-ink)]"
                      >
                        −
                      </button>
                      <button
                        onClick={() => changeQty(l.product.id, 1)}
                        className="h-8 w-8 rounded-lg bg-black/5 text-[15px] font-bold text-[var(--brand-ink)]"
                      >
                        +
                      </button>
                      <div className="tabular w-[74px] text-right text-[13px] font-bold text-[var(--brand-ink)]">
                        {cop(l.product.price * l.qty)}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mb-4 flex gap-2">
                  {(["domicilio", "recoger"] as Fulfillment[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFulfillment(f)}
                      className="h-10 flex-1 rounded-xl2 text-[12.5px] font-bold"
                      style={
                        fulfillment === f
                          ? { background: "var(--brand-ink)", color: "white" }
                          : { background: "rgba(0,0,0,.05)", color: "var(--brand-ink)" }
                      }
                    >
                      {f === "domicilio" ? "Domicilio" : "Recoger en tienda"}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col gap-2.5">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Tu nombre"
                    className="h-11 rounded-xl2 border border-black/10 px-3.5 text-[13.5px] outline-none"
                  />
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Celular / WhatsApp"
                    className="h-11 rounded-xl2 border border-black/10 px-3.5 text-[13.5px] outline-none"
                  />
                  {fulfillment === "domicilio" ? (
                    <input
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Dirección de entrega"
                      className="h-11 rounded-xl2 border border-black/10 px-3.5 text-[13.5px] outline-none"
                    />
                  ) : null}

                  <select
                    value={payment}
                    onChange={(e) => setPayment(e.target.value as PayMethod)}
                    className="h-11 rounded-xl2 border border-black/10 bg-white px-3.5 text-[13.5px] outline-none"
                  >
                    {Object.entries(PAY_LABEL).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-4 border-t border-black/10 pt-4">
                  <div className="tabular flex justify-between text-[13px] text-[var(--brand-ink)]/60">
                    <span>Subtotal</span>
                    <span>{cop(subtotal)}</span>
                  </div>
                  {fee > 0 ? (
                    <div className="tabular mt-1 flex justify-between text-[13px] text-[var(--brand-ink)]/60">
                      <span>Domicilio</span>
                      <span>{cop(fee)}</span>
                    </div>
                  ) : null}
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-[14px] font-bold text-[var(--brand-ink)]">Total</span>
                    <span className="tabular text-[24px] font-extrabold" style={{ color: "var(--brand)" }}>
                      {cop(total)}
                    </span>
                  </div>

                  {error ? (
                    <div className="mt-3 rounded-xl2 bg-red-50 px-4 py-2.5 text-[12.5px] font-semibold text-red-700">
                      {error}
                    </div>
                  ) : null}

                  <button
                    disabled={pending}
                    onClick={sendOrder}
                    className="mt-3 h-[54px] w-full rounded-xl2 text-[14px] font-bold text-white disabled:opacity-60"
                    style={{ background: "var(--brand)" }}
                  >
                    {pending ? "Enviando…" : "Enviar pedido"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
