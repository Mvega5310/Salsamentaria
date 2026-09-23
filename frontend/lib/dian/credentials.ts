import { createClient } from "@/lib/supabase/server";
import type { FactusCredentials } from "./factus-client";

const ENCRYPTION_KEY = process.env.FACTUS_CONFIG_ENCRYPTION_KEY;

/**
 * Descifra y devuelve las credenciales Factus del negocio del usuario
 * autenticado (vía RPC get_dian_credentials, migración 14). Lanza si no
 * hay credenciales configuradas o si la llave de cifrado no coincide.
 *
 * SOLO llamar desde Server Actions o Route Handlers — el resultado nunca
 * debe incluirse en lo que se devuelve al cliente.
 */
export async function getTenantDianCredentials(): Promise<FactusCredentials> {
  if (!ENCRYPTION_KEY) {
    throw new Error("FACTUS_CONFIG_ENCRYPTION_KEY no está configurada en el servidor.");
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_dian_credentials", {
    p_encryption_key: ENCRYPTION_KEY,
  });

  if (error || !data) {
    throw new Error(
      error?.message ?? "Este negocio no tiene configurada la facturación DIAN.",
    );
  }

  return data as FactusCredentials;
}
