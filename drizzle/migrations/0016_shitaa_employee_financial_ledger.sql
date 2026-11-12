CREATE TABLE public.maintenance_wallet_entries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_id uuid NOT NULL REFERENCES public.profiles(id), kind text NOT NULL, amount numeric(14,2) NOT NULL, status text NOT NULL DEFAULT 'draft', asset_id uuid REFERENCES public.assets(id), work_order_id uuid REFERENCES public.work_orders(id), supplier text, description text NOT NULL, receipt_path text, reference text, occurred_at timestamptz NOT NULL DEFAULT now(), client_ref text NOT NULL UNIQUE, reversal_of uuid REFERENCES public.maintenance_wallet_entries(id), created_by uuid NOT NULL, reviewed_by uuid, reviewed_at timestamptz, review_note text, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.maintenance_wallet_entries TO authenticated; GRANT ALL ON public.maintenance_wallet_entries TO service_role;
ALTER TABLE public.maintenance_wallet_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY wallet_scoped_read ON public.maintenance_wallet_entries FOR SELECT TO authenticated USING(public.has_any_role(auth.uid(),'{owner,accountant}') OR (employee_id=auth.uid() AND public.has_role(auth.uid(),'field_maintenance')));
CREATE UNIQUE INDEX wallet_one_reversal ON public.maintenance_wallet_entries(reversal_of) WHERE reversal_of IS NOT NULL;
CREATE OR REPLACE FUNCTION public.wallet_validate() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF NEW.amount<=0 OR NEW.kind NOT IN('opening','issue','expense','return','correction') OR NEW.status NOT IN('draft','submitted','approved','rejected') THEN RAISE EXCEPTION 'حركة العهدة غير صحيحة'; END IF;
 IF TG_OP='UPDATE' AND OLD.status='approved' THEN RAISE EXCEPTION 'الحركة المعتمدة لا تعدل؛ سجل تصحيحًا'; END IF;
 IF NEW.kind='expense' AND (NEW.asset_id IS NULL OR NEW.supplier IS NULL OR NEW.receipt_path IS NULL) THEN RAISE EXCEPTION 'المركبة والمورد والفاتورة مطلوبة للمصروف'; END IF;
 IF NEW.work_order_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.work_orders w WHERE w.id=NEW.work_order_id AND w.asset_id=NEW.asset_id) THEN RAISE EXCEPTION 'أمر الصيانة لا يطابق المركبة'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER wallet_validation BEFORE INSERT OR UPDATE ON public.maintenance_wallet_entries FOR EACH ROW EXECUTE FUNCTION public.wallet_validate();
CREATE OR REPLACE FUNCTION public.wallet_create(p_employee uuid,p_kind text,p_amount numeric,p_description text,p_client_ref text,p_asset uuid DEFAULT NULL,p_work_order uuid DEFAULT NULL,p_supplier text DEFAULT NULL,p_receipt text DEFAULT NULL,p_reference text DEFAULT NULL,p_reversal uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing public.maintenance_wallet_entries%ROWTYPE; result uuid; fin boolean;
BEGIN
 fin:=public.has_any_role(auth.uid(),'{owner,accountant}');
 IF NOT fin AND (p_employee IS DISTINCT FROM auth.uid() OR NOT public.has_role(auth.uid(),'field_maintenance') OR p_kind NOT IN('expense','return')) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
 IF NOT public.has_role(p_employee,'field_maintenance') THEN RAISE EXCEPTION 'اختر موظف صيانة ميدانية'; END IF;
 IF length(trim(p_description))<3 OR length(trim(p_client_ref))<8 THEN RAISE EXCEPTION 'الوصف ومعرف الطلب مطلوبان'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_employee::text,0));
 SELECT * INTO existing FROM public.maintenance_wallet_entries WHERE client_ref=p_client_ref;
 IF FOUND THEN IF existing.employee_id<>p_employee OR existing.created_by<>auth.uid() THEN RAISE EXCEPTION 'معرف الطلب مستخدم'; END IF; RETURN existing.id; END IF;
 IF p_kind='correction' THEN
 IF NOT fin OR p_reversal IS NULL OR NOT EXISTS(SELECT 1 FROM public.maintenance_wallet_entries WHERE id=p_reversal AND employee_id=p_employee AND status='approved' AND amount=p_amount AND kind<>'correction') THEN RAISE EXCEPTION 'حدد حركة معتمدة مطابقة للتصحيح'; END IF;
 END IF;
 INSERT INTO public.maintenance_wallet_entries(employee_id,kind,amount,status,asset_id,work_order_id,supplier,description,receipt_path,reference,client_ref,reversal_of,created_by) VALUES(p_employee,p_kind,p_amount,'submitted',p_asset,p_work_order,NULLIF(p_supplier,''),trim(p_description),NULLIF(p_receipt,''),p_reference,p_client_ref,p_reversal,auth.uid()) RETURNING id INTO result;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.wallet_review(p_id uuid,p_approve boolean,p_note text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.maintenance_wallet_entries%ROWTYPE;
BEGIN
 IF NOT public.has_any_role(auth.uid(),'{owner,accountant}') THEN RAISE EXCEPTION 'غير مصرح'; END IF;
 SELECT * INTO e FROM public.maintenance_wallet_entries WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'الحركة غير موجودة'; END IF;
 IF e.employee_id=auth.uid() THEN RAISE EXCEPTION 'لا يمكنك تسوية أو اعتماد عهدتك بنفسك'; END IF;
 IF e.status='approved' AND p_approve THEN RETURN; END IF;
 IF e.status<>'submitted' THEN RAISE EXCEPTION 'الحركة ليست بانتظار الاعتماد'; END IF;
 IF NOT p_approve AND length(trim(COALESCE(p_note,'')))<3 THEN RAISE EXCEPTION 'سبب الرفض مطلوب'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(e.employee_id::text,0));
 UPDATE public.maintenance_wallet_entries SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,reviewed_by=auth.uid(),reviewed_at=now(),review_note=p_note WHERE id=p_id;
END $$;
CREATE OR REPLACE FUNCTION public.wallet_balances() RETURNS TABLE(employee_id uuid,balance numeric,pending_expenses numeric,maintenance_cost numeric) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT e.employee_id,COALESCE(sum(CASE WHEN e.status='approved' THEN CASE WHEN e.kind IN('opening','issue') THEN e.amount WHEN e.kind IN('expense','return') THEN -e.amount WHEN e.kind='correction' THEN CASE WHEN original.kind IN('opening','issue') THEN -e.amount ELSE e.amount END ELSE 0 END ELSE 0 END),0),COALESCE(sum(e.amount) FILTER(WHERE e.kind='expense' AND e.status='submitted'),0),COALESCE(sum(CASE WHEN e.status='approved' AND e.kind='expense' THEN e.amount WHEN e.status='approved' AND e.kind='correction' AND original.kind='expense' THEN -e.amount ELSE 0 END),0) FROM public.maintenance_wallet_entries e LEFT JOIN public.maintenance_wallet_entries original ON original.id=e.reversal_of WHERE public.has_any_role(auth.uid(),'{owner,accountant}') OR (e.employee_id=auth.uid() AND public.has_role(auth.uid(),'field_maintenance')) GROUP BY e.employee_id
$$;
REVOKE ALL ON FUNCTION public.wallet_create(uuid,text,numeric,text,text,uuid,uuid,text,text,text,uuid),public.wallet_review(uuid,boolean,text),public.wallet_balances() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wallet_create(uuid,text,numeric,text,text,uuid,uuid,text,text,text,uuid),public.wallet_review(uuid,boolean,text),public.wallet_balances() TO authenticated,service_role;
CREATE TRIGGER audit_wallet AFTER INSERT OR UPDATE OR DELETE ON public.maintenance_wallet_entries FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();