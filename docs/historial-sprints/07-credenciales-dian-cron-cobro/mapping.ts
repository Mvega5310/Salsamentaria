import type { TaxRegime } from "@/lib/format";

/**
 * Mapeo de tarifas DIAN estándar (no específico de Factus — esta parte del
 * estándar de facturación electrónica colombiana sí es pública y estable):
 * código "01" = IVA. Régimen exento/excluido se reporta con tarifa 0 y un
 * código de tributo distinto ("ZZ" no aplica / exclusión), según el DTO de
 * Customer confirmado (tributeId). El código de tributo exacto para cada
 * caso (IVA vs excluido vs exento) debe confirmarse contra el catálogo de
 * tributos que devuelve tu cuenta de Factus (típicamente un endpoint
 * GET /taxes o similar) antes de facturar en producción.
 */
const DIAN_TAX_RATE: Record<TaxRegime, number> = {
  gravado_19: 19,
  gravado_5: 5,
  exento: 0,
  excluido: 0,
};

export type FactusCustomer = {
  /** 3 = Cédula, 6 = NIT — confirmar contra el catálogo de tu cuenta */
  identificationDocumentId: number;
  identification: string;
  /** 1 = Persona jurídica, 2 = Persona natural (confirmado en el DTO de referencia) */
  legalOrganizationId: 1 | 2;
  names: string;
  email: string;
  phone?: string;
  address?: string;
  /** Requerido por la DIAN — usar 1 (Bogotá) o el código real si lo tienes */
  municipalityId?: number;
};

export function mapOrderCustomer(invoice: {
  customer_name: string | null;
  customer_doc_type: string | null;
  customer_doc_number: string | null;
  customer_email: string | null;
}): FactusCustomer {
  const isNit = invoice.customer_doc_type === "NIT";
  return {
    identificationDocumentId: isNit ? 6 : 3,
    identification: invoice.customer_doc_number ?? "222222222222", // consumidor final genérico DIAN
    legalOrganizationId: isNit ? 1 : 2,
    names: invoice.customer_name ?? "Consumidor Final",
    email: invoice.customer_email ?? "sinfactura@salsapos.co",
  };
}

/**
 * ⚠️ ZONA DE INCERTIDUMBRE — verificar antes de producción:
 * No pude confirmar los nombres exactos de campo que espera el
 * InvoiceItem de Factus (cantidad, precio unitario, descuento, tarifa de
 * impuesto). Los nombres usados abajo (quantity, price, tax_rate,
 * discount_rate) siguen la convención más común en APIs de facturación
 * colombianas, pero DEBEN contrastarse contra un ejemplo real de tu cuenta
 * Factus (su Postman collection o el primer intento en sandbox) antes de
 * emitir facturas de verdad. Si algo no calza, este es el único archivo
 * que hay que tocar — el resto del sistema no sabe nada de Factus.
 */
export function mapOrderToFactusPayload(params: {
  invoice: {
    id: string;
    subtotal: number;
    tax_total: number;
    total: number;
    customer_name: string | null;
    customer_doc_type: string | null;
    customer_doc_number: string | null;
    customer_email: string | null;
  };
  items: {
    name: string;
    qty: number;
    unit_price: number;
    tax_regime: TaxRegime;
    line_subtotal: number;
  }[];
  numberingRangeId: number;
}) {
  const customer = mapOrderCustomer(params.invoice);

  return {
    numbering_range_id: params.numberingRangeId,
    reference_code: params.invoice.id,
    customer,
    items: params.items.map((it) => ({
      code_reference: it.name.slice(0, 30),
      name: it.name,
      quantity: it.qty,
      price: it.unit_price,
      discount_rate: 0,
      tax_rate: DIAN_TAX_RATE[it.tax_regime],
      is_excluded: it.tax_regime === "excluido" || it.tax_regime === "exento" ? 1 : 0,
      unit_measure_id: 70, // 70 = unidad DIAN estándar; kg suele ser otro código — verificar catálogo
    })),
  };
}
