ALTER TABLE public.petroapp_transactions ADD COLUMN IF NOT EXISTS full_tank boolean;
COMMENT ON COLUMN public.petroapp_transactions.full_tank IS 'NULL until the bridge maps an observed source field or a reviewer sets it explicitly; required before approval/import.';
ALTER TABLE public.petroapp_transaction_events DROP CONSTRAINT IF EXISTS petroapp_transaction_events_kind_check;
ALTER TABLE public.petroapp_transaction_events ADD CONSTRAINT petroapp_transaction_events_kind_check CHECK (kind IN ('received','correction','cancellation','approved','rejected','imported','applied_correction','applied_cancellation','remapped','full_tank_set'));

CREATE OR REPLACE FUNCTION public.petroapp_set_full_tank(p_tx uuid, p_value boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ex petroapp_transactions;
BEGIN
  IF NOT public.petroapp_can_review() THEN RAISE EXCEPTION 'غير مصرح بمراجعة عمليات PetroApp'; END IF;
  IF p_value IS NULL THEN RAISE EXCEPTION 'حدد نعم أو لا'; END IF;
  SELECT * INTO ex FROM petroapp_transactions WHERE id = p_tx FOR UPDATE;
  IF NOT FOUND OR ex.review_state NOT IN ('pending','correction_pending') THEN RAISE EXCEPTION 'لا يمكن تعديل خزان ممتلئ لهذه العملية'; END IF;
  UPDATE petroapp_transactions SET full_tank = p_value, updated_at = now() WHERE id = p_tx;
  INSERT INTO petroapp_transaction_events(transaction_id, kind, previous, next, actor)
  VALUES (p_tx, 'full_tank_set', jsonb_build_object('full_tank', ex.full_tank), jsonb_build_object('full_tank', p_value), auth.uid());
END $$;
REVOKE EXECUTE ON FUNCTION public.petroapp_set_full_tank(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.petroapp_set_full_tank(uuid, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.petroapp_stage(p_run uuid, p_rows jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r jsonb; ex petroapp_transactions; v_hash text; v_state text; v_asset uuid; v_driver uuid; v_map text;
  va uuid; vd uuid; ca uuid; cd uuid; nv int; nc int; v_new jsonb;
  c_staged int := 0; c_dup int := 0; c_corr int := 0; c_canc int := 0; c_unm int := 0;
BEGIN
  IF NOT public.petroapp_can_review() THEN RAISE EXCEPTION 'غير مصرح بمزامنة PetroApp'; END IF;
  IF NOT EXISTS (SELECT 1 FROM petroapp_sync_runs WHERE id = p_run AND mode = 'sync' AND status = 'running') THEN RAISE EXCEPTION 'تشغيل المزامنة غير صالح'; END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 500 THEN RAISE EXCEPTION 'دفعة غير صالحة (الحد 500)'; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    IF coalesce(r->>'provider_txn_id','') = '' OR r->>'occurred_at' IS NULL THEN RAISE EXCEPTION 'عملية بلا معرف أو وقت'; END IF;
    IF r ? 'full_tank' AND jsonb_typeof(r->'full_tank') NOT IN ('boolean','null') THEN RAISE EXCEPTION 'full_tank غير صالح'; END IF;
    IF coalesce(r->>'provider_card_ref','') ~ '^[0-9]{12,19}$' THEN RAISE EXCEPTION 'رقم بطاقة كامل مرفوض'; END IF;
    -- State is required: missing or unknown values are rejected, never assumed completed.
    v_state := r->>'provider_state';
    IF v_state IS NULL OR v_state NOT IN ('completed','cancelled') THEN RAISE EXCEPTION 'حالة عملية غير معروفة من المصدر: %', coalesce(left(v_state, 40), 'missing'); END IF;
    v_new := jsonb_build_object('occurred_at', r->>'occurred_at', 'station', r->>'station', 'fuel_type', r->>'fuel_type', 'liters', r->>'liters',
      'unit_price', r->>'unit_price', 'amount', r->>'amount', 'odometer', r->>'odometer', 'provider_state', v_state, 'full_tank', r->'full_tank',
      'provider_vehicle_ref', r->>'provider_vehicle_ref', 'provider_card_ref', r->>'provider_card_ref');
    v_hash := md5(v_new::text);
    SELECT count(*), min(asset_id::text)::uuid, min(driver_id::text)::uuid INTO nv, va, vd FROM petroapp_mappings WHERE active AND kind='vehicle' AND provider_ref = r->>'provider_vehicle_ref';
    SELECT count(*), min(asset_id::text)::uuid, min(driver_id::text)::uuid INTO nc, ca, cd FROM petroapp_mappings WHERE active AND kind='card' AND provider_ref = r->>'provider_card_ref';
    v_asset := coalesce(va, ca); v_driver := coalesce(cd, vd);
    IF nv > 1 OR nc > 1 OR (va IS NOT NULL AND ca IS NOT NULL AND va <> ca) OR (vd IS NOT NULL AND cd IS NOT NULL AND vd <> cd) THEN v_map := 'ambiguous'; v_asset := NULL; v_driver := NULL;
    ELSIF v_asset IS NULL THEN v_map := 'unmatched';
    ELSE v_map := 'matched'; END IF;
    SELECT * INTO ex FROM petroapp_transactions WHERE provider_txn_id = r->>'provider_txn_id' FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO petroapp_transactions(provider_txn_id, provider_vehicle_ref, provider_card_ref, card_last4, occurred_at, station, fuel_type, liters, unit_price, amount, odometer, full_tank,
        provider_state, mapping_status, asset_id, driver_id, review_state, content_hash, first_run_id, last_run_id)
      VALUES (r->>'provider_txn_id', r->>'provider_vehicle_ref', r->>'provider_card_ref', r->>'card_last4', (r->>'occurred_at')::timestamptz, r->>'station', r->>'fuel_type',
        (r->>'liters')::numeric, (r->>'unit_price')::numeric, (r->>'amount')::numeric, (r->>'odometer')::numeric, (r->>'full_tank')::boolean,
        v_state, v_map, v_asset, v_driver, CASE WHEN v_state='cancelled' THEN 'cancelled' ELSE 'pending' END, v_hash, p_run, p_run)
      RETURNING * INTO ex;
      INSERT INTO petroapp_transaction_events(transaction_id, kind, next, run_id, actor) VALUES (ex.id, 'received', v_new, p_run, auth.uid());
      c_staged := c_staged + 1;
      IF v_map <> 'matched' THEN c_unm := c_unm + 1; END IF;
    ELSIF ex.content_hash = v_hash THEN
      UPDATE petroapp_transactions SET last_run_id = p_run WHERE id = ex.id;
      c_dup := c_dup + 1;
    ELSE
      INSERT INTO petroapp_transaction_events(transaction_id, kind, previous, next, run_id, actor)
      VALUES (ex.id, CASE WHEN v_state='cancelled' THEN 'cancellation' ELSE 'correction' END,
        jsonb_build_object('occurred_at', ex.occurred_at, 'station', ex.station, 'fuel_type', ex.fuel_type, 'liters', ex.liters, 'unit_price', ex.unit_price, 'amount', ex.amount,
          'odometer', ex.odometer, 'full_tank', ex.full_tank, 'provider_state', ex.provider_state, 'review_state', ex.review_state), v_new, p_run, auth.uid());
      IF v_state = 'cancelled' THEN c_canc := c_canc + 1; ELSE c_corr := c_corr + 1; END IF;
      -- A correction resets full_tank to the source value (NULL when unmapped) so the reviewer confirms it again.
      UPDATE petroapp_transactions SET provider_vehicle_ref = r->>'provider_vehicle_ref', provider_card_ref = r->>'provider_card_ref', card_last4 = r->>'card_last4',
        occurred_at = (r->>'occurred_at')::timestamptz, station = r->>'station', fuel_type = r->>'fuel_type', liters = (r->>'liters')::numeric,
        unit_price = (r->>'unit_price')::numeric, amount = (r->>'amount')::numeric, odometer = (r->>'odometer')::numeric, full_tank = (r->>'full_tank')::boolean, provider_state = v_state,
        mapping_status = v_map, asset_id = v_asset, driver_id = v_driver, content_hash = v_hash, last_run_id = p_run, updated_at = now(),
        review_state = CASE
          WHEN ex.fuel_entry_id IS NOT NULL THEN CASE WHEN v_state='cancelled' THEN 'cancellation_pending' ELSE 'correction_pending' END
          WHEN v_state = 'cancelled' THEN 'cancelled'
          ELSE 'pending' END,
        reviewed_by = NULL, reviewed_at = NULL
      WHERE id = ex.id;
      IF v_map <> 'matched' THEN c_unm := c_unm + 1; END IF;
    END IF;
  END LOOP;
  UPDATE petroapp_sync_runs SET staged = staged + c_staged, duplicates = duplicates + c_dup, corrections = corrections + c_corr,
    cancellations = cancellations + c_canc, unmatched = unmatched + c_unm, fetched = fetched + jsonb_array_length(p_rows) WHERE id = p_run;
  RETURN jsonb_build_object('staged', c_staged, 'duplicates', c_dup, 'corrections', c_corr, 'cancellations', c_canc, 'unmatched', c_unm);
END $function$;

CREATE OR REPLACE FUNCTION public.petroapp_import(p_ids uuid[])
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE ex petroapp_transactions; v_fuel uuid; c_imp int := 0; c_skip int := 0;
BEGIN
  IF NOT public.petroapp_can_review() THEN RAISE EXCEPTION 'غير مصرح باستيراد عمليات PetroApp'; END IF;
  IF coalesce(array_length(p_ids, 1), 0) > 200 THEN RAISE EXCEPTION 'الحد 200 عملية في كل مرة'; END IF;
  FOR ex IN SELECT * FROM petroapp_transactions WHERE id = ANY(p_ids) ORDER BY occurred_at FOR UPDATE LOOP
    IF ex.review_state <> 'approved' OR ex.mapping_status <> 'matched' OR ex.provider_state <> 'completed' OR ex.full_tank IS NULL OR ex.fuel_entry_id IS NOT NULL THEN c_skip := c_skip + 1; CONTINUE; END IF;
    SELECT id INTO v_fuel FROM fuel_entries WHERE client_event_id = 'petroapp:' || ex.provider_txn_id;
    IF v_fuel IS NULL THEN
      INSERT INTO fuel_entries(asset_id, driver_id, filled_at, station, liters, unit_price, amount, odometer, full_tank, source, status, client_event_id)
      VALUES (ex.asset_id, ex.driver_id, ex.occurred_at, ex.station, ex.liters, ex.unit_price, ex.amount, NULL, ex.full_tank, 'petroapp', 'pending', 'petroapp:' || ex.provider_txn_id)
      RETURNING id INTO v_fuel;
    END IF;
    UPDATE petroapp_transactions SET review_state = 'imported', fuel_entry_id = v_fuel, updated_at = now() WHERE id = ex.id;
    INSERT INTO petroapp_transaction_events(transaction_id, kind, next, actor) VALUES (ex.id, 'imported', jsonb_build_object('fuel_entry_id', v_fuel), auth.uid());
    c_imp := c_imp + 1;
  END LOOP;
  RETURN jsonb_build_object('imported', c_imp, 'skipped', c_skip);
END $function$;

CREATE OR REPLACE FUNCTION public.petroapp_review(p_tx uuid, p_decision text, p_note text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE ex petroapp_transactions;
BEGIN
  IF NOT public.petroapp_can_review() THEN RAISE EXCEPTION 'غير مصرح بمراجعة عمليات PetroApp'; END IF;
  SELECT * INTO ex FROM petroapp_transactions WHERE id = p_tx FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'العملية غير موجودة'; END IF;
  IF p_decision = 'approve' THEN
    IF ex.review_state <> 'pending' OR ex.mapping_status <> 'matched' OR ex.provider_state <> 'completed' OR ex.full_tank IS NULL OR ex.liters IS NULL OR ex.unit_price IS NULL OR ex.amount IS NULL THEN
      RAISE EXCEPTION 'لا يمكن اعتماد عملية غير مربوطة أو ناقصة البيانات';
    END IF;
    UPDATE petroapp_transactions SET review_state = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note WHERE id = p_tx;
    INSERT INTO petroapp_transaction_events(transaction_id, kind, actor, note) VALUES (p_tx, 'approved', auth.uid(), p_note);
  ELSIF p_decision = 'reject' THEN
    IF ex.review_state NOT IN ('pending','approved') THEN RAISE EXCEPTION 'لا يمكن رفض هذه العملية'; END IF;
    UPDATE petroapp_transactions SET review_state = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note WHERE id = p_tx;
    INSERT INTO petroapp_transaction_events(transaction_id, kind, actor, note) VALUES (p_tx, 'rejected', auth.uid(), p_note);
  ELSIF p_decision = 'apply_correction' THEN
    IF ex.review_state <> 'correction_pending' OR ex.mapping_status <> 'matched' OR ex.full_tank IS NULL OR ex.liters IS NULL OR ex.unit_price IS NULL OR ex.amount IS NULL THEN RAISE EXCEPTION 'لا يوجد تصحيح قابل للتطبيق'; END IF;
    UPDATE fuel_entries SET asset_id = ex.asset_id, driver_id = ex.driver_id, filled_at = ex.occurred_at, station = ex.station, liters = ex.liters,
      unit_price = ex.unit_price, amount = ex.amount, full_tank = ex.full_tank, status = 'pending' WHERE id = ex.fuel_entry_id;
    UPDATE petroapp_transactions SET review_state = 'imported', reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note WHERE id = p_tx;
    INSERT INTO petroapp_transaction_events(transaction_id, kind, actor, note) VALUES (p_tx, 'applied_correction', auth.uid(), p_note);
  ELSIF p_decision = 'apply_cancellation' THEN
    IF ex.review_state <> 'cancellation_pending' THEN RAISE EXCEPTION 'لا يوجد إلغاء قابل للتطبيق'; END IF;
    UPDATE fuel_entries SET status = 'rejected' WHERE id = ex.fuel_entry_id;
    UPDATE petroapp_transactions SET review_state = 'cancelled', reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note WHERE id = p_tx;
    INSERT INTO petroapp_transaction_events(transaction_id, kind, actor, note) VALUES (p_tx, 'applied_cancellation', auth.uid(), p_note);
  ELSE RAISE EXCEPTION 'قرار غير معروف'; END IF;
END $function$;