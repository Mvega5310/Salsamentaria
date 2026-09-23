-- ============================================================================
-- Migración 14: Credenciales DIAN por tenant (cifradas)
-- Hasta ahora lib/dian/factus-client.ts leía las credenciales de variables
-- de entorno GLOBALES — eso solo sirve para un único negocio. Cada
-- salsamentaría tiene su propio NIT y su propia habilitación DIAN ante
-- Factus, así que cada una necesita sus propias credenciales. Se guardan
-- cifradas con pgcrypto (pgp_sym_encrypt), nunca en texto plano — la llave
-- de cifrado vive solo en la variable de entorno del servidor
-- (FACTUS_CONFIG_ENCRYPTION_KEY), nunca en la base de datos.
-- ============================================================================

alter table tenants add column if not exists dian_credentials bytea;

-- ---------------------------------------------------------------------------
-- Guardar/actualizar credenciales — solo admin del tenant.
-- Marca dian_enabled = true al guardar con éxito: esta es la señal técnica
-- ("ya está configurado") que se combina con el entitlement comercial
-- ("plan Pro pagado") para decidir si el botón de factura DIAN se activa.
-- ---------------------------------------------------------------------------
create or replace function public.set_dian_credentials(
  p_encryption_key text,
  p_client_id text,
  p_client_secret text,
  p_username text,
  p_password text,
  p_numbering_range_id integer,
  p_dian_provider text default 'factus'
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_payload jsonb;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select tenant_id into v_tenant
    from memberships
   where user_id = auth.uid() and is_active
     and role in ('propietario','administrador')
   limit 1;

  if v_tenant is null then
    raise exception 'Sin permiso para configurar la facturación DIAN';
  end if;

  v_payload := jsonb_build_object(
    'client_id', p_client_id,
    'client_secret', p_client_secret,
    'username', p_username,
    'password', p_password,
    'numbering_range_id', p_numbering_range_id
  );

  update tenants
     set dian_credentials = pgp_sym_encrypt(v_payload::text, p_encryption_key),
         dian_provider = p_dian_provider,
         dian_enabled = true
   where id = v_tenant;
end; $$;

grant execute on function public.set_dian_credentials(text, text, text, text, text, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Leer credenciales descifradas — SOLO para uso interno del servidor al
-- emitir una factura (nunca debe llegar al navegador). Cualquier miembro
-- activo del tenant puede invocarla porque un cajero también factura, pero
-- la función NUNCA se expone directamente a fetch del cliente: solo se
-- llama desde una Server Action, que retiene el resultado en el servidor.
-- ---------------------------------------------------------------------------
create or replace function public.get_dian_credentials(p_encryption_key text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_encrypted bytea;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select tenant_id into v_tenant
    from memberships
   where user_id = auth.uid() and is_active
   limit 1;

  if v_tenant is null then
    raise exception 'Sin negocio activo';
  end if;

  select dian_credentials into v_encrypted from tenants where id = v_tenant;
  if v_encrypted is null then
    raise exception 'Este negocio no tiene configurada la facturación DIAN';
  end if;

  return pgp_sym_decrypt(v_encrypted, p_encryption_key)::jsonb;
end; $$;

grant execute on function public.get_dian_credentials(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Saber si ya hay credenciales configuradas, SIN decidir nada sensible —
-- para que la UI de configuración pueda mostrar "ya configurado" sin
-- necesitar la llave de cifrado.
-- ---------------------------------------------------------------------------
create or replace function public.has_dian_credentials()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tenants t
    join memberships m on m.tenant_id = t.id
    where m.user_id = auth.uid() and m.is_active
      and t.dian_credentials is not null
  );
$$;

grant execute on function public.has_dian_credentials() to authenticated;
