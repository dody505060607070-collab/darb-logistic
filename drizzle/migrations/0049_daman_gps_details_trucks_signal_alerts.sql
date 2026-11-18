ALTER TABLE public.gps_provider_vehicles
  ADD COLUMN IF NOT EXISTS vehicle_type text,
  ADD COLUMN IF NOT EXISTS icon text,
  ADD COLUMN IF NOT EXISTS driver_name text,
  ADD COLUMN IF NOT EXISTS driver_phone text,
  ADD COLUMN IF NOT EXISTS odometer_km numeric,
  ADD COLUMN IF NOT EXISTS battery_pct integer,
  ADD COLUMN IF NOT EXISTS gsm_state text,
  ADD COLUMN IF NOT EXISTS satellites integer,
  ADD COLUMN IF NOT EXISTS wasl_linked boolean,
  ADD COLUMN IF NOT EXISTS subscription_expires date,
  ADD COLUMN IF NOT EXISTS load_kg numeric,
  ADD COLUMN IF NOT EXISTS engine_on_today text,
  ADD COLUMN IF NOT EXISTS details_synced_at timestamptz;

ALTER TABLE public.trip_alerts DROP CONSTRAINT IF EXISTS trip_alerts_kind_check;
ALTER TABLE public.trip_alerts ADD CONSTRAINT trip_alerts_kind_check CHECK (kind IN ('off_route','stopped','gps_lost'));

-- Stores per-device details fetched by the sync job; raises (never lowers) the linked vehicle's odometer.
CREATE OR REPLACE FUNCTION public.gps_store_details(p_provider text, p_rows jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb; n integer := 0; v_asset uuid; v_km numeric;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) LOOP
    UPDATE gps_provider_vehicles SET
      vehicle_type = nullif(r->>'vehicle_type',''), icon = nullif(r->>'icon',''),
      driver_name = nullif(trim(r->>'driver_name'),''), driver_phone = nullif(trim(r->>'driver_phone'),''),
      odometer_km = (r->>'odometer_km')::numeric, battery_pct = (r->>'battery_pct')::integer,
      gsm_state = nullif(r->>'gsm_state',''), satellites = (r->>'satellites')::integer,
      wasl_linked = (r->>'wasl_linked')::boolean, subscription_expires = (r->>'subscription_expires')::date,
      load_kg = (r->>'load_kg')::numeric, engine_on_today = nullif(r->>'engine_on_today',''),
      details_synced_at = now()
    WHERE provider = p_provider AND provider_vehicle_id = r->>'provider_vehicle_id'
    RETURNING asset_id, odometer_km INTO v_asset, v_km;
    IF FOUND THEN
      n := n + 1;
      IF v_asset IS NOT NULL AND v_km IS NOT NULL AND v_km > 0 AND v_km < 5000000 THEN
        UPDATE assets SET odometer_km = round(v_km) WHERE id = v_asset AND coalesce(odometer_km, 0) < round(v_km);
      END IF;
    END IF;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.gps_store_details(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gps_store_details(text, jsonb) TO service_role;

-- Devices the provider reports as trucks join the fleet automatically (plate matches were linked earlier by the sync).
CREATE OR REPLACE FUNCTION public.gps_auto_add_trucks(p_provider text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record; v_code text; v_asset uuid; n integer := 0;
BEGIN
  FOR v IN SELECT * FROM gps_provider_vehicles
    WHERE provider = p_provider AND asset_id IS NULL AND (icon ILIKE 'truck%' OR vehicle_type ILIKE '%truck%')
    FOR UPDATE SKIP LOCKED LOOP
    v_code := coalesce(nullif(regexp_replace(coalesce(v.plate, ''), '\s*-\s*', ' ', 'g'), ''), 'GPS-' || v.provider_vehicle_id);
    IF EXISTS (SELECT 1 FROM assets WHERE code = v_code) THEN v_code := v_code || ' (' || v.provider_vehicle_id || ')'; END IF;
    INSERT INTO assets(code, kind, plate, make_model, status, odometer_km, notes)
    VALUES (v_code, CASE WHEN v.vehicle_type ILIKE 'big%' THEN 'tractor' ELSE 'rigid' END, v.plate,
      nullif(trim(coalesce(v.car_name, '')), ''), 'available',
      CASE WHEN v.odometer_km > 0 AND v.odometer_km < 5000000 THEN round(v.odometer_km) ELSE 0 END,
      'أُضيفت تلقائيًا من جهاز تتبع ضمان المهندس')
    RETURNING id INTO v_asset;
    UPDATE gps_provider_vehicles SET asset_id = v_asset WHERE id = v.id;
    PERFORM public.gps_provider_push_reading(v.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.gps_auto_add_trucks(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gps_auto_add_trucks(text) TO service_role;

CREATE OR REPLACE FUNCTION public.open_trip_alert(p_trip_id uuid, p_kind text, p_lat double precision, p_lng double precision, p_distance_m numeric, p_minutes numeric) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE nid uuid; t record; ph text; msg text;
BEGIN
  INSERT INTO trip_alerts(trip_id, kind, lat, lng, distance_m, minutes) VALUES (p_trip_id, p_kind, p_lat, p_lng, p_distance_m, p_minutes)
  ON CONFLICT (trip_id, kind) WHERE cleared_at IS NULL DO NOTHING RETURNING id INTO nid;
  IF nid IS NULL THEN
    UPDATE trip_alerts SET last_seen_at = now(), lat = p_lat, lng = p_lng, distance_m = p_distance_m, minutes = p_minutes WHERE trip_id = p_trip_id AND kind = p_kind AND cleared_at IS NULL;
    RETURN false;
  END IF;
  SELECT tr.number, tr.driver_id, dr.full_name, tk.code INTO t FROM trips tr LEFT JOIN drivers dr ON dr.id = tr.driver_id LEFT JOIN assets tk ON tk.id = tr.tractor_id WHERE tr.id = p_trip_id;
  ph := public.driver_wa_phone(t.driver_id);
  msg := CASE p_kind
    WHEN 'stopped' THEN format(E'⛔ المركبة %s متوقفة منذ %s دقيقة لسبب غير معروف حتى الآن\nالرحلة: %s\nالسائق: %s%s', coalesce(t.code,'—'), round(coalesce(p_minutes,0)), t.number, coalesce(t.full_name,'—'), public.wa_phone_line('جوال السائق', ph))
    WHEN 'gps_lost' THEN format(E'📡 انقطعت إشارة جهاز التتبع في المركبة %s أثناء الرحلة\nالرحلة: %s\nالسائق: %s%s', coalesce(t.code,'—'), t.number, coalesce(t.full_name,'—'), public.wa_phone_line('جوال السائق', ph))
    ELSE format(E'⚠️ المركبة %s خرجت عن المسار المخطط بمسافة %s كم\nالرحلة: %s\nالسائق: %s%s', coalesce(t.code,'—'), round(coalesce(p_distance_m,0) / 1000.0, 1), t.number, coalesce(t.full_name,'—'), public.wa_phone_line('جوال السائق', ph)) END
    || CASE WHEN p_lat IS NOT NULL THEN CASE WHEN p_kind = 'gps_lost' THEN E'\nآخر موقع معروف: ' ELSE E'\nآخر موقع: ' END || 'https://maps.google.com/?q=' || round(p_lat::numeric, 5) || ',' || round(p_lng::numeric, 5) ELSE '' END;
  PERFORM wa_department(msg, CASE p_kind WHEN 'off_route' THEN 'off_route' ELSE 'vehicle_stopped' END, p_trip_id);
  PERFORM wa_enqueue(ph, CASE p_kind
    WHEN 'stopped' THEN format(E'لاحظنا توقف المركبة في الرحلة %s. إن كان هناك سبب اكتبه في صفحة السائق ليصل للإدارة.', t.number)
    WHEN 'gps_lost' THEN format(E'انقطعت إشارة جهاز التتبع في مركبتك أثناء الرحلة %s. تأكد أن الجهاز يعمل، أو اكتب السبب في صفحة السائق.', t.number)
    ELSE format(E'لاحظنا خروجك عن المسار المخطط للرحلة %s. افتح الخريطة في صفحة السائق للعودة للمسار أو اكتب السبب.', t.number) END, p_kind, p_trip_id);
  INSERT INTO notifications(severity, category, title, body, entity_type, entity_id, dedupe_key, status)
  VALUES ('warning', 'tracking', CASE p_kind WHEN 'stopped' THEN 'توقف مركبة ' WHEN 'gps_lost' THEN 'انقطاع إشارة التتبع ' ELSE 'خروج عن المسار ' END || coalesce(t.code,''), t.number || ' — ' || coalesce(t.full_name,''), 'trip', p_trip_id, 'trip_alert:' || nid, 'open')
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION public.open_trip_alert(uuid, text, double precision, double precision, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.open_trip_alert(uuid, text, double precision, double precision, numeric, numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.driver_explain_alert(p_alert_id uuid, p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; t record;
BEGIN
  IF nullif(trim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'اكتب السبب'; END IF;
  SELECT * INTO a FROM trip_alerts WHERE id = p_alert_id AND cleared_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'التنبيه غير موجود أو انتهى'; END IF;
  SELECT tr.number, tr.driver_id, dr.full_name INTO t FROM trips tr LEFT JOIN drivers dr ON dr.id = tr.driver_id WHERE tr.id = a.trip_id;
  IF t.driver_id IS NULL OR t.driver_id IS DISTINCT FROM public.current_driver_id() THEN RAISE EXCEPTION 'هذه الرحلة ليست لك'; END IF;
  UPDATE trip_alerts SET reason = left(trim(p_reason), 300), reason_at = now() WHERE id = a.id;
  PERFORM wa_department(format(E'ℹ️ الرحلة %s — سبب %s: %s\nالسائق: %s%s', t.number,
    CASE a.kind WHEN 'stopped' THEN 'التوقف' WHEN 'gps_lost' THEN 'انقطاع جهاز التتبع' ELSE 'الخروج عن المسار' END, left(trim(p_reason), 300), coalesce(t.full_name,'—'),
    public.wa_phone_line('جوال السائق', public.driver_wa_phone(t.driver_id))), CASE a.kind WHEN 'off_route' THEN 'off_route' ELSE 'vehicle_stopped' END, a.trip_id);
END $$;
REVOKE EXECUTE ON FUNCTION public.driver_explain_alert(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_explain_alert(uuid, text) TO authenticated;