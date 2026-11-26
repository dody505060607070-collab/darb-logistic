-- Privileged regression runner: every fixture and queued notification is rolled back.
-- Uses a synthetic unprivileged caller and an existing owner for review.
DO $$
DECLARE actor uuid := gen_random_uuid(); reviewer uuid; did uuid; doc uuid; cid uuid;
        blocked boolean; ref text := substr(gen_random_uuid()::text,1,8);
BEGIN
 SELECT user_id INTO reviewer FROM public.user_roles WHERE role='owner' LIMIT 1;
 IF reviewer IS NULL THEN RAISE EXCEPTION 'Owner required for review regression'; END IF;
 BEGIN
  PERFORM set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
  blocked := false;
  BEGIN
   INSERT INTO public.customers(name,payment_terms_days) VALUES('SEC-terms-'||ref,365);
  EXCEPTION WHEN raise_exception THEN
   IF SQLERRM NOT LIKE '%مدة السداد%' THEN RAISE; END IF;
   blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Unprivileged customer creation accepted 365 days'; END IF;
  INSERT INTO public.customers(name) VALUES('SEC-default-'||ref) RETURNING id INTO cid;
  IF (SELECT payment_terms_days FROM public.customers WHERE id=cid) IS DISTINCT FROM 30 THEN RAISE EXCEPTION 'Default must remain 30'; END IF;
  blocked := false;
  BEGIN
   UPDATE public.customers SET payment_terms_days=365 WHERE id=cid;
  EXCEPTION WHEN raise_exception THEN
   IF SQLERRM NOT LIKE '%مدة السداد%' THEN RAISE; END IF;
   blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Unprivileged customer update accepted 365 days'; END IF;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',reviewer,'role','authenticated')::text,true);
  UPDATE public.customers SET payment_terms_days=45 WHERE id=cid;
  IF (SELECT payment_terms_days FROM public.customers WHERE id=cid) IS DISTINCT FROM 45 THEN RAISE EXCEPTION 'Owner terms update failed'; END IF;
  INSERT INTO public.drivers(code,full_name,license_no,license_expiry) VALUES('SEC-'||ref,'Rollback license fixture','OLD-LICENSE','2020-01-01') RETURNING id INTO did;
  -- No real driver, phone, external message or uploaded file is involved.
  PERFORM set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
  INSERT INTO public.documents(entity_type,entity_id,doc_type,number,expiry_date,review_status)
   VALUES('driver',did,'رخصة قيادة','UNREVIEWED','2035-01-01','approved') RETURNING id INTO doc;
  IF (SELECT review_status FROM public.documents WHERE id=doc) <> 'pending' THEN RAISE EXCEPTION 'Self upload was not forced pending'; END IF;
  IF (SELECT license_expiry FROM public.drivers WHERE id=did) IS DISTINCT FROM DATE '2020-01-01' THEN RAISE EXCEPTION 'Pending license changed eligibility'; END IF;
  IF (SELECT license_no FROM public.drivers WHERE id=did) IS DISTINCT FROM 'OLD-LICENSE' THEN RAISE EXCEPTION 'Pending license changed identity'; END IF;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',reviewer,'role','authenticated')::text,true);
  UPDATE public.documents SET review_status='approved' WHERE id=doc;
  IF (SELECT license_expiry FROM public.drivers WHERE id=did) IS DISTINCT FROM DATE '2035-01-01' THEN RAISE EXCEPTION 'Approved license did not sync'; END IF;
  UPDATE public.documents SET review_status='rejected' WHERE id=doc;
  IF (SELECT license_expiry FROM public.drivers WHERE id=did) IS NOT NULL THEN RAISE EXCEPTION 'Rejected license retained eligibility'; END IF;
  UPDATE public.documents SET review_status='approved' WHERE id=doc;
  DELETE FROM public.documents WHERE id=doc;
  IF (SELECT license_expiry FROM public.drivers WHERE id=did) IS NOT NULL THEN RAISE EXCEPTION 'Deleted license retained eligibility'; END IF;
  RAISE EXCEPTION USING ERRCODE='Z0001', MESSAGE='security fixtures rollback';
 EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL;
 END;
 RAISE NOTICE 'PASS: 365-day create/update denied; default 30; owner 45; pending date/number unchanged; approved sync; rejected/deleted revoked; all fixtures rolled back';
END $$;