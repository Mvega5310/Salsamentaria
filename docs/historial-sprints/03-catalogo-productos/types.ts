import type { TaxRegime, ProductUnit } from "./format";

export type Category = {
  id: string;
  name: string;
  sort_order: number;
};

export type Product = {
  id: string;
  name: string;
  slug: string | null;
  unit: ProductUnit;
  step: number;
  price: number;
  tax_regime: TaxRegime;
  category_id: string | null;
  image_url: string | null;
  // Presentes al cargar desde el panel de catálogo (no siempre en el POS)
  cost?: number | null;
  track_inventory?: boolean;
  stock?: number;
  min_stock?: number;
  is_active?: boolean;
};

export type TicketLine = {
  product: Product;
  qty: number;
};

export type OrderStatus =
  | "recibido"
  | "confirmado"
  | "preparando"
  | "en_camino"
  | "entregado"
  | "cancelado";

export type BoardOrder = {
  id: string;
  code: string | null;
  status: OrderStatus;
  fulfillment: "domicilio" | "recoger" | "mostrador";
  total: number;
  needs_invoice: boolean;
  contact_name: string | null;
  delivery_address: string | null;
  created_at: string;
  item_count: number;
};
