CREATE OR REPLACE FUNCTION public.current_driver_id()
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT d.id FROM public.drivers d
  WHERE d.user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'driver')
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.customer_terms_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.payment_terms_days IS DISTINCT FROM OLD.payment_terms_days
     AND NOT public.has_any_role(auth.uid(), '{owner,ops_manager,accountant}'::app_role[]) THEN
    RAISE EXCEPTION 'تعديل مدة السداد للإدارة أو المالية فقط';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.customer_terms_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS customer_terms_guard ON public.customers;
CREATE TRIGGER customer_terms_guard BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.customer_terms_guard();

ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS uploaded_by uuid;

CREATE POLICY "self upload own documents" ON public.documents FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid() AND review_status = 'pending' AND (
    (entity_type = 'driver' AND entity_id = public.current_driver_id())
    OR (entity_type = 'employee' AND entity_id = auth.uid())
  )
);
CREATE POLICY "self read own documents" ON public.documents FOR SELECT TO authenticated
USING (uploaded_by = auth.uid() OR (entity_type = 'employee' AND entity_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.document_self_upload_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_any_role(auth.uid(), '{owner,ops_manager,fleet_supervisor}'::app_role[]) THEN
    NEW.review_status := 'pending';
    NEW.uploaded_by := auth.uid();
    INSERT INTO public.notifications(severity, category, title, body, entity_type, entity_id, dedupe_key, status)
    VALUES ('info', 'documents', 'مستند جديد بانتظار المراجعة', coalesce(NEW.doc_type,'مستند'), 'document', NEW.id, 'doc-review:'||NEW.id, 'open');
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.document_self_upload_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS document_self_upload_guard ON public.documents;
CREATE TRIGGER document_self_upload_guard BEFORE INSERT ON public.documents FOR EACH ROW EXECUTE FUNCTION public.document_self_upload_guard();

CREATE OR REPLACE FUNCTION public.custody_assigned_notice()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE ph text; code text;
BEGIN
  IF NEW.driver_id IS NULL OR NEW.acknowledged THEN RETURN NEW; END IF;
  ph := public.driver_wa_phone(NEW.driver_id);
  SELECT a.code INTO code FROM public.assets a WHERE a.id = NEW.asset_id;
  IF ph IS NOT NULL THEN
    PERFORM public.wa_enqueue(ph, '🚚 تم تسليمك عهدة: ' || coalesce(code,'مركبة') || E'\nادخل إلى التطبيق واضغط «إقرار الاستلام» لتأكيد استلامها.', 'custody_assigned', NEW.id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.custody_assigned_notice() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS custody_assigned_notice ON public.custody;
CREATE TRIGGER custody_assigned_notice AFTER INSERT ON public.custody FOR EACH ROW EXECUTE FUNCTION public.custody_assigned_notice();