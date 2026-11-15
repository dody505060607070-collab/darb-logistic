-- Run with an authorized database connection; the final RAISE rolls everything back.
-- Rule: a department notice with no phone-holding staff in that department goes to owners instead of being dropped.
DO $$
DECLARE n int; dispatch int;
BEGIN
  SELECT count(*) INTO dispatch FROM profiles p JOIN user_roles ur ON ur.user_id=p.id
   WHERE ur.role IN ('dispatcher','ops_manager') AND nullif(trim(p.phone),'') IS NOT NULL;
  PERFORM public.wa_department('routing test', 'trip_created', gen_random_uuid(), false);
  SELECT count(*) INTO n FROM whatsapp_outbox WHERE body='routing test' AND event='trip_created';
  IF n = 0 THEN RAISE EXCEPTION 'FAIL: trip_created notice was dropped (dispatch staff with phone: %)', dispatch; END IF;
  RAISE EXCEPTION 'OK: % recipient(s) queued (dispatch staff with phone: %) — rolled back', n, dispatch;
END $$;
