-- ============================================================================
-- Migración 08: Ventas diarias en vivo (para el dashboard)
-- mv_daily_sales (04_metrics.sql) es materializada y solo se actualiza con
-- refresh_metrics() / pg_cron. El dashboard necesita datos del día en curso
-- sin depender de ese cron, así que se agrega una vista normal equivalente,
-- acotada a 90 días para que el índice idx_orders_tenant_created la resuelva
-- rápido. Para reportes históricos pesados, usar mv_daily_sales.
-- ============================================================================

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
  group by tenant_id, (created_at at time zone 'America/Bogota')::date;
