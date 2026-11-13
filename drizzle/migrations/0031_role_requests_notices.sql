CREATE TABLE public.delay_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id),
  driver_id uuid NOT NULL REFERENCES public.drivers(id),
  reason text NOT NULL,
  expected_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','acknowledged')),
  reply text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.delay_notices TO authenticated;
GRANT ALL ON public.delay_notices TO service_role;
ALTER TABLE public.delay_notices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "delay notices read" ON public.delay_notices FOR SELECT TO authenticated
  USING (driver_id = public.current_driver_id() OR public.has_any_role(auth.uid(), '{owner,ops_manager,dispatcher,fleet_supervisor}'::public.app_role[]));

CREATE OR REPLACE FUNCTION public.driver_report_delay(p_trip_id uuid, p_reason text, p_expected_at timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t record; nid uuid; dn text;
BEGIN
  SELECT * INTO t FROM trips WHERE id=p_trip_id;
  IF NOT FOUND OR t.driver_id IS DISTINCT FROM current_driver_id() THEN RAISE EXCEPTION 'هذه الرحلة ليست لك'; END IF;
  IF nullif(trim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'اكتب سبب التأخير'; END IF;
  IF p_expected_at IS NULL THEN RAISE EXCEPTION 'حدد موعد الوصول المتوقع'; END IF;
  INSERT INTO delay_notices(trip_id, driver_id, reason, expected_at) VALUES (p_trip_id, t.driver_id, trim(p_reason), p_expected_at) RETURNING id INTO nid;
  SELECT full_name INTO dn FROM drivers WHERE id=t.driver_id;
  PERFORM wa_admins(format(E'⏱️ تأخير من %s\nالرحلة %s (%s ← %s)\nالسبب: %s\nالوصول المتوقع: %s', coalesce(dn,'السائق'), t.number, t.origin_city, t.dest_city, trim(p_reason), to_char(p_expected_at AT TIME ZONE 'Asia/Riyadh','YYYY-MM-DD HH24:MI')), 'delay_notice', nid);
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.acknowledge_delay(p_id uuid, p_reply text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; dp text;
BEGIN
  IF NOT has_any_role(auth.uid(), '{owner,ops_manager,dispatcher}') THEN RAISE EXCEPTION 'ليست لديك صلاحية'; END IF;
  UPDATE delay_notices SET status='acknowledged', reply=nullif(trim(p_reply),''), reviewed_by=auth.uid(), reviewed_at=now() WHERE id=p_id AND status='pending' RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'الإشعار غير موجود أو تمت مراجعته'; END IF;
  SELECT phone INTO dp FROM drivers WHERE id=r.driver_id;
  PERFORM wa_enqueue(dp, format(E'✅ استلمت الإدارة إشعار التأخير%s', coalesce(E'\nرد الإدارة: '||nullif(trim(p_reply),''),'')), 'delay_ack', r.id);
END $$;

REVOKE ALL ON FUNCTION public.driver_report_delay(uuid,text,timestamptz), public.acknowledge_delay(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_report_delay(uuid,text,timestamptz), public.acknowledge_delay(uuid,text) TO authenticated;

-- Tell the sender the decision (with reason) when an expense, wallet entry or work order is reviewed.
CREATE OR REPLACE FUNCTION public.wa_decision_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ph text;
BEGIN
  IF TG_TABLE_NAME='expenses' THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved','rejected') THEN
      SELECT phone INTO ph FROM drivers WHERE id=NEW.driver_id;
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
END $$;
REVOKE ALL ON FUNCTION public.wa_decision_trigger() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER wa_expense_decision AFTER UPDATE OF status ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.wa_decision_trigger();
CREATE TRIGGER wa_wallet_decision AFTER UPDATE OF status ON public.maintenance_wallet_entries FOR EACH ROW EXECUTE FUNCTION public.wa_decision_trigger();
CREATE TRIGGER wa_work_order_decision AFTER UPDATE OF workflow_status ON public.work_orders FOR EACH ROW EXECUTE FUNCTION public.wa_decision_trigger();