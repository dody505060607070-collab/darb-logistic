-- PetroApp staging/review regression. Everything is rolled back (Z0001); uses synthetic provider IDs only.
DO $$
DECLARE owner_id uuid; stranger uuid := gen_random_uuid(); a1 uuid; a2 uuid; run uuid; run2 uuid; tx uuid; res jsonb; blocked boolean;
        fuel uuid; ref text := 'TEST-' || substr(gen_random_uuid()::text,1,8); odo numeric;
BEGIN
 SELECT user_id INTO owner_id FROM public.user_roles WHERE role='owner' LIMIT 1;
 SELECT id INTO a1 FROM public.assets ORDER BY created_at LIMIT 1;
 SELECT id INTO a2 FROM public.assets WHERE id <> a1 ORDER BY created_at LIMIT 1;
 BEGIN
  -- 1. No role: cannot begin a run, cannot read.
  PERFORM set_config('request.jwt.claims', json_build_object('sub',stranger,'role','authenticated')::text, true);
  blocked := false;
  BEGIN PERFORM public.petroapp_run_begin('sync'); EXCEPTION WHEN raise_exception THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Role-less user started a sync'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub',owner_id,'role','authenticated')::text, true);
  UPDATE public.assets SET odometer_km = 500000 WHERE id = a1;
  INSERT INTO public.petroapp_mappings(kind, provider_ref, asset_id) VALUES ('vehicle', ref||'-V1', a1), ('card', ref||'-C2', a2), ('vehicle', ref||'-V3', a1);
  -- Full card numbers are rejected.
  blocked := false;
  BEGIN INSERT INTO public.petroapp_mappings(kind, provider_ref, asset_id) VALUES ('card', '4111111111111111', a1); EXCEPTION WHEN check_violation THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Full card number stored'; END IF;

  run := public.petroapp_run_begin('sync');
  res := public.petroapp_stage(run, jsonb_build_array(
    jsonb_build_object('provider_txn_id', ref||'-T1', 'occurred_at','2026-11-01T08:00:00Z', 'provider_vehicle_ref', ref||'-V1', 'liters','100','unit_price','2.33','amount','233','odometer','1000'),
    jsonb_build_object('provider_txn_id', ref||'-T2', 'occurred_at','2026-11-01T09:00:00Z', 'provider_vehicle_ref', ref||'-V1', 'provider_card_ref', ref||'-C2', 'liters','10','unit_price','2','amount','20'),
    jsonb_build_object('provider_txn_id', ref||'-T3', 'occurred_at','2026-11-01T10:00:00Z', 'provider_vehicle_ref', 'NOPE', 'liters','10','unit_price','2','amount','20')));
  IF (res->>'staged')::int <> 3 OR (res->>'unmatched')::int <> 2 THEN RAISE EXCEPTION 'Stage counts wrong: %', res; END IF;
  IF (SELECT mapping_status FROM public.petroapp_transactions WHERE provider_txn_id = ref||'-T2') <> 'ambiguous' THEN RAISE EXCEPTION 'Conflicting vehicle/card not ambiguous'; END IF;
  -- Ambiguous cannot be approved.
  blocked := false;
  BEGIN PERFORM public.petroapp_review((SELECT id FROM public.petroapp_transactions WHERE provider_txn_id = ref||'-T2'), 'approve'); EXCEPTION WHEN raise_exception THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Ambiguous row approved'; END IF;
  -- Duplicate sync of same content is a no-op.
  res := public.petroapp_stage(run, jsonb_build_array(jsonb_build_object('provider_txn_id', ref||'-T1', 'occurred_at','2026-11-01T08:00:00Z', 'provider_vehicle_ref', ref||'-V1', 'liters','100','unit_price','2.33','amount','233','odometer','1000')));
  IF (res->>'duplicates')::int <> 1 OR (SELECT count(*) FROM public.petroapp_transactions WHERE provider_txn_id = ref||'-T1') <> 1 THEN RAISE EXCEPTION 'Duplicate not idempotent'; END IF;
  -- Import requires approval; import is pending, idempotent, old odometer does not lower the asset.
  SELECT id INTO tx FROM public.petroapp_transactions WHERE provider_txn_id = ref||'-T1';
  res := public.petroapp_import(ARRAY[tx]);
  IF (res->>'imported')::int <> 0 THEN RAISE EXCEPTION 'Unapproved row imported'; END IF;
  PERFORM public.petroapp_review(tx, 'approve');
  res := public.petroapp_import(ARRAY[tx, tx]);
  res := public.petroapp_import(ARRAY[tx]);
  IF (SELECT count(*) FROM public.fuel_entries WHERE client_event_id = 'petroapp:'||ref||'-T1') <> 1 THEN RAISE EXCEPTION 'Import not idempotent'; END IF;
  SELECT fuel_entry_id INTO fuel FROM public.petroapp_transactions WHERE id = tx;
  IF (SELECT status FROM public.fuel_entries WHERE id = fuel) <> 'pending' THEN RAISE EXCEPTION 'Import auto-approved'; END IF;
  SELECT odometer_km INTO odo FROM public.assets WHERE id = a1;
  IF odo <> 500000 THEN RAISE EXCEPTION 'Older odometer replaced newer (%).', odo; END IF;
  -- Accountant-style approval of the fuel entry, then a provider correction must not overwrite it silently.
  UPDATE public.fuel_entries SET status = 'approved' WHERE id = fuel;
  PERFORM public.petroapp_run_finish(run, 'ok');
  run2 := public.petroapp_run_begin('sync');
  PERFORM public.petroapp_stage(run2, jsonb_build_array(jsonb_build_object('provider_txn_id', ref||'-T1', 'occurred_at','2026-11-01T08:00:00Z', 'provider_vehicle_ref', ref||'-V1', 'liters','90','unit_price','2.33','amount','209.7','odometer','1000')));
  IF (SELECT liters FROM public.fuel_entries WHERE id = fuel) <> 100 OR (SELECT status FROM public.fuel_entries WHERE id = fuel) <> 'approved' THEN RAISE EXCEPTION 'Approved fuel entry silently overwritten'; END IF;
  IF (SELECT review_state FROM public.petroapp_transactions WHERE id = tx) <> 'correction_pending' THEN RAISE EXCEPTION 'Correction not flagged'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.petroapp_transaction_events WHERE transaction_id = tx AND kind = 'correction' AND (previous->>'liters')::numeric = 100) THEN RAISE EXCEPTION 'Correction history missing'; END IF;
  PERFORM public.petroapp_review(tx, 'apply_correction', 'test');
  IF (SELECT liters FROM public.fuel_entries WHERE id = fuel) <> 90 OR (SELECT status FROM public.fuel_entries WHERE id = fuel) <> 'pending' THEN RAISE EXCEPTION 'Correction not re-queued for approval'; END IF;
  -- Cancellation becomes pending, then explicitly applied.
  PERFORM public.petroapp_stage(run2, jsonb_build_array(jsonb_build_object('provider_txn_id', ref||'-T1', 'occurred_at','2026-11-01T08:00:00Z', 'provider_vehicle_ref', ref||'-V1', 'liters','90','unit_price','2.33','amount','209.7','odometer','1000','provider_state','cancelled')));
  IF (SELECT review_state FROM public.petroapp_transactions WHERE id = tx) <> 'cancellation_pending' THEN RAISE EXCEPTION 'Cancellation not flagged'; END IF;
  PERFORM public.petroapp_review(tx, 'apply_cancellation');
  IF (SELECT status FROM public.fuel_entries WHERE id = fuel) <> 'rejected' THEN RAISE EXCEPTION 'Cancellation not applied'; END IF;
  -- 429 stop: after a rate-limited run no new run may start.
  PERFORM public.petroapp_run_finish(run2, 'rate_limited', '{}'::jsonb, 'HTTP 429');
  blocked := false;
  BEGIN PERFORM public.petroapp_run_begin('preview'); EXCEPTION WHEN raise_exception THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Run allowed right after rate limit'; END IF;
  RAISE EXCEPTION USING ERRCODE='Z0001', MESSAGE='petroapp fixtures rollback';
 EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL;
 END;
 RAISE NOTICE 'PASS: role denial, no full card numbers, ambiguous blocked, duplicate idempotent, approval-gated pending import, odometer kept, correction/cancellation audited and explicit, 429 stop; rolled back';
END $$;
