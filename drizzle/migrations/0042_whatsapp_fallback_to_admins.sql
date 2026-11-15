CREATE OR REPLACE FUNCTION public.wa_event_roles(p_event text, p_critical boolean DEFAULT false)
 RETURNS app_role[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
 SELECT (CASE
 WHEN p_event IN ('maintenance_request','workshop_intake','workshop_report','maintenance_state') THEN ARRAY['maintenance']
 WHEN p_event IN ('fuel','expense','wallet_request') THEN ARRAY['accountant']
 WHEN p_event IN ('trip_assigned','trip_status','trip_event') THEN ARRAY['dispatcher','fleet_supervisor']
 WHEN p_event IN ('order_created','trip_created','return_request','delay_notice') THEN ARRAY['dispatcher','ops_manager']
 WHEN p_event='incident' THEN ARRAY['maintenance','fleet_supervisor','ops_manager']
 WHEN p_event='critical_maintenance' THEN ARRAY['maintenance','fleet_supervisor']
 WHEN p_event IN ('document_alert','critical_alert') THEN ARRAY['fleet_supervisor']
 WHEN p_event IN ('maintenance_alert','stock_alert') THEN ARRAY['maintenance']
 ELSE ARRAY[]::text[] END || CASE WHEN p_critical THEN ARRAY['owner'] ELSE ARRAY[]::text[] END)::public.app_role[] $function$;

-- Department notices fall back to general managers when nobody in the department has a phone yet.
CREATE OR REPLACE FUNCTION public.wa_department(p_body text, p_event text, p_entity uuid, p_critical boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record; roles app_role[] := public.wa_event_roles(p_event,p_critical); n int := 0;
BEGIN
 IF cardinality(roles) = 0 THEN RETURN; END IF;
 FOR r IN SELECT DISTINCT p.phone FROM profiles p JOIN user_roles ur ON ur.user_id=p.id
          WHERE ur.role=ANY(roles) AND nullif(trim(p.phone),'') IS NOT NULL LOOP
   PERFORM wa_enqueue(r.phone,p_body,p_event,p_entity); n := n + 1;
 END LOOP;
 IF n = 0 THEN
   FOR r IN SELECT DISTINCT p.phone FROM profiles p JOIN user_roles ur ON ur.user_id=p.id
            WHERE ur.role='owner' AND nullif(trim(p.phone),'') IS NOT NULL LOOP
     PERFORM wa_enqueue(r.phone,p_body,p_event,p_entity);
   END LOOP;
 END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.wa_trip_status_label(s text)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
 SELECT CASE s WHEN 'draft' THEN 'مسودة' WHEN 'planned' THEN 'مخططة' WHEN 'ready' THEN 'جاهزة'
   WHEN 'in_progress' THEN 'قيد التنفيذ' WHEN 'delivered' THEN 'تم التسليم'
   WHEN 'closed' THEN 'مغلقة تشغيليًا' WHEN 'cancelled' THEN 'ملغاة' ELSE coalesce(s,'—') END $function$;

CREATE OR REPLACE FUNCTION public.wa_trip_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE d record; msg text;
BEGIN
  SELECT full_name, phone INTO d FROM drivers WHERE id = NEW.driver_id;
  IF TG_OP='INSERT' AND NEW.driver_id IS NULL THEN
    PERFORM wa_admins(format(E'🚚 رحلة جديدة %s (%s ← %s)\nموعد التحميل: %s\nبانتظار تعيين سائق.', NEW.number, coalesce(NEW.origin_city,'—'), coalesce(NEW.dest_city,'—'), coalesce(to_char(NEW.planned_start AT TIME ZONE 'Asia/Riyadh','YYYY-MM-DD HH24:MI'),'—')), 'trip_created', NEW.id);
  END IF;
  IF NEW.driver_id IS NOT NULL AND (TG_OP='INSERT' OR OLD.driver_id IS DISTINCT FROM NEW.driver_id) THEN
    msg := format(E'🚚 رحلة جديدة %s\nمن: %s إلى: %s\nموعد التحميل: %s\nافتح تطبيق Shata للتفاصيل.', NEW.number, NEW.origin_city, NEW.dest_city, coalesce(to_char(NEW.planned_start AT TIME ZONE 'Asia/Riyadh','YYYY-MM-DD HH24:MI'),'—'));
    PERFORM wa_enqueue(d.phone, format(E'مرحبًا %s\n', coalesce(d.full_name,''))||msg, 'trip_assigned', NEW.id);
    PERFORM wa_admins(format(E'تم تكليف %s بالرحلة %s (%s ← %s)', coalesce(d.full_name,'سائق'), NEW.number, NEW.origin_city, NEW.dest_city), 'trip_assigned', NEW.id);
  END IF;
  IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    msg := format(E'تحديث الرحلة %s: الحالة أصبحت «%s»\nالسائق: %s', NEW.number, public.wa_trip_status_label(NEW.status::text), coalesce(d.full_name,'—'));
    PERFORM wa_admins(msg, 'trip_status', NEW.id);
    PERFORM wa_enqueue(d.phone, msg, 'trip_status', NEW.id);
  END IF;
  RETURN NEW;
END $function$;

REVOKE EXECUTE ON FUNCTION public.wa_department(text,text,uuid,boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.wa_trip_status_label(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.wa_trip_trigger() FROM PUBLIC, anon, authenticated;