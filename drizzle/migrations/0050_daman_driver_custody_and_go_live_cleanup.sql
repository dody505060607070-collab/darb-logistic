ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.custody ADD COLUMN IF NOT EXISTS source text;

CREATE OR REPLACE FUNCTION public.gps_link_drivers(p_provider text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v record; c record;
  v_name text; v_phone text; v_digits text; v_driver uuid; v_count integer; n integer := 0;
  v_src text := p_provider || '_gps';
BEGIN
  FOR v IN
    SELECT g.provider_vehicle_id, g.asset_id, g.driver_name, g.driver_phone, a.code AS asset_code, a.odometer_km
    FROM gps_provider_vehicles g JOIN assets a ON a.id = g.asset_id
    WHERE g.provider = p_provider
      AND (nullif(trim(coalesce(g.driver_name, '')), '') IS NOT NULL OR nullif(trim(coalesce(g.driver_phone, '')), '') IS NOT NULL)
  LOOP
    v_name := nullif(trim(coalesce(v.driver_name, '')), '');
    v_phone := nullif(regexp_replace(coalesce(v.driver_phone, ''), '[^0-9+]', '', 'g'), '');
    v_digits := right(regexp_replace(coalesce(v_phone, ''), '\D', '', 'g'), 9);
    IF length(v_digits) < 9 THEN v_digits := NULL; v_phone := NULL; END IF;
    v_driver := NULL;

    -- 1) Same phone as an existing driver file or employee login phone.
    IF v_digits IS NOT NULL THEN
      SELECT count(DISTINCT d.id), (array_agg(d.id ORDER BY d.created_at))[1] INTO v_count, v_driver
      FROM drivers d LEFT JOIN profiles p ON p.id = d.user_id
      WHERE right(regexp_replace(coalesce(d.phone, ''), '\D', '', 'g'), 9) = v_digits
         OR right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 9) = v_digits;
      IF v_count <> 1 THEN v_driver := NULL; END IF;
    END IF;
    -- 2) Exactly one driver with the same name.
    IF v_driver IS NULL AND v_name IS NOT NULL THEN
      SELECT count(*), (array_agg(id ORDER BY created_at))[1] INTO v_count, v_driver
      FROM drivers WHERE lower(trim(full_name)) = lower(v_name);
      IF v_count <> 1 THEN v_driver := NULL; END IF;
    END IF;
    -- 3) New driver file from the device data.
    IF v_driver IS NULL THEN
      INSERT INTO drivers(code, full_name, phone, status, source)
      VALUES ('DRV-GPS-' || v.provider_vehicle_id || '-' || substr(md5(coalesce(v_name, '') || coalesce(v_digits, '')), 1, 4),
              coalesce(v_name, 'سائق ' || v.asset_code), v_phone, 'available', v_src)
      ON CONFLICT (code) DO NOTHING
      RETURNING id INTO v_driver;
      IF v_driver IS NULL THEN
        SELECT id INTO v_driver FROM drivers
        WHERE code = 'DRV-GPS-' || v.provider_vehicle_id || '-' || substr(md5(coalesce(v_name, '') || coalesce(v_digits, '')), 1, 4);
      END IF;
    ELSE
      -- Device-created files follow later corrections on the device (name/phone), never employee-made files.
      UPDATE drivers SET full_name = coalesce(v_name, full_name), phone = coalesce(phone, v_phone)
      WHERE id = v_driver AND source = v_src
        AND (full_name IS DISTINCT FROM coalesce(v_name, full_name) OR (phone IS NULL AND v_phone IS NOT NULL));
    END IF;

    SELECT * INTO c FROM custody WHERE asset_id = v.asset_id AND closed_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO custody(asset_id, driver_id, odometer_out, notes, source)
      VALUES (v.asset_id, v_driver, v.odometer_km, 'ربط تلقائي: السائق المسجل على جهاز تتبع ضمان المهندس', v_src);
      n := n + 1;
    ELSIF c.driver_id <> v_driver AND c.source = v_src THEN
      UPDATE custody SET closed_at = now(), odometer_in = v.odometer_km WHERE id = c.id;
      INSERT INTO custody(asset_id, driver_id, odometer_out, notes, source, previous_custody_id)
      VALUES (v.asset_id, v_driver, v.odometer_km, 'ربط تلقائي: تغيّر السائق المسجل على جهاز تتبع ضمان المهندس', v_src, c.id);
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.gps_link_drivers(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gps_link_drivers(text) TO service_role;

-- One-time go-live cleanup of test records created before 2026-11-19 (bounded so it never touches later data).
DELETE FROM public.invoices WHERE created_at < '2026-11-19 00:00:00+00';
DELETE FROM public.maintenance_history WHERE work_order_id IN (SELECT id FROM public.work_orders WHERE created_at < '2026-11-19 00:00:00+00');
DELETE FROM public.stock_moves WHERE work_order_id IN (SELECT id FROM public.work_orders WHERE created_at < '2026-11-19 00:00:00+00');
DELETE FROM public.work_order_lines WHERE work_order_id IN (SELECT id FROM public.work_orders WHERE created_at < '2026-11-19 00:00:00+00');
DELETE FROM public.work_orders WHERE created_at < '2026-11-19 00:00:00+00';
DELETE FROM public.incidents WHERE created_at < '2026-11-19 00:00:00+00';
DELETE FROM public.inspections WHERE created_at < '2026-11-19 00:00:00+00';
DELETE FROM public.return_requests WHERE created_at < '2026-11-19 00:00:00+00';
DELETE FROM public.delay_notices WHERE created_at < '2026-11-19 00:00:00+00';
DELETE FROM public.trip_assignment_history WHERE trip_id IN (SELECT id FROM public.trips WHERE created_at < '2026-11-19 00:00:00+00');
DELETE FROM public.trips WHERE created_at < '2026-11-19 00:00:00+00';
DELETE FROM public.customer_requests WHERE created_at < '2026-11-19 00:00:00+00';
DELETE FROM public.transport_orders WHERE created_at < '2026-11-19 00:00:00+00';
DELETE FROM public.contracts WHERE created_at < '2026-11-19 00:00:00+00';
DELETE FROM public.crm_activities WHERE created_at < '2026-11-19 00:00:00+00';
DELETE FROM public.crm_opportunities WHERE created_at < '2026-11-19 00:00:00+00';
DELETE FROM public.locations WHERE created_at < '2026-11-19 00:00:00+00';
DELETE FROM public.customers WHERE created_at < '2026-11-19 00:00:00+00';
DELETE FROM public.notifications WHERE created_at < '2026-11-19 00:00:00+00';
DELETE FROM public.chat_messages WHERE created_at < '2026-11-19 00:00:00+00';
DELETE FROM public.ai_reports WHERE created_at < '2026-11-19 00:00:00+00';
DELETE FROM public.whatsapp_outbox WHERE created_at < '2026-11-19 00:00:00+00' AND state IN ('accepted', 'unresolved');
DELETE FROM public.gps_readings WHERE source <> 'gps_daman' AND received_time < '2026-11-19 00:00:00+00';
DELETE FROM public.gps_readings WHERE asset_id IN (SELECT a.id FROM public.assets a WHERE a.created_at < '2026-11-19 00:00:00+00' AND NOT EXISTS (SELECT 1 FROM public.gps_provider_vehicles g WHERE g.asset_id = a.id));
DELETE FROM public.custody WHERE asset_id IN (SELECT a.id FROM public.assets a WHERE a.created_at < '2026-11-19 00:00:00+00' AND NOT EXISTS (SELECT 1 FROM public.gps_provider_vehicles g WHERE g.asset_id = a.id));
DELETE FROM public.assets a WHERE a.created_at < '2026-11-19 00:00:00+00' AND NOT EXISTS (SELECT 1 FROM public.gps_provider_vehicles g WHERE g.asset_id = a.id);
UPDATE public.drivers SET status = 'available' WHERE status = 'on_trip';
UPDATE public.assets SET status = 'available' WHERE status = 'active';

SELECT public.gps_link_drivers('daman');