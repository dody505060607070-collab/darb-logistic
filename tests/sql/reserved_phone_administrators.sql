-- Read-only acceptance checks: every boolean must be true.
SELECT EXISTS (SELECT 1 FROM public.admin_phone_reservations WHERE phone='+966593555506') AS first_number_reserved;
SELECT EXISTS (SELECT 1 FROM public.admin_phone_reservations WHERE phone='+966580333363') AS second_number_reserved;
SELECT EXISTS (SELECT 1 FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.id WHERE p.phone='+966580333363' AND r.role='owner') AS existing_number_is_owner;
SELECT NOT has_function_privilege('authenticated','public.apply_reserved_phone_owner(uuid,text)','EXECUTE') AS ordinary_accounts_cannot_assign_reserved_role;
SELECT has_function_privilege('service_role','public.apply_reserved_phone_owner(uuid,text)','EXECUTE') AS verified_login_service_can_assign_reserved_role;