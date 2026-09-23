-- ============================================================================
-- Migración 16: Realtime en pedidos
-- Supabase Realtime respeta el RLS de la tabla (evalúa las mismas policies
-- que un SELECT normal), así que un cajero solo recibe eventos de SU
-- negocio — mismo aislamiento que ya existe, sin superficie nueva. Se
-- envuelve en un bloque que no falla si la publicación no existe (algunos
-- entornos self-hosted no traen Realtime activado).
-- ============================================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table orders';
  end if;
end $$;
