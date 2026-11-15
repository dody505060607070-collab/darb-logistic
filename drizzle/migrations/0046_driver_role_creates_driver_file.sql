CREATE OR REPLACE FUNCTION public.ensure_driver_file_for_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p record;
BEGIN
  IF NEW.role <> 'driver' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.drivers WHERE user_id = NEW.user_id) THEN RETURN NEW; END IF;
  SELECT full_name, phone, branch_id INTO p FROM public.profiles WHERE id = NEW.user_id;
  INSERT INTO public.drivers (code, full_name, phone, user_id, branch_id)
  VALUES ('DRV-' || left(NEW.user_id::text, 8), coalesce(nullif(trim(p.full_name), ''), p.phone, 'سائق جديد'), p.phone, NEW.user_id, p.branch_id)
  ON CONFLICT (code) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_driver_file_for_role() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS driver_role_creates_driver_file ON public.user_roles;
CREATE TRIGGER driver_role_creates_driver_file
AFTER INSERT ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.ensure_driver_file_for_role();