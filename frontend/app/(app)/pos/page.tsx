import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { getEntitlements } from "@/lib/entitlements";
import type { Category, Product } from "@/lib/types";
import PosClient from "./pos-client";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const supabase = createClient();
  const ctx = await getTenantContext();

  const [{ data: categories }, { data: products }, entitlements] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, sort_order")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("products")
      .select("id, name, slug, unit, step, price, tax_regime, category_id, image_url")
      .eq("is_active", true)
      .order("name"),
    ctx ? getEntitlements(ctx.tenantId) : null,
  ]);

  // DIAN necesita DOS cosas: que el plan lo incluya y esté pagado
  // (entitlements) Y que el negocio ya tenga sus credenciales Factus
  // configuradas (tenant.dian_enabled, un paso técnico aparte).
  const planAllowsDian = entitlements?.dianEnabled ?? false;
  const technicallyReady = ctx?.tenant.dian_enabled ?? false;

  let dianDisabledReason: string | null = null;
  if (!planAllowsDian) {
    dianDisabledReason =
      entitlements && entitlements.status !== "activa"
        ? "Activa tu suscripción para habilitar factura DIAN"
        : "Factura DIAN requiere el plan Pro";
  } else if (!technicallyReady) {
    dianDisabledReason = "Factura DIAN aún no está configurada para este negocio";
  }

  return (
    <PosClient
      categories={(categories ?? []) as Category[]}
      products={(products ?? []) as Product[]}
      dianEnabled={planAllowsDian && technicallyReady}
      dianDisabledReason={dianDisabledReason}
    />
  );
}
