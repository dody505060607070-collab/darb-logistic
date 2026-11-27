-- PetroApp staging/review regression. Everything is rolled back (Z0001); uses synthetic provider IDs only.
DO $$
DECLARE owner_id uuid; stranger uuid := gen_random_uuid(); a1 uuid; a2 uuid; run uuid; run2 uuid; tx uuid; res jsonb; blocked boolean;
        fuel uuid; manual uuid; n_manual int; n_expected int; ref text := 'TEST-' || substr(gen_random_uuid()::text,1,8); odo numeric;
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
  blocked := false;
  BEGIN PERFORM public.petroapp_set_full_tank(gen_random_uuid(), true); EXCEPTION WHEN raise_exception THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Role-less user set full_tank'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub',owner_id,'role','authenticated')::text, true);
  UPDATE public.assets SET odometer_km = 500000 WHERE id = a1;
  INSERT INTO public.petroapp_mappings(kind, provider_ref, asset_id) VALUES ('vehicle', ref||'-V1', a1), ('card', ref||'-C2', a2), ('vehicle', ref||'-V3', a1);
  -- Full card numbers are rejected.
  blocked := false;
  BEGIN INSERT INTO public.petroapp_mappings(kind, provider_ref, asset_id) VALUES ('card', '4111111111111111', a1); EXCEPTION WHEN check_violation THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Full card number stored'; END IF;

  run := public.petroapp_run_begin('sync');
  res := public.petroapp_stage(run, jsonb_build_array(
    jsonb_build_object('provider_txn_id', ref||'-T1', 'occurred_at','2026-11-01T08:00:00Z', 'provider_vehicle_ref', ref||'-V1', 'liters','100','unit_price','2.33','amount','233','odometer','1000','provider_state','completed'),
    jsonb_build_object('provider_txn_id', ref||'-T2', 'occurred_at','2026-11-01T09:00:00Z', 'provider_vehicle_ref', ref||'-V1', 'provider_card_ref', ref||'-C2', 'liters','10','unit_price','2','amount','20','provider_state','completed'),
    jsonb_build_object('provider_txn_id', ref||'-T3', 'occurred_at','2026-11-01T10:00:00Z', 'provider_vehicle_ref', 'NOPE', 'liters','10','unit_price','2','amount','20','provider_state','completed')));
  IF (res->>'staged')::int <> 3 OR (res->>'unmatched')::int <> 2 THEN RAISE EXCEPTION 'Stage counts wrong: %', res; END IF;
  IF (SELECT mapping_status FROM public.petroapp_transactions WHERE provider_txn_id = ref||'-T2') <> 'ambiguous' THEN RAISE EXCEPTION 'Conflicting vehicle/card not ambiguous'; END IF;
  -- Ambiguous cannot be approved.
  blocked := false;
  BEGIN PERFORM public.petroapp_review((SELECT id FROM public.petroapp_transactions WHERE provider_txn_id = ref||'-T2'), 'approve'); EXCEPTION WHEN raise_exception THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Ambiguous row approved'; END IF;
  -- Duplicate sync of same content is a no-op.
  res := public.petroapp_stage(run, jsonb_build_array(jsonb_build_object('provider_txn_id', ref||'-T1', 'occurred_at','2026-11-01T08:00:00Z', 'provider_vehicle_ref', ref||'-V1', 'liters','100','unit_price','2.33','amount','233','odometer','1000','provider_state','completed')));
  IF (res->>'duplicates')::int <> 1 OR (SELECT count(*) FROM public.petroapp_transactions WHERE provider_txn_id = ref||'-T1') <> 1 THEN RAISE EXCEPTION 'Duplicate not idempotent'; END IF;
  -- Import requires approval; import is pending, idempotent, old odometer does not lower the asset.
  SELECT id INTO tx FROM public.petroapp_transactions WHERE provider_txn_id = ref||'-T1';
  res := public.petroapp_import(ARRAY[tx]);
  IF (res->>'imported')::int <> 0 THEN RAISE EXCEPTION 'Unapproved row imported'; END IF;
  -- full_tank is never guessed: approval is blocked until a reviewer sets it.
  IF (SELECT full_tank FROM public.petroapp_transactions WHERE id = tx) IS NOT NULL THEN RAISE EXCEPTION 'full_tank guessed'; END IF;
  blocked := false;
  BEGIN PERFORM public.petroapp_review(tx, 'approve'); EXCEPTION WHEN raise_exception THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Approved without full_tank'; END IF;
  PERFORM public.petroapp_set_full_tank(tx, true);
  PERFORM public.petroapp_review(tx, 'approve');
  res := public.petroapp_import(ARRAY[tx, tx]);
  res := public.petroapp_import(ARRAY[tx]);
  IF (SELECT count(*) FROM public.fuel_entries WHERE client_event_id = 'petroapp:'||ref||'-T1') <> 1 THEN RAISE EXCEPTION 'Import not idempotent'; END IF;
  SELECT fuel_entry_id INTO fuel FROM public.petroapp_transactions WHERE id = tx;
  IF (SELECT status FROM public.fuel_entries WHERE id = fuel) <> 'pending' THEN RAISE EXCEPTION 'Import auto-approved'; END IF;
  IF (SELECT full_tank FROM public.fuel_entries WHERE id = fuel) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Import ignored explicit full_tank'; END IF;
  SELECT odometer_km INTO odo FROM public.assets WHERE id = a1;
  IF odo <> 500000 THEN RAISE EXCEPTION 'Asset odometer changed by import (%).', odo; END IF;
  -- Odometer unit is unproven: raw value stays on the staged row only, never copied to fuel_entries.
  IF (SELECT odometer FROM public.fuel_entries WHERE id = fuel) IS NOT NULL THEN RAISE EXCEPTION 'Raw odometer copied into fuel_entries'; END IF;
  IF (SELECT odometer FROM public.petroapp_transactions WHERE id = tx) <> 1000 THEN RAISE EXCEPTION 'Staged raw odometer lost'; END IF;
  -- No automatic WhatsApp for PetroApp imports.
  IF EXISTS (SELECT 1 FROM public.whatsapp_outbox WHERE entity_id = fuel) THEN RAISE EXCEPTION 'PetroApp import queued WhatsApp'; END IF;
  -- A manual fuel insert still follows the existing wa_admins path (same number of queued rows as a direct call).
  INSERT INTO public.fuel_entries(asset_id, filled_at, liters, unit_price, amount, source, status) VALUES (a1, now(), 5, 2, 10, 'manual', 'pending') RETURNING id INTO manual;
  SELECT count(*) INTO n_manual FROM public.whatsapp_outbox WHERE entity_id = manual;
  PERFORM public.wa_admins('test', 'fuel', fuel);
  SELECT count(*) INTO n_expected FROM public.whatsapp_outbox WHERE entity_id = fuel;
  IF n_manual <> n_expected THEN RAISE EXCEPTION 'Manual fuel notice path changed (% vs %)', n_manual, n_expected; END IF;
  DELETE FROM public.whatsapp_outbox WHERE entity_id IN (manual, fuel);
  -- Accountant-style approval of the fuel entry, then a provider correction must not overwrite it silently.
  UPDATE public.fuel_entries SET status = 'approved' WHERE id = fuel;
  PERFORM public.petroapp_run_finish(run, 'ok');
  run2 := public.petroapp_run_begin('sync');
  PERFORM public.petroapp_stage(run2, jsonb_build_array(jsonb_build_object('provider_txn_id', ref||'-T1', 'occurred_at','2026-11-01T08:00:00Z', 'provider_vehicle_ref', ref||'-V1', 'liters','90','unit_price','2.33','amount','209.7','odometer','1000','provider_state','completed')));
  IF (SELECT liters FROM public.fuel_entries WHERE id = fuel) <> 100 OR (SELECT status FROM public.fuel_entries WHERE id = fuel) <> 'approved' THEN RAISE EXCEPTION 'Approved fuel entry silently overwritten'; END IF;
  IF (SELECT review_state FROM public.petroapp_transactions WHERE id = tx) <> 'correction_pending' THEN RAISE EXCEPTION 'Correction not flagged'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.petroapp_transaction_events WHERE transaction_id = tx AND kind = 'correction' AND (previous->>'liters')::numeric = 100) THEN RAISE EXCEPTION 'Correction history missing'; END IF;
  -- Correction resets full_tank (source unmapped) and needs an explicit value before it applies.
  IF (SELECT full_tank FROM public.petroapp_transactions WHERE id = tx) IS NOT NULL THEN RAISE EXCEPTION 'Correction kept stale full_tank'; END IF;
  blocked := false;
  BEGIN PERFORM public.petroapp_review(tx, 'apply_correction', 'test'); EXCEPTION WHEN raise_exception THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Correction applied without full_tank'; END IF;
  PERFORM public.petroapp_set_full_tank(tx, false);
  PERFORM public.petroapp_review(tx, 'apply_correction', 'test');
  IF (SELECT full_tank FROM public.fuel_entries WHERE id = fuel) IS DISTINCT FROM false THEN RAISE EXCEPTION 'Correction did not update full_tank'; END IF;
  IF (SELECT liters FROM public.fuel_entries WHERE id = fuel) <> 90 OR (SELECT status FROM public.fuel_entries WHERE id = fuel) <> 'pending' THEN RAISE EXCEPTION 'Correction not re-queued for approval'; END IF;
  -- Cancellation becomes pending, then explicitly applied.
  PERFORM public.petroapp_stage(run2, jsonb_build_array(jsonb_build_object('provider_txn_id', ref||'-T1', 'occurred_at','2026-11-01T08:00:00Z', 'provider_vehicle_ref', ref||'-V1', 'liters','90','unit_price','2.33','amount','209.7','odometer','1000','provider_state','cancelled')));
  IF (SELECT review_state FROM public.petroapp_transactions WHERE id = tx) <> 'cancellation_pending' THEN RAISE EXCEPTION 'Cancellation not flagged'; END IF;
  PERFORM public.petroapp_review(tx, 'apply_cancellation');
  IF (SELECT status FROM public.fuel_entries WHERE id = fuel) <> 'rejected' THEN RAISE EXCEPTION 'Cancellation not applied'; END IF;
  -- Missing provider state is rejected, never assumed completed.
  blocked := false;
  BEGIN PERFORM public.petroapp_stage(run2, jsonb_build_array(jsonb_build_object('provider_txn_id', ref||'-T8', 'occurred_at','2026-11-01T08:00:00Z'))); EXCEPTION WHEN raise_exception THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Missing provider_state accepted'; END IF;
  -- Non-boolean full_tank is rejected.
  blocked := false;
  BEGIN PERFORM public.petroapp_stage(run2, jsonb_build_array(jsonb_build_object('provider_txn_id', ref||'-T7', 'occurred_at','2026-11-01T08:00:00Z','provider_state','completed','full_tank','yes'))); EXCEPTION WHEN raise_exception THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Non-boolean full_tank accepted'; END IF;
  -- Unknown provider state is rejected, not turned into completed.
  blocked := false;
  BEGIN PERFORM public.petroapp_stage(run2, jsonb_build_array(jsonb_build_object('provider_txn_id', ref||'-T9', 'occurred_at','2026-11-01T08:00:00Z', 'provider_state','reversed'))); EXCEPTION WHEN raise_exception THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Unknown provider_state accepted'; END IF;
  -- 429 stop: after a rate-limited run no new run may start.
  PERFORM public.petroapp_run_finish(run2, 'rate_limited', '{}'::jsonb, 'HTTP 429');
  blocked := false;
  BEGIN PERFORM public.petroapp_run_begin('preview'); EXCEPTION WHEN raise_exception THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Run allowed right after rate limit'; END IF;
  RAISE EXCEPTION USING ERRCODE='Z0001', MESSAGE='petroapp fixtures rollback';
 EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL;
 END;
 RAISE NOTICE 'PASS: role denial, no full card numbers, ambiguous blocked, duplicate idempotent, approval-gated pending import, odometer staged-only, no PetroApp WhatsApp, manual notice path kept, missing/unknown state rejected, full_tank explicit before approve/import/correction, correction/cancellation audited and explicit, 429 stop; rolled back';
END $$;
