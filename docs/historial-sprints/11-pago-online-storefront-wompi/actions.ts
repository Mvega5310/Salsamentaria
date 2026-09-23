"use server";

import { createClient } from "@/lib/supabase/server";

export type SubmitOrderInput = {
  tenantSlug: string;
  items: { productId: string; qty: number }[];
  fulfillment: "domicilio" | "recoger";
  paymentMethod: "efectivo" | "contra_entrega" | "transferencia" | "wompi_online";
  contactName: string;
  contactPhone: string;
  deliveryAddress?: string;
};

export type SubmitOrderResult =
  | { ok: true; orderId: string; orderCode: string }
  | { ok: false; error: string };

export async function submitOrder(input: SubmitOrderInput): Promise<SubmitOrderResult> {
  if (input.items.length === 0) return { ok: false, error: "El carrito está vacío." };
  if (!input.contactName.trim() || !input.contactPhone.trim()) {
    return { ok: false, error: "Nombre y teléfono son obligatorios." };
  }
  if (input.fulfillment === "domicilio" && !input.deliveryAddress?.trim()) {
    return { ok: false, error: "La dirección es obligatoria para domicilio." };
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_storefront_order", {
    p_tenant_slug: input.tenantSlug,
    p_items: input.items.map((i) => ({ product_id: i.productId, qty: i.qty })),
    p_fulfillment: input.fulfillment,
    p_payment_method: input.paymentMethod,
    p_contact_name: input.contactName.trim(),
    p_contact_phone: input.contactPhone.trim(),
    p_delivery_address: input.deliveryAddress?.trim() ?? null,
  });

  if (error || !data || data.length === 0) {
    return { ok: false, error: "No se pudo enviar el pedido. Intenta de nuevo." };
  }

  const row = data[0];
  return { ok: true, orderId: row.order_id, orderCode: row.order_code };
}
