import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext, isAdminRole } from "@/lib/tenant";
import { cop, qtyLabel, type ProductUnit } from "@/lib/format";
import MetricCard from "@/components/metric-card";
import BarList from "@/components/bar-list";
import DailySalesChart from "@/components/daily-sales-chart";

export const dynamic = "force-dynamic";

const PAY_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  contra_entrega: "Contra entrega",
  nequi: "Nequi",
  daviplata: "Daviplata",
  otro: "Otro",
};

const CHANNEL_LABEL: Record<string, string> = {
  pwa: "Catálogo PWA",
  mostrador: "Mostrador",
  whatsapp: "WhatsApp",
};

const TAX_LABEL: Record<string, string> = {
  gravado_19: "Gravado 19%",
  gravado_5: "Gravado 5%",
  exento: "Exento",
  excluido: "Excluido",
};

/** Fecha de hoy en la zona horaria del negocio, como YYYY-MM-DD. */
function todayInBogota(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
  }).format(new Date());
}

export default async function MetricasPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/onboarding");
  if (!isAdminRole(ctx.role)) redirect("/pos");

  const supabase = createClient();
  const t = ctx.tenantId;

  const [
    daily,
    topProducts,
    byCategory,
    byChannel,
    paymentMix,
    fulfillment,
    margin,
    waste,
    taxByRegime,
  ] = await Promise.all([
    supabase.from("v_daily_sales").select("*").eq("tenant_id", t).order("day"),
    supabase.from("v_top_products").select("*").eq("tenant_id", t).order("revenue", { ascending: false }).limit(8),
    supabase.from("v_sales_by_category").select("*").eq("tenant_id", t).order("revenue", { ascending: false }),
    supabase.from("v_sales_by_channel").select("*").eq("tenant_id", t),
    supabase.from("v_payment_mix").select("*").eq("tenant_id", t).order("amount", { ascending: false }),
    supabase.from("v_fulfillment_time").select("*").eq("tenant_id", t).maybeSingle(),
    supabase.from("v_product_margin").select("*").eq("tenant_id", t).order("gross_margin", { ascending: true }),
    supabase.from("v_waste").select("*").eq("tenant_id", t).order("cost_lost", { ascending: false }).limit(6),
    supabase.from("v_tax_by_regime").select("*").eq("tenant_id", t),
  ]);

  const dailyRows = daily.data ?? [];
  const today = todayInBogota();
  const todayRow = dailyRows.find((d) => d.day === today);
  const last14 = dailyRows.slice(-14);
  const last30 = dailyRows.slice(-30);

  const total30 = last30.reduce((s, d) => s + Number(d.gross_total), 0);
  const orders30 = last30.reduce((s, d) => s + Number(d.orders_count), 0);
  const avgTicket30 = orders30 > 0 ? total30 / orders30 : 0;

  const marginRows = margin.data ?? [];
  const lowMargin = marginRows.slice(0, 5);
  const negativeMargin = marginRows.filter((m) => Number(m.gross_margin) < 0);

  const taxRows = (taxByRegime.data ?? []) as { tax_regime: string; base: number; tax: number }[];
  const taxTotals = taxRows.reduce(
    (acc, r) => ({ base: acc.base + Number(r.base), tax: acc.tax + Number(r.tax) }),
    { base: 0, tax: 0 },
  );

  return (
    <div className="p-6">
      <h1 className="mb-5 font-display text-[22px] font-extrabold tracking-tight text-ink">
        Métricas
      </h1>

      {/* KPIs */}
      <div className="mb-5 grid grid-cols-4 gap-3">
        <MetricCard
          label="Ventas hoy"
          value={cop(Number(todayRow?.gross_total ?? 0))}
          sublabel={`${todayRow?.orders_count ?? 0} ${Number(todayRow?.orders_count ?? 0) === 1 ? "pedido" : "pedidos"}`}
        />
        <MetricCard
          label="Ventas últimos 30 días"
          value={cop(total30)}
          sublabel={`${orders30} pedidos`}
          accent="ink"
        />
        <MetricCard
          label="Ticket promedio (30 días)"
          value={cop(avgTicket30)}
          accent="mostaza"
        />
        <MetricCard
          label="Tiempo prom. de entrega"
          value={fulfillment.data?.avg_minutes ? `${fulfillment.data.avg_minutes} min` : "—"}
          sublabel={
            fulfillment.data?.delivered
              ? `${fulfillment.data.delivered} pedidos entregados`
              : "Sin entregas registradas"
          }
          accent="hoja"
        />
      </div>

      {/* Ventas diarias */}
      <div className="mb-5 rounded-xl2 border border-borde bg-white p-5">
        <div className="mb-4 text-[13px] font-bold text-ink">
          Ventas de los últimos {last14.length || 14} días
        </div>
        <DailySalesChart
          days={last14.map((d) => ({ day: d.day, gross_total: Number(d.gross_total) }))}
        />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4">
        <div className="rounded-xl2 border border-borde bg-white p-5">
          <div className="mb-4 text-[13px] font-bold text-ink">
            Top productos (30 días)
          </div>
          <BarList
            emptyLabel="Sin ventas en los últimos 30 días."
            formatValue={cop}
            items={(topProducts.data ?? []).map((p) => ({
              label: p.name,
              value: Number(p.revenue),
              sublabel: `· ${qtyLabel(Number(p.qty_sold), p.unit as ProductUnit)}`,
            }))}
          />
        </div>

        <div className="rounded-xl2 border border-borde bg-white p-5">
          <div className="mb-4 text-[13px] font-bold text-ink">
            Ventas por categoría
          </div>
          <BarList
            emptyLabel="Sin ventas registradas."
            formatValue={cop}
            items={(byCategory.data ?? []).map((c) => ({
              label: c.category,
              value: Number(c.revenue),
            }))}
          />
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4">
        <div className="rounded-xl2 border border-borde bg-white p-5">
          <div className="mb-4 text-[13px] font-bold text-ink">
            Medios de pago
          </div>
          <BarList
            emptyLabel="Sin pagos registrados."
            formatValue={cop}
            items={(paymentMix.data ?? []).map((p) => ({
              label: PAY_LABEL[p.method] ?? p.method,
              value: Number(p.amount),
              sublabel: `· ${p.tx} ${p.tx === 1 ? "pago" : "pagos"}`,
            }))}
          />
        </div>

        <div className="rounded-xl2 border border-borde bg-white p-5">
          <div className="mb-4 text-[13px] font-bold text-ink">
            Ventas por canal
          </div>
          <BarList
            emptyLabel="Sin ventas registradas."
            formatValue={cop}
            items={(byChannel.data ?? []).map((c) => ({
              label: CHANNEL_LABEL[c.channel] ?? c.channel,
              value: Number(c.revenue),
              sublabel: `· ticket prom. ${cop(Number(c.avg_ticket))}`,
            }))}
          />
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4">
        <div className="rounded-xl2 border border-borde bg-white p-5">
          <div className="mb-1 text-[13px] font-bold text-ink">
            Productos con menor margen
          </div>
          <div className="mb-4 text-[11.5px] text-muted">
            Requiere costo cargado en el catálogo para calcularse.
          </div>
          {lowMargin.length === 0 ? (
            <div className="py-6 text-center text-[12.5px] text-muted">
              Carga el costo de tus productos en el catálogo para ver el margen.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {lowMargin.map((m) => (
                <div key={m.product_id ?? m.name} className="flex items-center justify-between">
                  <span className="truncate text-[12.5px] font-semibold text-ink">
                    {m.name}
                  </span>
                  <span
                    className={`tabular text-[12.5px] font-bold ${
                      Number(m.gross_margin) < 0 ? "text-curado" : "text-hoja"
                    }`}
                  >
                    {cop(Number(m.gross_margin))}
                  </span>
                </div>
              ))}
              {negativeMargin.length > 0 ? (
                <div className="mt-2 rounded-xl2 bg-[#F6DED6] px-3 py-2 text-[11.5px] font-semibold text-curado">
                  {negativeMargin.length}{" "}
                  {negativeMargin.length === 1
                    ? "producto se está vendiendo por debajo del costo."
                    : "productos se están vendiendo por debajo del costo."}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="rounded-xl2 border border-borde bg-white p-5">
          <div className="mb-4 text-[13px] font-bold text-ink">Merma</div>
          <BarList
            emptyLabel="Sin merma registrada — se carga como movimiento de inventario tipo 'merma'."
            formatValue={cop}
            items={(waste.data ?? []).map((w) => ({
              label: w.name,
              value: Number(w.cost_lost),
              sublabel: `· ${w.qty_lost} und/kg perdidas`,
            }))}
          />
        </div>
      </div>

      {/* IVA por régimen — conciliación DIAN */}
      <div className="rounded-xl2 border border-borde bg-white p-5">
        <div className="mb-1 text-[13px] font-bold text-ink">
          IVA por régimen tributario
        </div>
        <div className="mb-4 text-[11.5px] text-muted">
          Para conciliar contra la facturación DIAN. Cifras de los últimos 90 días.
        </div>

        {taxRows.length === 0 ? (
          <div className="py-6 text-center text-[12.5px] text-muted">
            Sin ventas registradas.
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-borde text-left text-[11px] font-bold uppercase tracking-wide text-muted">
                <th className="py-2">Régimen</th>
                <th className="py-2 text-right">Base</th>
                <th className="py-2 text-right">IVA</th>
              </tr>
            </thead>
            <tbody>
              {taxRows.map((r) => (
                <tr key={r.tax_regime} className="border-b border-borde last:border-0">
                  <td className="py-2.5 font-semibold text-ink">
                    {TAX_LABEL[r.tax_regime] ?? r.tax_regime}
                  </td>
                  <td className="tabular py-2.5 text-right text-ink">{cop(Number(r.base))}</td>
                  <td className="tabular py-2.5 text-right font-bold text-salsa">
                    {cop(Number(r.tax))}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="py-2.5 text-[12px] font-bold text-muted">Total</td>
                <td className="tabular py-2.5 text-right text-[12px] font-bold text-ink">
                  {cop(taxTotals.base)}
                </td>
                <td className="tabular py-2.5 text-right text-[12px] font-bold text-salsa">
                  {cop(taxTotals.tax)}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
