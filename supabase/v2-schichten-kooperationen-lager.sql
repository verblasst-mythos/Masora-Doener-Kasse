-- =========================================================
--  Masora Döner Kasse — Update v2
--  Schichten (Ein-/Ausstempeln), Kooperationen, Lager
--
--  Einspielen: Supabase Dashboard -> SQL Editor -> alles
--  hier einfügen -> "Run". Kann mehrfach laufen.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Lagerfelder an den Produkten
-- ---------------------------------------------------------
alter table public.products add column if not exists stock       numeric(12,2) not null default 0;
alter table public.products add column if not exists min_stock   numeric(12,2) not null default 0;
alter table public.products add column if not exists track_stock boolean       not null default true;

-- ---------------------------------------------------------
-- 2. Schichten
-- ---------------------------------------------------------
create table if not exists public.shifts (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid references public.staff(id) on delete set null,
  staff_name text not null,
  started_at timestamptz not null default now(),
  ended_at   timestamptz,
  ended_auto boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists shifts_staff_started_idx on public.shifts (staff_id, started_at desc);
create index if not exists shifts_started_idx       on public.shifts (started_at desc);

-- ---------------------------------------------------------
-- 3. Kooperationen (Rabatt nur mit Codewort)
-- ---------------------------------------------------------
create table if not exists public.cooperations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  kind       text not null default 'percent' check (kind in ('percent', 'fixed')),
  value      numeric(10,2) not null default 0,
  code       text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists cooperations_code_idx on public.cooperations (lower(code));

-- ---------------------------------------------------------
-- 4. Lagerbewegungen
-- ---------------------------------------------------------
create table if not exists public.stock_moves (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid references public.products(id) on delete set null,
  product_name text not null,
  delta        numeric(12,2) not null,
  reason       text not null default 'korrektur'
               check (reason in ('verkauf', 'storno', 'wareneingang', 'korrektur', 'schwund')),
  order_id     uuid,
  staff_name   text,
  created_at   timestamptz not null default now()
);
create index if not exists stock_moves_created_idx on public.stock_moves (created_at desc);
create index if not exists stock_moves_product_idx on public.stock_moves (product_id, created_at desc);

-- ---------------------------------------------------------
-- 5. Bestellungen erweitern
-- ---------------------------------------------------------
alter table public.orders add column if not exists staff_id        uuid references public.staff(id) on delete set null;
alter table public.orders add column if not exists shift_id        uuid references public.shifts(id) on delete set null;
alter table public.orders add column if not exists discount_source text not null default 'rabatt';
create index if not exists orders_staff_created_idx on public.orders (staff_id, created_at desc);

-- Bestehende Bestellungen den Mitarbeitern zuordnen (über den Namen)
update public.orders o
   set staff_id = s.id
  from public.staff s
 where o.staff_id is null
   and o.staff_name = s.name;

-- ---------------------------------------------------------
-- 6. Zugriffsregeln
-- ---------------------------------------------------------
alter table public.shifts       enable row level security;
alter table public.cooperations enable row level security;
alter table public.stock_moves  enable row level security;

drop policy if exists shifts_anon_all on public.shifts;
create policy shifts_anon_all on public.shifts
  for all to anon using (true) with check (true);

drop policy if exists cooperations_anon_all on public.cooperations;
create policy cooperations_anon_all on public.cooperations
  for all to anon using (true) with check (true);

drop policy if exists stock_moves_anon_all on public.stock_moves;
create policy stock_moves_anon_all on public.stock_moves
  for all to anon using (true) with check (true);

-- ---------------------------------------------------------
-- 7. Bestellung abschliessen (mit Lagerabzug, in einem Schritt)
-- ---------------------------------------------------------
create or replace function public.place_order(
  p_items           jsonb,
  p_subtotal        numeric,
  p_discount_name   text,
  p_discount_amount numeric,
  p_discount_source text,
  p_total           numeric,
  p_payment_method  text,
  p_cash_given      numeric,
  p_change_due      numeric,
  p_staff_id        uuid,
  p_staff_name      text,
  p_shift_id        uuid,
  p_note            text
) returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_item  jsonb;
  v_pid   uuid;
  v_qty   numeric;
  v_stock numeric;
  v_track boolean;
  v_pname text;
begin
  -- Bestand prüfen und Zeilen sperren
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_pid := nullif(coalesce(v_item->>'product_id', v_item->>'id'), '')::uuid;
    v_qty := coalesce((v_item->>'qty')::numeric, 0);
    if v_pid is null or v_qty <= 0 then
      continue;
    end if;

    select p.stock, p.track_stock, p.name
      into v_stock, v_track, v_pname
      from public.products p
     where p.id = v_pid
       for update;

    if not found then
      continue;
    end if;

    if v_track and v_stock < v_qty then
      raise exception 'LAGER: % — nur noch % auf Lager, benoetigt %', v_pname, v_stock, v_qty;
    end if;
  end loop;

  -- Bestellung schreiben
  insert into public.orders (
    items, subtotal, discount_name, discount_amount, discount_source, total,
    payment_method, cash_given, change_due, staff_id, staff_name, shift_id, note
  ) values (
    p_items,
    p_subtotal,
    nullif(p_discount_name, ''),
    coalesce(p_discount_amount, 0),
    coalesce(nullif(p_discount_source, ''), 'rabatt'),
    p_total,
    p_payment_method,
    p_cash_given,
    p_change_due,
    p_staff_id,
    p_staff_name,
    p_shift_id,
    nullif(p_note, '')
  ) returning * into v_order;

  -- Lager abbuchen und Bewegung protokollieren
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_pid := nullif(coalesce(v_item->>'product_id', v_item->>'id'), '')::uuid;
    v_qty := coalesce((v_item->>'qty')::numeric, 0);
    if v_pid is null or v_qty <= 0 then
      continue;
    end if;

    v_pname := null;
    update public.products
       set stock = stock - v_qty
     where id = v_pid
       and track_stock = true
    returning name into v_pname;

    if v_pname is not null then
      insert into public.stock_moves (product_id, product_name, delta, reason, order_id, staff_name)
      values (v_pid, v_pname, -v_qty, 'verkauf', v_order.id, p_staff_name);
    end if;
  end loop;

  return v_order;
end;
$$;

-- ---------------------------------------------------------
-- 8. Storno (bucht das Lager zurück)
-- ---------------------------------------------------------
create or replace function public.cancel_order(
  p_order_id   uuid,
  p_staff_name text
) returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_item  jsonb;
  v_pid   uuid;
  v_qty   numeric;
  v_pname text;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Bestellung nicht gefunden';
  end if;
  if v_order.status = 'storniert' then
    return v_order;
  end if;

  update public.orders
     set status = 'storniert'
   where id = p_order_id
  returning * into v_order;

  for v_item in select value from jsonb_array_elements(v_order.items) loop
    v_pid := nullif(coalesce(v_item->>'product_id', v_item->>'id'), '')::uuid;
    v_qty := coalesce((v_item->>'qty')::numeric, 0);
    if v_pid is null or v_qty <= 0 then
      continue;
    end if;

    v_pname := null;
    update public.products
       set stock = stock + v_qty
     where id = v_pid
       and track_stock = true
    returning name into v_pname;

    if v_pname is not null then
      insert into public.stock_moves (product_id, product_name, delta, reason, order_id, staff_name)
      values (v_pid, v_pname, v_qty, 'storno', p_order_id, p_staff_name);
    end if;
  end loop;

  return v_order;
end;
$$;

-- ---------------------------------------------------------
-- 9. Bestand buchen (Wareneingang, Korrektur, Schwund)
-- ---------------------------------------------------------
create or replace function public.adjust_stock(
  p_product_id uuid,
  p_delta      numeric,
  p_reason     text,
  p_staff_name text
) returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products;
begin
  update public.products
     set stock = stock + p_delta
   where id = p_product_id
  returning * into v_product;

  if not found then
    raise exception 'Produkt nicht gefunden';
  end if;

  insert into public.stock_moves (product_id, product_name, delta, reason, staff_name)
  values (p_product_id, v_product.name, p_delta,
          coalesce(nullif(p_reason, ''), 'korrektur'), p_staff_name);

  return v_product;
end;
$$;

-- ---------------------------------------------------------
-- 10. Einstempeln / Ausstempeln / Schicht fortsetzen
-- ---------------------------------------------------------
create or replace function public.clock_in(
  p_staff_id   uuid,
  p_staff_name text
) returns public.shifts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift public.shifts;
begin
  -- Läuft schon eine Schicht? Dann diese zurückgeben.
  select * into v_shift
    from public.shifts
   where staff_id = p_staff_id
     and ended_at is null
   order by started_at desc
   limit 1;
  if found then
    return v_shift;
  end if;

  insert into public.shifts (staff_id, staff_name)
  values (p_staff_id, p_staff_name)
  returning * into v_shift;

  return v_shift;
end;
$$;

create or replace function public.clock_out(
  p_shift_id uuid,
  p_auto     boolean
) returns public.shifts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift public.shifts;
begin
  update public.shifts
     set ended_at   = now(),
         ended_auto = coalesce(p_auto, false)
   where id = p_shift_id
     and ended_at is null
  returning * into v_shift;

  if not found then
    select * into v_shift from public.shifts where id = p_shift_id;
  end if;

  return v_shift;
end;
$$;

-- Nach automatischer Abmeldung: Schicht innerhalb von 15 Minuten
-- wieder aufnehmen, damit die Dienstzeit nicht zerstückelt wird.
create or replace function public.resume_shift(
  p_staff_id uuid
) returns public.shifts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift public.shifts;
begin
  select * into v_shift
    from public.shifts
   where staff_id = p_staff_id
     and ended_auto = true
     and ended_at > now() - interval '15 minutes'
   order by ended_at desc
   limit 1;

  if not found then
    return null;
  end if;

  update public.shifts
     set ended_at = null, ended_auto = false
   where id = v_shift.id
  returning * into v_shift;

  return v_shift;
end;
$$;

-- ---------------------------------------------------------
-- 11. Ausführrechte
-- ---------------------------------------------------------
grant execute on function public.place_order(jsonb, numeric, text, numeric, text, numeric, text, numeric, numeric, uuid, text, uuid, text) to anon, authenticated;
grant execute on function public.cancel_order(uuid, text)                        to anon, authenticated;
grant execute on function public.adjust_stock(uuid, numeric, text, text)         to anon, authenticated;
grant execute on function public.clock_in(uuid, text)                            to anon, authenticated;
grant execute on function public.clock_out(uuid, boolean)                        to anon, authenticated;
grant execute on function public.resume_shift(uuid)                              to anon, authenticated;

-- ---------------------------------------------------------
-- 12. Startbestände und eine Beispiel-Kooperation
-- ---------------------------------------------------------
update public.products
   set stock     = case when category = 'Getränke' then 48 else 40 end,
       min_stock = case when category = 'Getränke' then 12 else 10 end
 where stock = 0;

insert into public.cooperations (name, kind, value, code, is_active)
select 'Lieferdienst Partner', 'percent', 15, 'PARTNER15', true
where not exists (select 1 from public.cooperations where lower(code) = 'partner15');
