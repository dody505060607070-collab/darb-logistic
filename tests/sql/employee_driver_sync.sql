-- Run with the database SQL tool; the final RAISE rolls everything back and prints the results.
-- Expected: driver_name_from_profile=اختبار اسم الموظف profile_name_from_driver=اختبار اسم السائق driver_phone_from_profile=+966500000001 gps_file_keeps_device_name=t
DO $$
DECLARE v_user uuid; v_gps_user uuid; a text; b text; c text; g boolean;
BEGIN
  SELECT d.user_id INTO v_user FROM drivers d JOIN profiles p ON p.id=d.user_id WHERE coalesce(d.source,'') NOT LIKE '%\_gps' LIMIT 1;
  UPDATE profiles SET full_name='اختبار اسم الموظف' WHERE id=v_user;
  SELECT full_name INTO a FROM drivers WHERE user_id=v_user;
  UPDATE drivers SET full_name='اختبار اسم السائق' WHERE user_id=v_user;
  SELECT full_name INTO b FROM profiles WHERE id=v_user;
  UPDATE profiles SET phone='+966500000001' WHERE id=v_user;
  SELECT phone INTO c FROM drivers WHERE user_id=v_user;
  SELECT d.user_id INTO v_gps_user FROM drivers d JOIN profiles p ON p.id=d.user_id WHERE d.source LIKE '%\_gps' LIMIT 1;
  UPDATE profiles SET full_name='اسم مختلف' WHERE id=v_gps_user;
  SELECT full_name <> 'اسم مختلف' INTO g FROM drivers WHERE user_id=v_gps_user;
  RAISE EXCEPTION 'RESULT driver_name_from_profile=% profile_name_from_driver=% driver_phone_from_profile=% gps_file_keeps_device_name=%', a, b, c, g;
END $$;
