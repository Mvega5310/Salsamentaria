"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext, isAdminRole } from "@/lib/tenant";

type ActionResult = { ok: true } | { ok: false; error: string };

const ENCRYPTION_KEY = process.env.FACTUS_CONFIG_ENCRYPTION_KEY;

export async function saveDianCredentials(formData: FormData): Promise<ActionResult> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: "Sin negocio activo." };
  if (!isAdminRole(ctx.role)) {
    return { ok: false, error: "Solo el propietario puede configurar la facturación DIAN." };
  }
  if (!ENCRYPTION_KEY) {
    return { ok: false, error: "El servidor no tiene configurada la llave de cifrado." };
  }

  const clientId = String(formData.get("clientId") ?? "").trim();
  const clientSecret = String(formData.get("clientSecret") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const numberingRangeId = Number(formData.get("numberingRangeId") ?? 0);

  if (!clientId || !clientSecret || !username || !password) {
    return { ok: false, error: "Completa todos los campos de credenciales." };
  }
  if (!numberingRangeId || numberingRangeId <= 0) {
    return { ok: false, error: "El rango de numeración debe ser un número válido (lo asigna Factus)." };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("set_dian_credentials", {
    p_encryption_key: ENCRYPTION_KEY,
    p_client_id: clientId,
    p_client_secret: clientSecret,
    p_username: username,
    p_password: password,
    p_numbering_range_id: numberingRangeId,
    p_dian_provider: "factus",
  });

  if (error) return { ok: false, error: "No se pudieron guardar las credenciales." };

  revalidatePath("/configuracion/dian");
  revalidatePath("/pos");
  return { ok: true };
}
