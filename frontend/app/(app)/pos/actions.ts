"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { createInvoice } from "@/lib/dian/factus-client";
import { mapOrderToFactusPayload } from "@/lib/dian/mapping";
import { getTenantDianCredentials } from "@/lib/dian/credentials";
import { getEntitlements } from "@/lib/entitlements";

export type SaleInput = {
  items: { productId: string; qty: number }[];
  needsInvoice: boolean;
  paymentMethod: "efectivo" | "tarjeta" | "transferencia" | "nequi" | "daviplata";
  buyer?: {
    docType: "CC" | "NIT" | "CE";
    docNumber: string;
    name: string;
    email: string;
  };
};

export type SaleResult =
  | { ok: true; code: string; subtotal: number; tax: number; total: number; dianStatus?: "emitida" | "rechazada" }
  | { ok: false; error: string };

/**
 * Flujo de venta de mostrador:
 *  1) crea el pedido (recibido)
 *  2) inserta las líneas — los triggers calculan IVA por producto y totales
 *  3) confirma y marca pagado — dispara inventario e historial
 *  4) registra el pago
 *  5) crea el comprobante (recibo interno emitido o factura DIAN en borrador)
 */
export async function createSale(input: SaleInput): Promise<SaleResult> {
  if (input.items.length === 0) {
    return { ok: false, error: "El ticket está vacío." };
  }
  if (input.needsInvoice && !input.buyer?.docNumber) {
    return { ok: false, error: "La factura DIAN necesita el documento del comprador." };
  }

  const supabase = createClient();
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: "Sin negocio activo." };

  // El botón deshabilitado en el POS es solo cortesía de UI — el navegador
  // no es de fiar. Esta es la verificación que de verdad importa: sin plan
  // Pro pagado y sin la configuración técnica de Factus, no se emite nada.
  if (input.needsInvoice) {
    const entitlements = await getEntitlements(ctx.tenantId);
    if (!entitlements.dianEnabled || !ctx.tenant.dian_enabled) {
      return {
        ok: false,
        error: !entitlements.dianEnabled
          ? "Tu plan no incluye factura DIAN, o la suscripción no está pagada."
          : "Factura DIAN aún no está configurada para este negocio.",
      };
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 1) Pedido
  const { data: order, error: e1 } = await supabase
    .from("orders")
    .insert({
      tenant_id: ctx.tenantId,
      channel: "mostrador",
      fulfillment: "mostrador",
      status: "recibido",
      needs_invoice: input.needsInvoice,
      payment_method: input.paymentMethod,
      cashier_id: user?.id ?? null,
    })
    .select("id")
    .single();

  if (e1 || !order) {
    return { ok: false, error: e1?.message ?? "No se pudo crear el pedido." };
  }

  // 2) Líneas
  const rows = input.items.map((i) => ({
    order_id: order.id,
    product_id: i.productId,
    qty: i.qty,
  }));
  const { error: e2 } = await supabase.from("order_items").insert(rows);
  if (e2) return { ok: false, error: e2.message };

  // 3) Confirmar + pagar
  const { error: e3 } = await supabase
    .from("orders")
    .update({ status: "confirmado", payment_status: "pagado" })
    .eq("id", order.id);
  if (e3) return { ok: false, error: e3.message };

  // 4) Totales ya calculados por los triggers
  const { data: fin } = await supabase
    .from("orders")
    .select("code, subtotal, tax_total, total")
    .eq("id", order.id)
    .single();

  const subtotal = fin?.subtotal ?? 0;
  const tax = fin?.tax_total ?? 0;
  const total = fin?.total ?? 0;

  // 5) Pago
  await supabase.from("payments").insert({
    tenant_id: ctx.tenantId,
    order_id: order.id,
    method: input.paymentMethod,
    amount: total,
    status: "pagado",
  });

  // 6) Comprobante
  const { data: invoiceRow } = await supabase
    .from("invoices")
    .insert({
      tenant_id: ctx.tenantId,
      order_id: order.id,
      type: input.needsInvoice ? "factura_electronica" : "recibo_interno",
      status: input.needsInvoice ? "borrador" : "emitida",
      subtotal,
      tax_total: tax,
      total,
      issued_at: input.needsInvoice ? null : new Date().toISOString(),
      customer_name: input.buyer?.name ?? null,
      customer_doc_type: input.buyer?.docType ?? null,
      customer_doc_number: input.buyer?.docNumber ?? null,
      customer_email: input.buyer?.email ?? null,
    })
    .select("id")
    .single();

  let dianStatus: "emitida" | "rechazada" | undefined;

  // 7) Si pidieron factura DIAN, intentamos emitirla contra Factus ahora
  // mismo. Un fallo aquí NO revierte la venta — el dinero ya se cobró — pero
  // deja el motivo guardado en dian_error para que el negocio pueda
  // reintentar o facturar manualmente después.
  if (input.needsInvoice && invoiceRow) {
    try {
      const creds = await getTenantDianCredentials();

      const { data: items } = await supabase
        .from("order_items")
        .select("name, qty, unit_price, tax_regime, line_subtotal")
        .eq("order_id", order.id);

      const payload = mapOrderToFactusPayload({
        invoice: {
          id: invoiceRow.id,
          subtotal,
          tax_total: tax,
          total,
          customer_name: input.buyer?.name ?? null,
          customer_doc_type: input.buyer?.docType ?? null,
          customer_doc_number: input.buyer?.docNumber ?? null,
          customer_email: input.buyer?.email ?? null,
        },
        items: items ?? [],
        numberingRangeId: creds.numbering_range_id,
      });

      const result = await createInvoice(creds, payload);

      await supabase
        .from("invoices")
        .update({
          status: "emitida",
          provider: "factus",
          cufe: result.cufe,
          pdf_url: result.pdfUrl,
          xml_url: result.xmlUrl,
          issued_at: new Date().toISOString(),
        })
        .eq("id", invoiceRow.id);
      dianStatus = "emitida";
    } catch (e) {
      // No tiramos la venta por esto — solo dejamos constancia del error.
      await supabase
        .from("invoices")
        .update({
          status: "rechazada",
          dian_error: e instanceof Error ? e.message : "Error desconocido al emitir ante la DIAN",
        })
        .eq("id", invoiceRow.id);
      dianStatus = "rechazada";
    }
  }

  revalidatePath("/tablero");
  return { ok: true, code: fin?.code ?? "", subtotal, tax, total, dianStatus };
}
