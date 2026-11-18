CREATE TABLE public.gps_provider_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'daman',
  provider_vehicle_id text NOT NULL,
  plate text,
  plate_key text,
  car_name text,
  vehicle_state text,
  ignition boolean,
  speed_kmh double precision,
  lat double precision,
  lng double precision,
  gps_time timestamptz,
  asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_vehicle_id)
);
CREATE UNIQUE INDEX gps_provider_vehicles_asset_uidx ON public.gps_provider_vehicles(asset_id) WHERE asset_id IS NOT NULL;
GRANT SELECT ON public.gps_provider_vehicles TO authenticated;
GRANT ALL ON public.gps_provider_vehicles TO service_role;
ALTER TABLE public.gps_provider_vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "provider vehicles ops only" ON public.gps_provider_vehicles FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), '{owner,ops_manager,dispatcher,fleet_supervisor}'));

-- Push the provider's current reading into the asset's history (deduplicated by reading_id).
CREATE OR REPLACE FUNCTION public.gps_provider_push_reading(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record;
BEGIN
  SELECT * INTO v FROM gps_provider_vehicles WHERE id = p_id;
  IF v.asset_id IS NULL OR v.lat IS NULL OR v.lng IS NULL OR v.gps_time IS NULL THEN RETURN; END IF;
  INSERT INTO gps_readings(asset_id, reading_id, event_time, lat, lng, source, speed_kmh)
  VALUES (v.asset_id, v.provider || '-' || v.provider_vehicle_id || '-' || floor(extract(epoch FROM v.gps_time))::bigint, LEAST(v.gps_time, now()), v.lat, v.lng, 'gps_' || v.provider, v.speed_kmh)
  ON CONFLICT (reading_id) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.gps_provider_push_reading(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gps_provider_push_reading(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.gps_link_vehicle(p_id uuid, p_asset_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_any_role(auth.uid(), '{owner,ops_manager,fleet_supervisor}') THEN
    RAISE EXCEPTION 'ربط أجهزة التتبع متاح للإدارة ومشرف الأسطول فقط';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM gps_provider_vehicles WHERE id = p_id) THEN RAISE EXCEPTION 'جهاز التتبع غير موجود'; END IF;
  IF p_asset_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM assets WHERE id = p_asset_id) THEN RAISE EXCEPTION 'المركبة غير موجودة'; END IF;
    IF EXISTS (SELECT 1 FROM gps_provider_vehicles WHERE asset_id = p_asset_id AND id <> p_id) THEN
      RAISE EXCEPTION 'هذه المركبة مربوطة بجهاز تتبع آخر';
    END IF;
  END IF;
  UPDATE gps_provider_vehicles SET asset_id = p_asset_id WHERE id = p_id;
  PERFORM public.gps_provider_push_reading(p_id);
END $$;
REVOKE ALL ON FUNCTION public.gps_link_vehicle(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gps_link_vehicle(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.gps_add_vehicle_to_fleet(p_id uuid, p_kind text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record; v_code text; v_asset uuid;
BEGIN
  IF NOT public.has_any_role(auth.uid(), '{owner,ops_manager,fleet_supervisor}') THEN
    RAISE EXCEPTION 'إضافة المركبات متاحة للإدارة ومشرف الأسطول فقط';
  END IF;
  IF p_kind NOT IN ('tractor','rigid') THEN RAISE EXCEPTION 'نوع المركبة غير صحيح'; END IF;
  SELECT * INTO v FROM gps_provider_vehicles WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'جهاز التتبع غير موجود'; END IF;
  IF v.asset_id IS NOT NULL THEN RETURN v.asset_id; END IF;
  v_code := coalesce(nullif(regexp_replace(coalesce(v.plate, ''), '\s*-\s*', ' ', 'g'), ''), 'GPS-' || v.provider_vehicle_id);
  IF EXISTS (SELECT 1 FROM assets WHERE code = v_code) THEN v_code := v_code || ' (' || v.provider_vehicle_id || ')'; END IF;
  INSERT INTO assets(code, kind, plate, make_model, status, notes)
  VALUES (v_code, p_kind, v.plate, nullif(trim(coalesce(v.car_name, '')), ''), 'available', 'أُضيفت من جهاز تتبع ضمان المهندس')
  RETURNING id INTO v_asset;
  UPDATE gps_provider_vehicles SET asset_id = v_asset WHERE id = p_id;
  PERFORM public.gps_provider_push_reading(p_id);
  RETURN v_asset;
END $$;
REVOKE ALL ON FUNCTION public.gps_add_vehicle_to_fleet(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gps_add_vehicle_to_fleet(uuid, text) TO authenticated;