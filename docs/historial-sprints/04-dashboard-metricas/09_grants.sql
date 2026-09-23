-- ============================================================================
-- Migración 09: Permisos sobre vistas de métricas
-- RLS controla QUÉ filas se ven; GRANT controla si el rol puede consultar la
-- vista siquiera. Supabase normalmente ya concede esto por defecto, pero se
-- declara explícito aquí para que el esquema no dependa de esa configuración
-- implícita (portabilidad a self-hosted / proyectos nuevos).
-- ============================================================================

grant select on
  v_daily_sales, v_top_products, v_sales_by_category, v_sales_by_channel,
  v_payment_mix, v_fulfillment_time, v_product_margin, v_waste, v_tax_by_regime,
  v_sales_orders
to authenticated;

-- Vistas de plataforma: RLS de las tablas base ya las restringe a admin de
-- plataforma (is_platform_admin()), así que conceder SELECT aquí es seguro.
grant select on v_platform_mrr, v_platform_tenants to authenticated;

-- Cualquier vista nueva que se cree en el futuro también queda expuesta
-- automáticamente al rol authenticated (mismo criterio que Supabase aplica
-- por defecto), para no repetir este paso en cada migración.
alter default privileges in schema public grant select on tables to authenticated;
