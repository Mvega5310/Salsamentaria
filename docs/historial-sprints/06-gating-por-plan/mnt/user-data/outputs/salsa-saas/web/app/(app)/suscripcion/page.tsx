import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext, isAdminRole } from "@/lib/tenant";
import { getEntitlements } from "@/lib/entitlements";
import { wompiPublicKey, wompiEnv } from "@/lib/billing/wompi";
import SuscripcionClient from "./suscripcion-client";

export const dynamic = "force-dynamic";

export default async function SuscripcionPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/onboarding");
  if (!isAdminRole(ctx.role)) redirect("/pos");

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: sub }, { data: invoices }, { data: plans }, entitlements] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("id, status, provider, provider_ref, trial_ends_at, current_period_end, plan:plans(code, name, price, interval)")
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle(),
    supabase
      .from("platform_invoices")
      .select("concept, amount, status, issued_at, paid_at")
      .eq("tenant_id", ctx.tenantId)
      .order("issued_at", { ascending: false })
      .limit(10),
    supabase
      .from("plans")
      .select("code, name, description, price, interval, features")
      .eq("is_active", true)
      .order("sort_order"),
    getEntitlements(ctx.tenantId),
  ]);

  const plan = sub ? (Array.isArray(sub.plan) ? sub.plan[0] : sub.plan) : null;

  return (
    <SuscripcionClient
      email={user?.email ?? ""}
      publicKey={wompiPublicKey}
      env={wompiEnv}
      isPaidAndActive={entitlements.isPaidAndActive}
      subscription={
        sub
          ? {
              status: sub.status,
              hasPaymentMethod: sub.provider === "wompi" && !!sub.provider_ref,
              trialEndsAt: sub.trial_ends_at,
              currentPeriodEnd: sub.current_period_end,
              planCode: plan?.code ?? "basico",
              planName: plan?.name ?? "—",
              planPrice: Number(plan?.price ?? 0),
              planInterval: plan?.interval ?? "mensual",
            }
          : null
      }
      plans={(plans ?? []).map((p) => ({
        code: p.code,
        name: p.name,
        description: p.description,
        price: Number(p.price),
        interval: p.interval,
        dianIncluded: (p.features as Record<string, unknown>)?.dian === true,
      }))}
      invoices={(invoices ?? []).map((i) => ({
        concept: i.concept,
        amount: Number(i.amount),
        status: i.status,
        date: i.paid_at ?? i.issued_at,
      }))}
    />
  );
}
