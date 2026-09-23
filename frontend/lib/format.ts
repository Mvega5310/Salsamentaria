export type TaxRegime = "gravado_19" | "gravado_5" | "exento" | "excluido";
export type ProductUnit = "kg" | "g" | "lb" | "und" | "l" | "ml";

/** Tasa efectiva de IVA según régimen. Igual que tax_rate_for() en la BD. */
export function taxRate(r: TaxRegime): number {
  return r === "gravado_19" ? 0.19 : r === "gravado_5" ? 0.05 : 0;
}

/** Formato de moneda colombiana. */
export function cop(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-CO");
}

/** Etiqueta de cantidad: "0,5 kg" o "6 und". */
export function qtyLabel(qty: number, unit: ProductUnit): string {
  if (unit === "und") return `${qty} und`;
  const q = qty.toLocaleString("es-CO", {
    minimumFractionDigits: qty % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${q} ${unit}`;
}

/** Descompone el precio (IVA incluido) en base + impuesto. Igual que la BD. */
export function lineBreakdown(price: number, qty: number, regime: TaxRegime) {
  const total = Math.round(price * qty * 100) / 100;
  const base = Math.round((total / (1 + taxRate(regime))) * 100) / 100;
  return { total, base, tax: total - base };
}
