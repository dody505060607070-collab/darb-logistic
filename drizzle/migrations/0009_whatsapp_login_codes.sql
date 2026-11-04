CREATE TABLE public.login_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.login_codes TO service_role;
ALTER TABLE public.login_codes ENABLE ROW LEVEL SECURITY;
CREATE INDEX login_codes_phone_idx ON public.login_codes(phone, created_at DESC);
COMMENT ON TABLE public.login_codes IS 'Hashed WhatsApp login codes; server-only (no client policies).';