ALTER TABLE public.return_requests
  ADD COLUMN IF NOT EXISTS has_cargo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cargo_description text,
  ADD COLUMN IF NOT EXISTS cargo_size text CHECK (cargo_size IS NULL OR cargo_size IN ('small','medium','large')),
  ADD COLUMN IF NOT EXISTS load_level text CHECK (load_level IS NULL OR load_level IN ('empty','partial','full')),
  ADD COLUMN IF NOT EXISTS pickup_place text,
  ADD COLUMN IF NOT EXISTS reject_reason text;

CREATE OR REPLACE FUNCTION public.driver_request_return_v2(p_trip_id uuid, p_depart_at timestamptz, p_notes text, p_has_cargo boolean, p_cargo_description text, p_cargo_size text, p_load_level text, p_pickup_place text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t record; rid uuid; dn text; det text;
BEGIN
  SELECT * INTO t FROM trips WHERE id=p_trip_id;
  IF NOT FOUND OR t.driver_id IS DISTINCT FROM current_driver_id() THEN RAISE EXCEPTION 'هذه الرحلة ليست لك'; END IF;
  IF t.status NOT IN ('in_progress','delivered','closed') THEN RAISE EXCEPTION 'يمكن طلب الرجوع بعد بدء الرحلة'; END IF;
  IF EXISTS (SELECT 1 FROM trips WHERE parent_trip_id=p_trip_id AND empty_reason='رحلة رجوع' AND status<>'cancelled') THEN RAISE EXCEPTION 'رحلة الرجوع موجودة بالفعل'; END IF;
  IF p_depart_at IS NULL THEN RAISE EXCEPTION 'حدد موعد الرجوع'; END IF;
  IF coalesce(p_has_cargo,false) AND nullif(trim(p_cargo_description),'') IS NULL THEN RAISE EXCEPTION 'اكتب ما الذي ترجع به'; END IF;
  IF p_cargo_size IS NOT NULL AND p_cargo_size NOT IN ('small','medium','large') THEN RAISE EXCEPTION 'حجم غير صالح'; END IF;
  IF p_load_level IS NOT NULL AND p_load_level NOT IN ('empty','partial','full') THEN RAISE EXCEPTION 'درجة امتلاء غير صالحة'; END IF;
  INSERT INTO return_requests(trip_id, driver_id, depart_at, notes, has_cargo, cargo_description, cargo_size, load_level, pickup_place)
  VALUES (p_trip_id, t.driver_id, p_depart_at, nullif(trim(p_notes),''), coalesce(p_has_cargo,false),
          CASE WHEN p_has_cargo THEN nullif(trim(p_cargo_description),'') END,
          CASE WHEN p_has_cargo THEN p_cargo_size END,
          CASE WHEN p_has_cargo THEN p_load_level ELSE 'empty' END,
          nullif(trim(p_pickup_place),''))
  RETURNING id INTO rid;
  SELECT full_name INTO dn FROM drivers WHERE id=t.driver_id;
  det := CASE WHEN coalesce(p_has_cargo,false) THEN format(E'\nالحمولة: %s — الحجم: %s — %s', trim(p_cargo_description),
           coalesce(CASE p_cargo_size WHEN 'small' THEN 'صغير' WHEN 'medium' THEN 'متوسط' WHEN 'large' THEN 'كبير' END,'—'),
           coalesce(CASE p_load_level WHEN 'partial' THEN 'نصف ممتلئة' WHEN 'full' THEN 'ممتلئة' ELSE 'فارغة' END,'—'))
         ELSE E'\nراجع فارغ بدون حمولة' END;
  PERFORM wa_admins(format(E'↩️ طلب رحلة رجوع من %s\nالرحلة %s\nمن: %s\nموعد الرجوع: %s%s%s\nوافق أو ارفض من لوحة التحكم.', coalesce(dn,'السائق'), t.number,
    coalesce(nullif(trim(p_pickup_place),''), t.dest_city), to_char(p_depart_at AT TIME ZONE 'Asia/Riyadh','YYYY-MM-DD HH24:MI'), det,
    coalesce(E'\nملاحظات: '||nullif(trim(p_notes),''),'')), 'return_request', rid);
  RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION public.approve_return_request(p_request_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; t record; dur interval; nid uuid;
BEGIN
  IF NOT has_any_role(auth.uid(), '{owner,ops_manager,dispatcher}') THEN RAISE EXCEPTION 'ليست لديك صلاحية'; END IF;
  SELECT * INTO r FROM return_requests WHERE id=p_request_id AND status='pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الطلب غير موجود أو تمت مراجعته'; END IF;
  SELECT * INTO t FROM trips WHERE id=r.trip_id;
  dur := greatest(coalesce(t.planned_end - t.planned_start, interval '8 hours'), interval '1 hour');
  nid := create_return_trip(r.trip_id, r.depart_at, r.depart_at + dur, t.dest_location_id, t.origin_location_id, t.distance_km, r.id);
  IF r.has_cargo THEN
    UPDATE trips SET is_empty=false, empty_reason='رحلة رجوع' WHERE id=nid;
  END IF;
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.reject_return_request(p_request_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; dp text; tn text;
BEGIN
  IF NOT has_any_role(auth.uid(), '{owner,ops_manager,dispatcher}') THEN RAISE EXCEPTION 'ليست لديك صلاحية'; END IF;
  IF nullif(trim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'اكتب سبب الرفض'; END IF;
  UPDATE return_requests SET status='rejected', reviewed_by=auth.uid(), reviewed_at=now(), reject_reason=trim(p_reason) WHERE id=p_request_id AND status='pending' RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'الطلب غير موجود أو تمت مراجعته'; END IF;
  SELECT phone INTO dp FROM drivers WHERE id=r.driver_id;
  SELECT number INTO tn FROM trips WHERE id=r.trip_id;
  PERFORM wa_enqueue(dp, format(E'❌ لم تتم الموافقة على طلب الرجوع للرحلة %s\nالسبب: %s', tn, trim(p_reason)), 'return_rejected', r.id);
END $$;

REVOKE ALL ON FUNCTION public.driver_request_return_v2(uuid,timestamptz,text,boolean,text,text,text,text), public.approve_return_request(uuid), public.reject_return_request(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_request_return_v2(uuid,timestamptz,text,boolean,text,text,text,text), public.approve_return_request(uuid), public.reject_return_request(uuid,text) TO authenticated;