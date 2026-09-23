-- ============================================================================
-- Migración 11: Permisos para el flujo de suscripción (Wompi)
-- Al construir /suscripcion se encontraron dos huecos reales en 03_rls.sql:
--   1. subs_admin exigía ser admin de PLATAFORMA para actualizar una
--      suscripción — un dueño de negocio no podía ni guardar su propia
--      tarjeta. Se resuelve con una RPC estrecha que solo toca
--      provider/provider_ref, nunca plan_id ni status (eso evita que un
--      tenant se "active" a sí mismo sin pagar).
--   2. pinvoices_admin solo dejaba leer platform_invoices a admin de
--      plataforma — un dueño de negocio no podía ver su propio historial
--      de cobros. Se agrega una policy de solo lectura para admins del
--      tenant dueño de la factura.
-- ============================================================================

create or replace function public.attach_subscription_payment_source(
  p_provider text,
  p_provider_ref text
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
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
    raise exception 'Sin permiso para gestionar la suscripción';
  end if;

  update subscriptions
     set provider = p_provider,
         provider_ref = p_provider_ref
   where tenant_id = v_tenant;

  if not found then
    raise exception 'No hay una suscripción activa para este negocio';
  end if;
end; $$;

grant execute on function public.attach_subscription_payment_source(text, text) to authenticated;

-- Lectura de facturas de plataforma para el dueño del negocio (antes solo
-- admin de plataforma podía leerlas — el propio tenant no veía su historial).
create policy pinvoices_tenant_read on platform_invoices for select
  using (has_tenant_role(tenant_id, array['propietario','administrador']::membership_role[]));

-- El webhook hace upsert por provider_ref (el id de transacción de Wompi es
-- único); sin este índice el ON CONFLICT no tiene contra qué resolver.
create unique index uq_platform_invoices_provider_ref
  on platform_invoices(provider_ref) where provider_ref is not null;
