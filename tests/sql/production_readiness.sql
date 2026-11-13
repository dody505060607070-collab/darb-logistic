-- Production-readiness acceptance checks. Runs as one DO block and always ends with
-- RAISE EXCEPTION so every fixture is rolled back; read the result from the error text.
-- Uses the labelled test accounts (driver, accountant, workshop) and the first owner.
DO $$
DECLARE
  owner_uid uuid := (SELECT user_id FROM public.user_roles WHERE role='owner' LIMIT 1);
  drv_uid uuid := (SELECT d.user_id FROM public.drivers d JOIN public.profiles p ON p.id=d.user_id WHERE p.full_name LIKE '%(اختبار)%' LIMIT 1);
  acc_uid uuid := (SELECT r.user_id FROM public.user_roles r JOIN public.profiles p ON p.id=r.user_id WHERE r.role='accountant' AND p.full_name LIKE '%(اختبار)%' LIMIT 1);
  ws_uid uuid := (SELECT r.user_id FROM public.user_roles r JOIN public.profiles p ON p.id=r.user_id WHERE r.role='workshop' AND p.full_name LIKE '%(اختبار)%' LIMIT 1);
  tractor uuid := (SELECT id FROM public.assets WHERE kind='tractor' LIMIT 1);
  t_other uuid; t_own uuid; ev1 uuid; ev2 uuid; n int; res text := ''; ok boolean; exp_id uuid;
BEGIN
  -- fixtures as owner
  PERFORM set_config('request.jwt.claims', json_build_object('sub', owner_uid, 'role','authenticated')::text, true);
  INSERT INTO public.trips(number, origin_city, dest_city, status) VALUES ('PRT-OTHER','الرياض','جدة','planned') RETURNING id INTO t_other;
  INSERT INTO public.trips(number, origin_city, dest_city, status, driver_id, tractor_id) VALUES ('PRT-OWN','الرياض','الدمام','planned',(SELECT id FROM public.drivers WHERE user_id=drv_uid), tractor) RETURNING id INTO t_own;
  INSERT INTO public.gps_readings(asset_id, reading_id, event_time, lat, lng, source) VALUES (tractor, 'prt-'||gen_random_uuid(), now(), 24.7, 46.7, 'manual');

  -- 1 trip created directly as delivered is refused
  BEGIN INSERT INTO public.trips(number, origin_city, dest_city, status) VALUES ('PRT-BAD','الرياض','جدة','delivered'); res := res||'1:FAIL '; EXCEPTION WHEN others THEN res := res||'1:ok '; END;
  -- 2 invalid transition planned -> closed and planned -> delivered refused
  BEGIN UPDATE public.trips SET status='closed' WHERE id=t_other; res := res||'2a:FAIL '; EXCEPTION WHEN others THEN res := res||'2a:ok '; END;
  BEGIN UPDATE public.trips SET status='delivered' WHERE id=t_other; res := res||'2b:FAIL '; EXCEPTION WHEN others THEN res := res||'2b:ok '; END;
  -- 3 cancel without reason refused
  BEGIN UPDATE public.trips SET status='cancelled' WHERE id=t_other; res := res||'3:FAIL '; EXCEPTION WHEN others THEN res := res||'3:ok '; END;
  -- 4 idempotent event replay returns same id; reuse on another trip refused
  ev1 := public.record_trip_event(t_own, 'note', NULL, NULL, NULL, 'x', 'prt-evt-1', NULL);
  ev2 := public.record_trip_event(t_own, 'note', NULL, NULL, NULL, 'x', 'prt-evt-1', NULL);
  res := res||CASE WHEN ev1=ev2 THEN '4a:ok ' ELSE '4a:FAIL ' END;
  BEGIN PERFORM public.record_trip_event(t_other, 'note', NULL, NULL, NULL, 'x', 'prt-evt-1', NULL); res := res||'4b:FAIL '; EXCEPTION WHEN others THEN res := res||'4b:ok '; END;
  -- 5 delivered event without POD refused
  BEGIN PERFORM public.record_trip_event(t_own, 'delivered', NULL, NULL, NULL, NULL, NULL, NULL); res := res||'5:FAIL '; EXCEPTION WHEN others THEN res := res||'5:ok '; END;
  -- 6 conflicting resource bookings refused (exclusion constraint)
  INSERT INTO public.resource_bookings(trip_id, resource_type, resource_id, period) VALUES (t_own,'tractor',tractor,tstzrange(now()+interval '10 days', now()+interval '11 days'));
  BEGIN INSERT INTO public.resource_bookings(trip_id, resource_type, resource_id, period) VALUES (t_other,'tractor',tractor,tstzrange(now()+interval '10 days 12 hours', now()+interval '12 days')); res := res||'6:FAIL '; EXCEPTION WHEN others THEN res := res||'6:ok '; END;

  -- as driver
  PERFORM set_config('request.jwt.claims', json_build_object('sub', drv_uid, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.trips WHERE id=t_other; res := res||CASE WHEN n=0 THEN '7:ok ' ELSE '7:FAIL ' END;
  BEGIN PERFORM public.record_trip_event(t_other, 'note', NULL, NULL, NULL, NULL, NULL, NULL); res := res||'8:FAIL '; EXCEPTION WHEN others THEN res := res||'8:ok '; END;
  BEGIN INSERT INTO public.user_roles(user_id, role) VALUES (drv_uid, 'owner'); res := res||'9:FAIL '; EXCEPTION WHEN others THEN res := res||'9:ok '; END;
  BEGIN INSERT INTO public.pods(trip_id, receiver_name, signature, photo_paths, status) VALUES (t_own,'x',repeat('s',30),'{a}','accepted'); res := res||'10:FAIL '; EXCEPTION WHEN others THEN res := res||'10:ok '; END;
  INSERT INTO public.expenses(driver_id, category, amount, status, client_event_id) VALUES ((SELECT public.current_driver_id()), 'other', 50, 'pending', 'prt-exp-1') RETURNING id INTO exp_id;
  BEGIN UPDATE public.trips SET status='in_progress' WHERE id=t_own; GET DIAGNOSTICS n = ROW_COUNT; res := res||CASE WHEN n=0 THEN '11:ok ' ELSE '11:FAIL ' END; EXCEPTION WHEN others THEN res := res||'11:ok '; END;
  SELECT count(*) INTO n FROM public.gps_readings; res := res||CASE WHEN n=0 THEN '12:ok ' ELSE '12:FAIL ' END;
  RESET ROLE;

  -- as accountant: no location history; approved expense immutable
  PERFORM set_config('request.jwt.claims', json_build_object('sub', acc_uid, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.gps_readings; res := res||CASE WHEN n=0 THEN '13:ok ' ELSE '13:FAIL ' END;
  PERFORM public.review_expense(exp_id, true, NULL);
  BEGIN UPDATE public.expenses SET amount=5000 WHERE id=exp_id; res := res||'14:FAIL '; EXCEPTION WHEN others THEN res := res||'14:ok '; END;
  BEGIN INSERT INTO public.expenses(category, amount, status) VALUES ('other', -5, 'pending'); res := res||'15:FAIL '; EXCEPTION WHEN others THEN res := res||'15:ok '; END;
  RESET ROLE;

  -- as workshop: no customers, trips or finance
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ws_uid, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT (SELECT count(*) FROM public.customers)+(SELECT count(*) FROM public.trips)+(SELECT count(*) FROM public.trip_financials)+(SELECT count(*) FROM public.invoices) INTO n;
  res := res||CASE WHEN n=0 THEN '16:ok ' ELSE '16:FAIL ' END;
  RESET ROLE;

  -- anon cannot call business RPCs
  SET LOCAL ROLE anon;
  BEGIN PERFORM public.record_trip_event(t_own, 'note', NULL, NULL, NULL, NULL, NULL, NULL); res := res||'17:FAIL '; EXCEPTION WHEN others THEN res := res||'17:ok '; END;
  RESET ROLE;

  RAISE EXCEPTION 'RESULT %', res;
END $$;
