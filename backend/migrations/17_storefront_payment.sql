-- ============================================================================
-- Migración 17: Pago en línea en la tienda pública (Wompi)
-- Se reutiliza el mismo Wompi ya integrado para la suscripción, pero es un
-- flujo distinto: pago único del cliente final, vía Checkout Web hospedado
-- (formulario + redirección, no tokenización) — no maneja tarjetas nuestro
-- servidor en ningún momento.
-- ============================================================================

alter type payment_method add value if not exists 'wompi_online';

-- El RPC de la tienda pública debe aceptar el nuevo método.
create or replace function public.create_storefront_order(
  p_tenant_slug text,
  p_items jsonb,
  p_fulfillment text,
  p_payment_method text,
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
  if p_payment_method not in ('efectivo','contra_entrega','transferencia','wompi_online') then
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

-- ---------------------------------------------------------------------------
-- Confirmar el total de un pedido propio para armar el checkout — por id
-- exacto, mismo patrón que get_storefront_order_status (sin listado).
-- ---------------------------------------------------------------------------
create or replace function public.get_storefront_order_total(p_order_id uuid)
returns table(total numeric, payment_status payment_status, tenant_slug text)
language sql stable security definer set search_path = public as $$
  select o.total, o.payment_status, t.slug
    from orders o
    join tenants t on t.id = o.tenant_id
   where o.id = p_order_id and o.channel = 'pwa';
$$;

grant execute on function public.get_storefront_order_total(uuid) to anon, authenticated;

-- El webhook hace upsert de payments por provider_ref (id de transacción
-- Wompi, único) — sin este índice el ON CONFLICT no tiene contra qué resolver.
create unique index if not exists uq_payments_provider_ref
  on payments(provider_ref) where provider_ref is not null;
