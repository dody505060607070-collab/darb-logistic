CREATE OR REPLACE FUNCTION public.set_work_order_status(p_id uuid, p_status text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w record;
BEGIN
  IF NOT public.has_any_role(auth.uid(), '{owner,ops_manager,maintenance}') THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF p_status NOT IN ('open','diagnosis','waiting_parts','in_progress','completed','closed') THEN RAISE EXCEPTION 'حالة غير صحيحة'; END IF;
  SELECT * INTO w FROM public.work_orders WHERE id = p_id FOR UPDATE;
  IF w.status = 'closed' THEN RAISE EXCEPTION 'أمر العمل مغلق'; END IF;
  UPDATE public.work_orders SET status = p_status, closed_at = CASE WHEN p_status IN ('completed','closed') THEN now() ELSE NULL END WHERE id = p_id;
  IF p_status IN ('diagnosis','waiting_parts','in_progress') THEN
    UPDATE public.assets SET status = 'maintenance' WHERE id = w.asset_id AND status <> 'active';
  ELSIF p_status IN ('completed','closed') THEN
    -- asset stays stopped if it has an unresolved critical defect; re-inspection required
    UPDATE public.assets SET status = CASE WHEN EXISTS (SELECT 1 FROM public.inspections WHERE asset_id = w.asset_id AND has_critical AND NOT resolved) THEN 'stopped' ELSE 'available' END
    WHERE id = w.asset_id AND status IN ('maintenance','stopped')
      AND NOT EXISTS (SELECT 1 FROM public.work_orders o WHERE o.asset_id = w.asset_id AND o.id <> p_id AND o.status NOT IN ('completed','closed'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.reinspect_ok(p_inspection_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i record;
BEGIN
  IF NOT public.has_any_role(auth.uid(), '{owner,ops_manager,maintenance,fleet_supervisor}') THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT * INTO i FROM public.inspections WHERE id = p_inspection_id FOR UPDATE;
  IF NOT i.has_critical OR i.resolved THEN RAISE EXCEPTION 'لا يوجد عيب حرج مفتوح'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.work_orders WHERE inspection_id = p_inspection_id AND status IN ('completed','closed')) THEN
    RAISE EXCEPTION 'يجب إكمال أمر العمل المرتبط بالعيب قبل إعادة الفحص';
  END IF;
  INSERT INTO public.inspections(asset_id, kind, template_version, items, notes)
  SELECT i.asset_id, 're_inspection', i.template_version,
    (SELECT jsonb_agg(jsonb_build_object('key', e->>'key', 'label', e->>'label', 'result', 'ok')) FROM jsonb_array_elements(i.items) e),
    'إعادة فحص بعد الإصلاح للفحص ' || i.id;
  UPDATE public.inspections SET resolved = true WHERE id = p_inspection_id;
  UPDATE public.assets SET status = 'available' WHERE id = i.asset_id AND status = 'stopped'
    AND NOT EXISTS (SELECT 1 FROM public.inspections WHERE asset_id = i.asset_id AND has_critical AND NOT resolved);
  UPDATE public.notifications SET status = 'resolved' WHERE dedupe_key = 'insp-crit-' || p_inspection_id;
END $$;

-- prevent duplicate expense submissions with same driver/trip/category/amount within 10 minutes
CREATE OR REPLACE FUNCTION public.expense_dedupe() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.expenses WHERE driver_id = NEW.driver_id AND trip_id IS NOT DISTINCT FROM NEW.trip_id
     AND category = NEW.category AND amount = NEW.amount AND abs(extract(epoch FROM (spent_at - NEW.spent_at))) < 600 AND id <> NEW.id) THEN
    RAISE EXCEPTION 'مصروف مكرر: نفس الفئة والمبلغ خلال 10 دقائق';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER expense_dedupe BEFORE INSERT ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.expense_dedupe();

GRANT EXECUTE ON FUNCTION public.set_work_order_status, public.reinspect_ok TO authenticated;
