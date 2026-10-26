-- =====================================================================
--  AF PARTS — قطع عمر صقر (مرسيدس E190)
--  شغّله مرة واحدة بعد schema.sql:
--  Supabase ← SQL Editor ← New query ← الصق الملف كله ← Run
--  لو اتشغّل تاني مش هيكرر حاجة.
-- =====================================================================
do $$
declare
  v_driver uuid;
  v_car uuid;
  v_id uuid;
  v_code text;
  a jsonb := jsonb_build_object('kind', 'admin', 'name', 'الإدارة');
  r record;
begin
  -- لو اتسجل قبل كده، منعملش حاجة
  select id into v_driver from public.drivers where name = 'عمر صقر' limit 1;
  if v_driver is not null then
    raise notice 'عمر صقر متسجل بالفعل — مفيش حاجة اتضافت';
    return;
  end if;

  -- نوعين جداد عشان التقسيم يبقى أوضح
  insert into public.categories (kind, name, sort) values
    ('part', 'تبريد', 9), ('part', 'دركسيون', 7)
  on conflict (kind, name) do nothing;

  insert into public.drivers (name) values ('عمر صقر') returning id into v_driver;
  insert into public.cars (driver_id, name) values (v_driver, 'مرسيدس E190') returning id into v_car;

  for r in
    select * from (values
      ( 1, 'تانك',                                            'تانية',           1, 'new'),
      ( 2, 'ردياتير + بوكس مراوح (2 مروحة)',                   'تبريد',           1, 'new'),
      ( 3, 'كرونة رشيو',                                      'فتيس ودفرنس',     1, 'new'),
      ( 4, 'صالة أمامي كاملة',                                 'دراعات وتعليق',   1, 'used'),
      ( 5, 'صالة خلفي كاملة',                                  'دراعات وتعليق',   1, 'used'),
      ( 6, 'كبالن',                                           'فتيس ودفرنس',     1, 'new'),
      ( 7, 'Angle Kit',                                       'دركسيون',         1, 'new'),
      ( 8, 'ردياتير + بوكس مراوح (2 مروحة) — القديم',          'تبريد',           1, 'used'),
      ( 9, '2 رفرف خلفي + أقصام + 2 باغة فوانيس',              'بودي',            1, 'used'),
      (10, 'جنوط',                                            'جنوط',            4, 'used'),
      (11, 'طارة',                                            'دركسيون',         1, 'used'),
      (12, 'عمود دركسيون',                                     'دركسيون',         1, 'used'),
      (13, 'عمود كردان',                                       'فتيس ودفرنس',     1, 'used'),
      (14, 'طقم دشم خلفي كامل',                                'دراعات وتعليق',   1, 'used'),
      (15, 'طقم بلي عجل خلفي',                                 'دراعات وتعليق',   1, 'new')
    ) as t(n, name, category, qty, cond)
    order by n
  loop
    v_code := public._take_code(null);
    insert into public.items (code, kind, name, category, driver_id, car_id, qty, condition)
    values (v_code, 'part', r.name, r.category, v_driver, v_car, r.qty, r.cond)
    returning id into v_id;
    perform public._log(v_id, 'create', r.qty, r.qty, 'دخلت مع العربية', a, null, v_car);
  end loop;

  raise notice 'تم: عمر صقر + مرسيدس E190 + 15 قطعة';
end $$;
