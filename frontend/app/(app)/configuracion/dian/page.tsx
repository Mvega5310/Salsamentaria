import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext, isAdminRole } from "@/lib/tenant";
import DianConfigClient from "./dian-client";

export const dynamic = "force-dynamic";

export default async function DianConfigPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/onboarding");
  if (!isAdminRole(ctx.role)) redirect("/pos");

  const supabase = createClient();
  const { data: configured } = await supabase.rpc("has_dian_credentials");

  return <DianConfigClient alreadyConfigured={!!configured} />;
}
