-- Keeps the employee account and its linked driver file showing the same name and phone.
CREATE OR REPLACE FUNCTION public.profile_to_driver_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_name text := nullif(trim(coalesce(NEW.full_name, '')), '');
BEGIN
  -- Names that are just a phone placeholder are not copied; GPS device files keep the device name (it is their match key).
  IF NEW.full_name IS DISTINCT FROM OLD.full_name AND v_name IS NOT NULL AND v_name !~ '^\+?[0-9 ]+$' THEN
    UPDATE drivers SET full_name = v_name
    WHERE user_id = NEW.id AND full_name IS DISTINCT FROM v_name AND coalesce(source, '') NOT LIKE '%\_gps';
  END IF;
  IF NEW.phone IS DISTINCT FROM OLD.phone AND NEW.phone IS NOT NULL THEN
    UPDATE drivers SET phone = NEW.phone WHERE user_id = NEW.id AND phone IS DISTINCT FROM NEW.phone;
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.driver_to_profile_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_name text := nullif(trim(coalesce(NEW.full_name, '')), '');
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NULL; END IF;
  -- Name follows the driver file when linked or renamed.
  IF v_name IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.full_name IS DISTINCT FROM OLD.full_name OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    UPDATE profiles SET full_name = v_name
    WHERE id = NEW.user_id AND full_name IS DISTINCT FROM v_name
      AND (TG_OP = 'INSERT' OR NEW.full_name IS DISTINCT FROM OLD.full_name OR nullif(trim(coalesce(full_name, '')), '') IS NULL OR full_name ~ '^\+?[0-9 ]+$');
  END IF;
  -- The phone is the login identity: only administration (or the system) moves it.
  IF NEW.phone IS NOT NULL AND TG_OP = 'UPDATE' AND NEW.phone IS DISTINCT FROM OLD.phone
     AND (auth.uid() IS NULL OR public.has_role(auth.uid(), 'owner')) THEN
    BEGIN
      UPDATE profiles SET phone = NEW.phone WHERE id = NEW.user_id AND phone IS DISTINCT FROM NEW.phone;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'رقم الجوال مرتبط بموظف آخر';
    END;
  END IF;
  RETURN NULL;
END $$;

REVOKE EXECUTE ON FUNCTION public.profile_to_driver_sync() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.driver_to_profile_sync() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profile_to_driver_sync ON public.profiles;
CREATE TRIGGER profile_to_driver_sync AFTER UPDATE OF full_name, phone ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profile_to_driver_sync();

DROP TRIGGER IF EXISTS driver_to_profile_sync ON public.drivers;
CREATE TRIGGER driver_to_profile_sync AFTER INSERT OR UPDATE OF full_name, phone, user_id ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.driver_to_profile_sync();