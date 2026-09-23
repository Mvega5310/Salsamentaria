-- ============================================================================
-- Migración 07: RLS de catálogo por rol
-- Las políticas genéricas de 03_rls.sql dejaban editar el catálogo a
-- cualquier miembro del negocio (incluido un cajero). Se reemplazan por:
--   SELECT  -> cualquier miembro activo del tenant
--   INSERT/UPDATE/DELETE -> solo 'propietario' o 'administrador'
-- ============================================================================

drop policy if exists categories_tenant on categories;
drop policy if exists products_tenant  on products;

-- ---- categories ----
create policy categories_read on categories for select
  using (tenant_id in (select user_tenant_ids()));

create policy categories_write on categories for insert
  with check (has_tenant_role(tenant_id, array['propietario','administrador']::membership_role[]));

create policy categories_update on categories for update
  using (has_tenant_role(tenant_id, array['propietario','administrador']::membership_role[]))
  with check (has_tenant_role(tenant_id, array['propietario','administrador']::membership_role[]));

create policy categories_delete on categories for delete
  using (has_tenant_role(tenant_id, array['propietario','administrador']::membership_role[]));

-- ---- products ----
create policy products_read on products for select
  using (tenant_id in (select user_tenant_ids()));

create policy products_write on products for insert
  with check (has_tenant_role(tenant_id, array['propietario','administrador']::membership_role[]));

create policy products_update on products for update
  using (has_tenant_role(tenant_id, array['propietario','administrador']::membership_role[]))
  with check (has_tenant_role(tenant_id, array['propietario','administrador']::membership_role[]));

create policy products_delete on products for delete
  using (has_tenant_role(tenant_id, array['propietario','administrador']::membership_role[]));
