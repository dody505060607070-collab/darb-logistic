CREATE TABLE public.admin_phone_reservations (phone text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.admin_phone_reservations TO service_role;
ALTER TABLE public.admin_phone_reservations ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.admin_phone_reservations IS 'Server-managed verified-phone owner reservations; not writable by application users';