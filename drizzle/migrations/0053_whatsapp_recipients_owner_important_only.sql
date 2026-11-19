CREATE OR REPLACE FUNCTION public.wa_recipient_active(p_phone text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.wa_norm(p_phone) IS NOT NULL AND (
    EXISTS (SELECT 1 FROM profiles p JOIN user_roles ur ON ur.user_id = p.id WHERE public.wa_norm(p.phone) = public.wa_norm(p_phone))
    OR EXISTS (SELECT 1 FROM drivers d WHERE public.wa_norm(d.phone) = public.wa_norm(p_phone))
  ) $$;
REVOKE ALL ON FUNCTION public.wa_recipient_active(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_recipient_active(text) TO service_role;

CREATE OR REPLACE FUNCTION public.wa_owner_important(p_event text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT p_event IN ('incident','critical_maintenance','vehicle_stopped','off_route') $$;

ALTER TABLE public.whatsapp_outbox DROP CONSTRAINT IF EXISTS whatsapp_outbox_state_check;
ALTER TABLE public.whatsapp_outbox ADD CONSTRAINT whatsapp_outbox_state_check CHECK (state = ANY (ARRAY['pending','sending','accepted','failed','unresolved','cancelled']));

CREATE OR REPLACE FUNCTION public.wa_enqueue(p_phone text, p_body text, p_event text, p_entity uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE n text := public.wa_norm(p_phone);
BEGIN
  IF n ~ '^[1-9]\d{8,14}$' AND public.wa_recipient_active(n)
     AND NOT EXISTS (SELECT 1 FROM whatsapp_outbox WHERE phone=n AND event=p_event AND entity_id IS NOT DISTINCT FROM p_entity AND body=p_body AND created_at > now()-interval '2 minutes') THEN
    INSERT INTO whatsapp_outbox(event, entity_id, phone, body) VALUES (p_event, p_entity, n, p_body);
  END IF;
END $function$;

-- Owners only receive important or critical notices; routine traffic never falls back to them.
CREATE OR REPLACE FUNCTION public.wa_department(p_body text, p_event text, p_entity uuid, p_critical boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE r record; roles app_role[] := public.wa_event_roles(p_event,p_critical); n int := 0;
BEGIN
  IF cardinality(roles) > 0 THEN
    FOR r IN SELECT DISTINCT p.phone FROM profiles p JOIN user_roles ur ON ur.user_id=p.id
             WHERE ur.role=ANY(roles) AND nullif(trim(p.phone),'') IS NOT NULL LOOP
      PERFORM wa_enqueue(r.phone,p_body,p_event,p_entity); n := n + 1;
    END LOOP;
  END IF;
  IF n = 0 AND (p_critical OR public.wa_owner_important(p_event)) THEN
    FOR r IN SELECT DISTINCT p.phone FROM profiles p JOIN user_roles ur ON ur.user_id=p.id
             WHERE ur.role='owner' AND nullif(trim(p.phone),'') IS NOT NULL LOOP
      PERFORM wa_enqueue(r.phone,p_body,p_event,p_entity);
    END LOOP;
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.claim_whatsapp_message(p_id uuid)
RETURNS SETOF whatsapp_outbox LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  UPDATE whatsapp_outbox SET state='cancelled', error='الرقم لم يعد ضمن الموظفين أو السائقين'
   WHERE id=p_id AND state IN ('pending','failed') AND NOT public.wa_recipient_active(phone);
  RETURN QUERY UPDATE whatsapp_outbox SET state='sending', claimed_at=now(), attempts=attempts+1
   WHERE id=p_id AND state IN ('pending','failed') AND attempts < 5 RETURNING *;
END $function$;
REVOKE ALL ON FUNCTION public.claim_whatsapp_message(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_message(uuid) TO service_role;

UPDATE public.whatsapp_outbox SET state='cancelled', error='الرقم لم يعد ضمن الموظفين أو السائقين'
 WHERE state IN ('pending','failed') AND NOT public.wa_recipient_active(phone);