-- Run with the database SQL tool; the final RAISE rolls everything back and prints the counts.
-- Expected: routine_to_owners=0 (no dispatcher/fleet staff), important_to_owners>0, deleted_number=0, driver=1.
DO $$
DECLARE e uuid := gen_random_uuid(); r_routine int; r_important int; r_deleted int; r_driver int;
BEGIN
  PERFORM public.wa_department('اختبار روتيني','trip_status',e,false);
  SELECT count(*) INTO r_routine FROM whatsapp_outbox WHERE entity_id=e;
  PERFORM public.wa_department('اختبار توقف','vehicle_stopped',e,false);
  SELECT count(*) INTO r_important FROM whatsapp_outbox WHERE entity_id=e AND event='vehicle_stopped';
  PERFORM public.wa_enqueue('+201221996350','اختبار رقم محذوف','trip_status',e);  -- number of a deleted employee
  SELECT count(*) INTO r_deleted FROM whatsapp_outbox WHERE entity_id=e AND phone='201221996350';
  PERFORM public.wa_enqueue('+966578393155','اختبار سائق','trip_status',e);       -- an existing driver file
  SELECT count(*) INTO r_driver FROM whatsapp_outbox WHERE entity_id=e AND phone='966578393155';
  RAISE EXCEPTION 'RESULT routine_to_owners=% important_to_owners=% deleted_number=% driver=%', r_routine, r_important, r_deleted, r_driver;
END $$;
