CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid,_role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_roles target WHERE target.user_id=_user_id AND target.role=_role) AND (
 _user_id=auth.uid() OR auth.role()='service_role' OR (auth.uid() IS NULL AND session_user IN ('postgres','supabase_admin')) OR EXISTS(SELECT 1 FROM public.user_roles actor WHERE actor.user_id=auth.uid() AND actor.role IN ('owner','ops_manager','dispatcher','fleet_supervisor','accountant','maintenance'))
 ) $$;
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid,_roles public.app_role[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_roles target WHERE target.user_id=_user_id AND target.role=ANY(_roles)) AND (
 _user_id=auth.uid() OR auth.role()='service_role' OR (auth.uid() IS NULL AND session_user IN ('postgres','supabase_admin')) OR EXISTS(SELECT 1 FROM public.user_roles actor WHERE actor.user_id=auth.uid() AND actor.role IN ('owner','ops_manager','dispatcher','fleet_supervisor','accountant','maintenance'))
 ) $$;
REVOKE ALL ON FUNCTION public.has_role(uuid,public.app_role),public.has_any_role(uuid,public.app_role[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid,public.app_role),public.has_any_role(uuid,public.app_role[]) TO authenticated,service_role;