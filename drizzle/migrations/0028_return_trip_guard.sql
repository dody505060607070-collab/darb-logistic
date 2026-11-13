CREATE OR REPLACE FUNCTION public.return_trip_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM trips WHERE id=NEW.trip_id AND parent_trip_id IS NOT NULL AND empty_reason='رحلة رجوع') THEN RAISE EXCEPTION 'هذه رحلة رجوع بالفعل'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER return_requests_guard BEFORE INSERT ON public.return_requests FOR EACH ROW EXECUTE FUNCTION public.return_trip_guard();