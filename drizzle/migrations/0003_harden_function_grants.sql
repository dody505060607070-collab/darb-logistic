ALTER FUNCTION public.fuel_validate() SET search_path = public;

DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.prokind = 'f'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    IF f.proname IN ('audit_trigger','handle_new_user','fuel_validate','gps_apply','stock_apply','tire_sync','inspection_apply','incident_notify','expense_dedupe') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', f.sig);
    END IF;
  END LOOP;
END $$;
