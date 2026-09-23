-- ============================================================================
-- Migración 03: Row-Level Security (aislamiento multi-inquilino)
-- Regla de oro: nadie ve datos de un tenant al que no pertenece.
-- Los helpers son SECURITY DEFINER para leer memberships sin recursión de RLS.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helpers de contexto
-- ---------------------------------------------------------------------------
create or replace function public.user_tenant_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select tenant_id from public.memberships
   where user_id = auth.uid() and is_active;
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.platform_admins where user_id = auth.uid());
$$;

create or replace function public.has_tenant_role(p_tenant uuid, p_roles membership_role[])
returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.memberships
     where user_id = auth.uid() and tenant_id = p_tenant
       and is_active and role = any(p_roles)
  );
$$;

-- ---------------------------------------------------------------------------
-- Activar RLS en todas las tablas
-- ---------------------------------------------------------------------------
alter table profiles              enable row level security;
alter table platform_admins       enable row level security;
alter table plans                 enable row level security;
alter table tenants               enable row level security;
alter table subscriptions         enable row level security;
alter table platform_invoices     enable row level security;
alter table memberships           enable row level security;
alter table categories            enable row level security;
alter table products              enable row level security;
alter table customers             enable row level security;
alter table orders                enable row level security;
alter table order_items           enable row level security;
alter table order_status_history  enable row level security;
alter table payments              enable row level security;
alter table invoice_sequences     enable row level security;
alter table invoices              enable row level security;
alter table inventory_movements   enable row level security;
alter table tenant_counters       enable row level security;

-- ---------------------------------------------------------------------------
-- Perfiles: cada quien el suyo
-- ---------------------------------------------------------------------------
create policy profiles_self on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- Planes: lectura pública (para la landing/pricing); escritura solo admin plataforma
create policy plans_read on plans for select using (is_active or is_platform_admin());
create policy plans_admin on plans for all
  using (is_platform_admin()) with check (is_platform_admin());

-- platform_admins / platform_invoices: solo admin de plataforma
create policy padmins_admin on platform_admins for all
  using (is_platform_admin()) with check (is_platform_admin());
create policy pinvoices_admin on platform_invoices for all
  using (is_platform_admin()) with check (is_platform_admin());

-- ---------------------------------------------------------------------------
-- Tenants: miembros leen su tenant; propietario/admin lo editan; admin plataforma todo
-- ---------------------------------------------------------------------------
create policy tenants_read on tenants for select
  using (id in (select user_tenant_ids()) or is_platform_admin());
create policy tenants_update on tenants for update
  using (has_tenant_role(id, array['propietario','administrador']::membership_role[]) or is_platform_admin())
  with check (has_tenant_role(id, array['propietario','administrador']::membership_role[]) or is_platform_admin());
create policy tenants_admin_all on tenants for all
  using (is_platform_admin()) with check (is_platform_admin());

-- Suscripciones: el tenant las ve; solo admin plataforma las gestiona (evita fraude de plan)
create policy subs_read on subscriptions for select
  using (tenant_id in (select user_tenant_ids()) or is_platform_admin());
create policy subs_admin on subscriptions for all
  using (is_platform_admin()) with check (is_platform_admin());

-- Memberships: miembros del tenant las ven; propietario/admin las gestionan
create policy memb_read on memberships for select
  using (tenant_id in (select user_tenant_ids()) or is_platform_admin());
create policy memb_manage on memberships for all
  using (has_tenant_role(tenant_id, array['propietario','administrador']::membership_role[]) or is_platform_admin())
  with check (has_tenant_role(tenant_id, array['propietario','administrador']::membership_role[]) or is_platform_admin());

-- ---------------------------------------------------------------------------
-- Patrón genérico para tablas con tenant_id:
--   SELECT/INSERT/UPDATE/DELETE permitido si el tenant está entre los del usuario.
-- ---------------------------------------------------------------------------
create policy categories_tenant on categories for all
  using (tenant_id in (select user_tenant_ids()))
  with check (tenant_id in (select user_tenant_ids()));

create policy products_tenant on products for all
  using (tenant_id in (select user_tenant_ids()))
  with check (tenant_id in (select user_tenant_ids()));

create policy customers_tenant on customers for all
  using (tenant_id in (select user_tenant_ids()))
  with check (tenant_id in (select user_tenant_ids()));

create policy orders_tenant on orders for all
  using (tenant_id in (select user_tenant_ids()))
  with check (tenant_id in (select user_tenant_ids()));

create policy payments_tenant on payments for all
  using (tenant_id in (select user_tenant_ids()))
  with check (tenant_id in (select user_tenant_ids()));

create policy invseq_tenant on invoice_sequences for all
  using (tenant_id in (select user_tenant_ids()))
  with check (tenant_id in (select user_tenant_ids()));

create policy invoices_tenant on invoices for all
  using (tenant_id in (select user_tenant_ids()))
  with check (tenant_id in (select user_tenant_ids()));

create policy invmoves_tenant on inventory_movements for all
  using (tenant_id in (select user_tenant_ids()))
  with check (tenant_id in (select user_tenant_ids()));

create policy counters_tenant on tenant_counters for all
  using (tenant_id in (select user_tenant_ids()))
  with check (tenant_id in (select user_tenant_ids()));

-- order_items y order_status_history no tienen tenant_id: se resuelve por el pedido padre
create policy order_items_tenant on order_items for all
  using (exists (select 1 from orders o
                  where o.id = order_items.order_id
                    and o.tenant_id in (select user_tenant_ids())))
  with check (exists (select 1 from orders o
                  where o.id = order_items.order_id
                    and o.tenant_id in (select user_tenant_ids())));

create policy status_hist_tenant on order_status_history for all
  using (exists (select 1 from orders o
                  where o.id = order_status_history.order_id
                    and o.tenant_id in (select user_tenant_ids())))
  with check (exists (select 1 from orders o
                  where o.id = order_status_history.order_id
                    and o.tenant_id in (select user_tenant_ids())));
