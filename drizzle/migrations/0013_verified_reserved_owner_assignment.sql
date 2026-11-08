CREATE OR REPLACE FUNCTION public.apply_reserved_phone_owner(p_user_id uuid, p_verified_phone text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.admin_phone_reservations WHERE phone=p_verified_phone) THEN RETURN; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=p_user_id AND phone=p_verified_phone) THEN RAISE EXCEPTION 'Verified phone does not match account'; END IF;
 INSERT INTO public.user_roles(user_id,role) VALUES (p_user_id,'owner') ON CONFLICT DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_reserved_phone_owner(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_reserved_phone_owner(uuid,text) TO service_role;