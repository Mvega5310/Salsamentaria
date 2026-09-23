-- ============================================================================
-- SalsaPOS — Plataforma SaaS multi-inquilino para salsamentarías (Colombia)
-- Migración 01: Esquema base
-- Motor: PostgreSQL 15+ / Supabase
-- ----------------------------------------------------------------------------
-- Convención: identificadores en inglés, valores de dominio (estados) en
-- español porque se muestran/consumen tal cual. Todo importe en COP con
-- numeric(14,2); cantidades con numeric(12,3) para soportar gramos (0,250 kg).
-- ============================================================================

create extension if not exists pgcrypto;      -- gen_random_uuid()
create extension if not exists pg_trgm;        -- búsqueda por nombre en catálogo

-- ---------------------------------------------------------------------------
-- 0. ENUMS (tipos de dominio)
-- ---------------------------------------------------------------------------
create type tenant_status        as enum ('trial','activo','suspendido','cancelado');
create type membership_role      as enum ('propietario','administrador','cajero','domiciliario');
create type subscription_status  as enum ('trialing','activa','vencida','suspendida','cancelada');
create type billing_interval     as enum ('mensual','anual','unico');   -- 'unico' = venta perpetua

create type product_unit         as enum ('kg','g','lb','und','l','ml');
-- Régimen de IVA por producto. ESTO reemplaza el "÷1,19" global del diseño.
create type tax_regime           as enum ('gravado_19','gravado_5','exento','excluido');

create type order_channel        as enum ('pwa','mostrador','whatsapp');
create type fulfillment_type     as enum ('domicilio','recoger','mostrador');
create type order_status         as enum ('recibido','confirmado','preparando','en_camino','entregado','cancelado');
create type payment_method       as enum ('efectivo','tarjeta','transferencia','contra_entrega','nequi','daviplata','otro');
create type payment_status       as enum ('pendiente','pagado','fallido','reembolsado');

create type invoice_type         as enum ('factura_electronica','recibo_interno');
create type invoice_status       as enum ('borrador','emitida','aceptada','rechazada','anulada');
create type doc_type             as enum ('CC','NIT','CE','PP','TI','NUIP');

create type inventory_move_type  as enum ('compra','venta','ajuste','merma','devolucion');

-- ---------------------------------------------------------------------------
-- Utilidad: updated_at automático
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end; $$;

-- ===========================================================================
-- 1. PLATAFORMA (SaaS): admins, planes, tenants, suscripciones, facturación SaaS
-- ===========================================================================

-- Perfil 1:1 con auth.users de Supabase
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  phone       text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Administradores de la plataforma (tú y tu equipo). No pertenecen a un tenant.
create table platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Planes del SaaS (catálogo global, no por tenant)
create table plans (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,            -- 'basico','pro','perpetuo'
  name          text not null,
  description   text,
  price         numeric(14,2) not null default 0,
  interval      billing_interval not null default 'mensual',
  -- Límites y features del plan (para gating en la app)
  max_products  integer,                          -- null = ilimitado
  max_staff     integer,
  max_orders_month integer,
  features      jsonb not null default '{}'::jsonb, -- {"dian":true,"metricas_avanzadas":true,...}
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

-- Un tenant = una salsamentaría (el negocio cliente del SaaS)
create table tenants (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,             -- subdominio / URL del PWA
  name          text not null,                    -- "La Costeña Salsamentaria"
  legal_name    text,
  nit           text,
  doc_type      doc_type,
  status        tenant_status not null default 'trial',
  -- Contacto / ubicación
  email         text,
  phone         text,
  address       text,
  city          text default 'Cartagena',
  timezone      text not null default 'America/Bogota',
  currency      char(3) not null default 'COP',
  -- Marca (white-label del PWA cliente)
  logo_url      text,
  brand_primary   text default '#B23A1E',
  brand_ink       text default '#2A1C16',
  brand_bg        text default '#EFE7DC',
  -- Operación
  order_prefix  text not null default 'PED',      -- prefijo de códigos de pedido
  delivery_fee_default numeric(14,2) not null default 6000,
  -- Config de facturación DIAN (proveedor externo)
  dian_enabled  boolean not null default false,
  dian_provider text,                              -- 'factus' | 'alegra' | ...
  dian_config   jsonb not null default '{}'::jsonb,-- credenciales/refs cifradas fuera de DB
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger trg_tenants_updated before update on tenants
  for each row execute function set_updated_at();

-- Suscripción del tenant a un plan del SaaS
create table subscriptions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  plan_id       uuid not null references plans(id),
  status        subscription_status not null default 'trialing',
  trial_ends_at timestamptz,
  current_period_start timestamptz not null default now(),
  current_period_end   timestamptz,
  cancel_at_period_end boolean not null default false,
  -- Pasarela de pago del SaaS (agnóstico)
  provider          text,                          -- 'wompi'|'bold'|'mercadopago'|'manual'
  provider_ref      text,                          -- id de suscripción en la pasarela
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index uq_subscription_active_per_tenant
  on subscriptions(tenant_id) where status in ('trialing','activa','vencida');
create trigger trg_subscriptions_updated before update on subscriptions
  for each row execute function set_updated_at();

-- Facturas del SaaS al tenant (cobro de la suscripción / mantenimiento)
create table platform_invoices (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  subscription_id uuid references subscriptions(id) on delete set null,
  concept       text not null,                     -- 'Suscripción Pro octubre', 'Mantenimiento', 'Setup'
  amount        numeric(14,2) not null,
  status        payment_status not null default 'pendiente',
  issued_at     timestamptz not null default now(),
  paid_at       timestamptz,
  provider_ref  text,
  created_at    timestamptz not null default now()
);

-- Vínculo usuario <-> tenant con rol (permite multi-negocio y staff)
create table memberships (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       membership_role not null default 'cajero',
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create index idx_memberships_user on memberships(user_id);

-- ===========================================================================
-- 2. CATÁLOGO (por tenant)
-- ===========================================================================

create table categories (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  name       text not null,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);
create index idx_categories_tenant on categories(tenant_id);

create table products (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  category_id   uuid references categories(id) on delete set null,
  name          text not null,
  slug          text,
  description   text,
  unit          product_unit not null default 'kg',
  step          numeric(12,3) not null default 0.250,   -- incremento de venta (0,25 kg)
  price         numeric(14,2) not null,                 -- PRECIO DE VENTA, IVA INCLUIDO
  cost          numeric(14,2),                           -- costo unitario (para margen)
  tax_regime    tax_regime not null default 'excluido', -- IVA por producto (ver migración 05)
  barcode       text,
  image_url     text,
  -- Inventario opcional
  track_inventory boolean not null default false,
  stock         numeric(12,3) not null default 0,
  min_stock     numeric(12,3) not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, slug)
);
create index idx_products_tenant on products(tenant_id);
create index idx_products_category on products(category_id);
create index idx_products_name_trgm on products using gin (name gin_trgm_ops);
create trigger trg_products_updated before update on products
  for each row execute function set_updated_at();

-- ===========================================================================
-- 3. CLIENTES (por tenant) — necesarios para DIAN y métricas de recompra
-- ===========================================================================
create table customers (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  name         text not null,
  doc_type     doc_type,
  doc_number   text,
  email        text,
  phone        text,
  address      text,
  neighborhood text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_customers_tenant on customers(tenant_id);
create index idx_customers_doc on customers(tenant_id, doc_number);
create trigger trg_customers_updated before update on customers
  for each row execute function set_updated_at();

-- ===========================================================================
-- 4. PEDIDOS Y VENTAS (por tenant)
-- ===========================================================================
create table orders (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  code           text,                              -- generado por trigger (PED-000123)
  channel        order_channel not null default 'mostrador',
  fulfillment    fulfillment_type not null default 'mostrador',
  status         order_status not null default 'recibido',
  customer_id    uuid references customers(id) on delete set null,
  -- Snapshot de contacto/entrega (para pedidos sin cliente registrado)
  contact_name   text,
  contact_phone  text,
  delivery_address text,
  -- Totales (calculados por trigger a partir de order_items)
  subtotal       numeric(14,2) not null default 0,  -- base sin IVA
  tax_total      numeric(14,2) not null default 0,  -- IVA total
  delivery_fee   numeric(14,2) not null default 0,
  total          numeric(14,2) not null default 0,  -- items (IVA incl.) + domicilio
  -- Pago
  payment_method payment_method,
  payment_status payment_status not null default 'pendiente',
  needs_invoice  boolean not null default false,    -- ¿requiere factura DIAN?
  -- Auditoría
  cashier_id     uuid references auth.users(id) on delete set null,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_orders_tenant on orders(tenant_id);
create index idx_orders_tenant_status on orders(tenant_id, status);
create index idx_orders_tenant_created on orders(tenant_id, created_at desc);
create unique index uq_orders_tenant_code on orders(tenant_id, code) where code is not null;
create trigger trg_orders_updated before update on orders
  for each row execute function set_updated_at();

create table order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  product_id    uuid references products(id) on delete set null,
  -- SNAPSHOTS: la factura debe ser inmutable aunque cambie el producto
  name          text not null,
  unit          product_unit not null,
  qty           numeric(12,3) not null check (qty > 0),
  unit_price    numeric(14,2) not null,             -- IVA incluido, congelado
  tax_regime    tax_regime not null,
  tax_rate      numeric(5,4) not null,              -- 0.1900, 0.0500, 0.0000
  -- Calculados por trigger (compute_line)
  line_subtotal numeric(14,2) not null default 0,   -- base
  line_tax      numeric(14,2) not null default 0,
  line_total    numeric(14,2) not null default 0,   -- unit_price * qty
  created_at    timestamptz not null default now()
);
create index idx_order_items_order on order_items(order_id);
create index idx_order_items_product on order_items(product_id);

-- Historial de estados (tablero en vivo + auditoría + tiempos de entrega)
create table order_status_history (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  from_status order_status,
  to_status   order_status not null,
  changed_by  uuid references auth.users(id) on delete set null,
  note        text,
  changed_at  timestamptz not null default now()
);
create index idx_status_hist_order on order_status_history(order_id, changed_at);

-- Pagos (soporta pagos parciales / mixtos y métricas de medios de pago)
create table payments (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  order_id      uuid references orders(id) on delete cascade,
  method        payment_method not null,
  amount        numeric(14,2) not null,
  status        payment_status not null default 'pagado',
  provider_ref  text,
  created_at    timestamptz not null default now()
);
create index idx_payments_tenant on payments(tenant_id);
create index idx_payments_order on payments(order_id);

-- ===========================================================================
-- 5. FACTURACIÓN (cliente final): dual DIAN electrónica + recibo interno
-- ===========================================================================

-- Rangos de numeración autorizados por la DIAN (una resolución por prefijo)
create table invoice_sequences (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  prefix        text not null,
  resolution    text,                              -- número de resolución DIAN
  range_from    bigint not null,
  range_to      bigint not null,
  current       bigint not null,                   -- próximo consecutivo a usar
  valid_until   date,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (tenant_id, prefix)
);

create table invoices (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  order_id      uuid references orders(id) on delete set null,
  type          invoice_type not null,
  status        invoice_status not null default 'borrador',
  -- Numeración
  prefix        text,
  number        bigint,
  -- Datos DIAN (los llena el proveedor tras emitir)
  cufe          text,                              -- código único de factura electrónica
  provider      text,                              -- 'factus'|'alegra'
  provider_ref  text,
  xml_url       text,
  pdf_url       text,
  -- Snapshot del cliente
  customer_name       text,
  customer_doc_type   doc_type,
  customer_doc_number text,
  customer_email      text,
  -- Totales congelados
  subtotal      numeric(14,2) not null default 0,
  tax_total     numeric(14,2) not null default 0,
  total         numeric(14,2) not null default 0,
  issued_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, prefix, number)
);
create index idx_invoices_tenant on invoices(tenant_id);
create index idx_invoices_order on invoices(order_id);
create trigger trg_invoices_updated before update on invoices
  for each row execute function set_updated_at();

-- ===========================================================================
-- 6. INVENTARIO (movimientos: compra, venta, ajuste, merma, devolución)
-- ===========================================================================
create table inventory_movements (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  product_id    uuid not null references products(id) on delete cascade,
  type          inventory_move_type not null,
  qty           numeric(12,3) not null,            -- + entra, - sale (venta/merma en negativo)
  ref_order_id  uuid references orders(id) on delete set null,
  unit_cost     numeric(14,2),
  note          text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index idx_inv_moves_tenant on inventory_movements(tenant_id);
create index idx_inv_moves_product on inventory_movements(product_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Contadores por tenant (para códigos de pedido secuenciales)
-- ---------------------------------------------------------------------------
create table tenant_counters (
  tenant_id  uuid primary key references tenants(id) on delete cascade,
  order_seq  bigint not null default 0
);
