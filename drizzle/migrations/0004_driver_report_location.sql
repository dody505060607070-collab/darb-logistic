CREATE OR REPLACE FUNCTION public.driver_report_location(p_trip_id uuid, p_lat double precision, p_lng double precision, p_speed double precision, p_event_time timestamptz, p_reading_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_asset uuid;
BEGIN
  IF p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180 THEN RAISE EXCEPTION 'إحداثيات غير صالحة'; END IF;
  SELECT t.tractor_id INTO v_asset FROM trips t JOIN drivers d ON d.id = t.driver_id
   WHERE t.id = p_trip_id AND d.user_id = auth.uid() AND t.status = 'in_progress';
  IF v_asset IS NULL THEN RAISE EXCEPTION 'لا توجد رحلة جارية لهذا السائق'; END IF;
  INSERT INTO gps_readings(asset_id, event_time, lat, lng, reading_id, source, speed_kmh)
  VALUES (v_asset, LEAST(p_event_time, now()), p_lat, p_lng, p_reading_id, 'driver_phone', p_speed)
  ON CONFLICT DO NOTHING;
END $$;
REVOKE EXECUTE ON FUNCTION public.driver_report_location(uuid,double precision,double precision,double precision,timestamptz,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_report_location(uuid,double precision,double precision,double precision,timestamptz,text) TO authenticated;