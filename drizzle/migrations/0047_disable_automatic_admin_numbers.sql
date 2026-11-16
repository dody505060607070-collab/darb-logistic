DELETE FROM public.admin_phone_reservations;
ALTER TABLE public.admin_phone_reservations ADD CONSTRAINT admin_phone_reservations_disabled CHECK (false) NOT VALID;
COMMENT ON TABLE public.admin_phone_reservations IS 'DEPRECATED: phone login requires an employee profile with an assigned role; no automatic administrator numbers.';
CREATE OR REPLACE FUNCTION public.apply_reserved_phone_owner(p_user_id uuid, p_verified_phone text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- DEPRECATED: never grants a role. Kept only so older deployed code keeps working.
  RETURN;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_reserved_phone_owner(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_reserved_phone_owner(uuid, text) TO service_role;
COMMENT ON FUNCTION public.apply_reserved_phone_owner(uuid, text) IS 'DEPRECATED: no-op; roles come only from user_roles assigned by administration.';