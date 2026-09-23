-- ============================================================================
-- Migración 15: Tienda pública (PWA del cliente final)
-- El rol `anon` de Supabase (sin sesión) necesita leer catálogo y crear
-- pedidos, pero las tablas base (tenants, products, orders...) tienen RLS
-- pensado para el equipo del negocio — exigen membership. En vez de abrir
-- esas políticas a `anon` (lo que expondría NIT, credenciales DIAN, costos,
-- etc.), se exponen VISTAS con solo las columnas seguras, y RPCs
-- SECURITY DEFINER para las dos escrituras que un cliente final necesita:
-- crear un pedido y consultar su propio estado.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Vistas de solo lectura — únicas columnas visibles a un desconocido.
-- security_invoker=false (default) es intencional aquí: el rol anon no tiene
-- membership, así que la vista debe correr con los privilegios de quien la
-- creó para poder leer las tablas base; el filtro por tenant activo y la
-- lista explícita de columnas es lo que mantiene esto seguro.
-- ---------------------------------------------------------------------------
create or replace view v_storefront_tenant as
  select id, slug, name, logo_url, brand_primary, brand_ink, brand_bg,
         delivery_fee_default, city, phone
    from tenants
   where status = 'activo';

create or replace view v_storefront_categories as
  select c.id, c.tenant_id, c.name, c.sort_order
    from categories c
    join tenants t on t.id = c.tenant_id and t.status = 'activo'
   where c.is_active;

create or replace view v_storefront_products as
  select p.id, p.tenant_id, p.category_id, p.name, p.slug, p.unit, p.step,
         p.price, p.image_url,
         -- Nunca se expone el stock exacto (información comercial del
         -- negocio) — solo si hay o no disponibilidad.
         case when p.track_inventory then p.stock > 0 else true end as available
    from products p
    join tenants t on t.id = p.tenant_id and t.status = 'activo'
   where p.is_active;

grant select on v_storefront_tenant, v_storefront_categories, v_storefront_products
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Crear un pedido desde la tienda pública. Todo el pedido nace en una sola
-- función para que anon nunca toque orders/order_items directamente — así
-- no hay forma de que alguien inserte un pedido con tenant_id o product_id
-- de otro negocio, ni de saltarse el cálculo de IVA (lo siguen haciendo los
-- triggers existentes, no esta función).
-- ---------------------------------------------------------------------------
create or replace function public.create_storefront_order(
  p_tenant_slug text,
  p_items jsonb,               -- [{"product_id": "uuid", "qty": 1.5}, ...]
  p_fulfillment text,          -- 'domicilio' | 'recoger'
  p_payment_method text,       -- 'efectivo' | 'contra_entrega' | 'transferencia'
  p_contact_name text,
  p_contact_phone text,
  p_delivery_address text default null
)
returns table(order_id uuid, order_code text)
language plpgsql security definer set search_path = public as $$
declare
  v_tenant tenants%rowtype;
  v_order_id uuid;
  v_item jsonb;
  v_fee numeric(14,2) := 0;
begin
  if p_fulfillment not in ('domicilio','recoger') then
    raise exception 'Tipo de entrega inválido';
  end if;
  if p_payment_method not in ('efectivo','contra_entrega','transferencia') then
    raise exception 'Método de pago inválido para pedido en línea';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene productos';
  end if;
  if coalesce(trim(p_contact_name), '') = '' or coalesce(trim(p_contact_phone), '') = '' then
    raise exception 'Nombre y teléfono de contacto son obligatorios';
  end if;
  if p_fulfillment = 'domicilio' and coalesce(trim(p_delivery_address), '') = '' then
    raise exception 'La dirección de entrega es obligatoria para domicilio';
  end if;

  select * into v_tenant from tenants where slug = p_tenant_slug and status = 'activo';
  if not found then
    raise exception 'Negocio no disponible';
  end if;

  if p_fulfillment = 'domicilio' then
    v_fee := v_tenant.delivery_fee_default;
  end if;

  insert into orders (
    tenant_id, channel, fulfillment, status,
    contact_name, contact_phone, delivery_address,
    delivery_fee, payment_method, payment_status, needs_invoice
  ) values (
    v_tenant.id, 'pwa', p_fulfillment::fulfillment_type, 'recibido',
    p_contact_name, p_contact_phone, p_delivery_address,
    v_fee, p_payment_method::payment_method, 'pendiente', false
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    -- Se valida que el producto exista, esté activo y pertenezca a ESTE
    -- tenant — es lo que evita que alguien arme un pedido con productos de
    -- otro negocio usando ids adivinados.
    if not exists (
      select 1 from products
       where id = (v_item->>'product_id')::uuid
         and tenant_id = v_tenant.id
         and is_active
    ) then
      raise exception 'Producto inválido en el pedido';
    end if;

    insert into order_items (order_id, product_id, qty)
      values (v_order_id, (v_item->>'product_id')::uuid, (v_item->>'qty')::numeric);
  end loop;

  return query select v_order_id, o.code from orders o where o.id = v_order_id;
end; $$;

grant execute on function public.create_storefront_order(text, jsonb, text, text, text, text, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Consultar el estado de UN pedido propio — por id exacto (UUID
-- impredecible), nunca por listado. No hay forma de "buscar pedidos de tal
-- negocio" con esta función, solo confirmar el que ya se tiene.
-- ---------------------------------------------------------------------------
create or replace function public.get_storefront_order_status(p_order_id uuid)
returns table(
  code text, status order_status, fulfillment fulfillment_type,
  total numeric, created_at timestamptz, tenant_name text
)
language sql stable security definer set search_path = public as $$
  select o.code, o.status, o.fulfillment, o.total, o.created_at, t.name
    from orders o
    join tenants t on t.id = o.tenant_id
   where o.id = p_order_id and o.channel = 'pwa';
$$;

grant execute on function public.get_storefront_order_status(uuid) to anon, authenticated;
