ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'field_maintenance';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'workshop';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'representative';
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.has_any_role(_user_id, ARRAY['owner','ops_manager','dispatcher','fleet_supervisor','accountant','maintenance']::public.app_role[]) $$;
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE inv record;
BEGIN
 INSERT INTO public.profiles(id,full_name,email,phone) VALUES(NEW.id,COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name',''),NULLIF(NEW.raw_user_meta_data->>'name',''),NULLIF(NEW.phone,''),'موظف'),NEW.email,CASE WHEN NULLIF(NEW.phone,'') IS NULL THEN NULL ELSE '+'||regexp_replace(NEW.phone,'[^0-9]','','g') END) ON CONFLICT(id) DO NOTHING;
 SELECT * INTO inv FROM public.invitations WHERE lower(email)=lower(NEW.email) AND accepted_at IS NULL ORDER BY created_at LIMIT 1 FOR UPDATE;
 IF FOUND THEN
 INSERT INTO public.user_roles(user_id,role) VALUES(NEW.id,inv.role) ON CONFLICT DO NOTHING;
 IF inv.driver_id IS NOT NULL THEN UPDATE public.drivers SET user_id=NEW.id WHERE id=inv.driver_id AND user_id IS NULL; END IF;
 UPDATE public.invitations SET accepted_at=now() WHERE id=inv.id;
 END IF;
 RETURN NEW;
END $$;
COMMENT ON FUNCTION public.handle_new_user() IS 'Shitaa: preserve existing roles; uninvited new accounts require explicit assignment, reserved administrators are applied after verified OTP.';