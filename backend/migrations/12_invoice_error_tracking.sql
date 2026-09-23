-- ============================================================================
-- Migración 12: Trazabilidad de errores de emisión DIAN
-- Sin esta columna, si Factus rechaza una factura (dato faltante, tarifa
-- inválida, etc.) el negocio solo ve "borrador" sin saber por qué.
-- ============================================================================

alter table invoices add column if not exists dian_error text;
