CREATE TABLE public.whatsapp_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event text NOT NULL,
  entity_id uuid,
  phone text NOT NULL,
  body text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sending','accepted','failed','unresolved')),
  provider_id text,
  attempts int NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  accepted_at timestamptz
);
GRANT SELECT ON public.whatsapp_outbox TO authenticated;
GRANT ALL ON public.whatsapp_outbox TO service_role;
ALTER TABLE public.whatsapp_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read wa outbox" ON public.whatsapp_outbox FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), '{owner,ops_manager}'::public.app_role[]));
CREATE INDEX whatsapp_outbox_pending ON public.whatsapp_outbox(state, created_at);

CREATE OR REPLACE FUNCTION public.wa_norm(p text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT CASE WHEN d ~ '^05\d{8}$' THEN '966'||substr(d,2) WHEN d ~ '^5\d{8}$' THEN '966'||d ELSE d END
  FROM (SELECT regexp_replace(coalesce(p,''),'\D','','g') d) x $$;

CREATE OR REPLACE FUNCTION public.wa_enqueue(p_phone text, p_body text, p_event text, p_entity uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n text := public.wa_norm(p_phone);
BEGIN
  IF n ~ '^[1-9]\d{8,14}$' AND NOT EXISTS (SELECT 1 FROM whatsapp_outbox WHERE phone=n AND event=p_event AND entity_id IS NOT DISTINCT FROM p_entity AND body=p_body AND created_at > now()-interval '2 minutes') THEN
    INSERT INTO whatsapp_outbox(event, entity_id, phone, body) VALUES (p_event, p_entity, n, p_body);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.wa_admins(p_body text, p_event text, p_entity uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT public.wa_norm(p.phone) ph FROM profiles p JOIN user_roles ur ON ur.user_id=p.id
    WHERE ur.role IN ('owner','ops_manager') AND p.phone IS NOT NULL LOOP
    PERFORM public.wa_enqueue(r.ph, p_body, p_event, p_entity);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.wa_enqueue(text,text,text,uuid), public.wa_admins(text,text,uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.wa_trip_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d record; msg text;
BEGIN
  SELECT full_name, phone INTO d FROM drivers WHERE id = NEW.driver_id;
  IF NEW.driver_id IS NOT NULL AND (TG_OP='INSERT' OR OLD.driver_id IS DISTINCT FROM NEW.driver_id) THEN
    msg := format(E'🚚 رحلة جديدة %s\nمن: %s إلى: %s\nموعد التحميل: %s\nافتح تطبيق Shata للتفاصيل.', NEW.number, NEW.origin_city, NEW.dest_city, coalesce(to_char(NEW.planned_start AT TIME ZONE 'Asia/Riyadh','YYYY-MM-DD HH24:MI'),'—'));
    PERFORM wa_enqueue(d.phone, format(E'مرحبًا %s\n', coalesce(d.full_name,''))||msg, 'trip_assigned', NEW.id);
    PERFORM wa_admins(format(E'تم تكليف %s بالرحلة %s (%s ← %s)', coalesce(d.full_name,'سائق'), NEW.number, NEW.origin_city, NEW.dest_city), 'trip_assigned', NEW.id);
  END IF;
  IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    msg := format(E'تحديث الرحلة %s: الحالة أصبحت «%s»\nالسائق: %s', NEW.number, NEW.status, coalesce(d.full_name,'—'));
    PERFORM wa_admins(msg, 'trip_status', NEW.id);
    PERFORM wa_enqueue(d.phone, msg, 'trip_status', NEW.id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER wa_trip AFTER INSERT OR UPDATE ON public.trips FOR EACH ROW EXECUTE FUNCTION public.wa_trip_trigger();

CREATE OR REPLACE FUNCTION public.wa_trip_event_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t record;
BEGIN
  SELECT tr.number, dr.full_name INTO t FROM trips tr LEFT JOIN drivers dr ON dr.id=tr.driver_id WHERE tr.id=NEW.trip_id;
  PERFORM wa_admins(format(E'📍 الرحلة %s — حدث: %s\nالسائق: %s%s', t.number, NEW.event_type, coalesce(t.full_name,'—'), coalesce(E'\nملاحظة: '||NEW.notes,'')), 'trip_event', NEW.trip_id);
  RETURN NEW;
END $$;
CREATE TRIGGER wa_trip_event AFTER INSERT ON public.trip_events FOR EACH ROW EXECUTE FUNCTION public.wa_trip_event_trigger();

CREATE OR REPLACE FUNCTION public.wa_order_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c text;
BEGIN
  SELECT name INTO c FROM customers WHERE id=NEW.customer_id;
  PERFORM wa_admins(format(E'📄 أمر نقل جديد %s\nالعميل: %s\nالحمولة: %s', NEW.number, coalesce(c,'—'), coalesce(NEW.cargo_type,'—')), 'order_created', NEW.id);
  RETURN NEW;
END $$;
CREATE TRIGGER wa_order AFTER INSERT ON public.transport_orders FOR EACH ROW EXECUTE FUNCTION public.wa_order_trigger();

CREATE OR REPLACE FUNCTION public.wa_incident_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d record; msg text;
BEGIN
  SELECT full_name, phone INTO d FROM drivers WHERE id=NEW.driver_id;
  msg := format(E'🚨 بلاغ %s (%s) — خطورة: %s\nالسائق: %s\n%s', NEW.number, NEW.kind, NEW.severity, coalesce(d.full_name,'—'), coalesce(NEW.description,''));
  PERFORM wa_admins(msg, 'incident', NEW.id);
  PERFORM wa_enqueue(d.phone, E'تم استلام بلاغك وسيتم التواصل معك.\n'||msg, 'incident', NEW.id);
  RETURN NEW;
END $$;
CREATE TRIGGER wa_incident AFTER INSERT ON public.incidents FOR EACH ROW EXECUTE FUNCTION public.wa_incident_trigger();

CREATE OR REPLACE FUNCTION public.wa_money_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE dn text;
BEGIN
  SELECT full_name INTO dn FROM drivers WHERE id=NEW.driver_id;
  IF TG_TABLE_NAME='fuel_entries' THEN
    PERFORM wa_admins(format(E'⛽ تعبئة ديزل: %s لتر — %s ر.س\nالسائق: %s', NEW.liters, NEW.amount, coalesce(dn,'—')), 'fuel', NEW.id);
  ELSE
    PERFORM wa_admins(format(E'🧾 مصروف للمراجعة: %s ر.س (%s)\nالسائق: %s', NEW.amount, NEW.category, coalesce(dn,'—')), 'expense', NEW.id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER wa_fuel AFTER INSERT ON public.fuel_entries FOR EACH ROW EXECUTE FUNCTION public.wa_money_trigger();
CREATE TRIGGER wa_expense AFTER INSERT ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.wa_money_trigger();

CREATE OR REPLACE FUNCTION public.claim_whatsapp_message(p_id uuid) RETURNS SETOF public.whatsapp_outbox
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  UPDATE whatsapp_outbox SET state='sending', claimed_at=now(), attempts=attempts+1
  WHERE id=p_id AND state IN ('pending','failed') AND attempts < 5 RETURNING * $$;
REVOKE ALL ON FUNCTION public.claim_whatsapp_message(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_message(uuid) TO service_role;