"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext, isAdminRole } from "@/lib/tenant";
import { savePaymentSource, chargePaymentSource } from "@/lib/billing/wompi";

type ActionResult = { ok: true } | { ok: false; error: string };

async function requireAdmin() {
  const ctx = await getTenantContext();
  if (!ctx) return { ctx: null, error: "Sin negocio activo." } as const;
  if (!isAdminRole(ctx.role)) {
    return { ctx: null, error: "Solo el propietario puede gestionar la suscripción." } as const;
  }
  return { ctx, error: null } as const;
}

/**
 * El navegador tokeniza la tarjeta directamente contra Wompi (con la llave
 * pública — los datos de la tarjeta nunca tocan nuestro servidor). Esta
 * acción solo recibe el token ya generado y lo convierte en una fuente de
 * pago reutilizable, guardada en la suscripción del tenant.
 */
export async function attachPaymentMethod(params: {
  cardToken: string;
  email: string;
}): Promise<ActionResult> {
  const { ctx, error } = await requireAdmin();
  if (!ctx) return { ok: false, error: error! };

  try {
    const { paymentSourceId } = await savePaymentSource({
      cardToken: params.cardToken,
      customerEmail: params.email,
    });

    const supabase = createClient();
    const { error: dbError } = await supabase.rpc("attach_subscription_payment_source", {
      p_provider: "wompi",
      p_provider_ref: String(paymentSourceId),
    });

    if (dbError) return { ok: false, error: "La tarjeta se guardó en Wompi pero no se pudo asociar a tu cuenta. Contáctanos." };

    revalidatePath("/suscripcion");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar el método de pago." };
  }
}

export async function switchPlan(planCode: string): Promise<ActionResult> {
  const { ctx, error } = await requireAdmin();
  if (!ctx) return { ok: false, error: error! };

  const supabase = createClient();
  const { error: dbError } = await supabase.rpc("change_subscription_plan", {
    p_plan_code: planCode,
  });

  if (dbError) return { ok: false, error: "No se pudo cambiar de plan." };

  revalidatePath("/suscripcion");
  return { ok: true };
}

/**
 * Cobro manual — para probar el flujo end-to-end hoy. En producción, esto
 * mismo lo dispara un cron mensual por cada suscripción con provider='wompi'
 * y current_period_end vencido (ver ARQUITECTURA.md).
 */
export async function chargeNow(): Promise<ActionResult> {
  const { ctx, error } = await requireAdmin();
  if (!ctx) return { ok: false, error: error! };

  const supabase = createClient();
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, provider, provider_ref, plan:plans(price)")
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();

  if (!sub || sub.provider !== "wompi" || !sub.provider_ref) {
    return { ok: false, error: "No hay un método de pago guardado todavía." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const plan = Array.isArray(sub.plan) ? sub.plan[0] : sub.plan;
  const price = Number(plan?.price ?? 0);
  if (price <= 0) return { ok: false, error: "El plan actual no tiene un precio de cobro." };

  try {
    // No escribimos platform_invoices aquí: ese registro lo crea el webhook
    // de Wompi (route /api/webhooks/wompi) cuando confirma el resultado real
    // del cobro. Escribirlo desde el cliente optimistamente sería confiar en
    // el navegador para algo que debe salir solo de la fuente de verdad del
    // proveedor de pagos.
    await chargePaymentSource({
      paymentSourceId: Number(sub.provider_ref),
      amountInCents: Math.round(price * 100),
      reference: `sub-${sub.id}-${Date.now()}`,
      customerEmail: user?.email ?? "facturacion@salsapos.co",
    });

    revalidatePath("/suscripcion");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "El cobro no pudo procesarse." };
  }
}
