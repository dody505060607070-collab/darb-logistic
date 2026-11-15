CREATE OR REPLACE FUNCTION public.driver_wa_phone(p_driver uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(nullif(trim(p.phone),''), nullif(trim(d.phone),'')) FROM drivers d LEFT JOIN profiles p ON p.id = d.user_id WHERE d.id = p_driver
$$;
REVOKE EXECUTE ON FUNCTION public.driver_wa_phone(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.driver_wa_phone(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.wa_phone_inline(p text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN public.wa_norm(p) ~ '^[1-9]\d{8,14}$' THEN ' (+' || public.wa_norm(p) || ')' ELSE '' END
$$;
CREATE OR REPLACE FUNCTION public.wa_phone_line(p_label text, p text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN public.wa_norm(p) ~ '^[1-9]\d{8,14}$' THEN E'\n' || p_label || ': +' || public.wa_norm(p) ELSE '' END
$$;
CREATE OR REPLACE FUNCTION public.wa_event_label(p text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE p WHEN 'arrived_pickup' THEN 'الوصول لموقع التحميل' WHEN 'loading_start' THEN 'بداية التحميل' WHEN 'loading_end' THEN 'نهاية التحميل'
    WHEN 'departed' THEN 'الانطلاق' WHEN 'arrived_delivery' THEN 'الوصول لموقع التسليم' WHEN 'unloading_start' THEN 'بداية التفريغ'
    WHEN 'unloading_end' THEN 'نهاية التفريغ' WHEN 'delivered' THEN 'تم التسليم' WHEN 'suspended' THEN 'تعليق الرحلة' WHEN 'breakdown' THEN 'عطل'
    WHEN 'resumed' THEN 'استئناف الرحلة' WHEN 'fuel_stop' THEN 'توقف للتزود بالوقود' WHEN 'rest_stop' THEN 'استراحة' WHEN 'note' THEN 'ملاحظة' ELSE p END
$$;
REVOKE EXECUTE ON FUNCTION public.wa_phone_inline(text), public.wa_phone_line(text,text), public.wa_event_label(text) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.wa_event_roles(p_event text, p_critical boolean DEFAULT false)
 RETURNS app_role[] LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $function$
 SELECT (CASE
 WHEN p_event IN ('maintenance_request','workshop_intake','workshop_report','maintenance_state') THEN ARRAY['maintenance']
 WHEN p_event IN ('fuel','expense','wallet_request') THEN ARRAY['accountant']
 WHEN p_event IN ('trip_assigned','trip_status','trip_event') THEN ARRAY['dispatcher','fleet_supervisor']
 WHEN p_event IN ('order_created','trip_created','return_request','delay_notice','customer_request') THEN ARRAY['dispatcher','ops_manager']
 WHEN p_event IN ('vehicle_stopped','off_route','stop_done') THEN ARRAY['fleet_supervisor','dispatcher']
 WHEN p_event='incident' THEN ARRAY['maintenance','fleet_supervisor','ops_manager']
 WHEN p_event='critical_maintenance' THEN ARRAY['maintenance','fleet_supervisor']
 WHEN p_event IN ('document_alert','critical_alert') THEN ARRAY['fleet_supervisor']
 WHEN p_event IN ('maintenance_alert','stock_alert') THEN ARRAY['maintenance']
 ELSE ARRAY[]::text[] END || CASE WHEN p_critical THEN ARRAY['owner'] ELSE ARRAY[]::text[] END)::public.app_role[] $function$;

CREATE OR REPLACE FUNCTION public.wa_trip_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE d record; msg text; ph text;
BEGIN
  SELECT full_name INTO d FROM drivers WHERE id = NEW.driver_id;
  ph := public.driver_wa_phone(NEW.driver_id);
  IF TG_OP='INSERT' AND NEW.driver_id IS NULL THEN
    PERFORM wa_admins(format(E'🚚 رحلة جديدة %s (%s ← %s)\nموعد التحميل: %s\nبانتظار تعيين سائق.', NEW.number, coalesce(NEW.origin_city,'—'), coalesce(NEW.dest_city,'—'), coalesce(to_char(NEW.planned_start AT TIME ZONE 'Asia/Riyadh','YYYY-MM-DD HH24:MI'),'—')), 'trip_created', NEW.id);
  END IF;
  IF NEW.driver_id IS NOT NULL AND (TG_OP='INSERT' OR OLD.driver_id IS DISTINCT FROM NEW.driver_id) THEN
    msg := format(E'🚚 رحلة جديدة %s\nمن: %s إلى: %s\nموعد التحميل: %s\nافتح تطبيق Shata للتفاصيل والخريطة.', NEW.number, NEW.origin_city, NEW.dest_city, coalesce(to_char(NEW.planned_start AT TIME ZONE 'Asia/Riyadh','YYYY-MM-DD HH24:MI'),'—'));
    PERFORM wa_enqueue(ph, format(E'مرحبًا %s\n', coalesce(d.full_name,''))||msg, 'trip_assigned', NEW.id);
    PERFORM wa_admins(format(E'تم تكليف %s بالرحلة %s (%s ← %s)%s', coalesce(d.full_name,'سائق'), NEW.number, NEW.origin_city, NEW.dest_city, public.wa_phone_line('جوال السائق', ph)), 'trip_assigned', NEW.id);
  END IF;
  IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    msg := format(E'تحديث الرحلة %s: الحالة أصبحت «%s»\nالسائق: %s', NEW.number, public.wa_trip_status_label(NEW.status::text), coalesce(d.full_name,'—'));
    PERFORM wa_admins(msg || public.wa_phone_line('جوال السائق', ph), 'trip_status', NEW.id);
    PERFORM wa_enqueue(ph, msg, 'trip_status', NEW.id);
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.wa_trip_event_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE t record;
BEGIN
  SELECT tr.number, tr.driver_id, dr.full_name INTO t FROM trips tr LEFT JOIN drivers dr ON dr.id=tr.driver_id WHERE tr.id=NEW.trip_id;
  PERFORM wa_admins(format(E'📍 الرحلة %s — %s\nالسائق: %s%s%s', t.number, public.wa_event_label(NEW.event_type::text), coalesce(t.full_name,'—'),
    public.wa_phone_line('جوال السائق', public.driver_wa_phone(t.driver_id)), coalesce(E'\nملاحظة: '||NEW.notes,'')), 'trip_event', NEW.trip_id);
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.wa_incident_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE d record; msg text; ph text;
BEGIN
  SELECT full_name INTO d FROM drivers WHERE id=NEW.driver_id;
  ph := public.driver_wa_phone(NEW.driver_id);
  msg := format(E'🚨 بلاغ %s (%s) — خطورة: %s\nالسائق: %s\n%s', NEW.number,
    CASE NEW.kind::text WHEN 'accident' THEN 'حادث' WHEN 'breakdown' THEN 'عطل بالمركبة' WHEN 'cargo' THEN 'مشكلة بالحمولة' WHEN 'other' THEN 'مشكلة أخرى' ELSE NEW.kind::text END,
    CASE NEW.severity::text WHEN 'critical' THEN 'حرجة' WHEN 'high' THEN 'عالية' WHEN 'medium' THEN 'متوسطة' WHEN 'low' THEN 'منخفضة' ELSE NEW.severity::text END,
    coalesce(d.full_name,'—'), coalesce(NEW.description,''));
  PERFORM wa_admins(msg || public.wa_phone_line('جوال السائق', ph), 'incident', NEW.id);
  PERFORM wa_enqueue(ph, E'تم استلام بلاغك وسيتم التواصل معك.\n'||msg, 'incident', NEW.id);
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.acknowledge_delay(p_id uuid, p_reply text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE r record;
BEGIN
  IF NOT has_any_role(auth.uid(), '{owner,ops_manager,dispatcher}') THEN RAISE EXCEPTION 'ليست لديك صلاحية'; END IF;
  UPDATE delay_notices SET status='acknowledged', reply=nullif(trim(p_reply),''), reviewed_by=auth.uid(), reviewed_at=now() WHERE id=p_id AND status='pending' RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'الإشعار غير موجود أو تمت مراجعته'; END IF;
  PERFORM wa_enqueue(public.driver_wa_phone(r.driver_id), format(E'✅ استلمت الإدارة إشعار التأخير%s', coalesce(E'\nرد الإدارة: '||nullif(trim(p_reply),''),'')), 'delay_ack', r.id);
END $function$;

CREATE OR REPLACE FUNCTION public.reject_return_request(p_request_id uuid, p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE r record; tn text;
BEGIN
  IF NOT has_any_role(auth.uid(), '{owner,ops_manager,dispatcher}') THEN RAISE EXCEPTION 'ليست لديك صلاحية'; END IF;
  IF nullif(trim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'اكتب سبب الرفض'; END IF;
  UPDATE return_requests SET status='rejected', reviewed_by=auth.uid(), reviewed_at=now(), reject_reason=trim(p_reason) WHERE id=p_request_id AND status='pending' RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'الطلب غير موجود أو تمت مراجعته'; END IF;
  SELECT number INTO tn FROM trips WHERE id=r.trip_id;
  PERFORM wa_enqueue(public.driver_wa_phone(r.driver_id), format(E'❌ لم تتم الموافقة على طلب الرجوع للرحلة %s\nالسبب: %s', tn, trim(p_reason)), 'return_rejected', r.id);
END $function$;

CREATE OR REPLACE FUNCTION public.wa_decision_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE ph text;
BEGIN
  IF TG_TABLE_NAME='expenses' THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved','rejected') THEN
      ph := public.driver_wa_phone(NEW.driver_id);
      PERFORM wa_enqueue(ph, CASE WHEN NEW.status='approved' THEN format(E'✅ اعتُمد مصروفك %s ر.س (%s)', NEW.amount, NEW.category)
        ELSE format(E'❌ رُفض مصروفك %s ر.س (%s)%s', NEW.amount, NEW.category, coalesce(E'\nالسبب: '||nullif(trim(NEW.reject_reason),''),'')) END, 'expense_decision', NEW.id);
    END IF;
  ELSIF TG_TABLE_NAME='maintenance_wallet_entries' THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved','rejected') THEN
      SELECT phone INTO ph FROM profiles WHERE id=NEW.employee_id;
      PERFORM wa_enqueue(ph, CASE WHEN NEW.status='approved' THEN format(E'✅ اعتُمدت حركة العهدة %s ر.س — %s', NEW.amount, NEW.description)
        ELSE format(E'❌ رُفضت حركة العهدة %s ر.س — %s%s', NEW.amount, NEW.description, coalesce(E'\nالسبب: '||nullif(trim(NEW.review_note),''),'')) END, 'wallet_decision', NEW.id);
    END IF;
  ELSIF TG_TABLE_NAME='work_orders' THEN
    IF NEW.workflow_status IS DISTINCT FROM OLD.workflow_status AND NEW.workflow_status IN ('approved','rejected') AND NEW.requested_by IS NOT NULL THEN
      SELECT phone INTO ph FROM profiles WHERE id=NEW.requested_by;
      PERFORM wa_enqueue(ph, CASE WHEN NEW.workflow_status='approved' THEN format(E'✅ اعتُمد أمر الصيانة %s%s', NEW.number, coalesce(E'\nالميزانية: '||NEW.approved_budget||' ر.س',''))
        ELSE format(E'❌ رُفض أمر الصيانة %s%s', NEW.number, coalesce(E'\nالسبب: '||nullif(trim(NEW.approval_note),''),'')) END, 'work_order_decision', NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.generate_critical_alerts()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n int := 0; r record; horizon int; nid uuid; k text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_staff(auth.uid()) THEN RAISE EXCEPTION 'ليست لديك صلاحية'; END IF;
  SELECT coalesce((SELECT max(x) FROM unnest(doc_alert_days) x), 30) INTO horizon FROM company_settings LIMIT 1;
  horizon := coalesce(horizon, 30);
  FOR r IN
    SELECT 'doc:'||x.id AS key, CASE WHEN x.expiry_date < current_date THEN 'critical' WHEN x.expiry_date <= current_date+7 THEN 'critical' ELSE 'warning' END sev, 'documents' cat,
      CASE WHEN x.expiry_date < current_date THEN 'منتهي: ' ELSE 'قارب على الانتهاء: ' END || x.doc_type || ' — ' || coalesce(d.full_name, a.code, 'الشركة') AS title,
      format('ينتهي في %s (باقي %s يوم)', x.expiry_date, x.expiry_date-current_date) body, x.entity_type et, x.entity_id eid, public.driver_wa_phone(d.id) dphone, x.expiry_date-current_date AS left_days
    FROM documents x LEFT JOIN drivers d ON x.entity_type='driver' AND d.id=x.entity_id LEFT JOIN assets a ON x.entity_type='asset' AND a.id=x.entity_id
    WHERE x.expiry_date IS NOT NULL AND x.expiry_date <= current_date+horizon AND x.review_status<>'rejected'
    UNION ALL
    SELECT 'mplan:'||p.id, 'warning', 'maintenance', 'صيانة دورية مستحقة: '||p.title||' — '||a.code,
      format('آخر تنفيذ %s، كل %s يوم', p.last_done_at, p.interval_days), 'asset', p.asset_id, NULL, (p.last_done_at+p.interval_days)-current_date
    FROM maintenance_plans p JOIN assets a ON a.id=p.asset_id
    WHERE p.interval_days IS NOT NULL AND p.last_done_at IS NOT NULL AND p.last_done_at+p.interval_days <= current_date+7
    UNION ALL
    SELECT 'insp:'||i.id, 'critical', 'maintenance', 'عيب حرج يحتاج إصلاح — '||a.code, coalesce(i.notes,'فحص به عيب حرج لم يُعالج'), 'asset', i.asset_id, NULL, 0
    FROM inspections i JOIN assets a ON a.id=i.asset_id WHERE i.has_critical AND NOT i.resolved
    UNION ALL
    SELECT 'stock:'||pt.id, 'warning', 'parts', 'مخزون منخفض: '||pt.name, format('المتوفر %s %s والحد الأدنى %s', pt.qty_on_hand, pt.unit, pt.reorder_level), NULL, NULL, NULL, 0
    FROM parts pt WHERE pt.qty_on_hand <= pt.reorder_level AND pt.reorder_level > 0
  LOOP
    k := r.key||':'||CASE WHEN r.left_days < 0 THEN 'expired' WHEN r.left_days <= 7 THEN '7' WHEN r.left_days <= 15 THEN '15' ELSE '30' END;
    INSERT INTO notifications(severity, category, title, body, entity_type, entity_id, dedupe_key)
    VALUES (r.sev, r.cat, r.title, r.body, r.et, r.eid, k) ON CONFLICT (dedupe_key) DO NOTHING RETURNING id INTO nid;
    IF nid IS NOT NULL THEN
      n := n+1;
      PERFORM wa_admins(format(E'⚠️ %s\n%s', r.title, r.body), 'critical_alert', nid);
      IF r.dphone IS NOT NULL THEN PERFORM wa_enqueue(r.dphone, format(E'⚠️ تنبيه: %s\n%s\nجدّدها وارفع الصورة الجديدة.', r.title, r.body), 'critical_alert', nid); END IF;
      nid := NULL;
    END IF;
  END LOOP;
  RETURN n;
END $function$;

CREATE OR REPLACE FUNCTION public.driver_report_delay(p_trip_id uuid, p_reason text, p_expected_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE t record; nid uuid; dn text;
BEGIN
  SELECT * INTO t FROM trips WHERE id=p_trip_id;
  IF NOT FOUND OR t.driver_id IS DISTINCT FROM current_driver_id() THEN RAISE EXCEPTION 'هذه الرحلة ليست لك'; END IF;
  IF nullif(trim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'اكتب سبب التأخير'; END IF;
  IF p_expected_at IS NULL THEN RAISE EXCEPTION 'حدد موعد الوصول المتوقع'; END IF;
  INSERT INTO delay_notices(trip_id, driver_id, reason, expected_at) VALUES (p_trip_id, t.driver_id, trim(p_reason), p_expected_at) RETURNING id INTO nid;
  SELECT full_name INTO dn FROM drivers WHERE id=t.driver_id;
  PERFORM wa_admins(format(E'⏱️ تأخير من %s\nالرحلة %s (%s ← %s)\nالسبب: %s\nالوصول المتوقع: %s', coalesce(dn,'السائق')||public.wa_phone_inline(public.driver_wa_phone(t.driver_id)), t.number, t.origin_city, t.dest_city, trim(p_reason), to_char(p_expected_at AT TIME ZONE 'Asia/Riyadh','YYYY-MM-DD HH24:MI')), 'delay_notice', nid);
  RETURN nid;
END $function$;

CREATE OR REPLACE FUNCTION public.driver_request_return(p_trip_id uuid, p_depart_at timestamp with time zone, p_notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE t record; rid uuid; dn text;
BEGIN
  SELECT * INTO t FROM trips WHERE id=p_trip_id;
  IF NOT FOUND OR t.driver_id IS DISTINCT FROM current_driver_id() THEN RAISE EXCEPTION 'هذه الرحلة ليست لك'; END IF;
  IF t.status NOT IN ('in_progress','delivered','closed') THEN RAISE EXCEPTION 'يمكن طلب الرجوع بعد بدء الرحلة'; END IF;
  IF EXISTS (SELECT 1 FROM trips WHERE parent_trip_id=p_trip_id AND empty_reason='رحلة رجوع' AND status<>'cancelled') THEN RAISE EXCEPTION 'رحلة الرجوع موجودة بالفعل'; END IF;
  IF p_depart_at IS NULL THEN RAISE EXCEPTION 'حدد موعد الرجوع'; END IF;
  INSERT INTO return_requests(trip_id, driver_id, depart_at, notes) VALUES (p_trip_id, t.driver_id, p_depart_at, nullif(trim(p_notes),'')) RETURNING id INTO rid;
  SELECT full_name INTO dn FROM drivers WHERE id=t.driver_id;
  PERFORM wa_admins(format(E'↩️ طلب رحلة رجوع من %s\nالرحلة %s (%s ← %s)\nموعد الرجوع المطلوب: %s%s\nراجع الطلب في صفحة الرحلة.', coalesce(dn,'السائق')||public.wa_phone_inline(public.driver_wa_phone(t.driver_id)), t.number, t.dest_city, t.origin_city, to_char(p_depart_at AT TIME ZONE 'Asia/Riyadh','YYYY-MM-DD HH24:MI'), coalesce(E'\nملاحظات: '||nullif(trim(p_notes),''),'')), 'return_request', rid);
  RETURN rid;
END $function$;

CREATE OR REPLACE FUNCTION public.driver_request_return_v2(p_trip_id uuid, p_depart_at timestamp with time zone, p_notes text, p_has_cargo boolean, p_cargo_description text, p_cargo_size text, p_load_level text, p_pickup_place text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  PERFORM wa_admins(format(E'↩️ طلب رحلة رجوع من %s\nالرحلة %s\nمن: %s\nموعد الرجوع: %s%s%s\nوافق أو ارفض من لوحة التحكم.', coalesce(dn,'السائق')||public.wa_phone_inline(public.driver_wa_phone(t.driver_id)), t.number,
    coalesce(nullif(trim(p_pickup_place),''), t.dest_city), to_char(p_depart_at AT TIME ZONE 'Asia/Riyadh','YYYY-MM-DD HH24:MI'), det,
    coalesce(E'\nملاحظات: '||nullif(trim(p_notes),''),'')), 'return_request', rid);
  RETURN rid;
END $function$;

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid();
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid();
CREATE POLICY "representative reads customers" ON public.customers FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'representative'));
CREATE POLICY "representative adds customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'representative') AND created_by = auth.uid());
CREATE POLICY "representative edits own customers" ON public.customers FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'representative') AND created_by = auth.uid()) WITH CHECK (public.has_role(auth.uid(), 'representative') AND created_by = auth.uid());
CREATE POLICY "representative reads locations" ON public.locations FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'representative'));
CREATE POLICY "representative adds locations" ON public.locations FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'representative') AND created_by = auth.uid());
CREATE POLICY "representative edits own locations" ON public.locations FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'representative') AND created_by = auth.uid()) WITH CHECK (public.has_role(auth.uid(), 'representative') AND created_by = auth.uid());

CREATE TABLE public.customer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE DEFAULT ('REQ-' || to_char(now() AT TIME ZONE 'Asia/Riyadh','YYMMDD') || '-' || upper(substr(md5(gen_random_uuid()::text),1,5))),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  pickup_location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  delivery_location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  delivery_city text,
  cargo_type text NOT NULL CHECK (length(trim(cargo_type)) >= 2),
  quantity numeric CHECK (quantity IS NULL OR quantity > 0),
  unit text,
  weight_kg numeric CHECK (weight_kg IS NULL OR weight_kg > 0),
  pickup_from timestamptz,
  contact_name text,
  contact_phone text,
  notes text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','converted','closed')),
  order_id uuid REFERENCES public.transport_orders(id) ON DELETE SET NULL,
  reviewed_by uuid,
  reviewed_at timestamptz,
  close_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_requests TO authenticated;
GRANT ALL ON public.customer_requests TO service_role;
ALTER TABLE public.customer_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customer requests read" ON public.customer_requests FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.has_any_role(auth.uid(), '{owner,ops_manager,dispatcher}'::public.app_role[]));
CREATE POLICY "customer requests add" ON public.customer_requests FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND status = 'new' AND public.has_any_role(auth.uid(), '{owner,ops_manager,dispatcher,representative}'::public.app_role[]));
CREATE POLICY "customer requests edit" ON public.customer_requests FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), '{owner,ops_manager,dispatcher}'::public.app_role[]) OR (created_by = auth.uid() AND status = 'new'))
  WITH CHECK (public.has_any_role(auth.uid(), '{owner,ops_manager,dispatcher}'::public.app_role[]) OR (created_by = auth.uid() AND status = 'new'));
CREATE POLICY "customer requests remove" ON public.customer_requests FOR DELETE TO authenticated
  USING (status = 'new' AND (created_by = auth.uid() OR public.has_role(auth.uid(), 'owner')));
CREATE INDEX customer_requests_status_idx ON public.customer_requests (status, created_at DESC);
CREATE INDEX customer_requests_creator_idx ON public.customer_requests (created_by, created_at DESC);

CREATE OR REPLACE FUNCTION public.customer_request_notify() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rep record; c record; lp record; msg text;
BEGIN
  SELECT full_name, phone INTO rep FROM profiles WHERE id = NEW.created_by;
  IF TG_OP = 'INSERT' THEN
    SELECT name, phone INTO c FROM customers WHERE id = NEW.customer_id;
    SELECT name, city, lat, lng INTO lp FROM locations WHERE id = NEW.pickup_location_id;
    msg := format(E'📋 طلب عميل جديد %s\nالمندوب: %s%s\nالعميل: %s%s\nالحمولة: %s%s\nمكان الاستلام: %s%s%s\nحوّله إلى أمر نقل من صفحة طلبات العملاء.',
      NEW.number, coalesce(rep.full_name, 'مندوب'), public.wa_phone_inline(rep.phone), c.name,
      public.wa_phone_line('جوال العميل', coalesce(NEW.contact_phone, c.phone)),
      NEW.cargo_type, coalesce(' — ' || NEW.quantity || ' ' || coalesce(NEW.unit,''), ''),
      coalesce(lp.name || ' — ' || coalesce(lp.city,''), 'لم يُحدد'),
      CASE WHEN lp.lat IS NOT NULL THEN E'\nالموقع: https://maps.google.com/?q=' || lp.lat || ',' || lp.lng ELSE '' END,
      coalesce(E'\nملاحظات: ' || nullif(trim(NEW.notes),''), ''));
    PERFORM wa_department(msg, 'customer_request', NEW.id);
    INSERT INTO notifications(severity, category, title, body, entity_type, entity_id, dedupe_key, status)
    VALUES ('info', 'sales', 'طلب عميل جديد ' || NEW.number, coalesce(c.name,'') || ' — ' || NEW.cargo_type, 'customer_request', NEW.id, 'customer_request:' || NEW.id, 'open')
    ON CONFLICT (dedupe_key) DO NOTHING;
  ELSIF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('converted','closed') THEN
    PERFORM wa_enqueue(rep.phone, CASE WHEN NEW.status = 'converted' THEN format(E'✅ تحوّل طلبك %s إلى أمر نقل.', NEW.number)
      ELSE format(E'ℹ️ أُغلق طلبك %s%s', NEW.number, coalesce(E'\nالسبب: ' || nullif(trim(NEW.close_reason),''), '')) END, 'customer_request_decision', NEW.id);
    UPDATE notifications SET status = 'resolved' WHERE dedupe_key = 'customer_request:' || NEW.id AND status = 'open';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.customer_request_notify() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER customer_request_notify AFTER INSERT OR UPDATE OF status ON public.customer_requests FOR EACH ROW EXECUTE FUNCTION public.customer_request_notify();

CREATE TABLE public.trip_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  seq integer NOT NULL DEFAULT 0,
  name text NOT NULL CHECK (length(trim(name)) >= 1),
  city text,
  lat double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','arrived','done','skipped')),
  arrived_at timestamptz,
  done_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_stops TO authenticated;
GRANT ALL ON public.trip_stops TO service_role;
ALTER TABLE public.trip_stops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read trip stops" ON public.trip_stops FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "dispatch adds trip stops" ON public.trip_stops FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), '{owner,ops_manager,dispatcher}'::public.app_role[]));
CREATE POLICY "dispatch edits trip stops" ON public.trip_stops FOR UPDATE TO authenticated USING (public.has_any_role(auth.uid(), '{owner,ops_manager,dispatcher}'::public.app_role[])) WITH CHECK (public.has_any_role(auth.uid(), '{owner,ops_manager,dispatcher}'::public.app_role[]));
CREATE POLICY "dispatch removes pending stops" ON public.trip_stops FOR DELETE TO authenticated USING (status = 'pending' AND public.has_any_role(auth.uid(), '{owner,ops_manager,dispatcher}'::public.app_role[]));
CREATE INDEX trip_stops_trip_idx ON public.trip_stops (trip_id, seq);

CREATE TABLE public.trip_routes (
  trip_id uuid PRIMARY KEY REFERENCES public.trips(id) ON DELETE CASCADE,
  points jsonb NOT NULL,
  distance_km numeric,
  duration_min numeric,
  provider text NOT NULL CHECK (provider IN ('ors','straight')),
  computed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.trip_routes TO authenticated;
GRANT ALL ON public.trip_routes TO service_role;
ALTER TABLE public.trip_routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read trip routes" ON public.trip_routes FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

CREATE TABLE public.trip_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('off_route','stopped')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  cleared_at timestamptz,
  lat double precision,
  lng double precision,
  distance_m numeric,
  minutes numeric,
  reason text,
  reason_at timestamptz
);
GRANT SELECT ON public.trip_alerts TO authenticated;
GRANT ALL ON public.trip_alerts TO service_role;
ALTER TABLE public.trip_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tracking staff read trip alerts" ON public.trip_alerts FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), '{owner,ops_manager,dispatcher,fleet_supervisor}'::public.app_role[]));
CREATE UNIQUE INDEX trip_alerts_open_uidx ON public.trip_alerts (trip_id, kind) WHERE cleared_at IS NULL;

CREATE OR REPLACE FUNCTION public.driver_trip_plan(p_trip_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE t record;
BEGIN
  SELECT id, driver_id INTO t FROM trips WHERE id = p_trip_id;
  IF NOT FOUND OR NOT ((t.driver_id IS NOT NULL AND t.driver_id = public.current_driver_id())
     OR public.has_any_role(auth.uid(), '{owner,ops_manager,dispatcher,fleet_supervisor}'::public.app_role[])) THEN
    RAISE EXCEPTION 'هذه الرحلة ليست لك';
  END IF;
  RETURN jsonb_build_object(
    'stops', coalesce((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'seq', s.seq, 'name', s.name, 'city', s.city, 'lat', s.lat, 'lng', s.lng, 'notes', s.notes, 'status', s.status, 'done_at', s.done_at) ORDER BY s.seq, s.created_at) FROM trip_stops s WHERE s.trip_id = p_trip_id), '[]'::jsonb),
    'route', (SELECT jsonb_build_object('points', r.points, 'distance_km', r.distance_km, 'duration_min', r.duration_min, 'provider', r.provider, 'computed_at', r.computed_at) FROM trip_routes r WHERE r.trip_id = p_trip_id),
    'alerts', coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'opened_at', a.opened_at, 'reason', a.reason)) FROM trip_alerts a WHERE a.trip_id = p_trip_id AND a.cleared_at IS NULL), '[]'::jsonb));
END $$;
REVOKE EXECUTE ON FUNCTION public.driver_trip_plan(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_trip_plan(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.driver_stop_update(p_stop_id uuid, p_status text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; t record;
BEGIN
  IF p_status NOT IN ('arrived','done','skipped') THEN RAISE EXCEPTION 'حالة غير صالحة'; END IF;
  SELECT * INTO s FROM trip_stops WHERE id = p_stop_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'النقطة غير موجودة'; END IF;
  SELECT tr.id, tr.number, tr.status, tr.driver_id, dr.full_name INTO t FROM trips tr LEFT JOIN drivers dr ON dr.id = tr.driver_id WHERE tr.id = s.trip_id;
  IF NOT ((t.driver_id IS NOT NULL AND t.driver_id = public.current_driver_id()) OR public.has_any_role(auth.uid(), '{owner,ops_manager,dispatcher}'::public.app_role[])) THEN
    RAISE EXCEPTION 'هذه الرحلة ليست لك';
  END IF;
  IF t.status::text <> 'in_progress' THEN RAISE EXCEPTION 'الرحلة ليست قيد التنفيذ'; END IF;
  IF s.status IN ('done','skipped') THEN RAISE EXCEPTION 'تم إنهاء هذه النقطة بالفعل'; END IF;
  IF p_status = 'skipped' AND NOT public.has_any_role(auth.uid(), '{owner,ops_manager,dispatcher}'::public.app_role[]) THEN RAISE EXCEPTION 'تخطي النقطة يحتاج موافقة الحركة'; END IF;
  UPDATE trip_stops SET status = p_status,
    arrived_at = coalesce(arrived_at, CASE WHEN p_status IN ('arrived','done') THEN now() END),
    done_at = CASE WHEN p_status IN ('done','skipped') THEN now() ELSE done_at END
  WHERE id = p_stop_id;
  IF p_status = 'done' THEN
    PERFORM wa_department(format(E'📦 الرحلة %s — تم التنزيل في «%s»\nالسائق: %s%s', t.number, s.name, coalesce(t.full_name,'—'),
      public.wa_phone_line('جوال السائق', public.driver_wa_phone(t.driver_id))), 'stop_done', t.id);
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.driver_stop_update(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_stop_update(uuid, text) TO authenticated;

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
    CASE a.kind WHEN 'stopped' THEN 'التوقف' ELSE 'الخروج عن المسار' END, left(trim(p_reason), 300), coalesce(t.full_name,'—'),
    public.wa_phone_line('جوال السائق', public.driver_wa_phone(t.driver_id))), CASE a.kind WHEN 'stopped' THEN 'vehicle_stopped' ELSE 'off_route' END, a.trip_id);
END $$;
REVOKE EXECUTE ON FUNCTION public.driver_explain_alert(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_explain_alert(uuid, text) TO authenticated;

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
    ELSE format(E'⚠️ المركبة %s خرجت عن المسار المخطط بمسافة %s كم\nالرحلة: %s\nالسائق: %s%s', coalesce(t.code,'—'), round(coalesce(p_distance_m,0) / 1000.0, 1), t.number, coalesce(t.full_name,'—'), public.wa_phone_line('جوال السائق', ph)) END
    || CASE WHEN p_lat IS NOT NULL THEN E'\nآخر موقع: https://maps.google.com/?q=' || round(p_lat::numeric, 5) || ',' || round(p_lng::numeric, 5) ELSE '' END;
  PERFORM wa_department(msg, CASE p_kind WHEN 'stopped' THEN 'vehicle_stopped' ELSE 'off_route' END, p_trip_id);
  PERFORM wa_enqueue(ph, CASE p_kind WHEN 'stopped' THEN format(E'لاحظنا توقف المركبة في الرحلة %s. إن كان هناك سبب اكتبه في صفحة السائق ليصل للإدارة.', t.number)
    ELSE format(E'لاحظنا خروجك عن المسار المخطط للرحلة %s. افتح الخريطة في صفحة السائق للعودة للمسار أو اكتب السبب.', t.number) END, p_kind, p_trip_id);
  INSERT INTO notifications(severity, category, title, body, entity_type, entity_id, dedupe_key, status)
  VALUES ('warning', 'tracking', CASE p_kind WHEN 'stopped' THEN 'توقف مركبة ' ELSE 'خروج عن المسار ' END || coalesce(t.code,''), t.number || ' — ' || coalesce(t.full_name,''), 'trip', p_trip_id, 'trip_alert:' || nid, 'open')
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION public.open_trip_alert(uuid, text, double precision, double precision, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.open_trip_alert(uuid, text, double precision, double precision, numeric, numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.clear_trip_alert(p_trip_id uuid, p_kind text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record;
BEGIN
  FOR a IN UPDATE trip_alerts SET cleared_at = now() WHERE trip_id = p_trip_id AND (p_kind IS NULL OR kind = p_kind) AND cleared_at IS NULL RETURNING id LOOP
    UPDATE notifications SET status = 'resolved' WHERE dedupe_key = 'trip_alert:' || a.id AND status = 'open';
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.clear_trip_alert(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_trip_alert(uuid, text) TO service_role;