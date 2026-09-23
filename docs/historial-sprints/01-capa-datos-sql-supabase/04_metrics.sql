-- ============================================================================
-- Migración 04: Capa de métricas y analítica
-- Vistas para el dashboard del negocio + vistas de plataforma para el SaaS.
-- Todas respetan RLS al consultarse con el token del usuario (security_invoker).
-- ============================================================================

-- Solo pedidos "vendidos" cuentan para ventas (excluye cancelados)
create or replace view v_sales_orders
with (security_invoker = true) as
  select * from orders where status <> 'cancelado';

-- ---------------------------------------------------------------------------
-- 1. Ventas diarias por tenant (base del dashboard)
--    Materializada: agregados pesados; refrescar con refresh_metrics().
-- ---------------------------------------------------------------------------
create materialized view mv_daily_sales as
  select
    tenant_id,
    (created_at at time zone 'America/Bogota')::date as day,
    count(*)                       as orders_count,
    sum(total)                     as gross_total,     -- IVA incluido
    sum(subtotal)                  as net_subtotal,    -- base sin IVA
    sum(tax_total)                 as tax_total,
    sum(delivery_fee)              as delivery_total,
    round(avg(total), 2)           as avg_ticket
  from orders
  where status <> 'cancelado'
  group by tenant_id, (created_at at time zone 'America/Bogota')::date;

create unique index uq_mv_daily_sales on mv_daily_sales(tenant_id, day);

-- ---------------------------------------------------------------------------
-- 2. Top productos (30 días) — cantidad e ingresos
-- ---------------------------------------------------------------------------
create or replace view v_top_products
with (security_invoker = true) as
  select
    o.tenant_id,
    oi.product_id,
    oi.name,
    oi.unit,
    sum(oi.qty)          as qty_sold,
    sum(oi.line_total)   as revenue,
    count(distinct o.id) as orders
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.status <> 'cancelado'
    and o.created_at >= now() - interval '30 days'
  group by o.tenant_id, oi.product_id, oi.name, oi.unit;

-- ---------------------------------------------------------------------------
-- 3. Ventas por categoría
-- ---------------------------------------------------------------------------
create or replace view v_sales_by_category
with (security_invoker = true) as
  select
    o.tenant_id,
    coalesce(c.name, 'Sin categoría') as category,
    sum(oi.line_total) as revenue,
    sum(oi.qty)        as qty
  from order_items oi
  join orders o     on o.id = oi.order_id and o.status <> 'cancelado'
  left join products p on p.id = oi.product_id
  left join categories c on c.id = p.category_id
  group by o.tenant_id, coalesce(c.name, 'Sin categoría');

-- ---------------------------------------------------------------------------
-- 4. Ventas por canal (PWA / mostrador / whatsapp)
-- ---------------------------------------------------------------------------
create or replace view v_sales_by_channel
with (security_invoker = true) as
  select tenant_id, channel,
         count(*) as orders, sum(total) as revenue, round(avg(total),2) as avg_ticket
  from orders where status <> 'cancelado'
  group by tenant_id, channel;

-- ---------------------------------------------------------------------------
-- 5. Mezcla de medios de pago
-- ---------------------------------------------------------------------------
create or replace view v_payment_mix
with (security_invoker = true) as
  select tenant_id, method, count(*) as tx, sum(amount) as amount
  from payments where status = 'pagado'
  group by tenant_id, method;

-- ---------------------------------------------------------------------------
-- 6. Tiempo de cumplimiento (de 'recibido' a 'entregado'), promedio en minutos
-- ---------------------------------------------------------------------------
create or replace view v_fulfillment_time
with (security_invoker = true) as
  with marks as (
    select o.tenant_id, o.id,
           min(h.changed_at) filter (where h.to_status = 'recibido')  as t_recibido,
           min(h.changed_at) filter (where h.to_status = 'entregado') as t_entregado
    from orders o
    join order_status_history h on h.order_id = o.id
    group by o.tenant_id, o.id
  )
  select tenant_id,
         count(*) filter (where t_entregado is not null) as delivered,
         round(avg(extract(epoch from (t_entregado - t_recibido))/60)
               filter (where t_entregado is not null), 1) as avg_minutes
  from marks
  group by tenant_id;

-- ---------------------------------------------------------------------------
-- 7. Margen bruto por producto (requiere cost cargado)
-- ---------------------------------------------------------------------------
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
  group by o.tenant_id, oi.product_id, oi.name;

-- ---------------------------------------------------------------------------
-- 8. Merma / pérdida de producto (crítico en salsamentaría)
-- ---------------------------------------------------------------------------
create or replace view v_waste
with (security_invoker = true) as
  select m.tenant_id, m.product_id, p.name,
         sum(abs(m.qty)) as qty_lost,
         sum(abs(m.qty) * coalesce(p.cost,0)) as cost_lost
  from inventory_movements m
  join products p on p.id = m.product_id
  where m.type = 'merma'
  group by m.tenant_id, m.product_id, p.name;

-- ---------------------------------------------------------------------------
-- 9. Impuestos recaudados por régimen (para conciliación DIAN)
-- ---------------------------------------------------------------------------
create or replace view v_tax_by_regime
with (security_invoker = true) as
  select o.tenant_id, oi.tax_regime,
         sum(oi.line_subtotal) as base, sum(oi.line_tax) as tax
  from order_items oi
  join orders o on o.id = oi.order_id and o.status <> 'cancelado'
  group by o.tenant_id, oi.tax_regime;

-- ===========================================================================
-- MÉTRICAS DE PLATAFORMA (solo admin de plataforma — RLS de las tablas aplica)
-- ===========================================================================

-- MRR: ingreso recurrente mensual (normaliza anual a /12, ignora 'unico')
create or replace view v_platform_mrr
with (security_invoker = true) as
  select
    count(*) filter (where s.status = 'activa') as active_subscriptions,
    sum(case pl.interval
          when 'mensual' then pl.price
          when 'anual'   then pl.price / 12
          else 0 end) filter (where s.status = 'activa') as mrr
  from subscriptions s
  join plans pl on pl.id = s.plan_id;

-- Estado de tenants (embudo trial → activo → churn)
create or replace view v_platform_tenants
with (security_invoker = true) as
  select status, count(*) as tenants from tenants group by status;

-- ---------------------------------------------------------------------------
-- Refresco de vistas materializadas (programar con pg_cron cada 5-15 min)
--   select cron.schedule('refresh_metrics','*/10 * * * *','select refresh_metrics()');
-- ---------------------------------------------------------------------------
create or replace function refresh_metrics()
returns void language plpgsql security definer as $$
begin
  refresh materialized view concurrently mv_daily_sales;
end; $$;
