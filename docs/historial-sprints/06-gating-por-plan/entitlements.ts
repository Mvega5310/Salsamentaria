import { cache } from "react";
import { createClient } from "./supabase/server";

export type Entitlements = {
  planCode: string;
  planName: string;
  status: string;
  /** true solo si el plan incluye la feature Y la suscripción está pagada */
  isPaidAndActive: boolean;
  dianEnabled: boolean;
  advancedMetrics: boolean;
  inventoryEnabled: boolean;
  maxProducts: number | null;
  maxStaff: number | null;
};

const FALLBACK: Entitlements = {
  planCode: "basico",
  planName: "Básico",
  status: "trialing",
  isPaidAndActive: false,
  dianEnabled: false,
  advancedMetrics: false,
  inventoryEnabled: false,
  maxProducts: null,
  maxStaff: null,
};

/**
 * Una feature "premium" (DIAN, métricas avanzadas, inventario) requiere DOS
 * cosas a la vez: que el plan la incluya Y que la suscripción esté con
 * status='activa' — eso solo lo pone el webhook de Wompi tras un cobro real
 * (ver /api/webhooks/wompi). Estar en trial de un plan Pro NO cuenta como
 * "pagado": así lo pidió el negocio explícitamente.
 */
export const getEntitlements = cache(
  async (tenantId: string): Promise<Entitlements> => {
    const supabase = createClient();
    const { data } = await supabase
      .from("subscriptions")
      .select("status, plan:plans(code, name, features, max_products, max_staff)")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!data) return FALLBACK;

    const plan = Array.isArray(data.plan) ? data.plan[0] : data.plan;
    if (!plan) return FALLBACK;

    const isPaidAndActive = data.status === "activa";
    const features = (plan.features ?? {}) as Record<string, unknown>;

    return {
      planCode: plan.code,
      planName: plan.name,
      status: data.status,
      isPaidAndActive,
      dianEnabled: isPaidAndActive && features.dian === true,
      advancedMetrics: isPaidAndActive && features.metricas === "avanzadas",
      inventoryEnabled: isPaidAndActive && features.inventario === true,
      maxProducts: plan.max_products,
      maxStaff: plan.max_staff,
    };
  },
);
