-- ============================================================================
-- Migración 18: Corrige índices únicos para que ON CONFLICT funcione
-- Los índices de las migraciones 11 y 17 eran ÚNICOS PARCIALES
-- (`where provider_ref is not null`). Postgres exige que la cláusula
-- ON CONFLICT (columna) repita exactamente el predicado del índice para
-- poder usarlo como destino de inferencia — ni el upsert de
-- Supabase-JS (`onConflict: 'provider_ref'`) ni un ON CONFLICT plano lo
-- hacen, así que los upserts de los webhooks fallaban en la práctica.
-- La solución es más simple que el problema: en SQL, NULL nunca es igual a
-- NULL, así que un índice único NORMAL ya permite múltiples filas con
-- provider_ref nulo sin necesitar la condición parcial.
-- ============================================================================

drop index if exists uq_platform_invoices_provider_ref;
create unique index uq_platform_invoices_provider_ref on platform_invoices(provider_ref);

drop index if exists uq_payments_provider_ref;
create unique index uq_payments_provider_ref on payments(provider_ref);
