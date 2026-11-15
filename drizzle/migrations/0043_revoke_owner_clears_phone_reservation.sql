CREATE OR REPLACE FUNCTION public.owner_revocation_clears_reservation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_phone text;
BEGIN
  IF OLD.role <> 'owner' OR auth.uid() IS NULL OR auth.uid() = OLD.user_id THEN RETURN OLD; END IF;
  SELECT phone INTO v_phone FROM public.profiles WHERE id = OLD.user_id;
  IF v_phone IS NULL OR regexp_replace(v_phone, '\D', '', 'g') = '' THEN RETURN OLD; END IF;
  DELETE FROM public.admin_phone_reservations
   WHERE regexp_replace(phone, '\D', '', 'g') = regexp_replace(v_phone, '\D', '', 'g');
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.owner_revocation_clears_reservation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS owner_revocation_clears_reservation ON public.user_roles;
CREATE TRIGGER owner_revocation_clears_reservation
AFTER DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.owner_revocation_clears_reservation();