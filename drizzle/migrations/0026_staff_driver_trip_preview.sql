CREATE OR REPLACE FUNCTION public.driver_trips_for(p_driver_id uuid)
RETURNS SETOF record LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'unused'; END $$;
DROP FUNCTION public.driver_trips_for(uuid);
CREATE FUNCTION public.driver_trips_for(p_driver_id uuid)
RETURNS TABLE(id uuid, number text, status text, stage text, exception text, origin_city text, dest_city text, planned_start timestamptz, planned_end timestamptz, actual_start timestamptz, distance_km numeric, tractor_id uuid, tractor_code text, trailer_id uuid, trailer_code text, cargo_type text, quantity numeric, unit text, weight_kg numeric, order_number text, customer_name text, consignee text, pickup_name text, delivery_name text, delivery_instructions text, dest_lat double precision, dest_lng double precision, origin_lat double precision, origin_lng double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT t.id, t.number, t.status, t.stage, t.exception, t.origin_city, t.dest_city, t.planned_start, t.planned_end, t.actual_start, t.distance_km,
    t.tractor_id, tk.code, t.trailer_id, tl.code, o.cargo_type, o.quantity, o.unit, o.weight_kg, o.number, c.name, o.consignee, lp.name, ld.name, ld.instructions,
    ld.lat, ld.lng, lp.lat, lp.lng
  FROM trips t
  LEFT JOIN assets tk ON tk.id = t.tractor_id
  LEFT JOIN assets tl ON tl.id = t.trailer_id
  LEFT JOIN transport_orders o ON o.id = t.order_id
  LEFT JOIN customers c ON c.id = o.customer_id
  LEFT JOIN locations lp ON lp.id = COALESCE(t.origin_location_id, o.pickup_location_id)
  LEFT JOIN locations ld ON ld.id = COALESCE(t.dest_location_id, o.delivery_location_id)
  WHERE t.driver_id = p_driver_id AND t.status NOT IN ('draft','cancelled')
    AND public.has_any_role(auth.uid(), '{owner,ops_manager,dispatcher,fleet_supervisor}'::public.app_role[])
  ORDER BY (t.status = 'in_progress') DESC, t.planned_start DESC NULLS LAST $$;
REVOKE ALL ON FUNCTION public.driver_trips_for(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_trips_for(uuid) TO authenticated;