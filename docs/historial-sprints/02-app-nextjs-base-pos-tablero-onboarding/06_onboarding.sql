-- ============================================================================
-- Migración 06: Onboarding de negocio (bootstrap seguro)
-- Un usuario autenticado NO puede insertar tenants directamente (no hay policy
-- para eso, a propósito). Este RPC SECURITY DEFINER crea el negocio, lo hace
-- propietario, inicializa el contador y arranca una suscripción trial de 14 días.
-- ============================================================================

create or replace function create_tenant_onboarding(
  p_name text,
  p_city text default 'Cartagena',
  p_phone text default null,
  p_slug text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_slug   text;
  v_plan   uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  -- Slug base a partir del nombre; si choca, se le agrega sufijo aleatorio
  v_slug := coalesce(nullif(trim(p_slug),''),
                     lower(regexp_replace(p_name, '[^a-zA-Z0-9]+', '-', 'g')));
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then v_slug := 'negocio'; end if;
  if exists (select 1 from tenants where slug = v_slug) then
    v_slug := v_slug || '-' || substr(gen_random_uuid()::text, 1, 4);
  end if;

  insert into tenants (slug, name, city, phone, status)
    values (v_slug, p_name, coalesce(p_city,'Cartagena'), p_phone, 'trial')
    returning id into v_tenant;

  insert into memberships (tenant_id, user_id, role)
    values (v_tenant, auth.uid(), 'propietario');

  insert into tenant_counters (tenant_id, order_seq)
    values (v_tenant, 0);

  select id into v_plan from plans where code = 'basico' limit 1;
  if v_plan is not null then
    insert into subscriptions (tenant_id, plan_id, status, trial_ends_at, current_period_end)
      values (v_tenant, v_plan, 'trialing', now() + interval '14 days', now() + interval '14 days');
  end if;

  return v_tenant;
end; $$;

grant execute on function create_tenant_onboarding(text,text,text,text) to authenticated;
