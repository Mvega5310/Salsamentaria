import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext, isAdminRole } from "@/lib/tenant";
import type { Category, Product } from "@/lib/types";
import CatalogoClient from "./catalogo-client";

export const dynamic = "force-dynamic";

export default async function CatalogoPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/onboarding");
  if (!isAdminRole(ctx.role)) redirect("/pos");

  const supabase = createClient();
  const [{ data: categories }, { data: products }] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, sort_order")
      .order("sort_order"),
    supabase
      .from("products")
      .select(
        "id, name, slug, unit, step, price, cost, tax_regime, category_id, image_url, track_inventory, stock, min_stock, is_active",
      )
      .order("name"),
  ]);

  return (
    <CatalogoClient
      categories={(categories ?? []) as Category[]}
      products={(products ?? []) as Product[]}
    />
  );
}
