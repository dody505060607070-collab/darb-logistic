CREATE TABLE public.work_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES public.work_orders(id),
  kind text NOT NULL CHECK (kind IN ('part','labor','other')),
  description text NOT NULL,
  qty numeric NOT NULL DEFAULT 1 CHECK (qty > 0),
  unit_price numeric NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.work_order_lines TO authenticated;
GRANT ALL ON public.work_order_lines TO service_role;
ALTER TABLE public.work_order_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "work order lines read" ON public.work_order_lines FOR SELECT TO authenticated USING (public.can_access_work_order(work_order_id));

ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS work_done text, ADD COLUMN IF NOT EXISTS odometer_km numeric, ADD COLUMN IF NOT EXISTS warranty_days integer;

-- Workshop / technician files what was actually done: technician, work, parts lines, labour, photos, invoice.
CREATE OR REPLACE FUNCTION public.workshop_job_report(p_id uuid, p_technician text, p_work_done text, p_lines jsonb, p_photos text[], p_invoice text, p_odometer numeric, p_warranty_days integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w record; l jsonb; parts numeric := 0; labor numeric := 0; total numeric; nxt text;
BEGIN
  IF NOT can_access_work_order(p_id) OR NOT has_any_role(auth.uid(), '{owner,ops_manager,maintenance,workshop,field_maintenance}') THEN RAISE EXCEPTION 'ليست لديك صلاحية'; END IF;
  SELECT * INTO w FROM work_orders WHERE id=p_id FOR UPDATE;
  IF w.workflow_status NOT IN ('approved','assigned','repairing','waiting_parts','waiting') THEN RAISE EXCEPTION 'لا يمكن تسجيل العمل في هذه المرحلة'; END IF;
  IF length(trim(coalesce(p_work_done,''))) < 3 THEN RAISE EXCEPTION 'اكتب ما تم عمله'; END IF;
  IF jsonb_typeof(coalesce(p_lines,'[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'بنود غير صالحة'; END IF;
  DELETE FROM work_order_lines WHERE work_order_id=p_id;
  FOR l IN SELECT * FROM jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) LOOP
    IF nullif(trim(l->>'description'),'') IS NULL OR coalesce((l->>'qty')::numeric,0) <= 0 OR coalesce((l->>'unit_price')::numeric,-1) < 0 THEN RAISE EXCEPTION 'راجع بنود القطع والأجور'; END IF;
    INSERT INTO work_order_lines(work_order_id, kind, description, qty, unit_price, created_by)
    VALUES (p_id, coalesce(nullif(l->>'kind',''),'part'), trim(l->>'description'), (l->>'qty')::numeric, (l->>'unit_price')::numeric, auth.uid());
    IF l->>'kind'='labor' THEN labor := labor + (l->>'qty')::numeric*(l->>'unit_price')::numeric;
    ELSE parts := parts + (l->>'qty')::numeric*(l->>'unit_price')::numeric; END IF;
  END LOOP;
  total := round(parts+labor, 2);
  UPDATE work_orders SET technician=nullif(trim(p_technician),''), work_done=trim(p_work_done), diagnosis=coalesce(diagnosis, trim(p_work_done)),
    parts_cost=round(parts,2), labor_cost=round(labor,2), estimate=total, vendor_invoice_ref=coalesce(nullif(trim(p_invoice),''), vendor_invoice_ref),
    photo_paths=photo_paths || coalesce(p_photos,'{}'), odometer_km=p_odometer, warranty_days=p_warranty_days
  WHERE id=p_id;
  IF w.workflow_status='repairing' OR w.workflow_status='waiting_parts' THEN
    nxt := CASE WHEN total > coalesce(w.approved_budget,0) THEN 'additional_review' ELSE 'ready_delivery' END;
    PERFORM maintenance_transition(p_id, nxt, format('تقرير الورشة: %s — الإجمالي %s ر.س', trim(p_work_done), total), NULL, NULL, NULL);
  END IF;
  PERFORM wa_admins(format(E'🔧 تقرير عمل %s\nما تم: %s\nقطع: %s ر.س — أجور: %s ر.س — الإجمالي: %s ر.س%s', w.number, trim(p_work_done), round(parts,2), round(labor,2), total,
    CASE WHEN total > coalesce(w.approved_budget,0) THEN E'\n⚠️ يتجاوز المعتمد ويحتاج موافقة' ELSE '' END), 'workshop_report', p_id);
  RETURN jsonb_build_object('parts', round(parts,2), 'labor', round(labor,2), 'total', total, 'next', nxt);
END $$;
REVOKE ALL ON FUNCTION public.workshop_job_report(uuid,text,text,jsonb,text[],text,numeric,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workshop_job_report(uuid,text,text,jsonb,text[],text,numeric,integer) TO authenticated;