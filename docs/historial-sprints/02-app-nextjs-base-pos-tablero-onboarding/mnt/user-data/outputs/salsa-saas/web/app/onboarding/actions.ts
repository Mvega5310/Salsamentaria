"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type OnboardingState = { error: string };

export async function createBusiness(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const name = String(formData.get("name") ?? "").trim();
  const city = String(formData.get("city") ?? "Cartagena").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;

  if (!name) return { error: "Escribe el nombre del negocio." };

  const supabase = createClient();
  const { error } = await supabase.rpc("create_tenant_onboarding", {
    p_name: name,
    p_city: city,
    p_phone: phone,
  });

  if (error) {
    return { error: "No se pudo crear el negocio. Intenta de nuevo." };
  }

  redirect("/pos");
}
