CREATE OR REPLACE FUNCTION public.is_permanent_admin(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=_uid AND phone='+201222576172') $$;
REVOKE EXECUTE ON FUNCTION public.is_permanent_admin(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.permanent_admin_role_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF OLD.role='owner' AND public.is_permanent_admin(OLD.user_id) AND (TG_OP='DELETE' OR NEW.role<>'owner' OR NEW.user_id<>OLD.user_id) THEN
    RAISE EXCEPTION 'هذا المدير دائم ولا يمكن إزالة صلاحيته';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER permanent_admin_role_guard BEFORE UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.permanent_admin_role_guard();

CREATE OR REPLACE FUNCTION public.permanent_admin_profile_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF OLD.phone='+201222576172' AND (TG_OP='DELETE' OR NEW.phone IS DISTINCT FROM OLD.phone) THEN
    RAISE EXCEPTION 'هذا المدير دائم ولا يمكن حذفه أو تغيير رقمه';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER permanent_admin_profile_guard BEFORE UPDATE OR DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.permanent_admin_profile_guard();
REVOKE EXECUTE ON FUNCTION public.permanent_admin_role_guard(), public.permanent_admin_profile_guard() FROM PUBLIC, anon, authenticated;