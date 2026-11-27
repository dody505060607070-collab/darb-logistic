-- PetroApp read-only integration foundation (staging + review; no provider secrets stored).
CREATE TABLE public.petroapp_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('vehicle','card')),
  provider_ref text NOT NULL CHECK (length(provider_ref) BETWEEN 1 AND 120),
  card_last4 text CHECK (card_last4 IS NULL OR card_last4 ~ '^[0-9]{4}$'),
  label text,
  asset_id uuid REFERENCES public.assets(id),
  driver_id uuid REFERENCES public.drivers(id),
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (asset_id IS NOT NULL OR driver_id IS NOT NULL),
  CHECK (provider_ref !~ '^[0-9]{12,19}$')
);
CREATE UNIQUE INDEX petroapp_mappings_active_ref ON public.petroapp_mappings(kind, provider_ref) WHERE active;
CREATE INDEX petroapp_mappings_asset ON public.petroapp_mappings(asset_id);
CREATE INDEX petroapp_mappings_driver ON public.petroapp_mappings(driver_id);

CREATE TABLE public.petroapp_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL CHECK (mode IN ('health','preview','sync')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','missing','rate_limited','auth_expired','error')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  window_from timestamptz,
  window_to timestamptz,
  cursor text CHECK (cursor IS NULL OR length(cursor) <= 200),
  fetched int NOT NULL DEFAULT 0,
  staged int NOT NULL DEFAULT 0,
  duplicates int NOT NULL DEFAULT 0,
  corrections int NOT NULL DEFAULT 0,
  cancellations int NOT NULL DEFAULT 0,
  unmatched int NOT NULL DEFAULT 0,
  error_summary text CHECK (error_summary IS NULL OR length(error_summary) <= 300),
  triggered_by uuid
);
CREATE INDEX petroapp_sync_runs_started ON public.petroapp_sync_runs(started_at DESC);

CREATE TABLE public.petroapp_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_txn_id text NOT NULL UNIQUE CHECK (length(provider_txn_id) BETWEEN 1 AND 120),
  provider_vehicle_ref text,
  provider_card_ref text CHECK (provider_card_ref IS NULL OR provider_card_ref !~ '^[0-9]{12,19}$'),
  card_last4 text CHECK (card_last4 IS NULL OR card_last4 ~ '^[0-9]{4}$'),
  occurred_at timestamptz NOT NULL,
  station text,
  fuel_type text,
  liters numeric CHECK (liters IS NULL OR liters > 0),
  unit_price numeric CHECK (unit_price IS NULL OR unit_price >= 0),
  amount numeric CHECK (amount IS NULL OR amount >= 0),
  odometer numeric CHECK (odometer IS NULL OR odometer >= 0),
  provider_state text NOT NULL DEFAULT 'completed' CHECK (provider_state IN ('completed','cancelled')),
  mapping_status text NOT NULL DEFAULT 'unmatched' CHECK (mapping_status IN ('matched','unmatched','ambiguous')),
  asset_id uuid REFERENCES public.assets(id),
  driver_id uuid REFERENCES public.drivers(id),
  review_state text NOT NULL DEFAULT 'pending' CHECK (review_state IN ('pending','approved','rejected','imported','correction_pending','cancellation_pending','cancelled')),
  fuel_entry_id uuid REFERENCES public.fuel_entries(id),
  content_hash text NOT NULL,
  first_run_id uuid REFERENCES public.petroapp_sync_runs(id),
  last_run_id uuid REFERENCES public.petroapp_sync_runs(id),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX petroapp_tx_review ON public.petroapp_transactions(review_state, occurred_at DESC);
CREATE INDEX petroapp_tx_mapping ON public.petroapp_transactions(mapping_status);
CREATE INDEX petroapp_tx_asset ON public.petroapp_transactions(asset_id);
CREATE INDEX petroapp_tx_driver ON public.petroapp_transactions(driver_id);
CREATE INDEX petroapp_tx_fuel ON public.petroapp_transactions(fuel_entry_id);
CREATE INDEX petroapp_tx_first_run ON public.petroapp_transactions(first_run_id);
CREATE INDEX petroapp_tx_last_run ON public.petroapp_transactions(last_run_id);

CREATE TABLE public.petroapp_transaction_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.petroapp_transactions(id),
  kind text NOT NULL CHECK (kind IN ('received','correction','cancellation','approved','rejected','imported','applied_correction','applied_cancellation','remapped')),
  previous jsonb,
  next jsonb,
  run_id uuid REFERENCES public.petroapp_sync_runs(id),
  actor uuid,
  note text,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX petroapp_events_tx ON public.petroapp_transaction_events(transaction_id, at DESC);
CREATE INDEX petroapp_events_run ON public.petroapp_transaction_events(run_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.petroapp_mappings TO authenticated;
GRANT SELECT ON public.petroapp_sync_runs, public.petroapp_transactions, public.petroapp_transaction_events TO authenticated;
GRANT ALL ON public.petroapp_mappings, public.petroapp_sync_runs, public.petroapp_transactions, public.petroapp_transaction_events TO service_role;
ALTER TABLE public.petroapp_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.petroapp_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.petroapp_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.petroapp_transaction_events ENABLE ROW LEVEL SECURITY;

-- Fuel-review roles (same set that may write fuel_entries) read; only the owner configures mappings.
CREATE POLICY "petroapp mappings read" ON public.petroapp_mappings FOR SELECT TO authenticated
  USING ((select public.has_any_role((select auth.uid()), '{owner,ops_manager,accountant,fleet_supervisor}'::app_role[])));
CREATE POLICY "petroapp mappings owner insert" ON public.petroapp_mappings FOR INSERT TO authenticated
  WITH CHECK ((select public.has_role((select auth.uid()), 'owner')));
CREATE POLICY "petroapp mappings owner update" ON public.petroapp_mappings FOR UPDATE TO authenticated
  USING ((select public.has_role((select auth.uid()), 'owner'))) WITH CHECK ((select public.has_role((select auth.uid()), 'owner')));
CREATE POLICY "petroapp mappings owner delete" ON public.petroapp_mappings FOR DELETE TO authenticated
  USING ((select public.has_role((select auth.uid()), 'owner')));
CREATE POLICY "petroapp runs read" ON public.petroapp_sync_runs FOR SELECT TO authenticated
  USING ((select public.has_any_role((select auth.uid()), '{owner,ops_manager,accountant,fleet_supervisor}'::app_role[])));
CREATE POLICY "petroapp tx read" ON public.petroapp_transactions FOR SELECT TO authenticated
  USING ((select public.has_any_role((select auth.uid()), '{owner,ops_manager,accountant,fleet_supervisor}'::app_role[])));
CREATE POLICY "petroapp events read" ON public.petroapp_transaction_events FOR SELECT TO authenticated
  USING ((select public.has_any_role((select auth.uid()), '{owner,ops_manager,accountant,fleet_supervisor}'::app_role[])));

CREATE OR REPLACE FUNCTION public.petroapp_can_review() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_any_role(auth.uid(), '{owner,ops_manager,accountant,fleet_supervisor}'::app_role[]);
$$;

CREATE OR REPLACE FUNCTION public.petroapp_run_begin(p_mode text, p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid;
BEGIN
  IF NOT public.petroapp_can_review() THEN RAISE EXCEPTION 'غير مصرح بمزامنة PetroApp'; END IF;
  IF p_mode NOT IN ('health','preview','sync') THEN RAISE EXCEPTION 'نوع تشغيل غير معروف'; END IF;
  -- Respect the source's limits: no new provider call for 30 minutes after a rate-limit/security stop.
  IF EXISTS (SELECT 1 FROM petroapp_sync_runs WHERE status = 'rate_limited' AND started_at > now() - interval '30 minutes') THEN
    RAISE EXCEPTION 'PetroApp أوقف الطلبات مؤقتًا؛ لا محاولة جديدة قبل 30 دقيقة من آخر تحذير';
  END IF;
  IF p_mode = 'sync' AND EXISTS (SELECT 1 FROM petroapp_sync_runs WHERE mode = 'sync' AND status = 'running' AND started_at > now() - interval '10 minutes') THEN
    RAISE EXCEPTION 'توجد مزامنة جارية بالفعل';
  END IF;
  INSERT INTO petroapp_sync_runs(mode, window_from, window_to, triggered_by) VALUES (p_mode, p_from, p_to, auth.uid()) RETURNING id INTO v;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.petroapp_run_finish(p_run uuid, p_status text, p_counts jsonb DEFAULT '{}'::jsonb, p_error text DEFAULT NULL, p_cursor text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.petroapp_can_review() THEN RAISE EXCEPTION 'غير مصرح بمزامنة PetroApp'; END IF;
  IF p_status NOT IN ('ok','missing','rate_limited','auth_expired','error') THEN RAISE EXCEPTION 'حالة غير معروفة'; END IF;
  UPDATE petroapp_sync_runs SET status = p_status, completed_at = now(), error_summary = left(p_error, 300), cursor = left(p_cursor, 200),
    fetched = greatest(fetched, coalesce((p_counts->>'fetched')::int, 0))
  WHERE id = p_run AND status = 'running';
END $$;

-- Stage normalized rows. Idempotent by provider_txn_id; changes are recorded as events, imported rows are never overwritten in fuel_entries.
CREATE OR REPLACE FUNCTION public.petroapp_stage(p_run uuid, p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb; ex petroapp_transactions; v_hash text; v_state text; v_asset uuid; v_driver uuid; v_map text;
  va uuid; vd uuid; ca uuid; cd uuid; nv int; nc int; v_new jsonb;
  c_staged int := 0; c_dup int := 0; c_corr int := 0; c_canc int := 0; c_unm int := 0;
BEGIN
  IF NOT public.petroapp_can_review() THEN RAISE EXCEPTION 'غير مصرح بمزامنة PetroApp'; END IF;
  IF NOT EXISTS (SELECT 1 FROM petroapp_sync_runs WHERE id = p_run AND mode = 'sync' AND status = 'running') THEN RAISE EXCEPTION 'تشغيل المزامنة غير صالح'; END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 500 THEN RAISE EXCEPTION 'دفعة غير صالحة (الحد 500)'; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    IF coalesce(r->>'provider_txn_id','') = '' OR r->>'occurred_at' IS NULL THEN RAISE EXCEPTION 'عملية بلا معرف أو وقت'; END IF;
    IF coalesce(r->>'provider_card_ref','') ~ '^[0-9]{12,19}$' THEN RAISE EXCEPTION 'رقم بطاقة كامل مرفوض'; END IF;
    v_state := CASE WHEN r->>'provider_state' = 'cancelled' THEN 'cancelled' ELSE 'completed' END;
    v_new := jsonb_build_object('occurred_at', r->>'occurred_at', 'station', r->>'station', 'fuel_type', r->>'fuel_type', 'liters', r->>'liters',
      'unit_price', r->>'unit_price', 'amount', r->>'amount', 'odometer', r->>'odometer', 'provider_state', v_state,
      'provider_vehicle_ref', r->>'provider_vehicle_ref', 'provider_card_ref', r->>'provider_card_ref');
    v_hash := md5(v_new::text);
    -- Mapping: exact active provider refs only; conflicting or multiple results are ambiguous, never guessed.
    SELECT count(*), min(asset_id::text)::uuid, min(driver_id::text)::uuid INTO nv, va, vd FROM petroapp_mappings WHERE active AND kind='vehicle' AND provider_ref = r->>'provider_vehicle_ref';
    SELECT count(*), min(asset_id::text)::uuid, min(driver_id::text)::uuid INTO nc, ca, cd FROM petroapp_mappings WHERE active AND kind='card' AND provider_ref = r->>'provider_card_ref';
    v_asset := coalesce(va, ca); v_driver := coalesce(cd, vd);
    IF nv > 1 OR nc > 1 OR (va IS NOT NULL AND ca IS NOT NULL AND va <> ca) OR (vd IS NOT NULL AND cd IS NOT NULL AND vd <> cd) THEN v_map := 'ambiguous'; v_asset := NULL; v_driver := NULL;
    ELSIF v_asset IS NULL THEN v_map := 'unmatched';
    ELSE v_map := 'matched'; END IF;
    SELECT * INTO ex FROM petroapp_transactions WHERE provider_txn_id = r->>'provider_txn_id' FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO petroapp_transactions(provider_txn_id, provider_vehicle_ref, provider_card_ref, card_last4, occurred_at, station, fuel_type, liters, unit_price, amount, odometer,
        provider_state, mapping_status, asset_id, driver_id, review_state, content_hash, first_run_id, last_run_id)
      VALUES (r->>'provider_txn_id', r->>'provider_vehicle_ref', r->>'provider_card_ref', r->>'card_last4', (r->>'occurred_at')::timestamptz, r->>'station', r->>'fuel_type',
        (r->>'liters')::numeric, (r->>'unit_price')::numeric, (r->>'amount')::numeric, (r->>'odometer')::numeric,
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
          'odometer', ex.odometer, 'provider_state', ex.provider_state, 'review_state', ex.review_state), v_new, p_run, auth.uid());
      IF v_state = 'cancelled' THEN c_canc := c_canc + 1; ELSE c_corr := c_corr + 1; END IF;
      UPDATE petroapp_transactions SET provider_vehicle_ref = r->>'provider_vehicle_ref', provider_card_ref = r->>'provider_card_ref', card_last4 = r->>'card_last4',
        occurred_at = (r->>'occurred_at')::timestamptz, station = r->>'station', fuel_type = r->>'fuel_type', liters = (r->>'liters')::numeric,
        unit_price = (r->>'unit_price')::numeric, amount = (r->>'amount')::numeric, odometer = (r->>'odometer')::numeric, provider_state = v_state,
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
END $$;

-- Owner remaps one staged row explicitly (for unmatched/ambiguous rows).
CREATE OR REPLACE FUNCTION public.petroapp_assign(p_tx uuid, p_asset uuid, p_driver uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ex petroapp_transactions;
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN RAISE EXCEPTION 'ربط عمليات PetroApp للمدير العام فقط'; END IF;
  SELECT * INTO ex FROM petroapp_transactions WHERE id = p_tx FOR UPDATE;
  IF NOT FOUND OR ex.review_state NOT IN ('pending','rejected') THEN RAISE EXCEPTION 'لا يمكن تعديل ربط هذه العملية'; END IF;
  IF NOT EXISTS (SELECT 1 FROM assets WHERE id = p_asset) THEN RAISE EXCEPTION 'المركبة غير موجودة'; END IF;
  UPDATE petroapp_transactions SET asset_id = p_asset, driver_id = p_driver, mapping_status = 'matched', review_state = 'pending', updated_at = now() WHERE id = p_tx;
  INSERT INTO petroapp_transaction_events(transaction_id, kind, previous, next, actor)
  VALUES (p_tx, 'remapped', jsonb_build_object('asset_id', ex.asset_id, 'driver_id', ex.driver_id, 'mapping_status', ex.mapping_status), jsonb_build_object('asset_id', p_asset, 'driver_id', p_driver), auth.uid());
END $$;

-- Explicit review: approve/reject staged rows, or apply a provider correction/cancellation to an imported fuel entry.
CREATE OR REPLACE FUNCTION public.petroapp_review(p_tx uuid, p_decision text, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ex petroapp_transactions;
BEGIN
  IF NOT public.petroapp_can_review() THEN RAISE EXCEPTION 'غير مصرح بمراجعة عمليات PetroApp'; END IF;
  SELECT * INTO ex FROM petroapp_transactions WHERE id = p_tx FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'العملية غير موجودة'; END IF;
  IF p_decision = 'approve' THEN
    IF ex.review_state <> 'pending' OR ex.mapping_status <> 'matched' OR ex.provider_state <> 'completed' OR ex.liters IS NULL OR ex.unit_price IS NULL OR ex.amount IS NULL THEN
      RAISE EXCEPTION 'لا يمكن اعتماد عملية غير مربوطة أو ناقصة البيانات';
    END IF;
    UPDATE petroapp_transactions SET review_state = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note WHERE id = p_tx;
    INSERT INTO petroapp_transaction_events(transaction_id, kind, actor, note) VALUES (p_tx, 'approved', auth.uid(), p_note);
  ELSIF p_decision = 'reject' THEN
    IF ex.review_state NOT IN ('pending','approved') THEN RAISE EXCEPTION 'لا يمكن رفض هذه العملية'; END IF;
    UPDATE petroapp_transactions SET review_state = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note WHERE id = p_tx;
    INSERT INTO petroapp_transaction_events(transaction_id, kind, actor, note) VALUES (p_tx, 'rejected', auth.uid(), p_note);
  ELSIF p_decision = 'apply_correction' THEN
    IF ex.review_state <> 'correction_pending' OR ex.mapping_status <> 'matched' OR ex.liters IS NULL OR ex.unit_price IS NULL OR ex.amount IS NULL THEN RAISE EXCEPTION 'لا يوجد تصحيح قابل للتطبيق'; END IF;
    -- The fuel entry returns to pending so the corrected figures are re-approved; the before/after stays in events and audit_log.
    UPDATE fuel_entries SET asset_id = ex.asset_id, driver_id = ex.driver_id, filled_at = ex.occurred_at, station = ex.station, liters = ex.liters,
      unit_price = ex.unit_price, amount = ex.amount, odometer = ex.odometer, status = 'pending' WHERE id = ex.fuel_entry_id;
    UPDATE petroapp_transactions SET review_state = 'imported', reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note WHERE id = p_tx;
    INSERT INTO petroapp_transaction_events(transaction_id, kind, actor, note) VALUES (p_tx, 'applied_correction', auth.uid(), p_note);
  ELSIF p_decision = 'apply_cancellation' THEN
    IF ex.review_state <> 'cancellation_pending' THEN RAISE EXCEPTION 'لا يوجد إلغاء قابل للتطبيق'; END IF;
    UPDATE fuel_entries SET status = 'rejected' WHERE id = ex.fuel_entry_id;
    UPDATE petroapp_transactions SET review_state = 'cancelled', reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note WHERE id = p_tx;
    INSERT INTO petroapp_transaction_events(transaction_id, kind, actor, note) VALUES (p_tx, 'applied_cancellation', auth.uid(), p_note);
  ELSE RAISE EXCEPTION 'قرار غير معروف'; END IF;
END $$;

-- Import approved rows into fuel_entries as pending (never auto-approved); idempotent through client_event_id.
CREATE OR REPLACE FUNCTION public.petroapp_import(p_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ex petroapp_transactions; v_fuel uuid; c_imp int := 0; c_skip int := 0;
BEGIN
  IF NOT public.petroapp_can_review() THEN RAISE EXCEPTION 'غير مصرح باستيراد عمليات PetroApp'; END IF;
  IF coalesce(array_length(p_ids, 1), 0) > 200 THEN RAISE EXCEPTION 'الحد 200 عملية في كل مرة'; END IF;
  FOR ex IN SELECT * FROM petroapp_transactions WHERE id = ANY(p_ids) ORDER BY occurred_at FOR UPDATE LOOP
    IF ex.review_state <> 'approved' OR ex.mapping_status <> 'matched' OR ex.provider_state <> 'completed' OR ex.fuel_entry_id IS NOT NULL THEN c_skip := c_skip + 1; CONTINUE; END IF;
    SELECT id INTO v_fuel FROM fuel_entries WHERE client_event_id = 'petroapp:' || ex.provider_txn_id;
    IF v_fuel IS NULL THEN
      INSERT INTO fuel_entries(asset_id, driver_id, filled_at, station, liters, unit_price, amount, odometer, full_tank, source, status, client_event_id)
      VALUES (ex.asset_id, ex.driver_id, ex.occurred_at, ex.station, ex.liters, ex.unit_price, ex.amount, ex.odometer, false, 'petroapp', 'pending', 'petroapp:' || ex.provider_txn_id)
      RETURNING id INTO v_fuel;
      -- An older odometer reading never lowers the vehicle's current odometer.
      IF ex.odometer IS NOT NULL THEN UPDATE assets SET odometer_km = ex.odometer WHERE id = ex.asset_id AND coalesce(odometer_km, 0) < ex.odometer; END IF;
    END IF;
    UPDATE petroapp_transactions SET review_state = 'imported', fuel_entry_id = v_fuel, updated_at = now() WHERE id = ex.id;
    INSERT INTO petroapp_transaction_events(transaction_id, kind, next, actor) VALUES (ex.id, 'imported', jsonb_build_object('fuel_entry_id', v_fuel), auth.uid());
    c_imp := c_imp + 1;
  END LOOP;
  RETURN jsonb_build_object('imported', c_imp, 'skipped', c_skip);
END $$;

REVOKE EXECUTE ON FUNCTION public.petroapp_can_review(), public.petroapp_run_begin(text, timestamptz, timestamptz), public.petroapp_run_finish(uuid, text, jsonb, text, text),
  public.petroapp_stage(uuid, jsonb), public.petroapp_assign(uuid, uuid, uuid), public.petroapp_review(uuid, text, text), public.petroapp_import(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.petroapp_can_review(), public.petroapp_run_begin(text, timestamptz, timestamptz), public.petroapp_run_finish(uuid, text, jsonb, text, text),
  public.petroapp_stage(uuid, jsonb), public.petroapp_assign(uuid, uuid, uuid), public.petroapp_review(uuid, text, text), public.petroapp_import(uuid[]) TO authenticated, service_role;