-- ============================================================================
-- Migración 05: Semilla (planes + tenant demo "La Costeña")
-- ⚠️ IMPORTANTE — CLASIFICACIÓN DE IVA:
--   Los regímenes asignados abajo son un PUNTO DE PARTIDA razonable, NO una
--   verdad fiscal. En Colombia la clasificación (excluido/exento/gravado)
--   depende de la partida arancelaria y del grado de procesamiento del
--   producto. DEBE validarse con el contador del negocio antes de facturar
--   ante la DIAN. El modelo soporta cualquier régimen por producto; aquí solo
--   sembramos valores plausibles para poder probar.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Planes del SaaS
-- ---------------------------------------------------------------------------
insert into plans (code, name, description, price, interval, max_products, max_staff, max_orders_month, features, sort_order) values
  ('basico','Básico','POS + catálogo PWA + recibo interno', 59000,'mensual', 80, 3, 800,
   '{"dian":false,"tablero":true,"metricas":"basicas","inventario":false,"soporte":"email"}', 1),
  ('pro','Pro','Todo lo del Básico + factura electrónica DIAN + inventario + métricas avanzadas', 129000,'mensual', null, 10, null,
   '{"dian":true,"tablero":true,"metricas":"avanzadas","inventario":true,"soporte":"prioritario","whatsapp":true}', 2),
  ('perpetuo','Licencia + Mantenimiento','Venta única del sistema + fee de mantenimiento anual', 2500000,'unico', null, null, null,
   '{"dian":true,"tablero":true,"metricas":"avanzadas","inventario":true,"mantenimiento_anual":true}', 3)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Tenant demo
-- ---------------------------------------------------------------------------
insert into tenants (id, slug, name, legal_name, nit, doc_type, status, city, phone,
                     order_prefix, delivery_fee_default, brand_primary, brand_ink, brand_bg)
values ('00000000-0000-0000-0000-0000000000aa',
        'la-costena', 'La Costeña Salsamentaria', 'La Costeña S.A.S.', '900123456', 'NIT',
        'activo', 'Cartagena', '+57 300 000 0000',
        'CTG', 6000, '#B23A1E', '#2A1C16', '#EFE7DC')
on conflict (id) do nothing;

-- Contador y secuencia de facturación DIAN del tenant demo
insert into tenant_counters (tenant_id, order_seq)
  values ('00000000-0000-0000-0000-0000000000aa', 1041)
on conflict (tenant_id) do nothing;

insert into invoice_sequences (tenant_id, prefix, resolution, range_from, range_to, current, valid_until)
  values ('00000000-0000-0000-0000-0000000000aa', 'FE', '18760000001', 1, 5000, 1, '2027-12-31')
on conflict (tenant_id, prefix) do nothing;

-- El tenant demo se creó por SQL directo, no por el RPC de onboarding —
-- así que, a diferencia de un negocio real, no tenía fila en `subscriptions`.
-- Se agrega aquí para que la demo funcione igual que un negocio real.
insert into subscriptions (tenant_id, plan_id, status, trial_ends_at, current_period_end)
  select '00000000-0000-0000-0000-0000000000aa', id, 'trialing',
         now() + interval '14 days', now() + interval '14 days'
  from plans where code = 'basico'
  limit 1
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Categorías
-- ---------------------------------------------------------------------------
insert into categories (id, tenant_id, name, sort_order) values
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000aa','Embutidos',1),
  ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000aa','Quesos',2),
  ('00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000aa','Carnes frías',3),
  ('00000000-0000-0000-0000-0000000000c4','00000000-0000-0000-0000-0000000000aa','Lácteos',4)
on conflict (tenant_id, name) do nothing;

-- ---------------------------------------------------------------------------
-- Productos (precio IVA incluido, régimen por producto — VALIDAR CON CONTADOR)
--   Nota: quesos frescos y lácteos suelen ser excluidos; embutidos/carnes
--   procesadas suelen ser gravados. Ajustar según partida arancelaria real.
-- ---------------------------------------------------------------------------
insert into products (tenant_id, category_id, name, slug, unit, step, price, cost, tax_regime, track_inventory, stock) values
  ('00000000-0000-0000-0000-0000000000aa','00000000-0000-0000-0000-0000000000c1','Jamón de cerdo ahumado','jamon','kg',0.250,28500,19000,'gravado_19', true, 40),
  ('00000000-0000-0000-0000-0000000000aa','00000000-0000-0000-0000-0000000000c2','Queso costeño artesanal','queso-costeno','kg',0.250,32000,22000,'excluido',   true, 30),
  ('00000000-0000-0000-0000-0000000000aa','00000000-0000-0000-0000-0000000000c1','Salchichón cervecero','salchichon','kg',0.250,21900,14500,'gravado_19', true, 25),
  ('00000000-0000-0000-0000-0000000000aa','00000000-0000-0000-0000-0000000000c1','Butifarra soledeña','butifarra','und',1,900,600,'gravado_19', true, 200),
  ('00000000-0000-0000-0000-0000000000aa','00000000-0000-0000-0000-0000000000c3','Chorizo cartagenero','chorizo','kg',0.250,24500,16000,'gravado_19', true, 20),
  ('00000000-0000-0000-0000-0000000000aa','00000000-0000-0000-0000-0000000000c4','Suero costeño 500 ml','suero','und',1,8500,5500,'excluido',   true, 60),
  ('00000000-0000-0000-0000-0000000000aa','00000000-0000-0000-0000-0000000000c2','Queso mozzarella bloque','mozzarella','kg',0.250,26900,18000,'gravado_19', true, 22),
  ('00000000-0000-0000-0000-0000000000aa','00000000-0000-0000-0000-0000000000c3','Mortadela de pollo','mortadela','kg',0.250,15400,9800,'gravado_19', true, 18)
on conflict (tenant_id, slug) do nothing;

-- ---------------------------------------------------------------------------
-- Para vincular tu usuario al tenant demo como propietario, tras registrarte:
--   insert into memberships (tenant_id, user_id, role)
--   values ('00000000-0000-0000-0000-0000000000aa', auth.uid(), 'propietario');
-- Y para hacerte admin de plataforma:
--   insert into platform_admins (user_id) values ('<tu-uuid>');
-- ---------------------------------------------------------------------------
