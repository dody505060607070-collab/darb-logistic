CREATE OR REPLACE FUNCTION public.expense_delete_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status = 'approved' AND public.expense_in_settled_advance(OLD.driver_id, OLD.trip_id, OLD.payment_method, OLD.spent_at) THEN
    RAISE EXCEPTION 'المصروف داخل سلفة تمت تسويتها؛ أعد فتح السلفة أولًا';
  END IF;
  RETURN OLD;
END $function$;

REVOKE EXECUTE ON FUNCTION public.expense_delete_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expense_in_settled_advance(uuid, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;