-- ============================================================================
-- Migración 02: Funciones y triggers de negocio
-- Corazón fiscal: el IVA se calcula por producto según su régimen, nunca con
-- un divisor global. El precio se guarda IVA-incluido (práctica de mostrador).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tasa efectiva según régimen. exento y excluido ⇒ 0% al cliente
-- (la diferencia contable se maneja en el reporte, no en el cobro).
-- ---------------------------------------------------------------------------
create or replace function tax_rate_for(p_regime tax_regime)
returns numeric language sql immutable as $$
  select case p_regime
    when 'gravado_19' then 0.1900
    when 'gravado_5'  then 0.0500
    else 0.0000            -- exento / excluido
  end;
$$;

-- ---------------------------------------------------------------------------
-- BEFORE INSERT/UPDATE en order_items:
-- congela snapshots desde el producto y descompone el precio (IVA incluido)
-- en base + impuesto según el régimen de la línea.
-- ---------------------------------------------------------------------------
create or replace function compute_order_line()
returns trigger language plpgsql as $$
declare
  p products%rowtype;
begin
  -- Completar snapshots desde el producto si no vinieron dados
  if new.product_id is not null then
    select * into p from products where id = new.product_id;
    if found then
      new.name       := coalesce(new.name, p.name);
      new.unit       := coalesce(new.unit, p.unit);
      new.unit_price := coalesce(new.unit_price, p.price);
      new.tax_regime := coalesce(new.tax_regime, p.tax_regime);
    end if;
  end if;

  new.tax_rate := tax_rate_for(new.tax_regime);

  -- line_total es lo que paga el cliente (IVA incluido)
  new.line_total    := round(new.unit_price * new.qty, 2);
  -- base = total / (1 + tasa);  impuesto = total - base
  new.line_subtotal := round(new.line_total / (1 + new.tax_rate), 2);
  new.line_tax       := new.line_total - new.line_subtotal;

  return new;
end; $$;

create trigger trg_order_line_compute
  before insert or update of qty, unit_price, tax_regime, product_id on order_items
  for each row execute function compute_order_line();

-- ---------------------------------------------------------------------------
-- Recalcular totales del pedido tras cualquier cambio en sus líneas
-- ---------------------------------------------------------------------------
create or replace function recalc_order_totals(p_order_id uuid)
returns void language plpgsql as $$
declare
  v_sub numeric(14,2);
  v_tax numeric(14,2);
  v_tot numeric(14,2);
  v_fee numeric(14,2);
begin
  select coalesce(sum(line_subtotal),0), coalesce(sum(line_tax),0), coalesce(sum(line_total),0)
    into v_sub, v_tax, v_tot
    from order_items where order_id = p_order_id;

  select delivery_fee into v_fee from orders where id = p_order_id;

  update orders
     set subtotal  = v_sub,
         tax_total = v_tax,
         total     = v_tot + coalesce(v_fee,0)
   where id = p_order_id;
end; $$;

create or replace function trg_recalc_after_items()
returns trigger language plpgsql as $$
begin
  perform recalc_order_totals(coalesce(new.order_id, old.order_id));
  return null;
end; $$;

create trigger trg_items_recalc
  after insert or update or delete on order_items
  for each row execute function trg_recalc_after_items();

-- Recalcular también si cambia el domicilio en el pedido
create or replace function trg_recalc_on_fee()
returns trigger language plpgsql as $$
begin
  if new.delivery_fee is distinct from old.delivery_fee then
    perform recalc_order_totals(new.id);
  end if;
  return new;
end; $$;

create trigger trg_orders_fee_recalc
  after update of delivery_fee on orders
  for each row execute function trg_recalc_on_fee();

-- ---------------------------------------------------------------------------
-- Código de pedido secuencial por tenant (PED-000123)
-- ---------------------------------------------------------------------------
create or replace function assign_order_code()
returns trigger language plpgsql as $$
declare
  v_seq bigint;
  v_prefix text;
begin
  if new.code is not null then
    return new;
  end if;

  insert into tenant_counters(tenant_id, order_seq)
    values (new.tenant_id, 1)
  on conflict (tenant_id)
    do update set order_seq = tenant_counters.order_seq + 1
  returning order_seq into v_seq;

  select order_prefix into v_prefix from tenants where id = new.tenant_id;
  new.code := coalesce(v_prefix,'PED') || '-' || lpad(v_seq::text, 6, '0');
  return new;
end; $$;

create trigger trg_orders_code
  before insert on orders
  for each row execute function assign_order_code();

-- ---------------------------------------------------------------------------
-- Historial de estados: registra cada transición
-- ---------------------------------------------------------------------------
create or replace function log_order_status()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into order_status_history(order_id, from_status, to_status, changed_by)
      values (new.id, null, new.status, new.cashier_id);
  elsif new.status is distinct from old.status then
    insert into order_status_history(order_id, from_status, to_status, changed_by)
      values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end; $$;

create trigger trg_orders_status_log
  after insert or update of status on orders
  for each row execute function log_order_status();

-- ---------------------------------------------------------------------------
-- Descontar inventario al confirmar el pedido (solo productos rastreados)
-- ---------------------------------------------------------------------------
create or replace function register_sale_inventory()
returns trigger language plpgsql as $$
begin
  if new.status = 'confirmado' and old.status = 'recibido' then
    insert into inventory_movements(tenant_id, product_id, type, qty, ref_order_id)
      select new.tenant_id, oi.product_id, 'venta', -oi.qty, new.id
        from order_items oi
        join products p on p.id = oi.product_id
       where oi.order_id = new.id and p.track_inventory;

    update products p
       set stock = p.stock - oi.qty
      from order_items oi
     where oi.order_id = new.id and oi.product_id = p.id and p.track_inventory;
  end if;
  return new;
end; $$;

create trigger trg_orders_inventory
  after update of status on orders
  for each row execute function register_sale_inventory();

-- ---------------------------------------------------------------------------
-- Numeración de factura DIAN: toma el siguiente consecutivo con bloqueo de fila
-- ---------------------------------------------------------------------------
create or replace function next_invoice_number(p_tenant uuid, p_prefix text)
returns bigint language plpgsql as $$
declare
  v_num bigint;
begin
  update invoice_sequences
     set current = current + 1
   where tenant_id = p_tenant and prefix = p_prefix and is_active
     and current <= range_to
  returning current - 1 into v_num;

  if v_num is null then
    raise exception 'Sin rango de numeración activo para % / %', p_tenant, p_prefix;
  end if;
  return v_num;
end; $$;
