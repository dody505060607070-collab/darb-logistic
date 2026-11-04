-- Rule (owner decision 2026-11-04): every new account without an invitation gets the owner role.
-- Run with the database SQL tool; the final RAISE rolls everything back.
-- Expected output: TEST_RESULT roles=owner
DO $$ DECLARE r text; BEGIN
INSERT INTO auth.users(id, instance_id, aud, role, email, phone, raw_user_meta_data, created_at, updated_at)
VALUES ('11111111-2222-3333-4444-555555555555','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t_rule@darb.test','966500000999','{}',now(),now());
SELECT string_agg(role::text, ',') INTO r FROM public.user_roles WHERE user_id='11111111-2222-3333-4444-555555555555';
RAISE EXCEPTION 'TEST_RESULT roles=%', r;
END $$;
