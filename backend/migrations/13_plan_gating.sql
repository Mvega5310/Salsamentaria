-- ============================================================================
-- Migración 13: Cambio de plan (gating comercial)
-- Mismo patrón que attach_subscription_payment_source (migración 11): una
-- función estrecha en vez de abrir subscriptions.UPDATE por completo. Cambiar
-- de plan_id NUNCA activa la suscripción por sí solo — status solo pasa a
-- 'activa' cuando el webhook de Wompi confirma un cobro real (ver
-- /api/webhooks/wompi). Esto es lo que impide que un tenant se "actualice a
-- Pro" sin pagar y active DIAN solo con este cambio.
-- ============================================================================

create or replace function public.change_subscription_plan(p_plan_code text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_plan uuid;
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

  select id into v_plan from plans where code = p_plan_code and is_active;
  if v_plan is null then
    raise exception 'Plan inválido: %', p_plan_code;
  end if;

  update subscriptions
     set plan_id = v_plan
   where tenant_id = v_tenant;

  if not found then
    raise exception 'No hay una suscripción activa para este negocio';
  end if;
end; $$;

grant execute on function public.change_subscription_plan(text) to authenticated;
