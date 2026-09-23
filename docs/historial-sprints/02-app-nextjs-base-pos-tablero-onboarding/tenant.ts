import { cache } from "react";
import { createClient } from "./supabase/server";

export type TenantContext = {
  tenantId: string;
  role: string;
  tenant: {
    id: string;
    name: string;
    slug: string;
    city: string | null;
    brand_primary: string | null;
    dian_enabled: boolean;
  };
};

/**
 * Devuelve el negocio activo del usuario (o null si no tiene membresía).
 * `cache` evita repetir la consulta dentro del mismo render de servidor.
 */
export const getTenantContext = cache(
  async (): Promise<TenantContext | null> => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data } = await supabase
      .from("memberships")
      .select(
        "role, tenant:tenants(id, name, slug, city, brand_primary, dian_enabled)",
      )
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (!data || !data.tenant) return null;

    // La relación puede venir como objeto o arreglo según el typing.
    const t = (
      Array.isArray(data.tenant) ? data.tenant[0] : data.tenant
    ) as TenantContext["tenant"];

    return { tenantId: t.id, role: data.role as string, tenant: t };
  },
);

/** Roles con permiso de editar catálogo, staff y configuración del negocio. */
export const ADMIN_ROLES = ["propietario", "administrador"] as const;

export function isAdminRole(role: string): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(role);
}
