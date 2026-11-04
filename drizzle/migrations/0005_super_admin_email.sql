CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE inv record;
BEGIN
  INSERT INTO public.profiles(id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)), NEW.email)
  ON CONFLICT (id) DO NOTHING;

  IF lower(NEW.email) = 'abdulazizrashudi@gmail.com' THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'owner') ON CONFLICT DO NOTHING;
    RETURN NEW;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'owner') THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'owner');
    RETURN NEW;
  END IF;

  SELECT * INTO inv FROM public.invitations WHERE lower(email) = lower(NEW.email) AND accepted_at IS NULL LIMIT 1;
  IF FOUND THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, inv.role) ON CONFLICT DO NOTHING;
    IF inv.driver_id IS NOT NULL THEN
      UPDATE public.drivers SET user_id = NEW.id WHERE id = inv.driver_id AND user_id IS NULL;
    END IF;
    UPDATE public.invitations SET accepted_at = now() WHERE id = inv.id;
  END IF;
  RETURN NEW;
END $function$;