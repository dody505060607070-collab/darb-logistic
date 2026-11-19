ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS auto_invoice text NOT NULL DEFAULT 'off';
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS auto_allocate boolean NOT NULL DEFAULT false;
ALTER TABLE public.company_settings DROP CONSTRAINT IF EXISTS company_settings_auto_invoice_check;
ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_auto_invoice_check CHECK (auto_invoice IN ('off','draft','approve'));

CREATE OR REPLACE FUNCTION public.invoice_recalc(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE sub numeric; d numeric;
BEGIN
  SELECT COALESCE(sum(amount),0) INTO sub FROM public.invoice_lines WHERE invoice_id = p_id;
  SELECT COALESCE(discount,0) INTO d FROM public.invoices WHERE id = p_id;
  IF d > sub THEN RAISE EXCEPTION 'الخصم أكبر من قيمة الفاتورة'; END IF;
  UPDATE public.invoices SET subtotal = sub,
    vat = round((sub - d) * vat_rate / 100, 2),
    total = round((sub - d) * (1 + vat_rate / 100), 2)
  WHERE id = p_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.invoice_recalc(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.invoice_build_from_trips(p_customer_id uuid, p_trip_ids uuid[], p_discount numeric DEFAULT 0) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE inv_id uuid; rate numeric; terms int; cnt int;
BEGIN
  IF p_trip_ids IS NULL OR array_length(p_trip_ids,1) IS NULL THEN RAISE EXCEPTION 'اختر رحلة واحدة على الأقل'; END IF;
  SELECT count(*) INTO cnt FROM public.trips t JOIN public.transport_orders o ON o.id = t.order_id
   WHERE t.id = ANY(p_trip_ids) AND o.customer_id = p_customer_id AND t.status IN ('delivered','closed');
  IF cnt <> array_length(p_trip_ids,1) THEN RAISE EXCEPTION 'كل الرحلات يجب أن تكون مسلّمة وتابعة لنفس العميل'; END IF;
  IF EXISTS (SELECT 1 FROM public.invoice_lines WHERE trip_id = ANY(p_trip_ids)) THEN RAISE EXCEPTION 'إحدى الرحلات مفوترة مسبقًا'; END IF;
  IF EXISTS (SELECT 1 FROM public.trips t LEFT JOIN public.trip_financials f ON f.trip_id = t.id WHERE t.id = ANY(p_trip_ids) AND COALESCE(f.revenue,0) <= 0) THEN
    RAISE EXCEPTION 'سعر إحدى الرحلات صفر؛ أدخل سعر الرحلة قبل الفوترة';
  END IF;
  IF COALESCE(p_discount,0) < 0 THEN RAISE EXCEPTION 'الخصم لا يكون بالسالب'; END IF;
  SELECT vat_rate INTO rate FROM public.company_settings WHERE id = 1;
  SELECT payment_terms_days INTO terms FROM public.customers WHERE id = p_customer_id;
  INSERT INTO public.invoices(customer_id, due_at, vat_rate, discount)
  VALUES (p_customer_id, current_date + COALESCE(terms,30), COALESCE(rate,15), COALESCE(p_discount,0)) RETURNING id INTO inv_id;
  INSERT INTO public.invoice_lines(invoice_id, trip_id, description, amount)
  SELECT inv_id, t.id, 'نقل ' || t.origin_city || ' → ' || t.dest_city || ' (' || t.number || ')', COALESCE(f.revenue,0)
  FROM public.trips t LEFT JOIN public.trip_financials f ON f.trip_id = t.id WHERE t.id = ANY(p_trip_ids);
  PERFORM public.invoice_recalc(inv_id);
  RETURN inv_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.invoice_build_from_trips(uuid, uuid[], numeric) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_invoice_from_trips(p_customer_id uuid, p_trip_ids uuid[], p_discount numeric DEFAULT 0) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_any_role(auth.uid(), '{owner,accountant}') THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  RETURN public.invoice_build_from_trips(p_customer_id, p_trip_ids, p_discount);
END $$;

-- Allocate one payment's unallocated balance to the customer's oldest open approved invoices.
CREATE OR REPLACE FUNCTION public.payment_allocate_fifo(p_payment_id uuid) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p record; remaining numeric; i record; part numeric; done numeric := 0;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;
  remaining := p.amount - COALESCE((SELECT sum(amount) FROM public.payment_allocations WHERE payment_id = p.id), 0);
  FOR i IN
    SELECT inv.id, inv.total - COALESCE((SELECT sum(a.amount) FROM public.payment_allocations a WHERE a.invoice_id = inv.id), 0) AS rem
    FROM public.invoices inv
    WHERE inv.customer_id = p.customer_id AND inv.status = 'approved'
    ORDER BY inv.due_at NULLS LAST, inv.issued_at, inv.created_at
    FOR UPDATE OF inv
  LOOP
    EXIT WHEN remaining <= 0;
    CONTINUE WHEN i.rem <= 0;
    part := least(remaining, i.rem);
    INSERT INTO public.payment_allocations(payment_id, invoice_id, amount) VALUES (p.id, i.id, part)
    ON CONFLICT (payment_id, invoice_id) DO UPDATE SET amount = payment_allocations.amount + EXCLUDED.amount;
    remaining := remaining - part;
    done := done + part;
  END LOOP;
  RETURN done;
END $$;
REVOKE EXECUTE ON FUNCTION public.payment_allocate_fifo(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.customer_allocate_fifo(p_customer_id uuid) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; done numeric := 0;
BEGIN
  FOR r IN SELECT id FROM public.payments WHERE customer_id = p_customer_id ORDER BY paid_at, created_at LOOP
    done := done + public.payment_allocate_fifo(r.id);
  END LOOP;
  RETURN done;
END $$;
REVOKE EXECUTE ON FUNCTION public.customer_allocate_fifo(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.payment_auto_allocate(p_payment_id uuid) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_any_role(auth.uid(), '{owner,accountant}') THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  RETURN public.payment_allocate_fifo(p_payment_id);
END $$;

CREATE OR REPLACE FUNCTION public.finance_settings_update(p_auto_invoice text, p_auto_allocate boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_any_role(auth.uid(), '{owner,accountant}') THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF p_auto_invoice NOT IN ('off','draft','approve') THEN RAISE EXCEPTION 'طريقة فوترة غير معروفة'; END IF;
  UPDATE public.company_settings SET auto_invoice = p_auto_invoice, auto_allocate = COALESCE(p_auto_allocate, false), updated_at = now() WHERE id = 1;
END $$;

CREATE OR REPLACE FUNCTION public.invoice_save(p_id uuid, p_customer_id uuid, p_due_at date, p_discount numeric, p_lines jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE inv_id uuid := p_id; inv record; rate numeric; terms int; l jsonb; t uuid; amt numeric;
BEGIN
  IF NOT public.has_any_role(auth.uid(), '{owner,accountant}') THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF p_customer_id IS NULL THEN RAISE EXCEPTION 'اختر العميل'; END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN RAISE EXCEPTION 'أضف بندًا واحدًا على الأقل'; END IF;
  IF COALESCE(p_discount,0) < 0 THEN RAISE EXCEPTION 'الخصم لا يكون بالسالب'; END IF;
  IF inv_id IS NULL THEN
    SELECT vat_rate INTO rate FROM public.company_settings WHERE id = 1;
    SELECT payment_terms_days INTO terms FROM public.customers WHERE id = p_customer_id;
    INSERT INTO public.invoices(customer_id, due_at, vat_rate, discount)
    VALUES (p_customer_id, COALESCE(p_due_at, current_date + COALESCE(terms,30)), COALESCE(rate,15), COALESCE(p_discount,0)) RETURNING id INTO inv_id;
  ELSE
    SELECT * INTO inv FROM public.invoices WHERE id = inv_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;
    IF inv.status <> 'draft' THEN RAISE EXCEPTION 'تُعدَّل المسودة فقط؛ أرجع الفاتورة إلى مسودة أولًا'; END IF;
    UPDATE public.invoices SET customer_id = p_customer_id, due_at = COALESCE(p_due_at, due_at), discount = COALESCE(p_discount,0) WHERE id = inv_id;
    DELETE FROM public.invoice_lines WHERE invoice_id = inv_id;
  END IF;
  FOR l IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    t := NULLIF(l->>'trip_id','')::uuid;
    amt := NULLIF(l->>'amount','')::numeric;
    IF COALESCE(trim(l->>'description'),'') = '' THEN RAISE EXCEPTION 'اكتب وصف كل بند'; END IF;
    IF COALESCE(amt,0) <= 0 THEN RAISE EXCEPTION 'مبلغ كل بند يجب أن يكون أكبر من صفر'; END IF;
    IF t IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.trips tr JOIN public.transport_orders o ON o.id = tr.order_id WHERE tr.id = t AND o.customer_id = p_customer_id) THEN
        RAISE EXCEPTION 'إحدى رحلات البنود لا تخص هذا العميل';
      END IF;
      IF EXISTS (SELECT 1 FROM public.invoice_lines WHERE trip_id = t) THEN RAISE EXCEPTION 'إحدى الرحلات مفوترة في فاتورة أخرى'; END IF;
    END IF;
    INSERT INTO public.invoice_lines(invoice_id, trip_id, description, amount) VALUES (inv_id, t, trim(l->>'description'), round(amt, 2));
  END LOOP;
  PERFORM public.invoice_recalc(inv_id);
  RETURN inv_id;
END $$;

CREATE OR REPLACE FUNCTION public.invoice_set_status(p_id uuid, p_status text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE inv record; s record;
BEGIN
  IF NOT public.has_any_role(auth.uid(), '{owner,accountant}') THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT * INTO inv FROM public.invoices WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;
  IF p_status = 'approved' THEN
    IF inv.status <> 'draft' THEN RAISE EXCEPTION 'الفاتورة ليست مسودة'; END IF;
    IF COALESCE(inv.total,0) <= 0 THEN RAISE EXCEPTION 'قيمة الفاتورة صفر؛ لا تُعتمد'; END IF;
    UPDATE public.invoices SET status = 'approved' WHERE id = p_id;
    SELECT auto_allocate INTO s FROM public.company_settings WHERE id = 1;
    IF COALESCE(s.auto_allocate, false) THEN PERFORM public.customer_allocate_fifo(inv.customer_id); END IF;
  ELSIF p_status = 'draft' THEN
    IF inv.status = 'draft' THEN RETURN; END IF;
    IF inv.provider_status IN ('sending','accepted','issued') THEN RAISE EXCEPTION 'الفاتورة أُرسلت رسميًا لمزود الفوترة؛ لا تُعدَّل'; END IF;
    IF EXISTS (SELECT 1 FROM public.payment_allocations WHERE invoice_id = p_id) THEN RAISE EXCEPTION 'عليها دفعات موزعة؛ ألغِ توزيع الدفعات أولًا'; END IF;
    UPDATE public.invoices SET status = 'draft' WHERE id = p_id;
  ELSE
    RAISE EXCEPTION 'حالة غير معروفة';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.invoice_delete(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE inv record;
BEGIN
  IF NOT public.has_any_role(auth.uid(), '{owner,accountant}') THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT * INTO inv FROM public.invoices WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;
  IF inv.provider_status IN ('sending','accepted','issued') THEN RAISE EXCEPTION 'الفاتورة أُرسلت رسميًا لمزود الفوترة ولا تُحذف'; END IF;
  DELETE FROM public.payment_allocations WHERE invoice_id = p_id;
  DELETE FROM public.invoices WHERE id = p_id;
END $$;

CREATE OR REPLACE FUNCTION public.invoice_unbilled_now() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c record; n int := 0;
BEGIN
  IF NOT public.has_any_role(auth.uid(), '{owner,accountant}') THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  FOR c IN
    SELECT o.customer_id, array_agg(t.id) AS ids
    FROM public.trips t
    JOIN public.transport_orders o ON o.id = t.order_id
    LEFT JOIN public.trip_financials f ON f.trip_id = t.id
    WHERE t.status IN ('delivered','closed') AND NOT t.is_empty AND COALESCE(f.revenue,0) > 0
      AND NOT EXISTS (SELECT 1 FROM public.invoice_lines l WHERE l.trip_id = t.id)
    GROUP BY o.customer_id
  LOOP
    PERFORM public.invoice_build_from_trips(c.customer_id, c.ids, 0);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.trip_auto_invoice() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE st record; cust uuid; inv_id uuid; rev numeric;
BEGIN
  IF NEW.status NOT IN ('delivered','closed') OR OLD.status IN ('delivered','closed') OR NEW.is_empty THEN RETURN NEW; END IF;
  SELECT auto_invoice, auto_allocate INTO st FROM public.company_settings WHERE id = 1;
  IF COALESCE(st.auto_invoice,'off') = 'off' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.invoice_lines WHERE trip_id = NEW.id) THEN RETURN NEW; END IF;
  SELECT o.customer_id INTO cust FROM public.transport_orders o WHERE o.id = NEW.order_id;
  SELECT revenue INTO rev FROM public.trip_financials WHERE trip_id = NEW.id;
  IF cust IS NULL OR COALESCE(rev,0) <= 0 THEN
    INSERT INTO public.notifications(severity, category, title, body, entity_type, entity_id, dedupe_key)
    VALUES ('warning','finance','رحلة مسلّمة تحتاج فوترة يدوية', 'الرحلة ' || NEW.number || ' بلا عميل أو بلا سعر؛ أدخل السعر من صفحة المالية ثم أنشئ الفاتورة.', 'trip', NEW.id, 'auto-invoice-' || NEW.id)
    ON CONFLICT (dedupe_key) DO NOTHING;
    RETURN NEW;
  END IF;
  BEGIN
    inv_id := public.invoice_build_from_trips(cust, ARRAY[NEW.id], 0);
    IF st.auto_invoice = 'approve' THEN
      UPDATE public.invoices SET status = 'approved' WHERE id = inv_id AND total > 0;
      IF COALESCE(st.auto_allocate,false) THEN PERFORM public.customer_allocate_fifo(cust); END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.notifications(severity, category, title, body, entity_type, entity_id, dedupe_key)
    VALUES ('warning','finance','تعذرت الفوترة التلقائية', 'الرحلة ' || NEW.number || ': ' || SQLERRM, 'trip', NEW.id, 'auto-invoice-' || NEW.id)
    ON CONFLICT (dedupe_key) DO NOTHING;
  END;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.trip_auto_invoice() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trip_auto_invoice ON public.trips;
CREATE TRIGGER trip_auto_invoice AFTER UPDATE OF status ON public.trips FOR EACH ROW EXECUTE FUNCTION public.trip_auto_invoice();

CREATE OR REPLACE FUNCTION public.payment_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE used numeric;
BEGIN
  SELECT COALESCE(sum(amount),0) INTO used FROM public.payment_allocations WHERE payment_id = NEW.id;
  IF NEW.amount < used THEN RAISE EXCEPTION 'المبلغ أقل من الموزع على الفواتير (%)؛ ألغِ جزءًا من التوزيع أولًا', used; END IF;
  IF NEW.customer_id <> OLD.customer_id AND used > 0 THEN RAISE EXCEPTION 'الدفعة موزعة على فواتير العميل؛ ألغِ التوزيع قبل تغيير العميل'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS payment_guard ON public.payments;
CREATE TRIGGER payment_guard BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.payment_guard();

CREATE OR REPLACE FUNCTION public.payment_auto_allocate_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF COALESCE((SELECT auto_allocate FROM public.company_settings WHERE id = 1), false) THEN
    PERFORM public.payment_allocate_fifo(NEW.id);
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.payment_auto_allocate_trigger() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS payment_auto_allocate ON public.payments;
CREATE TRIGGER payment_auto_allocate AFTER INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION public.payment_auto_allocate_trigger();

CREATE OR REPLACE FUNCTION public.expense_in_settled_advance(p_driver uuid, p_trip uuid, p_method text, p_spent timestamptz) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p_method = 'advance' AND EXISTS (
    SELECT 1 FROM public.advances a WHERE a.status = 'settled' AND a.driver_id = p_driver
      AND (a.trip_id IS NULL OR a.trip_id = p_trip) AND p_spent >= a.issued_at);
$$;
REVOKE EXECUTE ON FUNCTION public.expense_in_settled_advance(uuid, uuid, text, timestamptz) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.expense_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE fin boolean := auth.uid() IS NULL OR public.has_any_role(auth.uid(), '{owner,ops_manager,accountant}');
BEGIN
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN RAISE EXCEPTION 'مبلغ المصروف يجب أن يكون أكبر من صفر'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NOT fin THEN NEW.status := 'pending'; NEW.reviewed_by := NULL; NEW.reviewed_at := NULL; NEW.reject_reason := NULL; END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = 'approved' AND COALESCE(current_setting('app.expense_reopen', true), '') <> 'on'
     AND (NEW.amount, NEW.category, NEW.trip_id, NEW.driver_id, NEW.spent_at, NEW.status)
     IS DISTINCT FROM (OLD.amount, OLD.category, OLD.trip_id, OLD.driver_id, OLD.spent_at, OLD.status) THEN
    RAISE EXCEPTION 'المصروف المعتمد لا يُعدَّل مباشرة؛ اضغط «إعادة للمراجعة» ثم عدّله';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.expense_reopen(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e record;
BEGIN
  IF NOT public.has_any_role(auth.uid(), '{owner,accountant}') THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT * INTO e FROM public.expenses WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'المصروف غير موجود'; END IF;
  IF e.status = 'pending' THEN RETURN; END IF;
  IF e.status = 'approved' AND public.expense_in_settled_advance(e.driver_id, e.trip_id, e.payment_method, e.spent_at) THEN
    RAISE EXCEPTION 'المصروف داخل سلفة تمت تسويتها؛ أعد فتح السلفة أولًا';
  END IF;
  PERFORM set_config('app.expense_reopen', 'on', true);
  UPDATE public.expenses SET status = 'pending', reviewed_by = NULL, reviewed_at = NULL, reject_reason = NULL WHERE id = p_id;
  PERFORM set_config('app.expense_reopen', '', true);
END $$;

CREATE OR REPLACE FUNCTION public.expense_delete_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF OLD.status = 'approved' AND public.expense_in_settled_advance(OLD.driver_id, OLD.trip_id, OLD.payment_method, OLD.spent_at) THEN
    RAISE EXCEPTION 'المصروف داخل سلفة تمت تسويتها؛ أعد فتح السلفة أولًا';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS expense_delete_guard ON public.expenses;
CREATE TRIGGER expense_delete_guard BEFORE DELETE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.expense_delete_guard();

CREATE OR REPLACE FUNCTION public.advance_reopen(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_any_role(auth.uid(), '{owner,accountant}') THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  UPDATE public.advances SET status = 'open', settled_at = NULL, settled_expenses = NULL, balance = NULL WHERE id = p_id AND status = 'settled';
  IF NOT FOUND THEN RAISE EXCEPTION 'السلفة مفتوحة بالفعل'; END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.payment_auto_allocate(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.finance_settings_update(text, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.invoice_save(uuid, uuid, date, numeric, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.invoice_set_status(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.invoice_delete(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.invoice_unbilled_now() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.expense_reopen(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.advance_reopen(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_invoice_from_trips(uuid, uuid[], numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payment_auto_allocate(uuid), public.finance_settings_update(text, boolean), public.invoice_save(uuid, uuid, date, numeric, jsonb), public.invoice_set_status(uuid, text), public.invoice_delete(uuid), public.invoice_unbilled_now(), public.expense_reopen(uuid), public.advance_reopen(uuid), public.create_invoice_from_trips(uuid, uuid[], numeric), public.expense_in_settled_advance(uuid, uuid, text, timestamptz) TO authenticated;