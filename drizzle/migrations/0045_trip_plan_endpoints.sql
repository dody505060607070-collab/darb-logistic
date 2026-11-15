CREATE OR REPLACE FUNCTION public.driver_trip_plan(p_trip_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE t record;
BEGIN
  SELECT id, driver_id, origin_location_id, dest_location_id, origin_city, dest_city INTO t FROM trips WHERE id = p_trip_id;
  IF NOT FOUND OR NOT ((t.driver_id IS NOT NULL AND t.driver_id = public.current_driver_id())
     OR public.has_any_role(auth.uid(), '{owner,ops_manager,dispatcher,fleet_supervisor}'::public.app_role[])) THEN
    RAISE EXCEPTION 'هذه الرحلة ليست لك';
  END IF;
  RETURN jsonb_build_object(
    'origin', (SELECT jsonb_build_object('name', l.name, 'city', coalesce(l.city, t.origin_city), 'lat', l.lat, 'lng', l.lng) FROM locations l WHERE l.id = t.origin_location_id),
    'dest', (SELECT jsonb_build_object('name', l.name, 'city', coalesce(l.city, t.dest_city), 'lat', l.lat, 'lng', l.lng) FROM locations l WHERE l.id = t.dest_location_id),
    'origin_city', t.origin_city,
    'dest_city', t.dest_city,
    'stops', coalesce((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'seq', s.seq, 'name', s.name, 'city', s.city, 'lat', s.lat, 'lng', s.lng, 'notes', s.notes, 'status', s.status, 'done_at', s.done_at) ORDER BY s.seq, s.created_at) FROM trip_stops s WHERE s.trip_id = p_trip_id), '[]'::jsonb),
    'route', (SELECT jsonb_build_object('points', r.points, 'distance_km', r.distance_km, 'duration_min', r.duration_min, 'provider', r.provider, 'computed_at', r.computed_at) FROM trip_routes r WHERE r.trip_id = p_trip_id),
    'alerts', coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'opened_at', a.opened_at, 'reason', a.reason, 'minutes', a.minutes, 'distance_m', a.distance_m)) FROM trip_alerts a WHERE a.trip_id = p_trip_id AND a.cleared_at IS NULL), '[]'::jsonb));
END $$;
REVOKE EXECUTE ON FUNCTION public.driver_trip_plan(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_trip_plan(uuid) TO authenticated;