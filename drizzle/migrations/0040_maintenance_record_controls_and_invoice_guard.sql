ALTER TABLE public.workshops ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE OR REPLACE FUNCTION public.workshop_remove(p_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_open int; v_any int;
BEGIN
  IF NOT public.has_any_role(auth.uid(), '{owner,maintenance}') THEN RAISE EXCEPTION 'حذف الورش متاح للمدير العام ومسؤول الصيانة فقط'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workshops WHERE id = p_id) THEN RAISE EXCEPTION 'الورشة غير موجودة'; END IF;
  SELECT count(*) FILTER (WHERE workflow_status NOT IN ('closed','rejected')), count(*) INTO v_open, v_any FROM public.work_orders WHERE workshop_id = p_id;
  IF v_open > 0 THEN RAISE EXCEPTION 'الورشة عليها أوامر صيانة مفتوحة؛ أغلقها أو أعد إسنادها قبل الحذف'; END IF;
  DELETE FROM public.workshop_members WHERE workshop_id = p_id;
  IF v_any > 0 THEN
    UPDATE public.workshops SET archived_at = now() WHERE id = p_id;
    RETURN 'archived';
  END IF;
  DELETE FROM public.workshops WHERE id = p_id;
  RETURN 'deleted';
END $$;

CREATE OR REPLACE FUNCTION public.work_order_edit(p_id uuid, p_description text, p_severity text, p_expected_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.work_orders;
BEGIN
  SELECT * INTO w FROM public.work_orders WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'أمر الصيانة غير موجود'; END IF;
  IF w.workflow_status IN ('closed','rejected') THEN RAISE EXCEPTION 'لا يمكن تعديل أمر مغلق أو مرفوض'; END IF;
  IF NOT (public.has_any_role(auth.uid(), '{owner,ops_manager,maintenance}')
          OR (w.requested_by = auth.uid() AND w.workflow_status IN ('review','returned'))) THEN
    RAISE EXCEPTION 'يمكنك تعديل بلاغك فقط قبل اعتماده';
  END IF;
  IF length(trim(coalesce(p_description,''))) < 5 OR p_severity NOT IN ('normal','urgent','critical') THEN RAISE EXCEPTION 'وصف البلاغ والخطورة مطلوبان'; END IF;
  UPDATE public.work_orders SET description = trim(p_description), severity = p_severity, expected_at = p_expected_at WHERE id = p_id;
  INSERT INTO public.maintenance_history(work_order_id, from_status, to_status, note, actor)
  VALUES (p_id, w.workflow_status, w.workflow_status, 'تعديل بيانات البلاغ', auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.work_order_delete(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.work_orders;
BEGIN
  SELECT * INTO w FROM public.work_orders WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'أمر الصيانة غير موجود'; END IF;
  IF NOT (public.has_any_role(auth.uid(), '{owner,ops_manager,maintenance}')
          OR (w.requested_by = auth.uid() AND w.workflow_status IN ('review','returned'))) THEN
    RAISE EXCEPTION 'يمكنك حذف بلاغك فقط قبل اعتماده';
  END IF;
  IF w.workflow_status NOT IN ('review','returned','rejected','approved','assigned') THEN
    RAISE EXCEPTION 'بدأ العمل على هذا الأمر؛ لا يُحذف حفاظًا على السجل. استخدم الرفض أو الإغلاق بدلًا من الحذف';
  END IF;
  IF EXISTS (SELECT 1 FROM public.work_order_lines WHERE work_order_id = p_id)
     OR EXISTS (SELECT 1 FROM public.stock_moves WHERE work_order_id = p_id)
     OR EXISTS (SELECT 1 FROM public.maintenance_wallet_entries WHERE work_order_id = p_id) THEN
    RAISE EXCEPTION 'على الأمر تكاليف أو قطع أو قيود عهدة؛ لا يُحذف حفاظًا على السجل المالي';
  END IF;
  DELETE FROM public.maintenance_history WHERE work_order_id = p_id;
  DELETE FROM public.notifications WHERE entity_type = 'work_orders' AND entity_id = p_id;
  DELETE FROM public.work_orders WHERE id = p_id;
END $$;

REVOKE ALL ON FUNCTION public.workshop_remove(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.work_order_edit(uuid, text, text, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.work_order_delete(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workshop_remove(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.work_order_edit(uuid, text, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.work_order_delete(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_invoice_from_trips(p_customer_id uuid, p_trip_ids uuid[], p_discount numeric DEFAULT 0)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE inv_id uuid; sub numeric; rate numeric; terms int; cnt int;
BEGIN
  IF NOT public.has_any_role(auth.uid(), '{owner,accountant}') THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT count(*) INTO cnt FROM public.trips t JOIN public.transport_orders o ON o.id = t.order_id
   WHERE t.id = ANY(p_trip_ids) AND o.customer_id = p_customer_id AND t.status IN ('delivered','closed');
  IF cnt <> array_length(p_trip_ids,1) THEN RAISE EXCEPTION 'كل الرحلات يجب أن تكون مسلّمة وتابعة لنفس العميل'; END IF;
  IF EXISTS (SELECT 1 FROM public.invoice_lines WHERE trip_id = ANY(p_trip_ids)) THEN RAISE EXCEPTION 'إحدى الرحلات مفوترة مسبقًا'; END IF;
  IF EXISTS (SELECT 1 FROM public.trips t LEFT JOIN public.trip_financials f ON f.trip_id = t.id WHERE t.id = ANY(p_trip_ids) AND COALESCE(f.revenue,0) <= 0) THEN
    RAISE EXCEPTION 'سعر إحدى الرحلات صفر؛ أدخل سعر أمر النقل قبل الفوترة';
  END IF;
  IF COALESCE(p_discount,0) < 0 THEN RAISE EXCEPTION 'الخصم لا يكون بالسالب'; END IF;
  SELECT vat_rate INTO rate FROM public.company_settings WHERE id = 1;
  SELECT payment_terms_days INTO terms FROM public.customers WHERE id = p_customer_id;
  INSERT INTO public.invoices(customer_id, due_at, vat_rate) VALUES (p_customer_id, current_date + COALESCE(terms,30), COALESCE(rate,15)) RETURNING id INTO inv_id;
  INSERT INTO public.invoice_lines(invoice_id, trip_id, description, amount)
  SELECT inv_id, t.id, 'نقل ' || t.origin_city || ' → ' || t.dest_city || ' (' || t.number || ')', COALESCE(f.revenue,0)
  FROM public.trips t LEFT JOIN public.trip_financials f ON f.trip_id = t.id WHERE t.id = ANY(p_trip_ids);
  SELECT sum(amount) INTO sub FROM public.invoice_lines WHERE invoice_id = inv_id;
  IF COALESCE(p_discount,0) > sub THEN RAISE EXCEPTION 'الخصم أكبر من قيمة الفاتورة'; END IF;
  UPDATE public.invoices SET subtotal = sub, discount = COALESCE(p_discount,0),
    vat = round((sub - COALESCE(p_discount,0)) * COALESCE(rate,15) / 100, 2),
    total = round((sub - COALESCE(p_discount,0)) * (1 + COALESCE(rate,15) / 100), 2)
  WHERE id = inv_id;
  RETURN inv_id;
END $function$;