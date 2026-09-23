import { createClient } from "@supabase/supabase-js";

/**
 * Cliente con service role — solo para rutas servidor-a-servidor (webhooks,
 * cron) sin sesión de usuario. Se crea de forma perezosa a propósito:
 * instanciarlo a nivel de módulo rompe `next build` en cuanto las env vars
 * no están disponibles en tiempo de compilación (p. ej. sin `.env.local`).
 */
export function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
