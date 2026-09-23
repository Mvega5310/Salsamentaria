import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { StorefrontCategory, StorefrontProduct, StorefrontTenant } from "@/lib/storefront/types";
import StorefrontClient from "./storefront-client";

export const dynamic = "force-dynamic";

export default async function StorefrontPage({
  params,
}: {
  params: { slug: string };
}) {
  const supabase = createClient();

  const { data: tenant } = await supabase
    .from("v_storefront_tenant")
    .select("*")
    .eq("slug", params.slug)
    .maybeSingle();

  if (!tenant) notFound();

  const [{ data: categories }, { data: products }] = await Promise.all([
    supabase
      .from("v_storefront_categories")
      .select("*")
      .eq("tenant_id", tenant.id)
      .order("sort_order"),
    supabase
      .from("v_storefront_products")
      .select("*")
      .eq("tenant_id", tenant.id)
      .order("name"),
  ]);

  return (
    <StorefrontClient
      tenant={tenant as StorefrontTenant}
      categories={(categories ?? []) as StorefrontCategory[]}
      products={(products ?? []) as StorefrontProduct[]}
    />
  );
}
