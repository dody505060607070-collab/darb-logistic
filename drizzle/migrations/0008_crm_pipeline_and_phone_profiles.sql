CREATE TABLE public.crm_opportunities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid NOT NULL REFERENCES public.customers(id), title text NOT NULL CHECK(length(trim(title)) > 0), stage text NOT NULL DEFAULT 'new' CHECK(stage IN ('new','qualified','proposal','negotiation','won','lost')), value numeric(14,2) NOT NULL DEFAULT 0 CHECK(value >= 0), probability integer NOT NULL DEFAULT 0 CHECK(probability BETWEEN 0 AND 100), expected_close date, next_follow_up timestamptz, notes text, created_by uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_opportunities TO authenticated;
GRANT ALL ON public.crm_opportunities TO service_role;
ALTER TABLE public.crm_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_opportunities_access ON public.crm_opportunities FOR ALL TO authenticated USING(public.has_any_role(auth.uid(), '{owner,ops_manager,accountant}')) WITH CHECK(public.has_any_role(auth.uid(), '{owner,ops_manager,accountant}'));
CREATE INDEX crm_opportunities_customer_idx ON public.crm_opportunities(customer_id);
CREATE TABLE public.crm_activities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid NOT NULL REFERENCES public.customers(id), kind text NOT NULL DEFAULT 'call' CHECK(kind IN ('call','meeting','note','follow_up')), summary text NOT NULL CHECK(length(trim(summary)) > 0), due_at timestamptz, completed boolean NOT NULL DEFAULT false, created_by uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_activities TO authenticated;
GRANT ALL ON public.crm_activities TO service_role;
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_activities_access ON public.crm_activities FOR ALL TO authenticated USING(public.has_any_role(auth.uid(), '{owner,ops_manager,accountant}')) WITH CHECK(public.has_any_role(auth.uid(), '{owner,ops_manager,accountant}'));
CREATE INDEX crm_activities_customer_due_idx ON public.crm_activities(customer_id,due_at);
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE inv record;
BEGIN
 INSERT INTO public.profiles(id, full_name, email, phone) VALUES (NEW.id, COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name',''), NULLIF(NEW.raw_user_meta_data->>'name',''), NULLIF(NEW.phone,''), split_part(NEW.email,'@',1)), NEW.email, NULLIF(NEW.phone,'')) ON CONFLICT (id) DO NOTHING;
 IF lower(NEW.email) = 'abdulazizrashudi@gmail.com' OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE role = 'owner') THEN
 INSERT INTO public.user_roles(user_id,role) VALUES (NEW.id,'owner') ON CONFLICT DO NOTHING; RETURN NEW;
 END IF;
 SELECT * INTO inv FROM public.invitations WHERE lower(email) = lower(NEW.email) AND accepted_at IS NULL LIMIT 1;
 IF FOUND THEN
 INSERT INTO public.user_roles(user_id,role) VALUES (NEW.id,inv.role) ON CONFLICT DO NOTHING;
 IF inv.driver_id IS NOT NULL THEN UPDATE public.drivers SET user_id = NEW.id WHERE id=inv.driver_id AND user_id IS NULL; END IF;
 UPDATE public.invitations SET accepted_at=now() WHERE id=inv.id;
 END IF;
 RETURN NEW;
END $function$;