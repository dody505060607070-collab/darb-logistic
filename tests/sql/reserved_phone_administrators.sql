-- Read-only acceptance checks: every boolean must be true.
SELECT EXISTS (SELECT 1 FROM public.admin_phone_reservations WHERE phone='+966593555506') AS first_number_reserved;
SELECT EXISTS (SELECT 1 FROM public.admin_phone_reservations WHERE phone='+966580333363') AS second_number_reserved;
SELECT EXISTS (SELECT 1 FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.id WHERE p.phone='+966580333363' AND r.role='owner') AS existing_number_is_owner;
SELECT NOT has_function_privilege('authenticated','public.apply_reserved_phone_owner(uuid,text)','EXECUTE') AS ordinary_accounts_cannot_assign_reserved_role;
SELECT has_function_privilege('service_role','public.apply_reserved_phone_owner(uuid,text)','EXECUTE') AS verified_login_service_can_assign_reserved_role;
-- Revoking owner from another employee must clear that phone's reservation,
-- otherwise apply_reserved_phone_owner re-grants owner on their next login.
-- Run as an owner session (auth.uid() = owner A) against a test account B:
--   INSERT INTO admin_phone_reservations(phone) VALUES ('+966500000099');  -- B's profile phone
--   DELETE FROM user_roles WHERE user_id = '<B>' AND role = 'owner';
--   SELECT count(*) FROM admin_phone_reservations WHERE phone = '+966500000099';  -- expect 0
--   SELECT apply_reserved_phone_owner('<B>', '+966500000099');
--   SELECT count(*) FROM user_roles WHERE user_id = '<B>' AND role = 'owner';      -- expect 0
