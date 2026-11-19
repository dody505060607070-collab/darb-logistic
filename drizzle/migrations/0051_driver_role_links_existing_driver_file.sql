CREATE OR REPLACE FUNCTION public.ensure_driver_file_for_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p record;
  v_digits text;
  v_count integer;
  v_file uuid;
BEGIN
  IF NEW.role <> 'driver' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.drivers WHERE user_id = NEW.user_id) THEN RETURN NEW; END IF;
  SELECT full_name, phone, branch_id INTO p FROM public.profiles WHERE id = NEW.user_id;
  v_digits := right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 9);
  IF length(v_digits) = 9 THEN
    SELECT count(*), (array_agg(id))[1] INTO v_count, v_file
    FROM public.drivers
    WHERE user_id IS NULL AND right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9) = v_digits;
    IF v_count = 1 THEN
      UPDATE public.drivers SET user_id = NEW.user_id, phone = coalesce(p.phone, phone) WHERE id = v_file AND user_id IS NULL;
      RETURN NEW;
    END IF;
  END IF;
  INSERT INTO public.drivers (code, full_name, phone, user_id, branch_id)
  VALUES ('DRV-' || left(NEW.user_id::text, 8), coalesce(nullif(trim(p.full_name), ''), p.phone, 'سائق جديد'), p.phone, NEW.user_id, p.branch_id)
  ON CONFLICT (code) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_driver_file_for_role() FROM PUBLIC, anon, authenticated;

-- Backfill: driver accounts without a file adopt the single unlinked file carrying their phone.
WITH orphan AS (
  SELECT p.id AS user_id, p.phone, right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 9) AS digits
  FROM public.profiles p
  WHERE EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role = 'driver')
    AND NOT EXISTS (SELECT 1 FROM public.drivers d WHERE d.user_id = p.id)
    AND length(right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 9)) = 9
), match AS (
  SELECT o.user_id, o.phone, (array_agg(d.id))[1] AS driver_id, count(*) AS n
  FROM orphan o JOIN public.drivers d
    ON d.user_id IS NULL AND right(regexp_replace(coalesce(d.phone, ''), '\D', '', 'g'), 9) = o.digits
  GROUP BY o.user_id, o.phone
)
UPDATE public.drivers d SET user_id = m.user_id, phone = m.phone
FROM match m WHERE m.n = 1 AND d.id = m.driver_id AND d.user_id IS NULL;