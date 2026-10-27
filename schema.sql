-- =====================================================================
--  AF PARTS — نظام الجراش (قطع السواقين، العدة، التصدير، الطلعات)
--  الصق الملف كله في: Supabase ← SQL Editor ← New query ← Run
--  آمن إنك تشغّله أكتر من مرة.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1) الإدارة والعمال
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  company_ar text not null default 'AF Fabworks',
  company_en text not null default 'AF Fabworks',
  address_ar text not null default 'العاشر من رمضان، مصر',
  address_en text not null default '10th of Ramadan City, Egypt',
  phone text not null default '',
  email text not null default ''
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.staff_pins (
  staff_id uuid primary key references public.staff(id) on delete cascade,
  pin_hash text not null,
  failed_count int not null default 0,
  locked_until timestamptz
);

create table if not exists public.staff_sessions (
  token_hash text primary key,
  staff_id uuid not null references public.staff(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '180 days')
);

-- ---------------------------------------------------------------------
-- 2) السواقين والعربيات والأنواع
-- ---------------------------------------------------------------------
create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.cars (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  name text not null,
  plate text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  kind text not null check (kind in ('part', 'tool', 'product')),
  name text not null,
  sort int not null default 100,
  primary key (kind, name)
);
insert into public.categories (kind, name, sort) values
  ('part', 'سوست', 1), ('part', 'رشوهات', 2), ('part', 'كاوتش', 3), ('part', 'جنوط', 4),
  ('part', 'فرامل', 5), ('part', 'دراعات وتعليق', 6), ('part', 'دركسيون', 7), ('part', 'موتور', 8),
  ('part', 'تبريد', 9), ('part', 'فتيس ودفرنس', 10), ('part', 'كهربا', 11), ('part', 'بودي', 12),
  ('part', 'تانية', 99),
  ('tool', 'ميكانيكا وصيانة', 1), ('tool', 'مفاتيح', 2), ('tool', 'لقم وإنكيهات', 3), ('tool', 'بنس وقصافات', 4),
  ('tool', 'مفكات وشواكيش', 5), ('tool', 'قياس وتعليم', 6), ('tool', 'كهربا وبطاريات', 7), ('tool', 'لحام وحدادة', 8),
  ('tool', 'هوا وإيثانول ومية', 9), ('tool', 'زيوت وكيماويات', 10), ('tool', 'نظافة', 11),
  ('tool', 'مستلزمات واستهلاكات', 12), ('tool', 'تجهيزات الموقع', 13), ('tool', 'تانية', 99),
  ('product', 'تعليق', 1), ('product', 'شاسيه وتقوية', 2), ('product', 'دراعات', 3), ('product', 'تانية', 99)
on conflict (kind, name) do nothing;

-- ---------------------------------------------------------------------
-- 3) الحاجات (قطعة سواق / عدة الجراش / منتج تصدير) وأكواد الـ QR
-- ---------------------------------------------------------------------
create sequence if not exists public.code_seq;

-- كل كود QR اتعمل (فاضي أو مربوط بحاجة)
create table if not exists public.codes (
  code text primary key,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  code text unique,                -- العدة من غير كود، القطع والمنتجات بكود
  kind text not null check (kind in ('part', 'tool', 'product')),
  name text not null,
  name_en text not null default '',
  category text not null default '',
  size text not null default '',
  driver_id uuid references public.drivers(id) on delete restrict,
  car_id uuid references public.cars(id) on delete set null,
  qty int not null default 0 check (qty >= 0),
  condition text not null default 'used' check (condition in ('new', 'used', 'repair', 'damaged')),
  location text not null default '',
  note text not null default '',
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint items_owner_kind check (kind = 'part' or driver_id is null)   -- القطعة: لسواق، أو من غير سواق = ملك الجراش
);
create index if not exists items_driver_idx on public.items (driver_id);
alter table public.items alter column code drop not null;
do $$ begin
  alter table public.items add constraint items_code_kind check (kind = 'tool' or code is not null);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 4) الطلعات (سباق / تمرين / طلعة تانية) والليستات الجاهزة
-- ---------------------------------------------------------------------
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'race' check (kind in ('race', 'practice', 'other')),
  name text not null,
  place text not null default '',
  trip_date date not null default ((now() at time zone 'Africa/Cairo')::date),
  note text not null default '',
  status text not null default 'prep' check (status in ('prep', 'out', 'closed')),
  created_by text not null default '',
  departed_by text not null default '',
  closed_by text not null default '',
  created_at timestamptz not null default now(),
  departed_at timestamptz,
  closed_at timestamptz
);

create table if not exists public.trip_items (
  trip_id uuid not null references public.trips(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  qty int not null check (qty > 0),
  loaded boolean not null default false,
  packed boolean not null default false,
  ok int not null default 0,
  damaged int not null default 0,
  installed int not null default 0,
  used int not null default 0,
  lost int not null default 0,
  old jsonb,
  added_at timestamptz not null default now(),
  primary key (trip_id, item_id)
);

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

-- الطلعة فاكرة الليستة الجاهزة اللي اتعملت منها (عشان اللي يتضاف يتحفظ فيها كمان)
alter table public.trips add column if not exists template_id uuid references public.templates(id) on delete set null;

create table if not exists public.template_items (
  template_id uuid not null references public.templates(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  qty int not null check (qty > 0),
  primary key (template_id, item_id)
);

-- ---------------------------------------------------------------------
-- 5) التصدير: العملاء والشحنات
-- ---------------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null default '',
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);
alter table public.customers add column if not exists address text not null default '';

create sequence if not exists public.ship_seq;

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default ('SH-' || lpad(nextval('public.ship_seq')::text, 4, '0')),
  customer_id uuid not null references public.customers(id) on delete restrict,
  ship_date date not null default ((now() at time zone 'Africa/Cairo')::date),
  note text not null default '',
  status text not null default 'draft' check (status in ('draft', 'shipped')),
  created_by text not null default '',
  shipped_by text not null default '',
  created_at timestamptz not null default now(),
  shipped_at timestamptz
);

create table if not exists public.shipment_items (
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  qty int not null check (qty > 0),
  primary key (shipment_id, item_id)
);

-- ---------------------------------------------------------------------
-- 6) السجل + تذاكر الصور
-- ---------------------------------------------------------------------
-- delta = التغيير في الكمية اللي في الجراش، amount = عدد الحاجات اللي الحركة بتتكلم عنها
create table if not exists public.moves (
  id bigint generated always as identity primary key,
  item_id uuid not null references public.items(id) on delete cascade,
  type text not null,
  delta int not null default 0,
  amount int not null default 0,
  qty_after int not null default 0,
  note text not null default '',
  trip_id uuid references public.trips(id) on delete set null,
  car_id uuid references public.cars(id) on delete set null,
  shipment_id uuid references public.shipments(id) on delete set null,
  actor_kind text not null default '',
  actor_name text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists moves_item_idx on public.moves (item_id, id desc);
create index if not exists moves_time_idx on public.moves (created_at desc);

create table if not exists public.upload_tickets (
  path text primary key,
  item_id uuid,
  kind text not null default 'up',
  expires_at timestamptz not null default (now() + interval '15 minutes')
);

-- كل الجداول مقفولة، والتعامل بالدوال بس
do $$
declare t text;
begin
  foreach t in array array['admins','settings','staff','staff_pins','staff_sessions','drivers','cars','categories',
                           'codes','items','trips','trip_items','templates','template_items','customers',
                           'shipments','shipment_items','moves','upload_tickets'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
revoke all on sequence public.code_seq from anon, authenticated;
revoke all on sequence public.ship_seq from anon, authenticated;

-- ---------------------------------------------------------------------
-- 7) الدخول
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public._staff_id(p_token text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v uuid;
begin
  select s.staff_id into v
    from public.staff_sessions s join public.staff e on e.id = s.staff_id
   where s.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
     and s.expires_at > now() and e.active;
  if v is null then raise exception 'unauthorized'; end if;
  return v;
end $$;

-- مين اللي بيعمل العملية
create or replace function public._actor(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v uuid; n text; ci boolean;
begin
  if public.is_admin() then
    return jsonb_build_object('kind', 'admin', 'name', 'الإدارة', 'inv', true);
  end if;
  v := public._staff_id(p_token);
  select name, can_invoice into n, ci from public.staff where id = v;
  return jsonb_build_object('kind', 'staff', 'id', v, 'name', coalesce(n, ''), 'inv', coalesce(ci, false));
end $$;

create or replace function public._need_admin()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
end $$;

create or replace function public.public_staff()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb)
    from public.staff where active;
$$;

create or replace function public.staff_login(p_staff uuid, p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare sp public.staff_pins%rowtype; v_token text;
begin
  select * into sp from public.staff_pins where staff_id = p_staff for update;
  if not found or not exists (select 1 from public.staff where id = p_staff and active) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if sp.locked_until is not null and sp.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'locked',
                              'minutes', ceil(extract(epoch from (sp.locked_until - now())) / 60));
  end if;
  if sp.pin_hash <> crypt(coalesce(p_pin, ''), sp.pin_hash) then
    update public.staff_pins
       set failed_count = case when failed_count + 1 >= 5 then 0 else failed_count + 1 end,
           locked_until = case when failed_count + 1 >= 5 then now() + interval '10 minutes' else locked_until end
     where staff_id = p_staff;
    return jsonb_build_object('ok', false, 'error', 'wrong_pin', 'left', greatest(0, 5 - (sp.failed_count + 1)));
  end if;
  update public.staff_pins set failed_count = 0, locked_until = null where staff_id = p_staff;
  delete from public.staff_sessions where expires_at < now();
  v_token := encode(gen_random_bytes(24), 'hex');
  insert into public.staff_sessions (token_hash, staff_id) values (encode(digest(v_token, 'sha256'), 'hex'), p_staff);
  return jsonb_build_object('ok', true, 'token', v_token);
end $$;

create or replace function public.staff_logout(p_token text)
returns void language sql security definer set search_path = public, extensions as $$
  delete from public.staff_sessions where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

create or replace function public.admin_save_staff(p_id uuid, p_name text, p_pin text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v uuid;
begin
  perform public._need_admin();
  if coalesce(trim(p_name), '') = '' then raise exception 'name_required'; end if;
  if p_id is null and coalesce(p_pin, '') !~ '^[0-9]{4,8}$' then raise exception 'bad_pin'; end if;
  if p_pin is not null and p_pin <> '' and p_pin !~ '^[0-9]{4,8}$' then raise exception 'bad_pin'; end if;
  if p_id is null then
    insert into public.staff (name) values (trim(p_name)) returning id into v;
  else
    update public.staff set name = trim(p_name) where id = p_id returning id into v;
    if v is null then raise exception 'not_found'; end if;
  end if;
  if coalesce(p_pin, '') <> '' then
    insert into public.staff_pins (staff_id, pin_hash) values (v, crypt(p_pin, gen_salt('bf')))
    on conflict (staff_id) do update set pin_hash = excluded.pin_hash, failed_count = 0, locked_until = null;
    delete from public.staff_sessions where staff_id = v and p_id is not null;
  end if;
  return v;
end $$;

create or replace function public.admin_remove_staff(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._need_admin();
  update public.staff set active = false where id = p_id;
  delete from public.staff_sessions where staff_id = p_id;
end $$;

create or replace function public.admin_save_settings(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._need_admin();
  update public.settings set
    company_ar = coalesce(trim(p->>'company_ar'), company_ar),
    company_en = coalesce(trim(p->>'company_en'), company_en),
    address_ar = coalesce(trim(p->>'address_ar'), address_ar),
    address_en = coalesce(trim(p->>'address_en'), address_en),
    phone = coalesce(trim(p->>'phone'), phone),
    email = coalesce(trim(p->>'email'), email),
    inv_tax = coalesce(nullif(p->>'inv_tax', '')::numeric, inv_tax),
    inv_payment = coalesce(trim(p->>'inv_payment'), inv_payment),
    inv_terms_ar = coalesce(trim(p->>'inv_terms_ar'), inv_terms_ar),
    inv_terms_en = coalesce(trim(p->>'inv_terms_en'), inv_terms_en)
  where id = 1;
end $$;

-- ---------------------------------------------------------------------
-- 8) دوال داخلية
-- ---------------------------------------------------------------------
create or replace function public._log(p_item uuid, p_type text, p_delta int, p_amount int, p_note text,
                                       p_actor jsonb, p_trip uuid default null, p_car uuid default null,
                                       p_ship uuid default null)
returns void language sql security definer set search_path = public as $$
  insert into public.moves (item_id, type, delta, amount, qty_after, note, trip_id, car_id, shipment_id, actor_kind, actor_name)
  select p_item, p_type, coalesce(p_delta, 0), coalesce(p_amount, 0), i.qty, coalesce(p_note, ''), p_trip, p_car, p_ship,
         coalesce(p_actor->>'kind', ''), coalesce(p_actor->>'name', '')
    from public.items i where i.id = p_item;
$$;

create or replace function public._cond_ar(c text)
returns text language sql immutable as $$
  select case c when 'new' then 'جديدة' when 'used' then 'مستعملة' when 'repair' then 'محتاجة تصليح'
                when 'damaged' then 'تالفة' else coalesce(c, '') end;
$$;

create or replace function public._owner_ar(p_driver uuid, p_car uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select name from public.drivers where id = p_driver), 'الجراش')
      || coalesce(' / ' || (select name from public.cars where id = p_car), '');
$$;

-- كود جديد أو كود من استيكر فاضي
create or replace function public._take_code(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare v text := upper(trim(coalesce(p_code, '')));
begin
  if v = '' then
    v := 'AF-' || lpad(nextval('public.code_seq')::text, 5, '0');
    insert into public.codes (code, used) values (v, true);
    return v;
  end if;
  update public.codes set used = true where code = v and not used;
  if not found then
    if exists (select 1 from public.codes where code = v) then raise exception 'code_used'; end if;
    raise exception 'code_unknown';
  end if;
  return v;
end $$;

create or replace function public._ticket_ok(p_path text, p_kind text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.upload_tickets where path = p_path and kind = p_kind and expires_at > now());
$$;

-- القطعة القديمة اللي طلعت من العربية
-- o = {mode: 'keep'|'driver'|'trash'|'none', qty, name, size, condition, location, note, code}
create or replace function public._old_part(p_src public.items, p_car uuid, o jsonb, p_why text, p_actor jsonb, p_trip uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  q int := coalesce(nullif(o->>'qty', '')::int, 0);
  v_cond text := coalesce(nullif(o->>'condition', ''), 'used');
  v_id uuid; v_code text;
begin
  if o is null or coalesce(o->>'mode', 'none') <> 'keep' or q < 1 then return null; end if;
  if v_cond not in ('new', 'used', 'repair', 'damaged') then v_cond := 'used'; end if;
  v_code := public._take_code(o->>'code');
  insert into public.items (code, kind, name, category, size, driver_id, car_id, qty, condition, location, note)
  values (v_code, 'part', coalesce(nullif(trim(o->>'name'), ''), p_src.name || ' (القديمة)'), p_src.category,
          trim(coalesce(o->>'size', '')),
          coalesce(p_src.driver_id, (select c.driver_id from public.cars c where c.id = coalesce(p_car, p_src.car_id))),
          coalesce(p_car, p_src.car_id), q, v_cond,
          trim(coalesce(o->>'location', '')), trim(coalesce(o->>'note', '')))
  returning id into v_id;
  perform public._log(v_id, 'removed', q, q, p_why || ' بدل ' || p_src.code, p_actor, p_trip, coalesce(p_car, p_src.car_id));
  return v_code;
end $$;

create or replace function public._old_note(o jsonb, p_code text)
returns text language sql immutable as $$
  select case coalesce(o->>'mode', 'none')
    when 'keep' then 'القديمة فضلت في الجراش' || coalesce(' ' || p_code, '')
    when 'driver' then 'القديمة السواق خدها'
    when 'trash' then 'القديمة اترمت'
    else null end;
$$;

-- ---------------------------------------------------------------------
-- 9) قراءة كل البيانات مرة واحدة
-- ---------------------------------------------------------------------
create or replace function public.bootstrap(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); inv boolean := coalesce((a->>'inv')::boolean, false);
begin
  return jsonb_build_object(
    'me', a,
    'settings', (select case when inv then to_jsonb(s) else to_jsonb(s) - 'inv_payment' - 'inv_terms_ar' - 'inv_terms_en' - 'inv_tax' end
                   from public.settings s where id = 1),
    'drivers', coalesce((select jsonb_agg(to_jsonb(d) order by d.name) from public.drivers d), '[]'::jsonb),
    'cars', coalesce((select jsonb_agg(to_jsonb(c) order by c.name) from public.cars c), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(to_jsonb(c) order by c.kind, c.sort, c.name) from public.categories c), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(case when inv then to_jsonb(i) else to_jsonb(i) - 'price' - 'price_cur' end order by i.name)
                         from public.items i), '[]'::jsonb),
    'price_items', coalesce((select jsonb_agg(case when inv then to_jsonb(x) else to_jsonb(x) - 'price' - 'price_cur' end order by x.kind, x.name)
                               from public.price_items x), '[]'::jsonb),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name) order by e.name) from public.staff e where e.active), '[]'::jsonb),
    'jobs', public._job_jsons(inv),
    'invoices', case when inv then coalesce((select jsonb_agg(to_jsonb(v) order by v.inv_date desc, v.created_at desc)
                     from (select * from public.invoices order by inv_date desc, created_at desc limit 300) v), '[]'::jsonb)
                else '[]'::jsonb end,
    'trips', coalesce((
      select jsonb_agg(to_jsonb(t) || jsonb_build_object('items', coalesce((
               select jsonb_agg(to_jsonb(x) - 'trip_id' order by x.added_at) from public.trip_items x where x.trip_id = t.id), '[]'::jsonb))
             order by (t.status = 'closed'), t.trip_date desc, t.created_at desc)
        from (select * from public.trips where status <> 'closed'
              union all
              (select * from public.trips where status = 'closed' order by trip_date desc, created_at desc limit 40)) t
    ), '[]'::jsonb),
    'templates', coalesce((
      select jsonb_agg(to_jsonb(t) || jsonb_build_object('items', coalesce((
               select jsonb_agg(to_jsonb(x) - 'template_id') from public.template_items x where x.template_id = t.id), '[]'::jsonb))
             order by t.name)
        from public.templates t), '[]'::jsonb),
    'customers', coalesce((select jsonb_agg(to_jsonb(c) order by c.name) from public.customers c), '[]'::jsonb),
    'units', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'item_id', u.item_id, 'code', u.code, 'serial', u.serial,
                                                       'created_at', u.created_at) order by u.item_id, u.serial)
                         from public.units u where u.status = 'stock'), '[]'::jsonb),
    'shipments', coalesce((
      select jsonb_agg(to_jsonb(s) || jsonb_build_object('items', coalesce((
               select jsonb_agg(to_jsonb(x) - 'shipment_id') from public.shipment_items x where x.shipment_id = s.id), '[]'::jsonb),
             'units', coalesce((
               select jsonb_agg(jsonb_build_object('id', u.id, 'item_id', u.item_id, 'code', u.code) order by u.item_id, u.serial)
                 from public.shipment_units su join public.units u on u.id = su.unit_id where su.shipment_id = s.id), '[]'::jsonb))
             order by (s.status = 'shipped'), s.ship_date desc, s.created_at desc)
        from (select * from public.shipments where status = 'draft'
              union all
              (select * from public.shipments where status = 'shipped' order by ship_date desc, created_at desc limit 60)) s
    ), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------------
-- 10) السواقين والعربيات والأنواع والعملاء
-- ---------------------------------------------------------------------
create or replace function public.save_driver(p_token text, p_id uuid, p_name text, p_phone text, p_note text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); v uuid;
begin
  if coalesce(trim(p_name), '') = '' then raise exception 'name_required'; end if;
  if p_id is null then
    insert into public.drivers (name, phone, note)
    values (trim(p_name), coalesce(trim(p_phone), ''), coalesce(trim(p_note), '')) returning id into v;
  else
    update public.drivers set name = trim(p_name), phone = coalesce(trim(p_phone), ''), note = coalesce(trim(p_note), '')
     where id = p_id returning id into v;
    if v is null then raise exception 'not_found'; end if;
  end if;
  return v;
end $$;

create or replace function public.delete_driver(p_token text, p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token);
begin
  if exists (select 1 from public.items where driver_id = p_id) then raise exception 'has_items'; end if;
  delete from public.drivers where id = p_id;
end $$;

create or replace function public.save_car(p_token text, p_id uuid, p_driver uuid, p_name text, p_plate text, p_note text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); v uuid;
begin
  if coalesce(trim(p_name), '') = '' then raise exception 'name_required'; end if;
  if p_id is null then
    if not exists (select 1 from public.drivers where id = p_driver) then raise exception 'driver_required'; end if;
    insert into public.cars (driver_id, name, plate, note)
    values (p_driver, trim(p_name), coalesce(trim(p_plate), ''), coalesce(trim(p_note), '')) returning id into v;
  else
    update public.cars set name = trim(p_name), plate = coalesce(trim(p_plate), ''), note = coalesce(trim(p_note), '')
     where id = p_id returning id into v;
    if v is null then raise exception 'not_found'; end if;
  end if;
  return v;
end $$;

create or replace function public.delete_car(p_token text, p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token);
begin
  if exists (select 1 from public.items where car_id = p_id) then raise exception 'has_items'; end if;
  delete from public.cars where id = p_id;
end $$;

create or replace function public.add_category(p_token text, p_kind text, p_name text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token);
begin
  if coalesce(trim(p_name), '') = '' then raise exception 'name_required'; end if;
  insert into public.categories (kind, name, sort) values (p_kind, trim(p_name), 50) on conflict do nothing;
end $$;

create or replace function public.delete_category(p_token text, p_kind text, p_name text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public._need_admin();
  delete from public.categories where kind = p_kind and name = p_name;
end $$;

create or replace function public.save_customer(p_token text, p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); v uuid;
begin
  if coalesce(trim(p->>'name'), '') = '' then raise exception 'name_required'; end if;
  if p_id is null then
    insert into public.customers (name, country, phone, email, address, note)
    values (trim(p->>'name'), trim(coalesce(p->>'country', '')), trim(coalesce(p->>'phone', '')),
            trim(coalesce(p->>'email', '')), trim(coalesce(p->>'address', '')), trim(coalesce(p->>'note', '')))
    returning id into v;
  else
    update public.customers set name = trim(p->>'name'), country = trim(coalesce(p->>'country', '')),
           phone = trim(coalesce(p->>'phone', '')), email = trim(coalesce(p->>'email', '')),
           address = trim(coalesce(p->>'address', '')), note = trim(coalesce(p->>'note', ''))
     where id = p_id returning id into v;
    if v is null then raise exception 'not_found'; end if;
  end if;
  return v;
end $$;

create or replace function public.delete_customer(p_token text, p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token);
begin
  if exists (select 1 from public.shipments where customer_id = p_id) then raise exception 'has_items'; end if;
  delete from public.customers where id = p_id;
end $$;

-- ---------------------------------------------------------------------
-- 11) الأكواد (استيكرات فاضية)
-- ---------------------------------------------------------------------
create or replace function public.reserve_codes(p_token text, p_count int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); n int := least(greatest(coalesce(p_count, 21), 1), 210); v text; res jsonb := '[]'::jsonb;
begin
  for k in 1..n loop
    v := 'AF-' || lpad(nextval('public.code_seq')::text, 5, '0');
    insert into public.codes (code, used) values (v, false);
    res := res || to_jsonb(v);
  end loop;
  return res;
end $$;

create or replace function public.code_info(p_token text, p_code text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); v text := upper(trim(coalesce(p_code, ''))); iid uuid;
begin
  select item_id into iid from public.units where code = v;
  if iid is not null then
    return (select jsonb_build_object('status', 'unit', 'item_id', u.item_id, 'unit_id', u.id, 'code', u.code,
                                      'unit_status', u.status, 'note', u.note, 'out_at', u.out_at, 'created_at', u.created_at,
                                      'ship_ref', (select s.ref from public.shipments s where s.id = u.shipment_id))
              from public.units u where u.code = v);
  end if;
  select id into iid from public.items where code = v;
  if iid is not null then return jsonb_build_object('status', 'item', 'item_id', iid, 'code', v); end if;
  if exists (select 1 from public.codes where code = v and not used) then
    return jsonb_build_object('status', 'blank', 'code', v);
  end if;
  return jsonb_build_object('status', 'unknown', 'code', v);
end $$;

-- ---------------------------------------------------------------------
-- 12) الحاجات
-- ---------------------------------------------------------------------
-- رقم القطعة الجاي لنوع منتجات: AF-<اختصار النوع>-<رقم>
create or replace function public._next_part_no(p_cat text)
returns text language plpgsql security definer set search_path = public as $$
declare ab text; pre text; mx int;
begin
  select nullif(abbr, '') into ab from public.categories where kind = 'product' and name = coalesce(p_cat, '');
  pre := 'AF-' || coalesce(ab, 'GEN') || '-';
  select coalesce(max(substring(upper(part_no) from length(pre) + 1)::int), 0) into mx
    from public.items where upper(part_no) like pre || '%' and substring(upper(part_no) from length(pre) + 1) ~ '^[0-9]+$';
  return pre || lpad((mx + 1)::text, 3, '0');
end $$;

create or replace function public.save_item(p_token text, p_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  a jsonb := public._actor(p_token);
  old public.items%rowtype;
  v_kind text := coalesce(nullif(p->>'kind', ''), 'part');
  v_name text := trim(coalesce(p->>'name', ''));
  v_en text := trim(coalesce(p->>'name_en', ''));
  v_cat text := trim(coalesce(p->>'category', ''));
  v_size text := trim(coalesce(p->>'size', ''));
  v_driver uuid := nullif(p->>'driver_id', '')::uuid;
  v_car uuid := nullif(p->>'car_id', '')::uuid;
  v_cond text := coalesce(nullif(p->>'condition', ''), 'used');
  v_loc text := trim(coalesce(p->>'location', ''));
  v_note text := trim(coalesce(p->>'note', ''));
  v_qty int := coalesce(nullif(p->>'qty', '')::int, 1);
  v_pn text := nullif(upper(trim(coalesce(p->>'part_no', ''))), '');
  v_id uuid; v_code text;
begin
  if v_name = '' then raise exception 'name_required'; end if;
  if v_cond not in ('new', 'used', 'repair', 'damaged') then raise exception 'bad_condition'; end if;
  if p_id is not null then
    select * into old from public.items where id = p_id for update;
    if not found then raise exception 'not_found'; end if;
    v_kind := old.kind;
  end if;
  if v_kind not in ('part', 'tool', 'product') then raise exception 'bad_kind'; end if;
  if v_kind <> 'product' then v_pn := null; end if;
  if v_pn is not null and exists (select 1 from public.items where upper(part_no) = v_pn and id is distinct from p_id) then
    raise exception 'part_no_used';
  end if;
  if v_kind = 'part' then
    -- من غير سواق = قطعة ملك الجراش
    if v_driver is not null and not exists (select 1 from public.drivers where id = v_driver) then raise exception 'driver_required'; end if;
    if v_driver is null then v_car := null; end if;
    if v_car is not null and not exists (select 1 from public.cars where id = v_car and driver_id = v_driver) then raise exception 'car_mismatch'; end if;
  else
    v_driver := null; v_car := null;
  end if;

  if p_id is null then
    if v_qty < (case when v_kind = 'product' then 0 else 1 end) then raise exception 'bad_qty'; end if;
    v_code := case when v_kind = 'tool' then null else public._take_code(p->>'code') end;
    if v_kind = 'product' and v_pn is null then v_pn := public._next_part_no(v_cat); end if;  -- رقم القطعة أوتوماتيك
    insert into public.items (code, kind, name, name_en, category, size, driver_id, car_id, qty, condition, location, note, part_no)
    values (v_code, v_kind, v_name, v_en, v_cat, v_size, v_driver, v_car, v_qty, v_cond, v_loc, v_note, v_pn)
    returning id into v_id;
    perform public._log(v_id, 'create', v_qty, v_qty, trim(coalesce(p->>'source', '')), a, null, v_car);
  else
    update public.items
       set name = v_name, name_en = v_en, category = v_cat, size = v_size, driver_id = v_driver, car_id = v_car,
           condition = v_cond, location = v_loc, note = v_note,
           part_no = case when p ? 'part_no' then v_pn else part_no end, updated_at = now()
     where id = p_id returning id, code into v_id, v_code;
    if p ? 'part_no' and old.part_no is distinct from v_pn then
      perform public._log(v_id, 'edit', 0, 0,
        'رقم القطعة: من "' || coalesce(nullif(old.part_no, ''), '—') || '" إلى "' || coalesce(v_pn, '—') || '"', a);
    end if;
    if old.location is distinct from v_loc then
      perform public._log(v_id, 'move', 0, 0,
        'من "' || coalesce(nullif(old.location, ''), 'بدون مكان') || '" إلى "' || coalesce(nullif(v_loc, ''), 'بدون مكان') || '"', a);
    end if;
    if old.condition <> v_cond then
      perform public._log(v_id, 'cond', 0, 0, 'من ' || public._cond_ar(old.condition) || ' إلى ' || public._cond_ar(v_cond), a);
    end if;
    if old.driver_id is distinct from v_driver or old.car_id is distinct from v_car then
      perform public._log(v_id, 'edit', 0, 0,
        'صاحبها: من ' || public._owner_ar(old.driver_id, old.car_id) || ' إلى ' || public._owner_ar(v_driver, v_car), a, null, v_car);
    end if;
    if old.name <> v_name then
      perform public._log(v_id, 'edit', 0, 0, 'الاسم: من "' || old.name || '" إلى "' || v_name || '"', a);
    end if;
    if old.size <> v_size then
      perform public._log(v_id, 'edit', 0, 0,
        'المقاس: من "' || coalesce(nullif(old.size, ''), '—') || '" إلى "' || coalesce(nullif(v_size, ''), '—') || '"', a);
    end if;
  end if;
  return jsonb_build_object('id', v_id, 'code', v_code, 'part_no', (select part_no from public.items where id = v_id));
end $$;

-- دخول / خروج / جرد
create or replace function public.item_move(p_token text, p_item uuid, p_type text, p_qty int, p_note text)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); cur int; d int;
begin
  select qty into cur from public.items where id = p_item for update;
  if not found then raise exception 'not_found'; end if;
  if p_type = 'in' then
    if coalesce(p_qty, 0) < 1 then raise exception 'bad_qty'; end if;
    d := p_qty;
  elsif p_type = 'out' then
    if coalesce(p_qty, 0) < 1 then raise exception 'bad_qty'; end if;
    if p_qty > cur then raise exception 'not_enough'; end if;
    d := -p_qty;
  elsif p_type = 'adjust' then
    if coalesce(p_qty, -1) < 0 then raise exception 'bad_qty'; end if;
    d := p_qty - cur;
    if d = 0 then return cur; end if;
  else
    raise exception 'bad_type';
  end if;
  update public.items set qty = qty + d, updated_at = now() where id = p_item;
  perform public._log(p_item, p_type, d, abs(d), p_note, a);
  return cur + d;
end $$;

-- تركيب قطعة على عربية + القديمة اللي طلعت بدلها
create or replace function public.install_part(p_token text, p_item uuid, p_qty int, p_car uuid, p_note text, p_old jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); p public.items%rowtype; v_car uuid; cname text; old_code text;
begin
  select * into p from public.items where id = p_item for update;
  if not found then raise exception 'not_found'; end if;
  if p.kind <> 'part' then raise exception 'bad_kind'; end if;
  if coalesce(p_qty, 0) < 1 then raise exception 'bad_qty'; end if;
  if p_qty > p.qty then raise exception 'not_enough'; end if;
  v_car := coalesce(p_car, p.car_id);
  if v_car is null then raise exception 'car_required'; end if;
  -- قطعة السواق على عربيته بس، وقطعة الجراش على أي عربية
  select name into cname from public.cars where id = v_car and (p.driver_id is null or driver_id = p.driver_id);
  if cname is null then raise exception 'car_mismatch'; end if;
  update public.items set qty = qty - p_qty, updated_at = now() where id = p_item;
  old_code := public._old_part(p, v_car, p_old, 'اتشالت من ' || cname, a, null);
  perform public._log(p_item, 'install', -p_qty, p_qty,
    concat_ws(' — ', 'على ' || cname, public._old_note(p_old, old_code), nullif(trim(coalesce(p_note, '')), '')), a, null, v_car);
  return jsonb_build_object('old_code', old_code);
end $$;

-- تراجع عن آخر حركة (الإدارة بس)
create or replace function public.undo_move(p_token text, p_move bigint)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare m public.moves%rowtype; cur int;
begin
  perform public._need_admin();
  select * into m from public.moves where id = p_move;
  if not found then raise exception 'not_found'; end if;
  if m.type not in ('in', 'out', 'adjust') then raise exception 'cant_undo'; end if;
  if exists (select 1 from public.moves where item_id = m.item_id and id > m.id) then raise exception 'not_latest'; end if;
  select qty into cur from public.items where id = m.item_id for update;
  if cur - m.delta < 0 then raise exception 'not_enough'; end if;
  update public.items set qty = qty - m.delta, updated_at = now() where id = m.item_id;
  delete from public.moves where id = p_move;
end $$;

-- مسح حاجة بالسجل بتاعها (الإدارة بس)
create or replace function public.delete_item(p_token text, p_item uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare ph text; v_code text; del text;
begin
  perform public._need_admin();
  if exists (select 1 from public.trip_items x join public.trips t on t.id = x.trip_id
              where x.item_id = p_item and t.status <> 'closed') then raise exception 'on_trip'; end if;
  if exists (select 1 from public.shipment_items x join public.shipments s on s.id = x.shipment_id
              where x.item_id = p_item and s.status = 'draft') then raise exception 'on_shipment'; end if;
  select photo_path, code into ph, v_code from public.items where id = p_item;
  if not found then raise exception 'not_found'; end if;
  delete from public.items where id = p_item;
  update public.codes set used = false where code = v_code;   -- الاستيكر يرجع فاضي
  if ph is not null and not exists (select 1 from public.items where photo_path = ph) then
    insert into public.upload_tickets (path, kind) values (ph, 'del')
    on conflict (path) do update set kind = 'del', expires_at = now() + interval '15 minutes';
    del := ph;
  end if;
  return jsonb_build_object('delete', del);
end $$;

-- الصور
create or replace function public.photo_ticket(p_token text, p_item uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); v text;
begin
  if not exists (select 1 from public.items where id = p_item) then raise exception 'not_found'; end if;
  delete from public.upload_tickets where expires_at < now();
  v := 'items/' || p_item::text || '/' || encode(gen_random_bytes(9), 'hex') || '.jpg';
  insert into public.upload_tickets (path, item_id, kind) values (v, p_item, 'up');
  return v;
end $$;

create or replace function public.set_photo(p_token text, p_item uuid, p_path text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); old text; del text;
begin
  if p_path is not null and not exists (select 1 from public.upload_tickets
                                          where path = p_path and item_id = p_item and kind = 'up') then
    raise exception 'bad_ticket';
  end if;
  select photo_path into old from public.items where id = p_item for update;
  if not found then raise exception 'not_found'; end if;
  update public.items set photo_path = p_path, updated_at = now() where id = p_item;
  if p_path is not null then delete from public.upload_tickets where path = p_path; end if;
  if old is not null and old is distinct from p_path and not exists (select 1 from public.items where photo_path = old) then
    insert into public.upload_tickets (path, kind) values (old, 'del')
    on conflict (path) do update set kind = 'del', expires_at = now() + interval '15 minutes';
    del := old;
  end if;
  return jsonb_build_object('delete', del);
end $$;

-- ---------------------------------------------------------------------
-- 13) الطلعات
-- ---------------------------------------------------------------------
create or replace function public.trip_save(p_token text, p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); v uuid; v_kind text := coalesce(nullif(p->>'kind', ''), 'race');
begin
  if coalesce(trim(p->>'name'), '') = '' then raise exception 'name_required'; end if;
  if v_kind not in ('race', 'practice', 'other') then raise exception 'bad_kind'; end if;
  if p_id is null then
    insert into public.trips (kind, name, place, trip_date, note, created_by)
    values (v_kind, trim(p->>'name'), trim(coalesce(p->>'place', '')),
            coalesce(nullif(p->>'trip_date', '')::date, (now() at time zone 'Africa/Cairo')::date),
            trim(coalesce(p->>'note', '')), a->>'name')
    returning id into v;
  else
    update public.trips set kind = v_kind, name = trim(p->>'name'), place = trim(coalesce(p->>'place', '')),
           trip_date = coalesce(nullif(p->>'trip_date', '')::date, trip_date), note = trim(coalesce(p->>'note', ''))
     where id = p_id returning id into v;
    if v is null then raise exception 'not_found'; end if;
  end if;
  return v;
end $$;

create or replace function public.trip_delete(p_token text, p_trip uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token);
begin
  if not exists (select 1 from public.trips where id = p_trip and status = 'prep') then raise exception 'trip_not_prep'; end if;
  delete from public.trips where id = p_trip;
end $$;

-- إضافة حاجات للطلعة: [{item_id, qty}]
-- في التحضير بتتحجز في الليستة بس، وبعد ما الطلعة تطلع بتخرج من الجراش على طول
create or replace function public.trip_add(p_token text, p_trip uuid, p_items jsonb, p_loaded boolean)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); t public.trips%rowtype; it jsonb; iid uuid; q int; cur int; have int;
begin
  select * into t from public.trips where id = p_trip for update;
  if not found or t.status = 'closed' then raise exception 'trip_closed'; end if;
  for it in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    iid := (it->>'item_id')::uuid;
    q := coalesce((it->>'qty')::int, 0);
    if q < 1 then raise exception 'bad_qty'; end if;
    select qty into cur from public.items where id = iid for update;
    if not found then raise exception 'not_found'; end if;
    select coalesce(qty, 0) into have from public.trip_items where trip_id = p_trip and item_id = iid;
    have := coalesce(have, 0);
    if t.status = 'prep' then
      if have + q > cur then raise exception 'not_enough'; end if;
      insert into public.trip_items (trip_id, item_id, qty, loaded) values (p_trip, iid, q, coalesce(p_loaded, false))
        on conflict (trip_id, item_id) do update
        set qty = public.trip_items.qty + excluded.qty, loaded = public.trip_items.loaded or excluded.loaded;
    else
      if q > cur then raise exception 'not_enough'; end if;
      update public.items set qty = qty - q, updated_at = now() where id = iid;
      insert into public.trip_items (trip_id, item_id, qty, loaded) values (p_trip, iid, q, true)
        on conflict (trip_id, item_id) do update set qty = public.trip_items.qty + excluded.qty, loaded = true;
      perform public._log(iid, 'trip_out', -q, q, t.name, a, p_trip);
    end if;
  end loop;
end $$;

-- تغيير الكمية في الليستة (في التحضير بس)
create or replace function public.trip_set_qty(p_token text, p_trip uuid, p_item uuid, p_qty int)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); cur int;
begin
  if not exists (select 1 from public.trips where id = p_trip and status = 'prep') then raise exception 'trip_not_prep'; end if;
  select qty into cur from public.items where id = p_item;
  if coalesce(p_qty, 0) < 1 then raise exception 'bad_qty'; end if;
  if p_qty > cur then raise exception 'not_enough'; end if;
  update public.trip_items set qty = p_qty where trip_id = p_trip and item_id = p_item;
end $$;

-- شيل حاجة من الطلعة
create or replace function public.trip_remove(p_token text, p_trip uuid, p_item uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); t public.trips%rowtype; q int;
begin
  select * into t from public.trips where id = p_trip for update;
  if not found or t.status = 'closed' then raise exception 'trip_closed'; end if;
  delete from public.trip_items where trip_id = p_trip and item_id = p_item returning qty into q;
  if q is null then return; end if;
  if t.status = 'out' then
    update public.items set qty = qty + q, updated_at = now() where id = p_item;
    perform public._log(p_item, 'trip_cancel', q, q, t.name, a, p_trip);
  end if;
end $$;

-- علامة: اتحملت (loaded) / اتلمّت (packed)
create or replace function public.trip_check(p_token text, p_trip uuid, p_item uuid, p_field text, p_value boolean)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); st text;
begin
  select status into st from public.trips where id = p_trip;
  if st is null or st = 'closed' then raise exception 'trip_closed'; end if;
  if p_field = 'loaded' then
    update public.trip_items set loaded = coalesce(p_value, true) where trip_id = p_trip and item_id = p_item;
  elsif p_field = 'packed' then
    if st <> 'out' then raise exception 'trip_not_out'; end if;
    update public.trip_items set packed = coalesce(p_value, true) where trip_id = p_trip and item_id = p_item;
  else
    raise exception 'bad_field';
  end if;
  if not found then raise exception 'not_in_trip'; end if;
end $$;

-- علّم على مجموعة حاجات مرة واحدة
create or replace function public.trip_check_many(p_token text, p_trip uuid, p_items uuid[], p_field text, p_value boolean)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); st text; n int;
begin
  select status into st from public.trips where id = p_trip;
  if st is null or st = 'closed' then raise exception 'trip_closed'; end if;
  if p_field = 'loaded' then
    update public.trip_items set loaded = coalesce(p_value, true) where trip_id = p_trip and item_id = any(p_items);
  elsif p_field = 'packed' then
    if st <> 'out' then raise exception 'trip_not_out'; end if;
    update public.trip_items set packed = coalesce(p_value, true) where trip_id = p_trip and item_id = any(p_items);
  else
    raise exception 'bad_field';
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

-- حالة الحاجة في الرجوع: {damaged, installed, used, lost, old}
create or replace function public.trip_outcome(p_token text, p_trip uuid, p_item uuid, p jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); x public.trip_items%rowtype; k text;
  v_dmg int := greatest(coalesce((p->>'damaged')::int, 0), 0);
  v_inst int := greatest(coalesce((p->>'installed')::int, 0), 0);
  v_used int := greatest(coalesce((p->>'used')::int, 0), 0);
  v_lost int := greatest(coalesce((p->>'lost')::int, 0), 0);
begin
  if not exists (select 1 from public.trips where id = p_trip and status = 'out') then raise exception 'trip_not_out'; end if;
  select * into x from public.trip_items where trip_id = p_trip and item_id = p_item for update;
  if not found then raise exception 'not_in_trip'; end if;
  select kind into k from public.items where id = p_item;
  if k <> 'part' then v_inst := 0; end if;
  if v_dmg + v_inst + v_used + v_lost > x.qty then raise exception 'bad_counts'; end if;
  update public.trip_items
     set damaged = v_dmg, installed = v_inst, used = v_used, lost = v_lost,
         old = case when v_inst > 0 then p->'old' else null end,
         packed = case when v_lost = x.qty or v_used + v_inst + v_lost = x.qty then true else packed end
   where trip_id = p_trip and item_id = p_item;
end $$;

-- طلعنا: p_mode = 'drop' (شيل اللي ما اتحملش) أو 'all' (اعتبر الكل اتحمل)
create or replace function public.trip_depart(p_token text, p_trip uuid, p_mode text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); t public.trips%rowtype; x record; dropped int := 0;
begin
  select * into t from public.trips where id = p_trip for update;
  if not found or t.status <> 'prep' then raise exception 'trip_not_prep'; end if;
  if coalesce(p_mode, 'drop') = 'drop' then
    delete from public.trip_items where trip_id = p_trip and not loaded;
    get diagnostics dropped = row_count;
  end if;
  if not exists (select 1 from public.trip_items where trip_id = p_trip) then raise exception 'trip_empty'; end if;
  for x in select ti.item_id, ti.qty, i.qty as cur from public.trip_items ti join public.items i on i.id = ti.item_id
            where ti.trip_id = p_trip for update of i loop
    if x.qty > x.cur then raise exception 'not_enough'; end if;
    update public.items set qty = qty - x.qty, updated_at = now() where id = x.item_id;
    perform public._log(x.item_id, 'trip_out', -x.qty, x.qty, t.name, a, p_trip);
  end loop;
  update public.trip_items set loaded = true where trip_id = p_trip;
  update public.trips set status = 'out', departed_at = now(), departed_by = a->>'name' where id = p_trip;
  return jsonb_build_object('dropped', dropped);
end $$;

-- رجعنا: p_unpacked = 'ok' (اللي ما اتعلّمش عليه رجع سليم) أو 'lost' (يتسجل ضايع)
create or replace function public.trip_close(p_token text, p_trip uuid, p_unpacked text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  a jsonb := public._actor(p_token);
  t public.trips%rowtype; x public.trip_items%rowtype; p public.items%rowtype;
  v_ok int; selfok boolean; nid uuid; ncode text; old_code text; clones int := 0;
begin
  select * into t from public.trips where id = p_trip for update;
  if not found or t.status <> 'out' then raise exception 'trip_not_out'; end if;

  if coalesce(p_unpacked, 'ok') = 'lost' then
    update public.trip_items set lost = qty - damaged - installed - used
     where trip_id = p_trip and not packed;
  end if;

  for x in select * from public.trip_items where trip_id = p_trip loop
    v_ok := x.qty - x.damaged - x.installed - x.used - x.lost;
    if v_ok < 0 then raise exception 'bad_counts'; end if;
    update public.trip_items set ok = v_ok where trip_id = p_trip and item_id = x.item_id;
    select * into p from public.items where id = x.item_id for update;
    -- لو الحاجة كلها كانت برا (ومش في طلعة تانية) نعدّل عليها نفسها، غير كده نسجل التالف كحاجة لوحده
    selfok := p.qty = 0 and not exists (
      select 1 from public.trip_items j join public.trips tt on tt.id = j.trip_id
       where j.item_id = x.item_id and tt.status = 'out' and tt.id <> p_trip);

    if v_ok > 0 then
      update public.items set qty = qty + v_ok, updated_at = now() where id = p.id;
      perform public._log(p.id, 'trip_back', v_ok, v_ok, t.name, a, p_trip);
      selfok := false;
    end if;

    if x.installed > 0 then
      old_code := public._old_part(p, p.car_id, x.old, 'اتشالت في ' || t.name, a, p_trip);
      perform public._log(p.id, 'trip_installed', 0, x.installed,
        concat_ws(' — ', t.name, public._old_note(x.old, old_code)), a, p_trip, p.car_id);
    end if;

    if x.damaged > 0 then
      if selfok then
        update public.items set qty = qty + x.damaged, condition = 'damaged', updated_at = now() where id = p.id;
        perform public._log(p.id, 'trip_damaged', x.damaged, x.damaged, t.name, a, p_trip);
      else
        ncode := case when p.kind = 'tool' then null else public._take_code(null) end;
        insert into public.items (code, kind, name, name_en, category, size, driver_id, car_id, qty, condition, location, note, photo_path)
        values (ncode, p.kind, p.name, p.name_en, p.category, p.size, p.driver_id, p.car_id, x.damaged, 'damaged', p.location,
                'رجعت تالفة من ' || t.name || coalesce(' (الأصل ' || p.code || ')', ''), p.photo_path)
        returning id into nid;
        perform public._log(nid, 'trip_damaged', x.damaged, x.damaged, t.name || coalesce(' — من ' || p.code, ''), a, p_trip);
        perform public._log(p.id, 'trip_damaged', 0, x.damaged, t.name || coalesce(' — اتسجلت ' || ncode, ' — التالف اتسجل لوحده'), a, p_trip);
        clones := clones + 1;
      end if;
    end if;

    if x.used > 0 then perform public._log(p.id, 'trip_used', 0, x.used, t.name, a, p_trip); end if;
    if x.lost > 0 then perform public._log(p.id, 'trip_lost', 0, x.lost, t.name, a, p_trip); end if;
  end loop;

  update public.trips set status = 'closed', closed_at = now(), closed_by = a->>'name' where id = p_trip;
  return jsonb_build_object('clones', clones);
end $$;

-- الليستات الجاهزة
create or replace function public.template_save(p_token text, p_id uuid, p_name text, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); v uuid;
begin
  if coalesce(trim(p_name), '') = '' then raise exception 'name_required'; end if;
  if p_id is null then
    insert into public.templates (name) values (trim(p_name)) returning id into v;
  else
    update public.templates set name = trim(p_name) where id = p_id returning id into v;
    if v is null then raise exception 'not_found'; end if;
  end if;
  if p_items is not null then
    delete from public.template_items where template_id = v;
    insert into public.template_items (template_id, item_id, qty)
    select v, (e->>'item_id')::uuid, greatest(coalesce((e->>'qty')::int, 1), 1)
      from jsonb_array_elements(p_items) e
     where exists (select 1 from public.items where id = (e->>'item_id')::uuid)
    on conflict (template_id, item_id) do update set qty = excluded.qty;
  end if;
  return v;
end $$;

create or replace function public.template_delete(p_token text, p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token);
begin
  delete from public.templates where id = p_id;
end $$;

-- ضيف حاجات لليستة جاهزة من غير ما تمسح اللي فيها: [{item_id, qty}]
create or replace function public.template_add_items(p_token text, p_template uuid, p_items jsonb)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); n int;
begin
  if not exists (select 1 from public.templates where id = p_template) then raise exception 'not_found'; end if;
  insert into public.template_items (template_id, item_id, qty)
  select p_template, (e->>'item_id')::uuid, greatest(coalesce((e->>'qty')::int, 1), 1)
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
   where exists (select 1 from public.items where id = (e->>'item_id')::uuid)
  on conflict (template_id, item_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- حط ليستة جاهزة في طلعة (في التحضير)، وبيرجع الحاجات اللي مش كفاية
create or replace function public.trip_apply_template(p_token text, p_trip uuid, p_template uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); x record; have int; can int; short jsonb := '[]'::jsonb;
begin
  if not exists (select 1 from public.trips where id = p_trip and status = 'prep') then raise exception 'trip_not_prep'; end if;
  update public.trips set template_id = p_template where id = p_trip;
  for x in select ti.item_id, ti.qty, i.qty as cur from public.template_items ti join public.items i on i.id = ti.item_id
            where ti.template_id = p_template loop
    select coalesce(qty, 0) into have from public.trip_items where trip_id = p_trip and item_id = x.item_id;
    have := coalesce(have, 0);
    can := least(x.qty - have, x.cur - have);
    if can > 0 then
      insert into public.trip_items (trip_id, item_id, qty) values (p_trip, x.item_id, can)
        on conflict (trip_id, item_id) do update set qty = public.trip_items.qty + excluded.qty;
    end if;
    if have + greatest(can, 0) < x.qty then
      short := short || jsonb_build_object('item_id', x.item_id, 'wanted', x.qty, 'got', have + greatest(can, 0));
    end if;
  end loop;
  return short;
end $$;

-- ---------------------------------------------------------------------
-- 14) الشحنات
-- ---------------------------------------------------------------------
create or replace function public.shipment_save(p_token text, p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); v uuid; v_cust uuid := nullif(p->>'customer_id', '')::uuid;
begin
  if v_cust is null or not exists (select 1 from public.customers where id = v_cust) then raise exception 'customer_required'; end if;
  if p_id is null then
    insert into public.shipments (customer_id, ship_date, note, created_by)
    values (v_cust, coalesce(nullif(p->>'ship_date', '')::date, (now() at time zone 'Africa/Cairo')::date),
            trim(coalesce(p->>'note', '')), a->>'name')
    returning id into v;
  else
    update public.shipments set customer_id = v_cust, ship_date = coalesce(nullif(p->>'ship_date', '')::date, ship_date),
           note = trim(coalesce(p->>'note', ''))
     where id = p_id returning id into v;
    if v is null then raise exception 'not_found'; end if;
  end if;
  return v;
end $$;

-- [{item_id, qty}] — بيضيف على الموجود (منتجات أو قطع، العدة لأ)
create or replace function public.shipment_add(p_token text, p_ship uuid, p_items jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); it jsonb; iid uuid; q int; cur int; k text; have int;
begin
  if not exists (select 1 from public.shipments where id = p_ship and status = 'draft') then raise exception 'shipment_done'; end if;
  for it in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    iid := (it->>'item_id')::uuid; q := coalesce((it->>'qty')::int, 0);
    if q < 1 then raise exception 'bad_qty'; end if;
    select qty, kind into cur, k from public.items where id = iid;
    if k is null then raise exception 'not_found'; end if;
    if k not in ('product', 'part') then raise exception 'bad_kind'; end if;
    select qty into have from public.shipment_items where shipment_id = p_ship and item_id = iid;
    if coalesce(have, 0) + q > cur then raise exception 'not_enough'; end if;
    if k = 'product' then
      perform public._ship_take(p_ship, iid, q);   -- المنتج: بياخد أقدم قطع في المخزن بأكوادها
    else
      insert into public.shipment_items (shipment_id, item_id, qty) values (p_ship, iid, q)
        on conflict (shipment_id, item_id) do update set qty = public.shipment_items.qty + excluded.qty;
    end if;
  end loop;
end $$;

-- شحنة جديدة في خطوة واحدة: العميل (قديم أو بياناته جديدة) + الشحنة + الحاجات اللي فيها
-- p = { customer_id | customer: {name, phone, country, address, email}, ship_date, note, items: [{item_id, qty}] }
create or replace function public.shipment_create(p_token text, p jsonb)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); v_cust uuid := nullif(p->>'customer_id', '')::uuid; c jsonb := p->'customer'; v uuid;
begin
  if v_cust is not null then
    if not exists (select 1 from public.customers where id = v_cust) then raise exception 'customer_required'; end if;
  else
    if c is null or jsonb_typeof(c) <> 'object' or coalesce(trim(c->>'name'), '') = '' then raise exception 'customer_required'; end if;
    -- لو نفس الاسم ونفس التليفون متسجل قبل كده، نستخدمه ونحدّث اللي اتكتب جديد
    select id into v_cust from public.customers
     where lower(trim(name)) = lower(trim(c->>'name')) and phone = trim(coalesce(c->>'phone', ''))
     order by created_at limit 1;
    if v_cust is not null then
      update public.customers set
        country = coalesce(nullif(trim(coalesce(c->>'country', '')), ''), country),
        address = coalesce(nullif(trim(coalesce(c->>'address', '')), ''), address),
        email = coalesce(nullif(trim(coalesce(c->>'email', '')), ''), email)
       where id = v_cust;
    else
      insert into public.customers (name, country, phone, email, address)
      values (trim(c->>'name'), trim(coalesce(c->>'country', '')), trim(coalesce(c->>'phone', '')),
              trim(coalesce(c->>'email', '')), trim(coalesce(c->>'address', '')))
      returning id into v_cust;
    end if;
  end if;
  insert into public.shipments (customer_id, ship_date, note, created_by)
  values (v_cust, coalesce(nullif(p->>'ship_date', '')::date, (now() at time zone 'Africa/Cairo')::date),
          trim(coalesce(p->>'note', '')), a->>'name')
  returning id into v;
  if jsonb_typeof(p->'items') = 'array' and jsonb_array_length(p->'items') > 0 then
    perform public.shipment_add(p_token, v, p->'items');
  end if;
  return v;
end $$;

create or replace function public.shipment_set_qty(p_token text, p_ship uuid, p_item uuid, p_qty int)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); cur int; k text; have int;
begin
  if not exists (select 1 from public.shipments where id = p_ship and status = 'draft') then raise exception 'shipment_done'; end if;
  select qty, kind into cur, k from public.items where id = p_item;
  if k = 'product' then
    select count(*) into have from public.shipment_units where shipment_id = p_ship and item_id = p_item;
    if coalesce(p_qty, 0) > cur then raise exception 'not_enough'; end if;
    if coalesce(p_qty, 0) > have then
      perform public._ship_take(p_ship, p_item, p_qty - have);
    elsif coalesce(p_qty, 0) < have then
      -- اللي اتضاف الآخر يطلع الأول
      delete from public.shipment_units where unit_id in (
        select unit_id from public.shipment_units where shipment_id = p_ship and item_id = p_item
         order by added_at desc limit have - greatest(coalesce(p_qty, 0), 0));
      perform public._ship_fix(p_ship, p_item);
    end if;
    return;
  end if;
  if coalesce(p_qty, 0) < 1 then
    delete from public.shipment_items where shipment_id = p_ship and item_id = p_item;
    return;
  end if;
  if p_qty > cur then raise exception 'not_enough'; end if;
  update public.shipment_items set qty = p_qty where shipment_id = p_ship and item_id = p_item;
end $$;

-- ياخد أقدم قطع المنتج اللي في المخزن ومش في شحنة
create or replace function public._ship_take(p_ship uuid, p_item uuid, p_n int)
returns void language plpgsql security definer set search_path = public as $$
declare got int;
begin
  insert into public.shipment_units (unit_id, shipment_id, item_id)
  select x.id, p_ship, p_item from public.units x
   where x.item_id = p_item and x.status = 'stock' and not exists (select 1 from public.shipment_units su where su.unit_id = x.id)
   order by x.serial limit p_n;
  get diagnostics got = row_count;
  if got < p_n then raise exception 'not_enough'; end if;
  perform public._ship_fix(p_ship, p_item);
end $$;

create or replace function public.shipment_ship(p_token text, p_ship uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); s public.shipments%rowtype; x record; cname text;
begin
  select * into s from public.shipments where id = p_ship for update;
  if not found or s.status <> 'draft' then raise exception 'shipment_done'; end if;
  if not exists (select 1 from public.shipment_items where shipment_id = p_ship) then raise exception 'shipment_empty'; end if;
  select name into cname from public.customers where id = s.customer_id;
  -- قطع المنتجات بأكوادها بتتعلّم إنها اتشحنت
  update public.units u set status = 'shipped', shipment_id = p_ship, out_at = now()
    from public.shipment_units su where su.shipment_id = p_ship and su.unit_id = u.id;
  for x in select si.item_id, si.qty, i.qty as cur from public.shipment_items si join public.items i on i.id = si.item_id
            where si.shipment_id = p_ship for update of i loop
    if x.qty > x.cur then raise exception 'not_enough'; end if;
    update public.items set qty = qty - x.qty, updated_at = now() where id = x.item_id;
    perform public._log(x.item_id, 'ship', -x.qty, x.qty, s.ref || ' — ' || coalesce(cname, ''), a, null, null, p_ship);
  end loop;
  update public.shipments set status = 'shipped', shipped_at = now(), shipped_by = a->>'name' where id = p_ship;
end $$;

create or replace function public.shipment_delete(p_token text, p_ship uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token);
begin
  if not exists (select 1 from public.shipments where id = p_ship and status = 'draft') then raise exception 'shipment_done'; end if;
  delete from public.shipments where id = p_ship;
end $$;

-- ---------------------------------------------------------------------
-- 15) السجل
-- ---------------------------------------------------------------------
create or replace function public.moves_list(p_token text, p jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  a jsonb := public._actor(p_token);
  f_item uuid := nullif(p->>'item_id', '')::uuid;
  f_trip uuid := nullif(p->>'trip_id', '')::uuid;
  f_car uuid := nullif(p->>'car_id', '')::uuid;
  f_driver uuid := nullif(p->>'driver_id', '')::uuid;
  f_kind text := nullif(p->>'kind', '');
  f_group text := coalesce(p->>'group', '');
  f_from date := nullif(p->>'from', '')::date;
  f_to date := nullif(p->>'to', '')::date;
  f_before bigint := nullif(p->>'before', '')::bigint;
  f_limit int := least(coalesce(nullif(p->>'limit', '')::int, 60), 2000);
begin
  return coalesce((
    select jsonb_agg(to_jsonb(m) order by m.id desc) from (
      select mv.*, it.code, it.name as item_name, it.kind as item_kind, it.size as item_size, it.driver_id,
             not exists (select 1 from public.moves m2 where m2.item_id = mv.item_id and m2.id > mv.id) as is_last
        from public.moves mv
        join public.items it on it.id = mv.item_id
       where (f_item is null or mv.item_id = f_item)
         and (f_trip is null or mv.trip_id = f_trip)
         and (f_car is null or mv.car_id = f_car)
         and (f_driver is null or it.driver_id = f_driver
              or mv.car_id in (select c.id from public.cars c where c.driver_id = f_driver))
         and (f_kind is null or it.kind = f_kind)
         and (f_from is null or (mv.created_at at time zone 'Africa/Cairo')::date >= f_from)
         and (f_to is null or (mv.created_at at time zone 'Africa/Cairo')::date <= f_to)
         and (f_before is null or mv.id < f_before)
         and (f_group = ''
              or (f_group = 'io' and mv.type in ('create', 'make', 'in', 'out', 'adjust', 'ship'))
              or (f_group = 'install' and mv.type in ('install', 'removed', 'trip_installed'))
              or (f_group = 'trip' and left(mv.type, 5) = 'trip_')
              or (f_group = 'edit' and mv.type in ('move', 'cond', 'edit')))
       order by mv.id desc
       limit f_limit
    ) m
  ), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- 15ب) الأسعار والفواتير
--   • منتجاتنا (منتجات التصدير) ليها رقم قطعة ثابت (AF-ENG-001) وسعر
--   • ليستة أسعار للمصنعيات والقطع والخامات
--   • الفواتير للإدارة، واللي الإدارة تديله صلاحية من الموظفين
-- ---------------------------------------------------------------------
alter table public.settings add column if not exists inv_tax numeric(5,2) not null default 0;
alter table public.settings add column if not exists inv_payment text not null default '';
alter table public.settings add column if not exists inv_terms_ar text not null default '';
alter table public.settings add column if not exists inv_terms_en text not null default '';

alter table public.staff add column if not exists can_invoice boolean not null default false;

alter table public.categories add column if not exists abbr text not null default '';

alter table public.items add column if not exists part_no text;
alter table public.items add column if not exists price numeric(12,2);
alter table public.items add column if not exists price_cur text not null default 'USD';
do $$ begin
  alter table public.items add constraint items_price_cur check (price_cur in ('EGP', 'USD'));
exception when duplicate_object then null; end $$;
create unique index if not exists items_part_no_key on public.items (upper(part_no)) where part_no is not null and part_no <> '';

create table if not exists public.price_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('labor', 'material')),   -- مصنعية / قطع وخامات
  name text not null,
  name_en text not null default '',
  unit text not null default '',
  price numeric(12,2) not null default 0,
  price_cur text not null default 'EGP' check (price_cur in ('EGP', 'USD')),
  part_no text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);

create sequence if not exists public.inv_seq;
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default ('INV-' || lpad(nextval('public.inv_seq')::text, 4, '0')),
  inv_date date not null default ((now() at time zone 'Africa/Cairo')::date),
  lang text not null default 'ar' check (lang in ('ar', 'en')),
  currency text not null default 'EGP' check (currency in ('EGP', 'USD')),
  rate numeric(12,4),                      -- كام جنيه في الدولار وقت الفاتورة
  show_rate boolean not null default false,
  bill jsonb not null default '{}'::jsonb, -- name, phone, address, country, extra
  customer_id uuid references public.customers(id) on delete set null,
  driver_id uuid references public.drivers(id) on delete set null,
  shipment_id uuid references public.shipments(id) on delete set null,
  lines jsonb not null default '[]'::jsonb,
  discount numeric(12,2) not null default 0,
  tax_pct numeric(5,2) not null default 0,
  subtotal numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  notes text not null default '',
  terms text not null default '',
  paid boolean not null default false,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists invoices_date_idx on public.invoices (inv_date desc, created_at desc);
alter table public.invoices add column if not exists show_payment boolean not null default false;

-- أنواع منتجاتنا واختصاراتها (اللي بتتحط في رقم القطعة)
insert into public.categories (kind, name, sort, abbr) values
  ('product', 'كيت زاوية', 1, 'ANG'), ('product', 'قواعد ماتور', 2, 'ENG'), ('product', 'دراعات', 3, 'ARM'),
  ('product', 'ضبط التو', 4, 'TOE'), ('product', 'رول كيج', 5, 'CAG'), ('product', 'تعليق', 6, 'SUS'),
  ('product', 'شاسيه وتقوية', 7, 'CHS'), ('product', 'تانية', 99, 'GEN')
on conflict (kind, name) do update set abbr = case when public.categories.abbr = '' then excluded.abbr else public.categories.abbr end;

-- قطع الجراش: القطعة ممكن تبقى من غير سواق (ملك الجراش)
do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'public.items'::regclass and contype = 'c'
            and pg_get_constraintdef(oid) like '%(kind = ''part''::text) = (driver_id IS NOT NULL)%' loop
    execute format('alter table public.items drop constraint %I', c);
  end loop;
  begin
    alter table public.items add constraint items_owner_kind check (kind = 'part' or driver_id is null);
  exception when duplicate_object then null; end;
end $$;

alter table public.price_items enable row level security;
alter table public.invoices enable row level security;
revoke all on public.price_items from anon, authenticated;
revoke all on public.invoices from anon, authenticated;
revoke all on sequence public.inv_seq from anon, authenticated;

-- لازم يكون عنده صلاحية الفواتير (الإدارة أو موظف الإدارة اديته الصلاحية)
create or replace function public._need_invoice(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token);
begin
  if not coalesce((a->>'inv')::boolean, false) then raise exception 'invoice_only'; end if;
  return a;
end $$;

-- الإدارة: الموظفين ومين ليه صلاحية الفواتير
create or replace function public.admin_staff()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public._need_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'can_invoice', can_invoice) order by name)
                     from public.staff where active), '[]'::jsonb);
end $$;

create or replace function public.admin_set_staff_invoice(p_id uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._need_admin();
  update public.staff set can_invoice = coalesce(p_on, false) where id = p_id;
  if not found then raise exception 'not_found'; end if;
end $$;

-- سعر منتج من منتجاتنا (الرقم بيتحفظ مع المنتج نفسه)
create or replace function public.set_item_price(p_token text, p_item uuid, p_price numeric, p_cur text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._need_invoice(p_token); k text;
begin
  select kind into k from public.items where id = p_item;
  if k is null then raise exception 'not_found'; end if;
  if k <> 'product' then raise exception 'bad_kind'; end if;
  if p_price is not null and p_price < 0 then raise exception 'bad_price'; end if;
  if coalesce(p_cur, 'USD') not in ('EGP', 'USD') then raise exception 'bad_currency'; end if;
  update public.items set price = round(p_price, 2), price_cur = coalesce(p_cur, 'USD'), updated_at = now() where id = p_item;
end $$;

-- اختصار نوع المنتجات (اللي بيتحط في رقم القطعة: AF-ENG-001)
create or replace function public.set_category_abbr(p_token text, p_kind text, p_name text, p_abbr text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); v text := upper(regexp_replace(coalesce(p_abbr, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if length(v) > 6 then raise exception 'bad_abbr'; end if;
  update public.categories set abbr = v where kind = p_kind and name = p_name;
  if not found then raise exception 'not_found'; end if;
end $$;

-- ليستة الأسعار (مصنعيات / قطع وخامات)
create or replace function public.price_item_save(p_token text, p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._need_invoice(p_token); v uuid;
  v_kind text := coalesce(nullif(p->>'kind', ''), 'labor');
  v_cur text := coalesce(nullif(p->>'price_cur', ''), 'EGP');
  v_price numeric := coalesce(nullif(p->>'price', '')::numeric, 0);
begin
  if coalesce(trim(p->>'name'), '') = '' then raise exception 'name_required'; end if;
  if v_kind not in ('labor', 'material') then raise exception 'bad_kind'; end if;
  if v_cur not in ('EGP', 'USD') then raise exception 'bad_currency'; end if;
  if v_price < 0 then raise exception 'bad_price'; end if;
  if p_id is null then
    insert into public.price_items (kind, name, name_en, unit, price, price_cur, part_no, note)
    values (v_kind, trim(p->>'name'), trim(coalesce(p->>'name_en', '')), trim(coalesce(p->>'unit', '')), round(v_price, 2), v_cur,
            upper(trim(coalesce(p->>'part_no', ''))), trim(coalesce(p->>'note', '')))
    returning id into v;
  else
    update public.price_items set kind = v_kind, name = trim(p->>'name'), name_en = trim(coalesce(p->>'name_en', '')),
           unit = trim(coalesce(p->>'unit', '')), price = round(v_price, 2), price_cur = v_cur,
           part_no = upper(trim(coalesce(p->>'part_no', ''))), note = trim(coalesce(p->>'note', ''))
     where id = p_id returning id into v;
    if v is null then raise exception 'not_found'; end if;
  end if;
  return v;
end $$;

create or replace function public.price_item_delete(p_token text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._need_admin();
  delete from public.price_items where id = p_id;
end $$;

-- حفظ الفاتورة كاملة (البنود جوه lines)، والإجمالي بيتحسب هنا
-- line = { kind: product|labor|material|free, ref_id, part_no, desc, qty, unit, price, src_price, src_cur, manual }
create or replace function public.invoice_save(p_token text, p_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  a jsonb := public._need_invoice(p_token);
  v_lines jsonb := '[]'::jsonb; l jsonb; q numeric; pr numeric;
  v_sub numeric := 0; v_disc numeric; v_tax numeric := coalesce(nullif(p->>'tax_pct', '')::numeric, 0); v_tot numeric;
  v_cur text := coalesce(nullif(p->>'currency', ''), 'EGP'); v_lang text := coalesce(nullif(p->>'lang', ''), 'ar');
  v_bill jsonb := coalesce(p->'bill', '{}'::jsonb);
  v uuid; v_ref text;
begin
  if v_cur not in ('EGP', 'USD') then raise exception 'bad_currency'; end if;
  if v_lang not in ('ar', 'en') then v_lang := 'ar'; end if;
  if jsonb_typeof(v_bill) <> 'object' or coalesce(trim(v_bill->>'name'), '') = '' then raise exception 'bill_required'; end if;
  if jsonb_typeof(p->'lines') = 'array' then
    for l in select value from jsonb_array_elements(p->'lines') loop
      continue when jsonb_typeof(l) <> 'object' or coalesce(trim(l->>'desc'), '') = '';
      q := round(coalesce(nullif(l->>'qty', '')::numeric, 0), 2);
      pr := round(coalesce(nullif(l->>'price', '')::numeric, 0), 2);
      if q <= 0 then raise exception 'bad_qty'; end if;
      if pr < 0 then raise exception 'bad_price'; end if;
      v_lines := v_lines || jsonb_build_array(l || jsonb_build_object('qty', q, 'price', pr, 'desc', trim(l->>'desc')));
      v_sub := v_sub + round(q * pr, 2);
    end loop;
  end if;
  if jsonb_array_length(v_lines) = 0 then raise exception 'invoice_empty'; end if;
  if v_tax < 0 or v_tax > 100 then raise exception 'bad_tax'; end if;
  v_disc := least(greatest(coalesce(nullif(p->>'discount', '')::numeric, 0), 0), v_sub);
  v_tot := v_sub - v_disc + round((v_sub - v_disc) * v_tax / 100, 2);
  if p_id is null then
    insert into public.invoices (inv_date, lang, currency, rate, show_rate, bill, customer_id, driver_id, shipment_id, job_id,
                                 lines, discount, tax_pct, subtotal, total, notes, terms, created_by, show_payment)
    values (coalesce(nullif(p->>'inv_date', '')::date, (now() at time zone 'Africa/Cairo')::date), v_lang, v_cur,
            nullif(p->>'rate', '')::numeric, coalesce((p->>'show_rate')::boolean, false), v_bill,
            nullif(p->>'customer_id', '')::uuid, nullif(p->>'driver_id', '')::uuid, nullif(p->>'shipment_id', '')::uuid,
            nullif(p->>'job_id', '')::uuid,
            v_lines, v_disc, v_tax, round(v_sub, 2), round(v_tot, 2), trim(coalesce(p->>'notes', '')), trim(coalesce(p->>'terms', '')), a->>'name',
            coalesce((p->>'show_payment')::boolean, false))
    returning id, ref into v, v_ref;
  else
    update public.invoices set
      inv_date = coalesce(nullif(p->>'inv_date', '')::date, inv_date), lang = v_lang, currency = v_cur,
      rate = nullif(p->>'rate', '')::numeric, show_rate = coalesce((p->>'show_rate')::boolean, false), bill = v_bill,
      customer_id = nullif(p->>'customer_id', '')::uuid, driver_id = nullif(p->>'driver_id', '')::uuid,
      shipment_id = nullif(p->>'shipment_id', '')::uuid, job_id = nullif(p->>'job_id', '')::uuid,
      lines = v_lines, discount = v_disc, tax_pct = v_tax, subtotal = round(v_sub, 2), total = round(v_tot, 2),
      notes = trim(coalesce(p->>'notes', '')), terms = trim(coalesce(p->>'terms', '')),
      show_payment = coalesce((p->>'show_payment')::boolean, false), updated_at = now()
     where id = p_id returning id, ref into v, v_ref;
    if v is null then raise exception 'not_found'; end if;
  end if;
  return jsonb_build_object('id', v, 'ref', v_ref);
end $$;

create or replace function public.invoice_set_paid(p_token text, p_id uuid, p_paid boolean)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._need_invoice(p_token);
begin
  update public.invoices set paid = coalesce(p_paid, false), updated_at = now() where id = p_id;
  if not found then raise exception 'not_found'; end if;
end $$;

create or replace function public.invoice_delete(p_token text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._need_admin();
  delete from public.invoices where id = p_id;
end $$;

-- ---------------------------------------------------------------------
-- 15ج) أوامر الشغل: كل عربية داخلة الجراش ليها أمر شغل
--   الحالة، الشغل المطلوب، المسؤول، الساعات، الخامات، القطع اللي اتركبت، صور قبل وبعد
-- ---------------------------------------------------------------------
create sequence if not exists public.job_seq;

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default ('JOB-' || lpad(nextval('public.job_seq')::text, 4, '0')),
  driver_id uuid references public.drivers(id) on delete set null,
  car_id uuid references public.cars(id) on delete set null,
  title text not null,                                   -- المطلوب باختصار
  note text not null default '',
  status text not null default 'received'
    check (status in ('received', 'working', 'waiting', 'ready', 'delivered', 'cancelled')),
  staff_id uuid references public.staff(id) on delete set null,   -- المسؤول عنها
  due_date date,                                         -- ميعاد التسليم
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index if not exists jobs_car_idx on public.jobs (car_id);
create index if not exists jobs_status_idx on public.jobs (status, created_at desc);

-- الشغل المطلوب (task) والخامات اللي اتصرفت (material)
create table if not exists public.job_lines (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  kind text not null check (kind in ('task', 'material')),
  title text not null,
  qty numeric(12,2) not null default 1 check (qty > 0),
  unit text not null default '',
  price_item_id uuid references public.price_items(id) on delete set null,
  done boolean not null default false,
  done_by text not null default '',
  done_at timestamptz,
  sort int not null default 0,
  created_by text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists job_lines_job_idx on public.job_lines (job_id);

-- ساعات الشغل
create table if not exists public.job_hours (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  staff_id uuid references public.staff(id) on delete set null,
  staff_name text not null default '',
  hours numeric(5,2) not null check (hours > 0 and hours <= 24),
  work_date date not null default ((now() at time zone 'Africa/Cairo')::date),
  note text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists job_hours_job_idx on public.job_hours (job_id);

-- صور قبل / أثناء / بعد
create table if not exists public.job_photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  path text not null unique,
  stage text not null default 'before' check (stage in ('before', 'during', 'after')),
  created_by text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists job_photos_job_idx on public.job_photos (job_id);

-- الفاتورة ممكن تبقى جاية من أمر شغل
alter table public.invoices add column if not exists job_id uuid references public.jobs(id) on delete set null;

do $$
declare t text;
begin
  foreach t in array array['jobs', 'job_lines', 'job_hours', 'job_photos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
revoke all on sequence public.job_seq from anon, authenticated;

-- أمر الشغل كامل (بالشغل والخامات والساعات والصور والفاتورة لو اتعملت)
create or replace function public._job_json(p_job uuid, p_inv boolean)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(j) || jsonb_build_object(
    'lines', coalesce((select jsonb_agg(to_jsonb(l) - 'job_id' order by l.kind desc, l.sort, l.created_at)
                         from public.job_lines l where l.job_id = j.id), '[]'::jsonb),
    'hours', coalesce((select jsonb_agg(to_jsonb(h) - 'job_id' order by h.work_date desc, h.created_at desc)
                         from public.job_hours h where h.job_id = j.id), '[]'::jsonb),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', ph.id, 'path', ph.path, 'stage', ph.stage,
                                                            'created_by', ph.created_by, 'created_at', ph.created_at) order by ph.created_at)
                          from public.job_photos ph where ph.job_id = j.id), '[]'::jsonb),
    'invoice', (select case when p_inv then jsonb_build_object('id', v.id, 'ref', v.ref, 'paid', v.paid)
                            else jsonb_build_object('ref', v.ref) end
                  from public.invoices v where v.job_id = j.id order by v.created_at desc limit 1))
  from public.jobs j where j.id = p_job;
$$;

create or replace function public._job_jsons(p_inv boolean)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(public._job_json(j.id, p_inv)
                    order by (j.status in ('delivered', 'cancelled')), j.status_at desc, j.created_at desc), '[]'::jsonb)
    from (select id, status, status_at, created_at from public.jobs where status not in ('delivered', 'cancelled')
          union all
          (select id, status, status_at, created_at from public.jobs where status in ('delivered', 'cancelled')
            order by status_at desc limit 80)) j;
$$;

-- أمر شغل واحد (لو قديم ومش في الليستة)
create or replace function public.job_get(p_token text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); r jsonb;
begin
  r := public._job_json(p_id, coalesce((a->>'inv')::boolean, false));
  if r is null then raise exception 'not_found'; end if;
  return r;
end $$;

-- كل أوامر الشغل بتاعة عربية (سجل العربية)
create or replace function public.car_jobs(p_token text, p_car uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', j.id, 'ref', j.ref, 'title', j.title, 'status', j.status,
                                                       'created_at', j.created_at, 'delivered_at', j.delivered_at)
                                    order by j.created_at desc)
                     from public.jobs j where j.car_id = p_car), '[]'::jsonb);
end $$;

-- استلام عربية / تعديل أمر الشغل
-- p = { driver_id, car_id, title, note, staff_id, due_date, tasks: ['...'] (في الأول بس) }
create or replace function public.job_save(p_token text, p_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  a jsonb := public._actor(p_token);
  v_car uuid := nullif(p->>'car_id', '')::uuid;
  v_drv uuid := nullif(p->>'driver_id', '')::uuid;
  v_staff uuid := nullif(p->>'staff_id', '')::uuid;
  v_title text := trim(coalesce(p->>'title', ''));
  v_due date := nullif(p->>'due_date', '')::date;
  cd uuid; v uuid; v_ref text; t text; n int := 0;
begin
  if v_title = '' then raise exception 'job_title_required'; end if;
  if v_car is not null then
    select driver_id into cd from public.cars where id = v_car;
    if cd is null then raise exception 'not_found'; end if;
    if v_drv is null then v_drv := cd; elsif v_drv <> cd then raise exception 'car_mismatch'; end if;
  end if;
  if v_drv is not null and not exists (select 1 from public.drivers where id = v_drv) then raise exception 'not_found'; end if;
  if v_staff is not null and not exists (select 1 from public.staff where id = v_staff and active) then raise exception 'not_found'; end if;
  if p_id is null then
    insert into public.jobs (driver_id, car_id, title, note, staff_id, due_date, created_by)
    values (v_drv, v_car, v_title, trim(coalesce(p->>'note', '')), v_staff, v_due, coalesce(a->>'name', ''))
    returning id, ref into v, v_ref;
    if jsonb_typeof(p->'tasks') = 'array' then
      for t in select trim(value) from jsonb_array_elements_text(p->'tasks') loop
        continue when t = '';
        n := n + 1;
        insert into public.job_lines (job_id, kind, title, sort, created_by) values (v, 'task', left(t, 300), n, coalesce(a->>'name', ''));
      end loop;
    end if;
  else
    update public.jobs set driver_id = v_drv, car_id = v_car, title = v_title, note = trim(coalesce(p->>'note', '')),
           staff_id = v_staff, due_date = v_due, updated_at = now()
     where id = p_id returning id, ref into v, v_ref;
    if v is null then raise exception 'not_found'; end if;
  end if;
  return jsonb_build_object('id', v, 'ref', v_ref);
end $$;

-- الحالة: استلمناها / شغالين / مستنية قطع / جاهزة / اتسلمت / اتلغت
create or replace function public.job_set_status(p_token text, p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token);
begin
  if p_status not in ('received', 'working', 'waiting', 'ready', 'delivered', 'cancelled') then raise exception 'bad_status'; end if;
  update public.jobs set status = p_status, status_at = now(), updated_at = now(),
         delivered_at = case when p_status = 'delivered' then coalesce(delivered_at, now()) else null end
   where id = p_id;
  if not found then raise exception 'not_found'; end if;
end $$;

-- شغلانة أو خامة جديدة على أمر الشغل
-- p = { kind: task|material, title, qty, unit, price_item_id }
create or replace function public.job_line_add(p_token text, p_job uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  a jsonb := public._actor(p_token);
  v_kind text := coalesce(nullif(p->>'kind', ''), 'task');
  v_pi uuid := nullif(p->>'price_item_id', '')::uuid;
  v_title text := trim(coalesce(p->>'title', ''));
  v_qty numeric := round(coalesce(nullif(p->>'qty', '')::numeric, 1), 2);
  v_unit text := trim(coalesce(p->>'unit', ''));
  pi public.price_items%rowtype; s int; v uuid;
begin
  if not exists (select 1 from public.jobs where id = p_job) then raise exception 'not_found'; end if;
  if v_kind not in ('task', 'material') then raise exception 'bad_kind'; end if;
  if v_pi is not null then
    select * into pi from public.price_items where id = v_pi;
    if not found then raise exception 'not_found'; end if;
    if v_title = '' then v_title := pi.name; end if;
    if v_unit = '' then v_unit := pi.unit; end if;
  end if;
  if v_title = '' then raise exception 'name_required'; end if;
  if v_qty <= 0 then raise exception 'bad_qty'; end if;
  select coalesce(max(sort), 0) + 1 into s from public.job_lines where job_id = p_job and kind = v_kind;
  insert into public.job_lines (job_id, kind, title, qty, unit, price_item_id, sort, created_by)
  values (p_job, v_kind, left(v_title, 300), v_qty, v_unit, v_pi, s, coalesce(a->>'name', ''))
  returning id into v;
  update public.jobs set updated_at = now() where id = p_job;
  return v;
end $$;

create or replace function public.job_line_update(p_token text, p_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); v_title text := trim(coalesce(p->>'title', ''));
  v_qty numeric := round(coalesce(nullif(p->>'qty', '')::numeric, 1), 2); jid uuid;
begin
  if v_title = '' then raise exception 'name_required'; end if;
  if v_qty <= 0 then raise exception 'bad_qty'; end if;
  update public.job_lines set title = left(v_title, 300), qty = v_qty, unit = trim(coalesce(p->>'unit', unit))
   where id = p_id returning job_id into jid;
  if jid is null then raise exception 'not_found'; end if;
  update public.jobs set updated_at = now() where id = jid;
end $$;

create or replace function public.job_line_done(p_token text, p_id uuid, p_done boolean)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); jid uuid;
begin
  update public.job_lines set done = coalesce(p_done, false),
         done_by = case when coalesce(p_done, false) then coalesce(a->>'name', '') else '' end,
         done_at = case when coalesce(p_done, false) then now() else null end
   where id = p_id returning job_id into jid;
  if jid is null then raise exception 'not_found'; end if;
  update public.jobs set updated_at = now() where id = jid;
end $$;

create or replace function public.job_line_delete(p_token text, p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); jid uuid;
begin
  delete from public.job_lines where id = p_id returning job_id into jid;
  if jid is not null then update public.jobs set updated_at = now() where id = jid; end if;
end $$;

-- ساعات شغل: p = { staff_id, hours, work_date, note }
create or replace function public.job_hours_add(p_token text, p_job uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  a jsonb := public._actor(p_token);
  v_staff uuid := coalesce(nullif(p->>'staff_id', '')::uuid, nullif(a->>'id', '')::uuid);
  v_h numeric := round(coalesce(nullif(p->>'hours', '')::numeric, 0), 2);
  v_name text; v uuid;
begin
  if not exists (select 1 from public.jobs where id = p_job) then raise exception 'not_found'; end if;
  if v_h <= 0 or v_h > 24 then raise exception 'bad_hours'; end if;
  if v_staff is not null then
    select name into v_name from public.staff where id = v_staff;
    if v_name is null then raise exception 'not_found'; end if;
  else
    v_name := coalesce(a->>'name', '');
  end if;
  insert into public.job_hours (job_id, staff_id, staff_name, hours, work_date, note, created_by)
  values (p_job, v_staff, v_name, v_h, coalesce(nullif(p->>'work_date', '')::date, (now() at time zone 'Africa/Cairo')::date),
          trim(coalesce(p->>'note', '')), coalesce(a->>'name', ''))
  returning id into v;
  update public.jobs set updated_at = now() where id = p_job;
  return v;
end $$;

create or replace function public.job_hours_delete(p_token text, p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); jid uuid;
begin
  delete from public.job_hours where id = p_id returning job_id into jid;
  if jid is not null then update public.jobs set updated_at = now() where id = jid; end if;
end $$;

-- الصور: تذكرة رفع، وبعد الرفع تتسجل على أمر الشغل
create or replace function public.job_photo_ticket(p_token text, p_job uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); v text;
begin
  if not exists (select 1 from public.jobs where id = p_job) then raise exception 'not_found'; end if;
  delete from public.upload_tickets where expires_at < now();
  v := 'jobs/' || p_job::text || '/' || encode(gen_random_bytes(9), 'hex') || '.jpg';
  insert into public.upload_tickets (path, item_id, kind) values (v, p_job, 'up');
  return v;
end $$;

create or replace function public.job_photo_add(p_token text, p_job uuid, p_path text, p_stage text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); v uuid;
begin
  if not exists (select 1 from public.upload_tickets where path = p_path and item_id = p_job and kind = 'up') then
    raise exception 'bad_ticket';
  end if;
  insert into public.job_photos (job_id, path, stage, created_by)
  values (p_job, p_path, case when p_stage in ('before', 'during', 'after') then p_stage else 'during' end, coalesce(a->>'name', ''))
  returning id into v;
  delete from public.upload_tickets where path = p_path;
  update public.jobs set updated_at = now() where id = p_job;
  return v;
end $$;

create or replace function public.job_photo_delete(p_token text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); ph text; jid uuid;
begin
  delete from public.job_photos where id = p_id returning path, job_id into ph, jid;
  if ph is null then raise exception 'not_found'; end if;
  insert into public.upload_tickets (path, kind) values (ph, 'del')
  on conflict (path) do update set kind = 'del', expires_at = now() + interval '15 minutes';
  update public.jobs set updated_at = now() where id = jid;
  return jsonb_build_object('delete', ph);
end $$;

-- القطع اللي اتركبت على العربية من وقت ما دخلت لحد ما اتسلمت
create or replace function public.job_parts(p_token text, p_job uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); j public.jobs%rowtype; t_end timestamptz;
begin
  select * into j from public.jobs where id = p_job;
  if not found then raise exception 'not_found'; end if;
  if j.car_id is null then return '[]'::jsonb; end if;
  t_end := case when j.status = 'delivered' then coalesce(j.delivered_at, j.status_at)
                when j.status = 'cancelled' then j.status_at else now() end;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', m.id, 'type', m.type, 'amount', m.amount, 'note', m.note,
                                        'created_at', m.created_at, 'actor_name', m.actor_name,
                                        'item_id', i.id, 'code', i.code, 'name', i.name, 'size', i.size,
                                        'garage', i.driver_id is null) order by m.id)
      from public.moves m join public.items i on i.id = m.item_id
     where m.car_id = j.car_id and m.type in ('install', 'trip_installed', 'removed')
       and m.created_at >= j.created_at and m.created_at <= t_end
  ), '[]'::jsonb);
end $$;

-- مسح أمر شغل (الإدارة بس) — الصور بتتمسح كمان
create or replace function public.job_delete(p_token text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare paths text[];
begin
  perform public._need_admin();
  select coalesce(array_agg(path), '{}') into paths from public.job_photos where job_id = p_id;
  insert into public.upload_tickets (path, kind) select x, 'del' from unnest(paths) x
  on conflict (path) do update set kind = 'del', expires_at = now() + interval '15 minutes';
  delete from public.jobs where id = p_id;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('delete', to_jsonb(paths));
end $$;

-- ---------------------------------------------------------------------
-- 16) قطع التصدير: كل قطعة ليها كود لوحدها (رقم القطعة + مسلسل، زي AF-ANG-001-0007)
--     عدد المنتج = عدد قطعه اللي في المخزن، وبيتظبط لوحده مع أي حركة
-- ---------------------------------------------------------------------
create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  serial int not null,
  code text not null unique,
  status text not null default 'stock' check (status in ('stock', 'shipped', 'out')),
  shipment_id uuid references public.shipments(id) on delete set null,
  note text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  out_at timestamptz,
  unique (item_id, serial)
);
create index if not exists units_item_idx on public.units (item_id, status, serial);

-- القطع اللي في كل شحنة (بتفضل بعد الشحن عشان نعرف أنهي كود راح لمين)
create table if not exists public.shipment_units (
  unit_id uuid primary key references public.units(id) on delete cascade,
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  added_at timestamptz not null default clock_timestamp()
);
create index if not exists shipment_units_ship_idx on public.shipment_units (shipment_id, item_id);

do $$
declare t text;
begin
  foreach t in array array['units', 'shipment_units'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- قطعة جديدة بكود جديد
create or replace function public._unit_new(p_item uuid, p_by text)
returns text language plpgsql security definer set search_path = public as $$
declare pn text; cat text; s int; v text;
begin
  select upper(nullif(trim(part_no), '')), category into pn, cat from public.items where id = p_item and kind = 'product' for update;
  if not found then raise exception 'not_found'; end if;
  if pn is null then
    pn := public._next_part_no(cat);
    update public.items set part_no = pn where id = p_item;
  end if;
  select coalesce(max(serial), 0) + 1 into s from public.units where item_id = p_item;
  loop
    v := pn || '-' || lpad(s::text, 4, '0');
    exit when not exists (select 1 from public.codes where code = v);
    s := s + 1;
  end loop;
  insert into public.codes (code, used) values (v, true);
  insert into public.units (item_id, serial, code, created_by) values (p_item, s, v, coalesce(p_by, ''));
  return v;
end $$;

-- عدد قطع المنتج في الشحنة = عدد أكوادها
create or replace function public._ship_fix(p_ship uuid, p_item uuid)
returns void language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from public.shipment_units where shipment_id = p_ship and item_id = p_item;
  if n = 0 then
    delete from public.shipment_items where shipment_id = p_ship and item_id = p_item;
  else
    insert into public.shipment_items (shipment_id, item_id, qty) values (p_ship, p_item, n)
      on conflict (shipment_id, item_id) do update set qty = excluded.qty;
  end if;
end $$;

-- يخلي قطع المخزن قد عدد المنتج: لو العدد زاد بيرجّع آخر قطع خرجت (زي التراجع أو الرجوع من طلعة) أو يعمل جديدة،
-- ولو قل بيخرّج الأقدم (اللي مش في شحنة الأول)
create or replace function public._units_sync(p_item uuid)
returns void language plpgsql security definer set search_path = public as $$
declare q int; k text; n int; d int; got int; u record;
begin
  select qty, kind into q, k from public.items where id = p_item;
  if k is distinct from 'product' then return; end if;
  select count(*) into n from public.units where item_id = p_item and status = 'stock';
  if q > n then
    d := q - n;
    update public.units set status = 'stock', out_at = null, note = ''
     where id in (select id from public.units where item_id = p_item and status = 'out'
                   order by out_at desc nulls last, serial desc limit d);
    get diagnostics got = row_count;
    for i in 1..(d - got) loop perform public._unit_new(p_item, ''); end loop;
  elsif q < n then
    for u in select x.id, su.shipment_id from public.units x
               left join public.shipment_units su on su.unit_id = x.id
              where x.item_id = p_item and x.status = 'stock'
              order by (su.unit_id is not null), x.serial limit n - q loop
      update public.units set status = 'out', out_at = now() where id = u.id;
      if u.shipment_id is not null then
        delete from public.shipment_units where unit_id = u.id;
        perform public._ship_fix(u.shipment_id, p_item);
      end if;
    end loop;
  end if;
end $$;

create or replace function public._units_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'product' then perform public._units_sync(new.id); end if;
  return null;
end $$;
drop trigger if exists items_units_sync on public.items;
create trigger items_units_sync after insert or update of qty on public.items
  for each row execute function public._units_trg();

-- التحويل: المنتجات اللي كان عليها عدد على كود واحد بتتقسم لقطع بأكواد، والشحنات اللي لسه بتتجهز تاخد قطعها
do $$
declare r record;
begin
  for r in select id from public.items where kind = 'product' loop
    perform public._units_sync(r.id);
  end loop;
  for r in select si.shipment_id, si.item_id, si.qty from public.shipment_items si
             join public.shipments s on s.id = si.shipment_id join public.items i on i.id = si.item_id
            where s.status = 'draft' and i.kind = 'product'
              and si.qty > (select count(*) from public.shipment_units su where su.shipment_id = si.shipment_id and su.item_id = si.item_id) loop
    insert into public.shipment_units (unit_id, shipment_id, item_id)
    select x.id, r.shipment_id, r.item_id from public.units x
     where x.item_id = r.item_id and x.status = 'stock' and not exists (select 1 from public.shipment_units su where su.unit_id = x.id)
     order by x.serial
     limit r.qty - (select count(*) from public.shipment_units su where su.shipment_id = r.shipment_id and su.item_id = r.item_id);
    perform public._ship_fix(r.shipment_id, r.item_id);
  end loop;
end $$;

-- «صنّعنا»: كذا قطعة مرة واحدة، كل واحدة بكود
create or replace function public.make_units(p_token text, p_item uuid, p_count int, p_note text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); k text; res jsonb := '[]'::jsonb; n int := coalesce(p_count, 0);
begin
  select kind into k from public.items where id = p_item for update;
  if k is null then raise exception 'not_found'; end if;
  if k <> 'product' then raise exception 'bad_kind'; end if;
  if n < 1 or n > 200 then raise exception 'bad_qty'; end if;
  for i in 1..n loop res := res || to_jsonb(public._unit_new(p_item, a->>'name')); end loop;
  update public.items set qty = qty + n, updated_at = now() where id = p_item;
  perform public._log(p_item, 'make', n, n,
    concat_ws(' — ', (res->>0) || case when n > 1 then ' → ' || (res->>(n - 1)) else '' end, nullif(trim(coalesce(p_note, '')), '')), a);
  return res;
end $$;

-- خروج قطعة واحدة بكودها (اتباعت، اترمت...)
create or replace function public.unit_out(p_token text, p_unit uuid, p_note text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); u public.units%rowtype; sh uuid;
begin
  select * into u from public.units where id = p_unit for update;
  if not found then raise exception 'not_found'; end if;
  if u.status <> 'stock' then raise exception 'unit_not_stock'; end if;
  perform 1 from public.items where id = u.item_id for update;
  select shipment_id into sh from public.shipment_units where unit_id = p_unit;
  if sh is not null then
    delete from public.shipment_units where unit_id = p_unit;
    perform public._ship_fix(sh, u.item_id);
  end if;
  update public.units set status = 'out', out_at = now(), note = trim(coalesce(p_note, '')) where id = p_unit;
  update public.items set qty = qty - 1, updated_at = now() where id = u.item_id;
  perform public._log(u.item_id, 'out', -1, 1, concat_ws(' — ', u.code, nullif(trim(coalesce(p_note, '')), '')), a);
end $$;

-- سكان قطعة وهي بتتحط في صندوق الشحنة
create or replace function public.shipment_add_unit(p_token text, p_ship uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); u public.units%rowtype; sh uuid; v text := upper(trim(coalesce(p_code, '')));
begin
  if not exists (select 1 from public.shipments where id = p_ship and status = 'draft') then raise exception 'shipment_done'; end if;
  select * into u from public.units where code = v for update;
  if not found then
    if exists (select 1 from public.items where code = v and kind = 'product') then raise exception 'scan_unit'; end if;
    raise exception 'unit_unknown';
  end if;
  if u.status <> 'stock' then raise exception 'unit_not_stock'; end if;
  select shipment_id into sh from public.shipment_units where unit_id = u.id;
  if sh = p_ship then raise exception 'unit_added'; end if;
  if sh is not null then raise exception 'unit_other_ship'; end if;
  insert into public.shipment_units (unit_id, shipment_id, item_id) values (u.id, p_ship, u.item_id);
  perform public._ship_fix(p_ship, u.item_id);
  return jsonb_build_object('item_id', u.item_id, 'code', u.code);
end $$;

create or replace function public.shipment_remove_unit(p_token text, p_ship uuid, p_unit uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb := public._actor(p_token); iid uuid;
begin
  if not exists (select 1 from public.shipments where id = p_ship and status = 'draft') then raise exception 'shipment_done'; end if;
  delete from public.shipment_units where unit_id = p_unit and shipment_id = p_ship returning item_id into iid;
  if iid is null then raise exception 'not_found'; end if;
  perform public._ship_fix(p_ship, iid);
end $$;

-- ---------------------------------------------------------------------
-- 17) الصلاحيات
-- ---------------------------------------------------------------------
do $$
declare f record;
begin
  -- الدوال الداخلية (اللي اسمها بيبدأ بـ _) محدش يقدر يناديها من برا
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like '\_%' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;
do $$
declare f record;
begin
  -- دوال الابلكيشن (من غير _) مسموحة للابلكيشن صراحةً، مهما كانت إعدادات المشروع
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname not like '\_%' and p.prokind = 'f' loop
    execute format('grant execute on function %s to anon, authenticated', f.sig);
  end loop;
end $$;
grant usage on schema public to anon, authenticated;
grant execute on function public._ticket_ok(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 18) مكان الصور (Storage) — لو فشل لأي سبب، باقي النظام بيشتغل عادي من غير صور
-- ---------------------------------------------------------------------
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('photos', 'photos', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update set public = true;

  execute 'drop policy if exists photos_upload on storage.objects';
  execute $p$create policy photos_upload on storage.objects for insert to anon, authenticated
           with check (bucket_id = 'photos' and public._ticket_ok(name, 'up'))$p$;
  execute 'drop policy if exists photos_del_sel on storage.objects';
  execute $p$create policy photos_del_sel on storage.objects for select to anon, authenticated
           using (bucket_id = 'photos' and public._ticket_ok(name, 'del'))$p$;
  execute 'drop policy if exists photos_del on storage.objects';
  execute $p$create policy photos_del on storage.objects for delete to anon, authenticated
           using (bucket_id = 'photos' and public._ticket_ok(name, 'del'))$p$;
exception when others then
  raise notice 'photos setup skipped: %', sqlerrm;
end $$;

-- =====================================================================
--  بعد ما تعمل حساب الأدمن (Authentication ← Users ← Add user)
--  شغّل السطر ده مرة واحدة (غيّر الإيميل بإيميلك):
--
--    insert into public.admins (user_id)
--    select id from auth.users where email = 'YOUR-EMAIL@example.com'
--    on conflict do nothing;
-- =====================================================================
