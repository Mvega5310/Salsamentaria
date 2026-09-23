-- ============================================================================
-- Migración 10: Métricas restringidas a roles admin, a nivel de base de datos
-- Las vistas de 04_metrics.sql y 08_metrics_live.sql heredan RLS de orders/
-- products/inventory_movements, que solo exige PERTENECER al tenant — no el
-- rol. La app ya oculta /metricas a un cajero, pero llamando la API de
-- Supabase directamente podía leer costo y margen igual. Se cierra aquí:
-- las vistas analíticas ahora solo devuelven filas para admin del tenant.
-- ============================================================================

create or replace function public.admin_tenant_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select tenant_id from public.memberships
   where user_id = auth.uid() and is_active
     and role in ('propietario','administrador');
$$;

-- ---- v_daily_sales (vista en vivo, 08) ----
create or replace view v_daily_sales
with (security_invoker = true) as
  select
    tenant_id,
    (created_at at time zone 'America/Bogota')::date as day,
    count(*)              as orders_count,
    sum(total)             as gross_total,
    sum(subtotal)           as net_subtotal,
    sum(tax_total)          as tax_total,
    sum(delivery_fee)       as delivery_total,
    round(avg(total), 2)    as avg_ticket
  from orders
  where status <> 'cancelado'
    and created_at >= now() - interval '90 days'
    and tenant_id in (select admin_tenant_ids())
  group by tenant_id, (created_at at time zone 'America/Bogota')::date;

-- ---- v_top_products ----
create or replace view v_top_products
with (security_invoker = true) as
  select
    o.tenant_id, oi.product_id, oi.name, oi.unit,
    sum(oi.qty) as qty_sold, sum(oi.line_total) as revenue, count(distinct o.id) as orders
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.status <> 'cancelado'
    and o.created_at >= now() - interval '30 days'
    and o.tenant_id in (select admin_tenant_ids())
  group by o.tenant_id, oi.product_id, oi.name, oi.unit;

-- ---- v_sales_by_category ----
create or replace view v_sales_by_category
with (security_invoker = true) as
  select
    o.tenant_id, coalesce(c.name, 'Sin categoría') as category,
    sum(oi.line_total) as revenue, sum(oi.qty) as qty
  from order_items oi
  join orders o     on o.id = oi.order_id and o.status <> 'cancelado'
  left join products p on p.id = oi.product_id
  left join categories c on c.id = p.category_id
  where o.tenant_id in (select admin_tenant_ids())
  group by o.tenant_id, coalesce(c.name, 'Sin categoría');

-- ---- v_sales_by_channel ----
create or replace view v_sales_by_channel
with (security_invoker = true) as
  select tenant_id, channel,
         count(*) as orders, sum(total) as revenue, round(avg(total),2) as avg_ticket
  from orders
  where status <> 'cancelado'
    and tenant_id in (select admin_tenant_ids())
  group by tenant_id, channel;

-- ---- v_payment_mix ----
create or replace view v_payment_mix
with (security_invoker = true) as
  select tenant_id, method, count(*) as tx, sum(amount) as amount
  from payments
  where status = 'pagado'
    and tenant_id in (select admin_tenant_ids())
  group by tenant_id, method;

-- ---- v_fulfillment_time ----
create or replace view v_fulfillment_time
with (security_invoker = true) as
  with marks as (
    select o.tenant_id, o.id,
           min(h.changed_at) filter (where h.to_status = 'recibido')  as t_recibido,
           min(h.changed_at) filter (where h.to_status = 'entregado') as t_entregado
    from orders o
    join order_status_history h on h.order_id = o.id
    where o.tenant_id in (select admin_tenant_ids())
    group by o.tenant_id, o.id
  )
  select tenant_id,
         count(*) filter (where t_entregado is not null) as delivered,
         round(avg(extract(epoch from (t_entregado - t_recibido))/60)
               filter (where t_entregado is not null), 1) as avg_minutes
  from marks
  group by tenant_id;

-- ---- v_product_margin (contiene costo — la más sensible) ----
create or replace view v_product_margin
with (security_invoker = true) as
  select
    o.tenant_id, oi.product_id, oi.name,
    sum(oi.line_subtotal)                       as revenue_base,
    sum(coalesce(p.cost,0) * oi.qty)            as cost_total,
    sum(oi.line_subtotal - coalesce(p.cost,0) * oi.qty) as gross_margin
  from order_items oi
  join orders o on o.id = oi.order_id and o.status <> 'cancelado'
  left join products p on p.id = oi.product_id
  where o.tenant_id in (select admin_tenant_ids())
  group by o.tenant_id, oi.product_id, oi.name;

-- ---- v_waste (contiene costo) ----
create or replace view v_waste
with (security_invoker = true) as
  select m.tenant_id, m.product_id, p.name,
         sum(abs(m.qty)) as qty_lost,
         sum(abs(m.qty) * coalesce(p.cost,0)) as cost_lost
  from inventory_movements m
  join products p on p.id = m.product_id
  where m.type = 'merma'
    and m.tenant_id in (select admin_tenant_ids())
  group by m.tenant_id, m.product_id, p.name;

-- ---- v_tax_by_regime ----
create or replace view v_tax_by_regime
with (security_invoker = true) as
  select o.tenant_id, oi.tax_regime,
         sum(oi.line_subtotal) as base, sum(oi.line_tax) as tax
  from order_items oi
  join orders o on o.id = oi.order_id and o.status <> 'cancelado'
  where o.tenant_id in (select admin_tenant_ids())
  group by o.tenant_id, oi.tax_regime;

-- ---------------------------------------------------------------------------
-- Nota: mv_daily_sales (materializada, 04_metrics.sql) no se toca aquí.
-- Al ser materializada y refrescada por un job (no por el usuario que
-- consulta), no puede aplicar security_invoker por fila; si en el futuro se
-- expone directamente a la app, filtrar por tenant_id + rol en el código,
-- igual que hoy hace /metricas con getTenantContext().
-- ---------------------------------------------------------------------------
