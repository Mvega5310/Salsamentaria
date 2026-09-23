import type { ProductUnit } from "@/lib/format";
import type { OrderStatus } from "@/lib/types";

export type StorefrontTenant = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  brand_primary: string;
  brand_ink: string;
  brand_bg: string;
  delivery_fee_default: number;
  city: string | null;
  phone: string | null;
};

export type StorefrontCategory = {
  id: string;
  name: string;
  sort_order: number;
};

export type StorefrontProduct = {
  id: string;
  category_id: string | null;
  name: string;
  slug: string | null;
  unit: ProductUnit;
  step: number;
  price: number;
  image_url: string | null;
  available: boolean;
};

export type CartLine = { product: StorefrontProduct; qty: number };

/** Fila que retorna el RPC `get_storefront_order_total` (migración 17). */
export type StorefrontOrderTotal = {
  total: number;
  payment_status: "pendiente" | "pagado" | "fallido" | "reembolsado";
  tenant_slug: string;
};

/** Fila que retorna el RPC `get_storefront_order_status` (migración 15). */
export type StorefrontOrderStatus = {
  code: string;
  status: OrderStatus;
  fulfillment: "domicilio" | "recoger" | "mostrador";
  total: number;
  created_at: string;
  tenant_name: string;
};
