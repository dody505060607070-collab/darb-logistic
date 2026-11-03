INSERT INTO public.branches(name, city) VALUES ('فرع الرياض','الرياض'),('فرع جدة','جدة'),('فرع الدمام','الدمام');

INSERT INTO public.assets(code, kind, plate, make_model, year, vin, status, odometer_km, location_text, last_lat, last_lng, last_position_at, last_position_source, branch_id)
SELECT v.code, 'tractor', v.plate, v.mm, v.yr, v.vin, v.st, v.odo, v.loc, v.lat, v.lng, now() - (v.mins || ' minutes')::interval, 'manual', (SELECT id FROM public.branches WHERE city = v.br)
FROM (VALUES
 ('TRK-014','ك س أ 4187','مرسيدس أكتروس 1845',2022,'WDB9634031L23456','active',284500,'على الطريق الرياض – جدة',23.1,43.2,5,'الرياض'),
 ('TRK-015','ك س أ 4191','فولفو FH 460',2023,'YV2RT40A5PB123456','active',121300,'على الطريق الدمام – الرياض',25.6,48.1,8,'الدمام'),
 ('TRK-007','ك س أ 4102','مان TGX 18.480',2021,'WMA06XZZ1MP012345','active',356200,'القصيم',26.33,43.97,20,'الرياض'),
 ('TRK-008','ك س أ 4162','مرسيدس أكتروس 1845',2021,'WDB9634031L22981','maintenance',402100,'ورشة الصيانة – الرياض',24.68,46.72,180,'الرياض'),
 ('TRK-009','ك س أ 4165','فولفو FH 460',2022,'YV2RT40A5NB998877','available',188400,'مركز الرياض',24.71,46.67,60,'الرياض'),
 ('TRK-010','ك س أ 4170','سكانيا R450',2020,'YS2R4X20005123456','available',451000,'مركز جدة',21.54,39.17,90,'جدة'),
 ('TRK-011','ك س أ 4175','مان TGX 18.480',2022,'WMA06XZZ1NP054321','available',97600,'مركز الدمام',26.42,50.09,45,'الدمام'),
 ('TRK-012','ك س أ 4180','سكانيا R450',2019,'YS2R4X20005654321','stopped',512300,'مركز جدة',21.5,39.2,600,'جدة')
) AS v(code, plate, mm, yr, vin, st, odo, loc, lat, lng, mins, br);

INSERT INTO public.assets(code, kind, plate, trailer_type, capacity_tons, year, status, location_text, branch_id)
SELECT v.code, 'trailer', v.plate, v.tt, v.cap, v.yr, v.st, v.loc, (SELECT id FROM public.branches WHERE city = v.br)
FROM (VALUES
 ('TRL-019','ق ر ب 2219','صندوق مغلق',33,2021,'active','على الطريق','الرياض'),
 ('TRL-021','ق ر ب 2221','ستارة جانبية',32,2022,'active','على الطريق','الدمام'),
 ('TRL-017','ق ر ب 2217','مسطحة',36,2020,'active','القصيم','الرياض'),
 ('TRL-007','ق ر ب 2207','حاويات (فلات بد)',40,2019,'available','الرياض','الرياض'),
 ('TRL-010','ق ر ب 2210','صهريج وقود',36,2021,'maintenance','ورشة الصيانة','الرياض'),
 ('TRL-004','ق ر ب 2204','براد (مبرد)',28,2023,'available','جدة','جدة'),
 ('TRL-013','ق ر ب 2213','صندوق مغلق',33,2022,'available','الدمام','الدمام')
) AS v(code, plate, tt, cap, yr, st, loc, br);

INSERT INTO public.drivers(code, full_name, phone, national_id, nationality, license_no, license_expiry, status, branch_id)
SELECT v.code, v.name, v.phone, v.nid, v.nat, v.lic, (current_date + (v.days || ' days')::interval)::date, v.st, (SELECT id FROM public.branches WHERE city = v.br)
FROM (VALUES
 ('DRV-0045','سعد القحطاني','0551234567','1023456789','سعودي','LIC-778812',420,'on_trip','الرياض'),
 ('DRV-0046','ناصر العتيبي','0559876543','1034567891','سعودي','LIC-778813',300,'on_trip','الدمام'),
 ('DRV-0047','خالد العتيبي','0553214567','1045678912','سعودي','LIC-778814',190,'on_trip','الرياض'),
 ('DRV-0048','محمد الشهري','0557418529','1056789123','سعودي','LIC-778815',18,'available','جدة'),
 ('DRV-0049','عبدالله الدوسري','0552583691','1067891234','سعودي','LIC-778816',540,'available','الرياض'),
 ('DRV-0050','فهد المطيري','0559632587','1078912345','سعودي','LIC-778817',-5,'off','الدمام')
) AS v(code, name, phone, nid, nat, lic, days, st, br);

INSERT INTO public.documents(entity_type, entity_id, doc_type, number, issue_date, expiry_date, review_status)
SELECT 'asset', a.id, d.t, d.n || a.code, current_date - 300, current_date + d.days, 'approved'
FROM public.assets a CROSS JOIN (VALUES ('استمارة','IST-',200),('تأمين','INS-',90),('فحص دوري','MVPI-',25)) AS d(t,n,days)
WHERE a.kind = 'tractor';
UPDATE public.documents SET expiry_date = current_date - 3 WHERE doc_type = 'فحص دوري' AND number = 'MVPI-TRK-012';
INSERT INTO public.documents(entity_type, entity_id, doc_type, number, issue_date, expiry_date, review_status)
SELECT 'driver', d.id, 'بطاقة سائق', 'DC-' || d.code, current_date - 200, d.license_expiry, 'approved' FROM public.drivers d;

INSERT INTO public.authorizations(number, driver_id, asset_id, scope, valid_from, valid_to, review_status)
SELECT 'AUTH-' || d.code, d.id, a.id, 'قيادة داخل المملكة', current_date - 30, current_date + 150, 'approved'
FROM public.drivers d JOIN public.assets a ON a.code = CASE d.code WHEN 'DRV-0045' THEN 'TRK-014' WHEN 'DRV-0046' THEN 'TRK-015' WHEN 'DRV-0047' THEN 'TRK-007' END;

INSERT INTO public.custody(asset_id, driver_id, opened_at, odometer_out, fuel_level_out, accessories, acknowledged)
SELECT a.id, d.id, now() - interval '3 days', a.odometer_km - 900, 'ممتلئ', 'طفاية، مثلث تحذير، عدة إطارات', true
FROM public.drivers d JOIN public.assets a ON a.code = CASE d.code WHEN 'DRV-0045' THEN 'TRK-014' WHEN 'DRV-0046' THEN 'TRK-015' WHEN 'DRV-0047' THEN 'TRK-007' END;

INSERT INTO public.customers(name, cr_number, vat_number, contact_name, phone, email, city, payment_terms_days) VALUES
 ('شركة الخدمات اللوجستية السعودية','1010123456','300123456700003','أحمد الزهراني','0112345678','ops@sls.sa','الرياض',30),
 ('مصانع الخليج للأغذية','2050234567','300234567800003','سارة الحربي','0138765432','logistics@gulffoods.sa','الدمام',45),
 ('مجموعة البحر الأحمر التجارية','4030345678','300345678900003','ياسر الغامدي','0126543210','supply@redsea.sa','جدة',30),
 ('شركة نجد للمواد الإنشائية','1131456789','300456789000003','تركي السبيعي','0163456789','orders@najd-mat.sa','بريدة',60);

INSERT INTO public.locations(customer_id, name, city, lat, lng, contact, working_hours, instructions)
SELECT c.id, v.n, v.city, v.lat, v.lng, v.ct, '07:00 – 19:00', v.ins FROM (VALUES
 ('شركة الخدمات اللوجستية السعودية','مستودع السلي – الرياض','الرياض',24.6,46.85,'0501112233','الدخول من البوابة 3'),
 ('شركة الخدمات اللوجستية السعودية','مستودع الخمرة – جدة','جدة',21.33,39.23,'0502223344','التفريغ بالرصيف 7 فقط'),
 ('مصانع الخليج للأغذية','مصنع المدينة الصناعية الثانية – الدمام','الدمام',26.32,50.05,'0503334455','يلزم تبريد 4 درجات'),
 ('مصانع الخليج للأغذية','مركز توزيع الرياض','الرياض',24.75,46.76,'0504445566',NULL),
 ('مجموعة البحر الأحمر التجارية','ميناء جدة الإسلامي','جدة',21.47,39.17,'0505556677','تصريح الميناء مطلوب'),
 ('مجموعة البحر الأحمر التجارية','مستودع المدينة المنورة','المدينة المنورة',24.52,39.6,'0506667788',NULL),
 ('شركة نجد للمواد الإنشائية','مصنع بريدة','بريدة',26.36,43.95,'0507778899',NULL),
 ('شركة نجد للمواد الإنشائية','موقع مشروع مكة','مكة المكرمة',21.42,39.83,'0508889900','ساعات الدخول 22:00–05:00')
) AS v(cust, n, city, lat, lng, ct, ins) JOIN public.customers c ON c.name = v.cust;

INSERT INTO public.contracts(customer_id, number, pricing_model, rate, free_wait_hours, wait_fee_per_hour, start_date, end_date, terms)
SELECT id, 'CTR-2026-' || lpad((row_number() over ())::text,3,'0'), CASE WHEN city='بريدة' THEN 'per_ton' ELSE 'per_trip' END,
 CASE WHEN city='بريدة' THEN 95 ELSE 3800 END, 2, 150, current_date - 120, current_date + 245, 'سداد خلال مدة الائتمان، انتظار مجاني ساعتان'
FROM public.customers;

INSERT INTO public.carriers(name, cr_number, contact_name, phone) VALUES ('مؤسسة الطريق السريع للنقل','1010998877','بندر القرني','0551112299'),('شركة الشحن المتحد','2050887766','وليد الخالدي','0553334488');

-- orders
INSERT INTO public.transport_orders(customer_id, contract_id, shipper, consignee, cargo_type, quantity, unit, weight_kg, pickup_location_id, delivery_location_id, pickup_at, delivery_due_at, price, status)
SELECT c.id, (SELECT id FROM public.contracts k WHERE k.customer_id = c.id LIMIT 1), c.name, v.cons, v.cargo, v.qty, v.unit, v.w,
  (SELECT id FROM public.locations WHERE name = v.p), (SELECT id FROM public.locations WHERE name = v.d),
  now() + (v.ps || ' hours')::interval, now() + (v.pe || ' hours')::interval, v.price, v.st
FROM (VALUES
 ('شركة الخدمات اللوجستية السعودية','فرع جدة للعميل','بضائع عامة',48,'طرد',22500,'مستودع السلي – الرياض','مستودع الخمرة – جدة',-8,6,3800,'in_progress'),
 ('مصانع الخليج للأغذية','مركز توزيع الرياض','مواد غذائية مبردة',30,'منصة',18000,'مصنع المدينة الصناعية الثانية – الدمام','مركز توزيع الرياض',-5,2,2900,'in_progress'),
 ('شركة نجد للمواد الإنشائية','موقع مشروع مكة','حديد تسليح',24,'طن',24000,'مصنع بريدة','موقع مشروع مكة',-30,-6,2280,'completed'),
 ('مجموعة البحر الأحمر التجارية','مستودع المدينة المنورة','حاويات',2,'حاوية',30000,'ميناء جدة الإسلامي','مستودع المدينة المنورة',20,30,3200,'confirmed'),
 ('شركة الخدمات اللوجستية السعودية','مستودع السلي','مستلزمات طبية',60,'كرتون',9000,'مستودع الخمرة – جدة','مستودع السلي – الرياض',40,56,3800,'draft')
) AS v(cust, cons, cargo, qty, unit, w, p, d, ps, pe, price, st) JOIN public.customers c ON c.name = v.cust;

-- trips
INSERT INTO public.trips(order_id, origin_city, dest_city, tractor_id, trailer_id, driver_id, planned_start, planned_end, actual_start, actual_end, distance_km, status, stage, cargo_weight_tons)
SELECT o.id, v.oc, v.dc, (SELECT id FROM public.assets WHERE code = v.tk), (SELECT id FROM public.assets WHERE code = v.tl), (SELECT id FROM public.drivers WHERE code = v.dr),
  now() + (v.ps || ' hours')::interval, now() + (v.pe || ' hours')::interval,
  CASE WHEN v.st IN ('in_progress','delivered','closed') THEN now() + (v.ps || ' hours')::interval END,
  CASE WHEN v.st IN ('delivered','closed') THEN now() + (v.pe || ' hours')::interval END,
  v.km, v.st, v.stage, o.weight_kg / 1000
FROM (VALUES
 ('مستودع السلي – الرياض','الرياض','جدة','TRK-014','TRL-019','DRV-0045',-8,6,950,'in_progress','departed'),
 ('مصنع المدينة الصناعية الثانية – الدمام','الدمام','الرياض','TRK-015','TRL-021','DRV-0046',-5,2,410,'in_progress','departed'),
 ('مصنع بريدة','بريدة','مكة المكرمة','TRK-007','TRL-017','DRV-0047',-30,-6,1030,'delivered','delivered'),
 ('ميناء جدة الإسلامي','جدة','المدينة المنورة','TRK-010','TRL-004','DRV-0048',20,30,420,'planned','pending')
) AS v(p, oc, dc, tk, tl, dr, ps, pe, km, st, stage)
JOIN public.transport_orders o ON o.pickup_location_id = (SELECT id FROM public.locations WHERE name = v.p);

INSERT INTO public.trip_financials(trip_id, revenue, est_cost)
SELECT t.id, o.price, round(o.price * 0.42) FROM public.trips t JOIN public.transport_orders o ON o.id = t.order_id;

INSERT INTO public.resource_bookings(trip_id, resource_type, resource_id, period)
SELECT t.id, r.rt, r.rid, tstzrange(t.planned_start, t.planned_end, '[)') FROM public.trips t
CROSS JOIN LATERAL (VALUES ('driver', t.driver_id), ('tractor', t.tractor_id), ('trailer', t.trailer_id)) AS r(rt, rid)
WHERE t.status IN ('planned','in_progress');

INSERT INTO public.trip_events(trip_id, event_type, occurred_at, location_text)
SELECT t.id, e.ty, t.planned_start + (e.h || ' minutes')::interval, e.loc FROM public.trips t
CROSS JOIN LATERAL (VALUES ('arrived_pickup',-90, t.origin_city),('loading_start',-80,t.origin_city),('loading_end',-20,t.origin_city),('departed',0,t.origin_city)) AS e(ty,h,loc)
WHERE t.status IN ('in_progress','delivered');
INSERT INTO public.trip_events(trip_id, event_type, occurred_at, location_text)
SELECT t.id, e.ty, t.planned_end + (e.h || ' minutes')::interval, t.dest_city FROM public.trips t
CROSS JOIN LATERAL (VALUES ('arrived_delivery',-60),('unloading_start',-50),('unloading_end',-10),('delivered',0)) AS e(ty,h)
WHERE t.status = 'delivered';

INSERT INTO public.pods(trip_id, receiver_name, received_at, captured_at, qty_delivered, notes, location_source, status)
SELECT id, 'م. عادل الحربي', planned_end, planned_end, 24, 'استلام كامل دون ملاحظات', 'driver_app', 'accepted' FROM public.trips WHERE status = 'delivered';

INSERT INTO public.inspections(asset_id, driver_id, trip_id, kind, items)
SELECT t.tractor_id, t.driver_id, t.id, 'pre_trip', '[{"key":"tires","label":"الإطارات","result":"ok"},{"key":"brakes","label":"الفرامل","result":"ok"},{"key":"lights","label":"الأنوار","result":"ok"}]'::jsonb
FROM public.trips t WHERE t.status IN ('in_progress','delivered');

INSERT INTO public.fuel_entries(asset_id, driver_id, trip_id, filled_at, station, liters, unit_price, amount, odometer, status)
SELECT t.tractor_id, t.driver_id, t.id, t.planned_start + interval '3 hours', 'محطة الدريس – ' || t.origin_city, 320, 1.66, 531.2, 284000, 'approved' FROM public.trips t WHERE t.status IN ('in_progress','delivered');

INSERT INTO public.advances(driver_id, trip_id, amount, issued_at)
SELECT t.driver_id, t.id, 800, t.planned_start - interval '2 hours' FROM public.trips t WHERE t.status = 'in_progress';

INSERT INTO public.expenses(trip_id, driver_id, category, amount, description, spent_at, status)
SELECT t.id, t.driver_id, e.c, e.a, e.d, t.planned_start + interval '4 hours', e.s FROM public.trips t
CROSS JOIN (VALUES ('وجبات',85,'وجبة غداء','approved'),('رسوم ميزان',40,'ميزان الشاحنات','pending')) AS e(c,a,d,s)
WHERE t.status = 'in_progress';

INSERT INTO public.work_orders(asset_id, kind, description, status, workshop, technician, opened_at, labor_cost)
SELECT id, 'preventive', 'صيانة دورية 400,000 كم – زيت وفلاتر', 'in_progress', 'ورشة الرياض المركزية', 'م. إبراهيم', now() - interval '1 day', 450 FROM public.assets WHERE code = 'TRK-008';
INSERT INTO public.work_orders(asset_id, kind, description, status, workshop, opened_at)
SELECT id, 'corrective', 'تسريب في نظام التبريد', 'waiting_parts', 'ورشة الرياض المركزية', now() - interval '2 days' FROM public.assets WHERE code = 'TRL-010';

INSERT INTO public.maintenance_plans(asset_id, title, interval_km, interval_days, last_done_at, last_done_km)
SELECT id, 'تغيير زيت وفلاتر', 40000, 90, current_date - 70, odometer_km - 36000 FROM public.assets WHERE kind = 'tractor';

INSERT INTO public.parts(sku, name, unit, qty_on_hand, unit_cost, reorder_level) VALUES
 ('OIL-15W40','زيت محرك 15W40','لتر',220,18,100),('FLT-OIL','فلتر زيت','قطعة',14,65,10),('FLT-AIR','فلتر هواء','قطعة',6,140,8),('BRK-PAD','فحمات فرامل','طقم',9,380,4);

INSERT INTO public.tires(serial, size, brand, cost, status) VALUES
 ('TYR-88120','315/80R22.5','ميشلان',1450,'in_stock'),('TYR-88121','315/80R22.5','ميشلان',1450,'in_stock'),('TYR-77210','385/65R22.5','بريدجستون',1600,'in_stock');

INSERT INTO public.incidents(trip_id, asset_id, driver_id, occurred_at, kind, severity, location_text, description, status, est_cost)
SELECT t.id, t.tractor_id, t.driver_id, now() - interval '6 days', 'damage', 'low', 'طريق الدمام', 'خدش في الباب الجانبي أثناء التحميل', 'investigating', 600
FROM public.trips t WHERE t.status = 'delivered';

INSERT INTO public.notifications(severity, category, title, body, dedupe_key) VALUES
 ('warning','maintenance','TRK-008 في الصيانة الدورية','أمر عمل مفتوح بورشة الرياض','seed-n1'),
 ('critical','documents','فحص دوري منتهٍ للرأس TRK-012','المركبة لا تُخصص حتى التجديد','seed-n2'),
 ('warning','documents','رخصة السائق فهد المطيري منتهية','يلزم التجديد قبل أي تكليف','seed-n3');
