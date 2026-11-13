-- Production readiness: trip status transitions, POD/expense immutability, GPS privacy, function privileges.
-- Rollback: DROP TRIGGER trip_status_guard ON trips; DROP TRIGGER pod_guard ON pods; DROP TRIGGER expense_guard ON expenses;
-- restore previous record_trip_event from migration history; re-create dropped pods policies and gps_readings select policy (is_staff).

CREATE OR REPLACE FUNCTION public.trip_status_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('draft','planned') THEN RAISE EXCEPTION 'تُنشأ الرحلة بحالة مسودة أو مخططة فقط'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.status IN ('closed','cancelled') AND (
     NEW.status IS DISTINCT FROM OLD.status OR NEW.driver_id IS DISTINCT FROM OLD.driver_id OR NEW.tractor_id IS DISTINCT FROM OLD.tractor_id
     OR NEW.trailer_id IS DISTINCT FROM OLD.trailer_id OR NEW.actual_start IS DISTINCT FROM OLD.actual_start OR NEW.actual_end IS DISTINCT FROM OLD.actual_end
     OR NEW.distance_km IS DISTINCT FROM OLD.distance_km) THEN
    RAISE EXCEPTION 'الرحلة نهائية؛ التصحيح يتم بإجراء موثق وليس بالتعديل المباشر';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'draft' AND NEW.status IN ('planned','ready','cancelled')) OR
      (OLD.status = 'planned' AND NEW.status IN ('draft','ready','in_progress','cancelled')) OR
      (OLD.status = 'ready' AND NEW.status IN ('planned','in_progress','cancelled')) OR
      (OLD.status = 'in_progress' AND NEW.status IN ('delivered','cancelled')) OR
      (OLD.status = 'delivered' AND NEW.status = 'closed')
    ) THEN
      RAISE EXCEPTION 'انتقال حالة غير مسموح: % إلى %', OLD.status, NEW.status;
    END IF;
    IF NEW.status = 'delivered' AND NOT EXISTS (SELECT 1 FROM public.pods WHERE trip_id = NEW.id AND status <> 'rejected') THEN
      RAISE EXCEPTION 'لا يكتمل التسليم دون إثبات تسليم';
    END IF;
    IF NEW.status = 'cancelled' AND length(trim(coalesce(NEW.cancel_reason,''))) < 3 THEN
      RAISE EXCEPTION 'سبب الإلغاء مطلوب';
    END IF;
  END IF;
  IF OLD.status = 'delivered' AND (NEW.actual_end IS DISTINCT FROM OLD.actual_end OR NEW.driver_id IS DISTINCT FROM OLD.driver_id OR NEW.tractor_id IS DISTINCT FROM OLD.tractor_id) THEN
    RAISE EXCEPTION 'لا يُعدل إسناد أو وقت تسليم رحلة مسلّمة مباشرة';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trip_status_guard ON public.trips;
CREATE TRIGGER trip_status_guard BEFORE INSERT OR UPDATE ON public.trips FOR EACH ROW EXECUTE FUNCTION public.trip_status_guard();

-- Proof of delivery: created only through submit_delivery; review can change status only.
CREATE OR REPLACE FUNCTION public.pod_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF (NEW.trip_id, NEW.receiver_name, NEW.receiver_phone, NEW.received_at, NEW.captured_at, NEW.qty_delivered, NEW.qty_short, NEW.qty_damaged, NEW.signature, NEW.photo_paths, NEW.lat, NEW.lng, NEW.client_event_id, NEW.created_by)
     IS DISTINCT FROM (OLD.trip_id, OLD.receiver_name, OLD.receiver_phone, OLD.received_at, OLD.captured_at, OLD.qty_delivered, OLD.qty_short, OLD.qty_damaged, OLD.signature, OLD.photo_paths, OLD.lat, OLD.lng, OLD.client_event_id, OLD.created_by) THEN
    RAISE EXCEPTION 'بيانات إثبات التسليم لا تُعدل بعد الإرسال';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status = 'submitted' AND NEW.status IN ('accepted','rejected')) THEN
    RAISE EXCEPTION 'مراجعة الإثبات تتم مرة واحدة من حالة مُرسل';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS pod_guard ON public.pods;
CREATE TRIGGER pod_guard BEFORE UPDATE ON public.pods FOR EACH ROW EXECUTE FUNCTION public.pod_guard();

DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='pods' AND cmd IN ('INSERT','DELETE') LOOP
    EXECUTE format('DROP POLICY %I ON public.pods', p.policyname);
  END LOOP;
END $$;
CREATE POLICY "pods delete owner only" ON public.pods FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'owner'));

-- Expenses: no self-review fields from the client, positive amounts, approved rows immutable except via review flow.
CREATE OR REPLACE FUNCTION public.expense_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE fin boolean := auth.uid() IS NULL OR public.has_any_role(auth.uid(), '{owner,ops_manager,accountant}');
BEGIN
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN RAISE EXCEPTION 'مبلغ المصروف يجب أن يكون أكبر من صفر'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NOT fin THEN NEW.status := 'pending'; NEW.reviewed_by := NULL; NEW.reviewed_at := NULL; NEW.reject_reason := NULL; END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = 'approved' AND (NEW.amount, NEW.category, NEW.trip_id, NEW.driver_id, NEW.spent_at, NEW.status)
     IS DISTINCT FROM (OLD.amount, OLD.category, OLD.trip_id, OLD.driver_id, OLD.spent_at, OLD.status) THEN
    RAISE EXCEPTION 'المصروف المعتمد لا يُعدل؛ سجّل تصحيحًا';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS expense_guard ON public.expenses;
CREATE TRIGGER expense_guard BEFORE INSERT OR UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.expense_guard();

-- Location history only for operations and fleet supervision.
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='gps_readings' AND cmd='SELECT' LOOP
    EXECUTE format('DROP POLICY %I ON public.gps_readings', p.policyname);
  END LOOP;
END $$;
CREATE POLICY "gps history ops only" ON public.gps_readings FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), '{owner,ops_manager,dispatcher,fleet_supervisor}'));
CREATE INDEX IF NOT EXISTS gps_readings_asset_time_idx ON public.gps_readings(asset_id, event_time DESC);

CREATE OR REPLACE FUNCTION public.record_trip_event(p_trip_id uuid, p_event_type text, p_location text DEFAULT NULL::text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_notes text DEFAULT NULL::text, p_client_event_id text DEFAULT NULL::text, p_occurred_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE tr record; ev_id uuid; is_ops boolean;
BEGIN
  SELECT * INTO tr FROM public.trips WHERE id = p_trip_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الرحلة غير موجودة'; END IF;
  is_ops := public.has_any_role(auth.uid(), '{owner,ops_manager,dispatcher}');
  IF NOT is_ops AND tr.driver_id IS DISTINCT FROM public.current_driver_id() THEN RAISE EXCEPTION 'غير مصرح'; END IF;

  IF p_client_event_id IS NOT NULL THEN
    SELECT id INTO ev_id FROM public.trip_events WHERE client_event_id = p_client_event_id AND trip_id = p_trip_id;
    IF FOUND THEN RETURN ev_id; END IF;
    IF EXISTS (SELECT 1 FROM public.trip_events WHERE client_event_id = p_client_event_id) THEN RAISE EXCEPTION 'معرف العملية مستخدم لرحلة أخرى'; END IF;
  END IF;

  IF tr.status IN ('closed','cancelled') THEN RAISE EXCEPTION 'الرحلة مغلقة'; END IF;
  IF p_event_type NOT IN ('arrived_pickup','loading_start','loading_end','departed','arrived_delivery','unloading_start','unloading_end','delivered','suspended','breakdown','resumed','fuel_stop','rest_stop','note') THEN RAISE EXCEPTION 'نوع حدث غير معروف'; END IF;
  IF tr.status = 'delivered' AND p_event_type <> 'note' THEN RAISE EXCEPTION 'تم تسليم الرحلة؛ لا تُسجل مراحل جديدة'; END IF;
  IF tr.status = 'draft' THEN RAISE EXCEPTION 'الرحلة غير مخصصة بعد'; END IF;
  IF p_event_type = 'delivered' AND tr.status <> 'in_progress' THEN RAISE EXCEPTION 'لا يتم التسليم إلا لرحلة قيد التنفيذ'; END IF;
  IF p_event_type = 'departed' AND tr.status NOT IN ('planned','ready','in_progress') THEN RAISE EXCEPTION 'الرحلة غير جاهزة للانطلاق — خصص الموارد أولًا'; END IF;
  IF p_event_type = 'departed' AND NOT is_ops AND NOT EXISTS (
     SELECT 1 FROM public.inspections WHERE trip_id = p_trip_id AND kind = 'pre_trip' AND NOT has_critical) THEN
     RAISE EXCEPTION 'يجب إكمال فحص ما قبل الانطلاق دون عيوب حرجة';
  END IF;
  IF p_event_type = 'delivered' AND NOT EXISTS (SELECT 1 FROM public.pods WHERE trip_id = p_trip_id) THEN
     RAISE EXCEPTION 'سجّل إثبات التسليم أولًا';
  END IF;

  INSERT INTO public.trip_events(trip_id, event_type, occurred_at, location_text, lat, lng, notes, client_event_id)
  VALUES (p_trip_id, p_event_type, COALESCE(p_occurred_at, now()), p_location, p_lat, p_lng, p_notes, p_client_event_id)
  RETURNING id INTO ev_id;

  UPDATE public.trips SET
    stage = CASE WHEN p_event_type IN ('suspended','breakdown','resumed','note','fuel_stop','rest_stop') THEN stage ELSE p_event_type END,
    exception = CASE WHEN p_event_type IN ('suspended','breakdown') THEN p_event_type WHEN p_event_type = 'resumed' THEN NULL ELSE exception END,
    status = CASE WHEN p_event_type IN ('departed','arrived_pickup','loading_start','loading_end','arrived_delivery','unloading_start','unloading_end') AND status IN ('planned','ready') THEN 'in_progress'
                  WHEN p_event_type = 'delivered' THEN 'delivered' ELSE status END,
    actual_start = CASE WHEN p_event_type = 'departed' AND actual_start IS NULL THEN COALESCE(p_occurred_at, now()) ELSE actual_start END,
    actual_end = CASE WHEN p_event_type = 'delivered' THEN COALESCE(p_occurred_at, now()) ELSE actual_end END
  WHERE id = p_trip_id;

  IF p_event_type = 'departed' THEN
    UPDATE public.drivers SET status = 'on_trip' WHERE id = tr.driver_id;
    UPDATE public.assets SET status = 'active' WHERE id IN (tr.tractor_id, tr.trailer_id);
  ELSIF p_event_type = 'delivered' THEN
    UPDATE public.drivers SET status = 'available' WHERE id = tr.driver_id;
    UPDATE public.assets SET status = 'available' WHERE id IN (tr.tractor_id, tr.trailer_id) AND status = 'active';
  END IF;
  IF p_lat IS NOT NULL AND tr.tractor_id IS NOT NULL THEN
    INSERT INTO public.gps_readings(asset_id, reading_id, event_time, lat, lng, source)
    VALUES (tr.tractor_id, 'evt-' || ev_id, COALESCE(p_occurred_at, now()), p_lat, p_lng, 'driver_app');
  END IF;
  RETURN ev_id;
END $function$;

-- Function privileges: nothing executable by anonymous callers; trigger functions not callable directly.
DO $$ DECLARE f record; had_auth boolean; had_srv boolean; BEGIN
  FOR f IN SELECT p.oid, p.oid::regprocedure AS sig, p.prorettype = 'trigger'::regtype AS is_trg
           FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
             AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e') LOOP
    had_auth := has_function_privilege('authenticated', f.oid, 'EXECUTE');
    had_srv := has_function_privilege('service_role', f.oid, 'EXECUTE');
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    IF f.is_trg THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', f.sig);
    ELSIF had_auth THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
    END IF;
    IF had_srv THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig); END IF;
  END LOOP;
END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;