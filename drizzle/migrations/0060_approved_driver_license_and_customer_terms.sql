CREATE OR REPLACE FUNCTION public.customer_terms_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NOT public.has_any_role(auth.uid(), '{owner,ops_manager,accountant}'::public.app_role[]) THEN
  IF TG_OP = 'INSERT' THEN
   IF NEW.payment_terms_days IS DISTINCT FROM 30 THEN RAISE EXCEPTION 'تحديد مدة السداد للإدارة أو المالية فقط'; END IF;
  ELSIF NEW.payment_terms_days IS DISTINCT FROM OLD.payment_terms_days THEN
   RAISE EXCEPTION 'تعديل مدة السداد للإدارة أو المالية فقط';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.customer_terms_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS customer_terms_guard ON public.customers;
CREATE TRIGGER customer_terms_guard BEFORE INSERT OR UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.customer_terms_guard();
CREATE OR REPLACE FUNCTION public.sync_driver_license() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE did uuid; affected uuid[] := ARRAY[]::uuid[]; exp date; num text;
BEGIN
 IF TG_OP <> 'INSERT' THEN
  IF OLD.entity_type = 'driver' AND OLD.doc_type LIKE '%رخص%' AND OLD.review_status = 'approved' THEN affected := array_append(affected, OLD.entity_id); END IF;
 END IF;
 IF TG_OP <> 'DELETE' THEN
  IF NEW.entity_type = 'driver' AND NEW.doc_type LIKE '%رخص%' AND NEW.review_status = 'approved' THEN affected := array_append(affected, NEW.entity_id); END IF;
 END IF;
 FOR did IN SELECT DISTINCT unnest(affected) LOOP
  IF did IS NULL THEN CONTINUE; END IF;
  SELECT x.expiry_date, x.number INTO exp, num FROM public.documents x
   WHERE x.entity_type = 'driver' AND x.entity_id = did AND x.doc_type LIKE '%رخص%' AND x.review_status = 'approved'
   ORDER BY x.expiry_date DESC NULLS LAST, x.created_at DESC, x.id DESC LIMIT 1;
  UPDATE public.drivers SET license_expiry = exp, license_no = coalesce(num, license_no) WHERE id = did;
 END LOOP;
 RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.sync_driver_license() FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.sync_driver_license() IS 'Only approved driver license documents update assignment eligibility; pending uploads never mutate license identity or dates.';