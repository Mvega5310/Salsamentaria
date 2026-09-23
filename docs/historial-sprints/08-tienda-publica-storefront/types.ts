import type { ProductUnit } from "@/lib/format";

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
