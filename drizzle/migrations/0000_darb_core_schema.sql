CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

CREATE TYPE public.app_role AS ENUM ('owner','ops_manager','dispatcher','fleet_supervisor','accountant','maintenance','driver');

CREATE TABLE public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text,
  phone text,
  branch_id uuid REFERENCES public.branches(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

CREATE TABLE public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  role public.app_role NOT NULL,
  driver_id uuid,
  invited_by uuid,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles public.app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles))
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role <> 'driver')
$$;

CREATE TABLE public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('tractor','trailer','rigid')),
  plate text,
  make_model text,
  year int,
  vin text,
  trailer_type text,
  capacity_tons numeric,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','active','maintenance','stopped')),
  branch_id uuid REFERENCES public.branches(id),
  odometer_km numeric DEFAULT 0,
  location_text text,
  last_lat double precision,
  last_lng double precision,
  last_position_at timestamptz,
  last_position_source text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.assets(kind, status);

CREATE TABLE public.drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  full_name text NOT NULL,
  phone text,
  email text,
  national_id text,
  nationality text,
  license_no text,
  license_expiry date,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','on_trip','off','suspended')),
  user_id uuid UNIQUE,
  branch_id uuid REFERENCES public.branches(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.current_driver_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.drivers WHERE user_id = auth.uid() LIMIT 1
$$;

CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('asset','driver','company','carrier')),
  entity_id uuid,
  doc_type text NOT NULL,
  number text,
  issue_date date,
  expiry_date date,
  file_path text,
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','approved','rejected')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.documents(entity_type, entity_id);
CREATE INDEX ON public.documents(expiry_date);

CREATE TABLE public.authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text,
  driver_id uuid NOT NULL REFERENCES public.drivers(id),
  asset_id uuid REFERENCES public.assets(id),
  scope text,
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  file_path text,
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_to >= valid_from)
);

CREATE TABLE public.custody (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id),
  driver_id uuid NOT NULL REFERENCES public.drivers(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  odometer_out numeric,
  odometer_in numeric,
  fuel_level_out text,
  fuel_level_in text,
  accessories text,
  damages text,
  acknowledged boolean NOT NULL DEFAULT false,
  previous_custody_id uuid REFERENCES public.custody(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX custody_one_open_per_asset ON public.custody(asset_id) WHERE closed_at IS NULL;

CREATE TABLE public.inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id),
  driver_id uuid REFERENCES public.drivers(id),
  trip_id uuid,
  kind text NOT NULL DEFAULT 'pre_trip',
  template_version text NOT NULL DEFAULT 'v1',
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  has_critical boolean NOT NULL DEFAULT false,
  resolved boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  cr_number text,
  vat_number text,
  contact_name text,
  phone text,
  email text,
  city text,
  payment_terms_days int NOT NULL DEFAULT 30,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id),
  name text NOT NULL,
  city text NOT NULL,
  lat double precision,
  lng double precision,
  contact text,
  working_hours text,
  instructions text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  number text NOT NULL,
  version int NOT NULL DEFAULT 1,
  pricing_model text NOT NULL DEFAULT 'per_trip' CHECK (pricing_model IN ('per_trip','per_ton','per_km','agreed')),
  rate numeric NOT NULL DEFAULT 0,
  free_wait_hours numeric NOT NULL DEFAULT 2,
  wait_fee_per_hour numeric NOT NULL DEFAULT 0,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'active',
  terms text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.carriers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  cr_number text,
  contact_name text,
  phone text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE SEQUENCE public.order_seq START 456;
CREATE SEQUENCE public.trip_seq START 120;
CREATE SEQUENCE public.wo_seq START 300;
CREATE SEQUENCE public.inc_seq START 40;
CREATE SEQUENCE public.inv_seq START 1000;

CREATE TABLE public.transport_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE DEFAULT ('ORD-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.order_seq')::text,5,'0')),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  contract_id uuid REFERENCES public.contracts(id),
  contract_snapshot jsonb,
  shipper text,
  consignee text,
  cargo_type text NOT NULL DEFAULT 'بضائع عامة',
  quantity numeric,
  unit text NOT NULL DEFAULT 'طرد',
  weight_kg numeric,
  pickup_location_id uuid REFERENCES public.locations(id),
  delivery_location_id uuid REFERENCES public.locations(id),
  pickup_at timestamptz,
  delivery_due_at timestamptz,
  requirements text,
  price numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed','in_progress','completed','cancelled')),
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE DEFAULT ('TRP-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.trip_seq')::text,5,'0')),
  order_id uuid REFERENCES public.transport_orders(id),
  origin_city text NOT NULL,
  dest_city text NOT NULL,
  origin_location_id uuid REFERENCES public.locations(id),
  dest_location_id uuid REFERENCES public.locations(id),
  tractor_id uuid REFERENCES public.assets(id),
  trailer_id uuid REFERENCES public.assets(id),
  driver_id uuid REFERENCES public.drivers(id),
  backup_driver_id uuid REFERENCES public.drivers(id),
  carrier_id uuid REFERENCES public.carriers(id),
  planned_start timestamptz,
  planned_end timestamptz,
  actual_start timestamptz,
  actual_end timestamptz,
  distance_km numeric,
  is_empty boolean NOT NULL DEFAULT false,
  empty_reason text,
  parent_trip_id uuid REFERENCES public.trips(id),
  stage text NOT NULL DEFAULT 'pending',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','planned','ready','in_progress','delivered','closed','cancelled')),
  exception text CHECK (exception IN ('suspended','breakdown')),
  cancel_reason text,
  cargo_weight_tons numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.trips(status);
CREATE INDEX ON public.trips(driver_id);

ALTER TABLE public.inspections ADD CONSTRAINT inspections_trip_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id);

CREATE TABLE public.trip_financials (
  trip_id uuid PRIMARY KEY REFERENCES public.trips(id) ON DELETE CASCADE,
  revenue numeric NOT NULL DEFAULT 0,
  est_cost numeric NOT NULL DEFAULT 0,
  carrier_cost numeric NOT NULL DEFAULT 0,
  approved boolean NOT NULL DEFAULT false
);

CREATE TABLE public.trip_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz NOT NULL DEFAULT now(),
  location_text text,
  lat double precision,
  lng double precision,
  notes text,
  client_event_id text UNIQUE,
  created_by uuid DEFAULT auth.uid()
);
CREATE INDEX ON public.trip_events(trip_id, occurred_at);

CREATE TABLE public.resource_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  resource_type text NOT NULL CHECK (resource_type IN ('driver','tractor','trailer')),
  resource_id uuid NOT NULL,
  period tstzrange NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_overlapping_bookings EXCLUDE USING gist (resource_type WITH =, resource_id WITH =, period WITH &&) WHERE (active)
);

CREATE TABLE public.pods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  receiver_name text NOT NULL,
  receiver_phone text,
  received_at timestamptz NOT NULL DEFAULT now(),
  captured_at timestamptz,
  qty_delivered numeric,
  qty_short numeric DEFAULT 0,
  qty_damaged numeric DEFAULT 0,
  notes text,
  signature text,
  photo_paths text[] NOT NULL DEFAULT '{}',
  lat double precision,
  lng double precision,
  location_source text,
  client_event_id text UNIQUE,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','accepted','rejected')),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.gps_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id),
  reading_id text NOT NULL UNIQUE,
  event_time timestamptz NOT NULL,
  received_time timestamptz NOT NULL DEFAULT now(),
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  speed_kmh numeric,
  source text NOT NULL DEFAULT 'manual'
);
CREATE INDEX ON public.gps_readings(asset_id, event_time DESC);

CREATE TABLE public.fuel_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id),
  driver_id uuid REFERENCES public.drivers(id),
  trip_id uuid REFERENCES public.trips(id),
  filled_at timestamptz NOT NULL DEFAULT now(),
  station text,
  liters numeric NOT NULL CHECK (liters > 0),
  unit_price numeric NOT NULL CHECK (unit_price >= 0),
  amount numeric NOT NULL,
  odometer numeric,
  full_tank boolean NOT NULL DEFAULT true,
  receipt_path text,
  source text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  client_event_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid REFERENCES public.trips(id),
  driver_id uuid REFERENCES public.drivers(id),
  category text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  description text,
  spent_at timestamptz NOT NULL DEFAULT now(),
  payment_method text NOT NULL DEFAULT 'advance',
  receipt_path text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reject_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  client_event_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id),
  trip_id uuid REFERENCES public.trips(id),
  amount numeric NOT NULL CHECK (amount > 0),
  issued_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  settled_expenses numeric,
  balance numeric,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','settled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE DEFAULT ('WO-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.wo_seq')::text,4,'0')),
  asset_id uuid NOT NULL REFERENCES public.assets(id),
  kind text NOT NULL DEFAULT 'corrective' CHECK (kind IN ('preventive','corrective')),
  description text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','diagnosis','waiting_parts','in_progress','completed','closed')),
  workshop text,
  technician text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  labor_cost numeric NOT NULL DEFAULT 0,
  parts_cost numeric NOT NULL DEFAULT 0,
  vendor_invoice_ref text UNIQUE,
  inspection_id uuid REFERENCES public.inspections(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.maintenance_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id),
  title text NOT NULL,
  interval_km numeric,
  interval_days int,
  last_done_at date,
  last_done_km numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'قطعة',
  qty_on_hand numeric NOT NULL DEFAULT 0 CHECK (qty_on_hand >= 0),
  unit_cost numeric NOT NULL DEFAULT 0,
  reorder_level numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.stock_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id uuid NOT NULL REFERENCES public.parts(id),
  work_order_id uuid REFERENCES public.work_orders(id),
  kind text NOT NULL CHECK (kind IN ('receive','issue','return','adjust')),
  qty numeric NOT NULL CHECK (qty <> 0),
  unit_cost numeric NOT NULL DEFAULT 0,
  client_ref text UNIQUE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  serial text NOT NULL UNIQUE,
  size text,
  brand text,
  cost numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'in_stock' CHECK (status IN ('in_stock','mounted','retired')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tire_mounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tire_id uuid NOT NULL REFERENCES public.tires(id),
  asset_id uuid NOT NULL REFERENCES public.assets(id),
  position text NOT NULL,
  axle int,
  mounted_at timestamptz NOT NULL DEFAULT now(),
  mounted_km numeric,
  removed_at timestamptz,
  removed_km numeric
);
CREATE UNIQUE INDEX tire_one_active_mount ON public.tire_mounts(tire_id) WHERE removed_at IS NULL;
CREATE UNIQUE INDEX tire_position_one_active ON public.tire_mounts(asset_id, position) WHERE removed_at IS NULL;

CREATE TABLE public.incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE DEFAULT ('INC-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.inc_seq')::text,4,'0')),
  trip_id uuid REFERENCES public.trips(id),
  asset_id uuid REFERENCES public.assets(id),
  driver_id uuid REFERENCES public.drivers(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL DEFAULT 'accident',
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  location_text text,
  description text NOT NULL,
  parties text,
  police_ref text,
  insurance_claim_ref text,
  est_cost numeric DEFAULT 0,
  approved_liability text,
  status text NOT NULL DEFAULT 'reported' CHECK (status IN ('reported','investigating','claim','resolved','closed')),
  photo_paths text[] NOT NULL DEFAULT '{}',
  client_event_id text UNIQUE,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.company_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  company_name text NOT NULL DEFAULT 'شركة دَرب للنقل البري',
  vat_rate numeric NOT NULL DEFAULT 15,
  vat_number text,
  cr_number text,
  timezone text NOT NULL DEFAULT 'Asia/Riyadh',
  doc_expiry_warning_days int NOT NULL DEFAULT 30,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE DEFAULT ('INV-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.inv_seq')::text,5,'0')),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  issued_at date NOT NULL DEFAULT current_date,
  due_at date,
  subtotal numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  vat_rate numeric NOT NULL DEFAULT 15,
  vat numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','cancelled')),
  provider_status text NOT NULL DEFAULT 'not_configured' CHECK (provider_status IN ('not_configured','sending','failed','accepted','issued')),
  provider_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  trip_id uuid UNIQUE REFERENCES public.trips(id),
  description text NOT NULL,
  amount numeric NOT NULL
);

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  amount numeric NOT NULL CHECK (amount > 0),
  paid_at date NOT NULL DEFAULT current_date,
  method text NOT NULL DEFAULT 'bank_transfer',
  reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id),
  amount numeric NOT NULL CHECK (amount > 0),
  UNIQUE (payment_id, invoice_id)
);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  category text NOT NULL DEFAULT 'general',
  title text NOT NULL,
  body text,
  entity_type text,
  entity_id uuid,
  dedupe_key text UNIQUE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.audit_log (
  id bigserial PRIMARY KEY,
  actor uuid,
  table_name text NOT NULL,
  row_id text,
  action text NOT NULL,
  data jsonb,
  at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['branches','profiles','invitations','assets','drivers','documents','authorizations','custody','inspections','customers','locations','contracts','carriers','transport_orders','trips','trip_financials','trip_events','resource_bookings','pods','gps_readings','fuel_entries','expenses','advances','work_orders','maintenance_plans','parts','stock_moves','tires','tire_mounts','incidents','company_settings','invoices','invoice_lines','payments','payment_allocations','notifications']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['branches','assets','drivers','documents','authorizations','custody','inspections','customers','locations','contracts','carriers','transport_orders','trips','trip_events','resource_bookings','pods','gps_readings','fuel_entries','expenses','advances','work_orders','maintenance_plans','parts','stock_moves','tires','tire_mounts','incidents','company_settings','notifications']
  LOOP
    EXECUTE format('CREATE POLICY "staff read %1$s" ON public.%1$I FOR SELECT TO authenticated USING (public.is_staff(auth.uid()))', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public._write_policy(_t text, _roles text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('CREATE POLICY "write ins %1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), %2$L::public.app_role[]))', _t, _roles);
  EXECUTE format('CREATE POLICY "write upd %1$s" ON public.%1$I FOR UPDATE TO authenticated USING (public.has_any_role(auth.uid(), %2$L::public.app_role[])) WITH CHECK (public.has_any_role(auth.uid(), %2$L::public.app_role[]))', _t, _roles);
  EXECUTE format('CREATE POLICY "write del %1$s" ON public.%1$I FOR DELETE TO authenticated USING (public.has_any_role(auth.uid(), %2$L::public.app_role[]))', _t, _roles);
END $$;

SELECT public._write_policy('branches', '{owner}');
SELECT public._write_policy('company_settings', '{owner}');
SELECT public._write_policy('assets', '{owner,ops_manager,fleet_supervisor}');
SELECT public._write_policy('drivers', '{owner,ops_manager,fleet_supervisor}');
SELECT public._write_policy('documents', '{owner,ops_manager,fleet_supervisor}');
SELECT public._write_policy('authorizations', '{owner,ops_manager,fleet_supervisor}');
SELECT public._write_policy('custody', '{owner,ops_manager,fleet_supervisor}');
SELECT public._write_policy('inspections', '{owner,ops_manager,fleet_supervisor,maintenance}');
SELECT public._write_policy('customers', '{owner,ops_manager,accountant}');
SELECT public._write_policy('locations', '{owner,ops_manager,dispatcher}');
SELECT public._write_policy('contracts', '{owner,ops_manager,accountant}');
SELECT public._write_policy('carriers', '{owner,ops_manager,accountant}');
SELECT public._write_policy('transport_orders', '{owner,ops_manager,dispatcher}');
SELECT public._write_policy('trips', '{owner,ops_manager,dispatcher}');
SELECT public._write_policy('trip_events', '{owner,ops_manager,dispatcher}');
SELECT public._write_policy('resource_bookings', '{owner,ops_manager,dispatcher}');
SELECT public._write_policy('pods', '{owner,ops_manager,dispatcher}');
SELECT public._write_policy('gps_readings', '{owner,ops_manager,dispatcher}');
SELECT public._write_policy('fuel_entries', '{owner,ops_manager,accountant,fleet_supervisor}');
SELECT public._write_policy('expenses', '{owner,ops_manager,accountant}');
SELECT public._write_policy('advances', '{owner,accountant}');
SELECT public._write_policy('work_orders', '{owner,ops_manager,maintenance}');
SELECT public._write_policy('maintenance_plans', '{owner,ops_manager,maintenance}');
SELECT public._write_policy('parts', '{owner,maintenance}');
SELECT public._write_policy('stock_moves', '{owner,maintenance}');
SELECT public._write_policy('tires', '{owner,maintenance}');
SELECT public._write_policy('tire_mounts', '{owner,maintenance}');
SELECT public._write_policy('incidents', '{owner,ops_manager,fleet_supervisor}');
SELECT public._write_policy('notifications', '{owner,ops_manager,dispatcher,fleet_supervisor,accountant,maintenance}');
SELECT public._write_policy('invitations', '{owner}');
CREATE POLICY "owner read invitations" ON public.invitations FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'owner'));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['trip_financials','invoices','invoice_lines','payments','payment_allocations']
  LOOP
    EXECUTE format('CREATE POLICY "finance read %1$s" ON public.%1$I FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ''{owner,ops_manager,accountant}''::public.app_role[]))', t);
    PERFORM public._write_policy(t, '{owner,accountant}');
  END LOOP;
END $$;
CREATE POLICY "ops write trip_financials" ON public.trip_financials FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), '{ops_manager,dispatcher}'::public.app_role[]));
CREATE POLICY "ops upd trip_financials" ON public.trip_financials FOR UPDATE TO authenticated USING (public.has_any_role(auth.uid(), '{ops_manager}'::public.app_role[]) AND NOT approved);

DROP FUNCTION public._write_policy(text, text);

CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(),'owner'));
CREATE POLICY "own roles read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'owner'));
CREATE POLICY "owner grants roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'owner'));
CREATE POLICY "owner revokes roles" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'owner') AND NOT (user_id = auth.uid() AND role = 'owner'));
CREATE POLICY "owner reads audit" ON public.audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'owner'));

CREATE POLICY "driver own row" ON public.drivers FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "driver own trips" ON public.trips FOR SELECT TO authenticated USING (driver_id = public.current_driver_id() OR backup_driver_id = public.current_driver_id());
CREATE POLICY "driver own trip events" ON public.trip_events FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.driver_id = public.current_driver_id()));
CREATE POLICY "driver own assets" ON public.assets FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.trips t WHERE (t.tractor_id = assets.id OR t.trailer_id = assets.id) AND t.driver_id = public.current_driver_id() AND t.status IN ('planned','ready','in_progress')) OR EXISTS (SELECT 1 FROM public.custody c WHERE c.asset_id = assets.id AND c.driver_id = public.current_driver_id() AND c.closed_at IS NULL));
CREATE POLICY "driver own custody" ON public.custody FOR SELECT TO authenticated USING (driver_id = public.current_driver_id());
CREATE POLICY "driver ack custody" ON public.custody FOR UPDATE TO authenticated USING (driver_id = public.current_driver_id() AND closed_at IS NULL) WITH CHECK (driver_id = public.current_driver_id());
CREATE POLICY "driver own inspections r" ON public.inspections FOR SELECT TO authenticated USING (driver_id = public.current_driver_id());
CREATE POLICY "driver own inspections w" ON public.inspections FOR INSERT TO authenticated WITH CHECK (driver_id = public.current_driver_id());
CREATE POLICY "driver own expenses r" ON public.expenses FOR SELECT TO authenticated USING (driver_id = public.current_driver_id());
CREATE POLICY "driver own expenses w" ON public.expenses FOR INSERT TO authenticated WITH CHECK (driver_id = public.current_driver_id() AND status = 'pending');
CREATE POLICY "driver own fuel r" ON public.fuel_entries FOR SELECT TO authenticated USING (driver_id = public.current_driver_id());
CREATE POLICY "driver own fuel w" ON public.fuel_entries FOR INSERT TO authenticated WITH CHECK (driver_id = public.current_driver_id() AND status = 'pending');
CREATE POLICY "driver own advances" ON public.advances FOR SELECT TO authenticated USING (driver_id = public.current_driver_id());
CREATE POLICY "driver own pods r" ON public.pods FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.driver_id = public.current_driver_id()));
CREATE POLICY "driver own pods w" ON public.pods FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.driver_id = public.current_driver_id() AND t.status = 'in_progress'));
CREATE POLICY "driver own incidents r" ON public.incidents FOR SELECT TO authenticated USING (driver_id = public.current_driver_id());
CREATE POLICY "driver own incidents w" ON public.incidents FOR INSERT TO authenticated WITH CHECK (driver_id = public.current_driver_id());
CREATE POLICY "driver own docs" ON public.documents FOR SELECT TO authenticated USING (entity_type = 'driver' AND entity_id = public.current_driver_id());
CREATE POLICY "driver own auth" ON public.authorizations FOR SELECT TO authenticated USING (driver_id = public.current_driver_id());

CREATE OR REPLACE FUNCTION public.audit_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_log(actor, table_name, row_id, action, data)
  VALUES (auth.uid(), TG_TABLE_NAME, COALESCE((CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END)->>'id',''), TG_OP,
          CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END);
  RETURN COALESCE(NEW, OLD);
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['assets','drivers','trips','transport_orders','custody','inspections','expenses','advances','fuel_entries','work_orders','invoices','payments','payment_allocations','user_roles','incidents','contracts','pods','company_settings']
  LOOP
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.audit_trigger()', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv record;
BEGIN
  INSERT INTO public.profiles(id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)), NEW.email)
  ON CONFLICT (id) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'owner') THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'owner');
    RETURN NEW;
  END IF;

  SELECT * INTO inv FROM public.invitations WHERE lower(email) = lower(NEW.email) AND accepted_at IS NULL LIMIT 1;
  IF FOUND THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, inv.role) ON CONFLICT DO NOTHING;
    IF inv.driver_id IS NOT NULL THEN
      UPDATE public.drivers SET user_id = NEW.id WHERE id = inv.driver_id AND user_id IS NULL;
    END IF;
    UPDATE public.invitations SET accepted_at = now() WHERE id = inv.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.fuel_validate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF abs(NEW.amount - round(NEW.liters * NEW.unit_price, 2)) > 1 THEN
    RAISE EXCEPTION 'المبلغ لا يطابق اللترات × سعر اللتر (المتوقع %)', round(NEW.liters * NEW.unit_price, 2);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fuel_validate BEFORE INSERT OR UPDATE ON public.fuel_entries FOR EACH ROW EXECUTE FUNCTION public.fuel_validate();

CREATE OR REPLACE FUNCTION public.gps_apply() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.assets SET last_lat = NEW.lat, last_lng = NEW.lng, last_position_at = NEW.event_time, last_position_source = NEW.source
  WHERE id = NEW.asset_id AND (last_position_at IS NULL OR last_position_at < NEW.event_time);
  RETURN NEW;
END $$;
CREATE TRIGGER gps_apply AFTER INSERT ON public.gps_readings FOR EACH ROW EXECUTE FUNCTION public.gps_apply();

CREATE OR REPLACE FUNCTION public.stock_apply() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE delta numeric;
BEGIN
  delta := CASE NEW.kind WHEN 'receive' THEN abs(NEW.qty) WHEN 'return' THEN abs(NEW.qty) WHEN 'issue' THEN -abs(NEW.qty) ELSE NEW.qty END;
  UPDATE public.parts SET qty_on_hand = qty_on_hand + delta WHERE id = NEW.part_id;
  IF NEW.kind = 'issue' AND NEW.work_order_id IS NOT NULL THEN
    UPDATE public.work_orders SET parts_cost = parts_cost + abs(NEW.qty) * NEW.unit_cost WHERE id = NEW.work_order_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER stock_apply AFTER INSERT ON public.stock_moves FOR EACH ROW EXECUTE FUNCTION public.stock_apply();

CREATE OR REPLACE FUNCTION public.tire_sync() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.tires SET status = CASE WHEN NEW.removed_at IS NULL THEN 'mounted' ELSE 'in_stock' END WHERE id = NEW.tire_id;
  RETURN NEW;
END $$;
CREATE TRIGGER tire_sync AFTER INSERT OR UPDATE ON public.tire_mounts FOR EACH ROW EXECUTE FUNCTION public.tire_sync();

CREATE OR REPLACE FUNCTION public.inspection_apply() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a_code text;
BEGIN
  NEW.has_critical := EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.items) e WHERE e->>'result' = 'fail' AND e->>'severity' = 'critical');
  IF NEW.has_critical AND NOT NEW.resolved THEN
    SELECT code INTO a_code FROM public.assets WHERE id = NEW.asset_id;
    UPDATE public.assets SET status = 'stopped' WHERE id = NEW.asset_id AND status <> 'maintenance';
    INSERT INTO public.notifications(severity, category, title, body, entity_type, entity_id, dedupe_key)
    VALUES ('critical','inspection','عيب حرج في ' || a_code, 'المركبة موقوفة حتى الإصلاح وإعادة الفحص', 'asset', NEW.asset_id, 'insp-crit-' || NEW.id)
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inspection_apply BEFORE INSERT OR UPDATE ON public.inspections FOR EACH ROW EXECUTE FUNCTION public.inspection_apply();

CREATE OR REPLACE FUNCTION public.incident_notify() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications(severity, category, title, body, entity_type, entity_id, dedupe_key)
  VALUES (CASE WHEN NEW.severity IN ('high','critical') THEN 'critical' ELSE 'warning' END, 'incident', 'بلاغ ' || NEW.number, left(NEW.description, 140), 'incident', NEW.id, 'inc-' || NEW.id)
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER incident_notify AFTER INSERT ON public.incidents FOR EACH ROW EXECUTE FUNCTION public.incident_notify();

CREATE OR REPLACE FUNCTION public.assign_trip_resources(
  p_trip_id uuid, p_driver_id uuid, p_tractor_id uuid, p_trailer_id uuid,
  p_start timestamptz, p_end timestamptz, p_override_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tr record; d record; tk record; tl record; can_override boolean;
BEGIN
  IF NOT public.has_any_role(auth.uid(), '{owner,ops_manager,dispatcher}') THEN RAISE EXCEPTION 'ليست لديك صلاحية التخصيص'; END IF;
  IF p_end <= p_start THEN RAISE EXCEPTION 'وقت النهاية يجب أن يكون بعد البداية'; END IF;
  SELECT * INTO tr FROM public.trips WHERE id = p_trip_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الرحلة غير موجودة'; END IF;
  IF tr.status IN ('delivered','closed','cancelled') THEN RAISE EXCEPTION 'لا يمكن تخصيص رحلة منتهية أو ملغاة'; END IF;
  can_override := p_override_reason IS NOT NULL AND length(trim(p_override_reason)) > 3 AND public.has_any_role(auth.uid(), '{owner,ops_manager}');

  SELECT * INTO d FROM public.drivers WHERE id = p_driver_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'السائق غير موجود'; END IF;
  IF d.status = 'suspended' THEN RAISE EXCEPTION 'السائق موقوف'; END IF;
  IF NOT can_override AND (d.license_expiry IS NULL OR d.license_expiry < p_end::date) THEN RAISE EXCEPTION 'رخصة السائق % منتهية أو غير مسجلة خلال مدة الرحلة', d.full_name; END IF;

  SELECT * INTO tk FROM public.assets WHERE id = p_tractor_id;
  IF NOT FOUND OR tk.kind NOT IN ('tractor','rigid') THEN RAISE EXCEPTION 'يجب اختيار رأس أو شاحنة منفردة'; END IF;
  IF tk.status IN ('maintenance','stopped') THEN RAISE EXCEPTION 'المركبة % غير جاهزة (%)', tk.code, tk.status; END IF;
  IF EXISTS (SELECT 1 FROM public.inspections WHERE asset_id = tk.id AND has_critical AND NOT resolved) THEN RAISE EXCEPTION 'للمركبة % عيب حرج مفتوح — لا يمكن التجاوز', tk.code; END IF;

  IF p_trailer_id IS NOT NULL THEN
    IF tk.kind = 'rigid' THEN RAISE EXCEPTION 'الشاحنة المنفردة لا تقطر مقطورة'; END IF;
    SELECT * INTO tl FROM public.assets WHERE id = p_trailer_id;
    IF NOT FOUND OR tl.kind <> 'trailer' THEN RAISE EXCEPTION 'المقطورة غير صحيحة'; END IF;
    IF tl.status IN ('maintenance','stopped') THEN RAISE EXCEPTION 'المقطورة % غير جاهزة', tl.code; END IF;
    IF EXISTS (SELECT 1 FROM public.inspections WHERE asset_id = tl.id AND has_critical AND NOT resolved) THEN RAISE EXCEPTION 'للمقطورة % عيب حرج مفتوح', tl.code; END IF;
    IF tr.cargo_weight_tons IS NOT NULL AND tl.capacity_tons IS NOT NULL AND tr.cargo_weight_tons > tl.capacity_tons THEN RAISE EXCEPTION 'الحمولة تتجاوز سعة المقطورة'; END IF;
  ELSIF tk.kind = 'tractor' AND NOT tr.is_empty THEN
    RAISE EXCEPTION 'الرأس يحتاج مقطورة لرحلة محملة';
  END IF;

  IF NOT can_override AND EXISTS (
    SELECT 1 FROM public.documents WHERE expiry_date < p_end::date AND
      ((entity_type='asset' AND entity_id IN (p_tractor_id, p_trailer_id)) OR (entity_type='driver' AND entity_id = p_driver_id))) THEN
    RAISE EXCEPTION 'توجد مستندات منتهية للسائق أو المركبة خلال مدة الرحلة';
  END IF;

  DELETE FROM public.resource_bookings WHERE trip_id = p_trip_id;
  BEGIN
    INSERT INTO public.resource_bookings(trip_id, resource_type, resource_id, period) VALUES
      (p_trip_id, 'driver', p_driver_id, tstzrange(p_start, p_end, '[)')),
      (p_trip_id, 'tractor', p_tractor_id, tstzrange(p_start, p_end, '[)'));
    IF p_trailer_id IS NOT NULL THEN
      INSERT INTO public.resource_bookings(trip_id, resource_type, resource_id, period) VALUES (p_trip_id, 'trailer', p_trailer_id, tstzrange(p_start, p_end, '[)'));
    END IF;
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'تعارض حجز: أحد الموارد محجوز لرحلة أخرى في نفس الفترة';
  END;

  UPDATE public.trips SET driver_id = p_driver_id, tractor_id = p_tractor_id, trailer_id = p_trailer_id,
    planned_start = p_start, planned_end = p_end, status = CASE WHEN status = 'draft' THEN 'planned' ELSE status END
  WHERE id = p_trip_id;

  IF can_override THEN
    INSERT INTO public.audit_log(actor, table_name, row_id, action, data) VALUES (auth.uid(), 'trips', p_trip_id::text, 'OVERRIDE', jsonb_build_object('reason', p_override_reason));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.record_trip_event(p_trip_id uuid, p_event_type text, p_location text DEFAULT NULL,
  p_lat double precision DEFAULT NULL, p_lng double precision DEFAULT NULL, p_notes text DEFAULT NULL,
  p_client_event_id text DEFAULT NULL, p_occurred_at timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tr record; ev_id uuid; is_ops boolean;
BEGIN
  SELECT * INTO tr FROM public.trips WHERE id = p_trip_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الرحلة غير موجودة'; END IF;
  is_ops := public.has_any_role(auth.uid(), '{owner,ops_manager,dispatcher}');
  IF NOT is_ops AND tr.driver_id IS DISTINCT FROM public.current_driver_id() THEN RAISE EXCEPTION 'غير مصرح'; END IF;

  IF p_client_event_id IS NOT NULL THEN
    SELECT id INTO ev_id FROM public.trip_events WHERE client_event_id = p_client_event_id;
    IF FOUND THEN RETURN ev_id; END IF;
  END IF;

  IF tr.status IN ('closed','cancelled') THEN RAISE EXCEPTION 'الرحلة مغلقة'; END IF;
  IF p_event_type = 'departed' AND tr.status NOT IN ('planned','ready','in_progress') THEN RAISE EXCEPTION 'الرحلة غير جاهزة للانطلاق — خصص الموارد أولًا'; END IF;
  IF p_event_type = 'departed' AND NOT is_ops AND NOT EXISTS (
     SELECT 1 FROM public.inspections WHERE trip_id = p_trip_id AND kind = 'pre_trip' AND NOT has_critical) THEN
     RAISE EXCEPTION 'يجب إكمال فحص ما قبل الانطلاق دون عيوب حرجة';
  END IF;
  IF p_event_type = 'delivered' AND NOT EXISTS (SELECT 1 FROM public.pods WHERE trip_id = p_trip_id) THEN
     RAISE EXCEPTION 'سجّل إثبات التسليم أولًا';
  END IF;

  INSERT INTO public.trip_events(trip_id, event_type, occurred_at, location_text, lat, lng, notes, client_event_id)
  VALUES (p_trip_id, p_event_type, COALESCE(p_occurred_at, now()), p_location, p_lat, p_lng, p_notes, p_client_event_id)
  RETURNING id INTO ev_id;

  UPDATE public.trips SET
    stage = CASE WHEN p_event_type IN ('suspended','breakdown','resumed') THEN stage ELSE p_event_type END,
    exception = CASE WHEN p_event_type IN ('suspended','breakdown') THEN p_event_type WHEN p_event_type = 'resumed' THEN NULL ELSE exception END,
    status = CASE WHEN p_event_type IN ('departed','arrived_pickup','loading_start','loading_end','arrived_delivery','unloading_start','unloading_end') AND status IN ('planned','ready') THEN 'in_progress'
                  WHEN p_event_type = 'delivered' THEN 'delivered' ELSE status END,
    actual_start = CASE WHEN p_event_type = 'departed' AND actual_start IS NULL THEN COALESCE(p_occurred_at, now()) ELSE actual_start END,
    actual_end = CASE WHEN p_event_type = 'delivered' THEN COALESCE(p_occurred_at, now()) ELSE actual_end END
  WHERE id = p_trip_id;

  IF p_event_type = 'departed' THEN
    UPDATE public.drivers SET status = 'on_trip' WHERE id = tr.driver_id;
    UPDATE public.assets SET status = 'active' WHERE id IN (tr.tractor_id, tr.trailer_id);
  ELSIF p_event_type = 'delivered' THEN
    UPDATE public.drivers SET status = 'available' WHERE id = tr.driver_id;
    UPDATE public.assets SET status = 'available' WHERE id IN (tr.tractor_id, tr.trailer_id) AND status = 'active';
  END IF;
  IF p_lat IS NOT NULL AND tr.tractor_id IS NOT NULL THEN
    INSERT INTO public.gps_readings(asset_id, reading_id, event_time, lat, lng, source)
    VALUES (tr.tractor_id, 'evt-' || ev_id, COALESCE(p_occurred_at, now()), p_lat, p_lng, 'driver_app');
  END IF;
  RETURN ev_id;
END $$;

CREATE OR REPLACE FUNCTION public.close_trip(p_trip_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_any_role(auth.uid(), '{owner,ops_manager,dispatcher}') THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  UPDATE public.trips SET status = 'closed' WHERE id = p_trip_id AND status = 'delivered';
  IF NOT FOUND THEN RAISE EXCEPTION 'لا يمكن الإغلاق إلا بعد التسليم'; END IF;
  UPDATE public.resource_bookings SET active = false WHERE trip_id = p_trip_id;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_trip(p_trip_id uuid, p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_any_role(auth.uid(), '{owner,ops_manager,dispatcher}') THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN RAISE EXCEPTION 'سبب الإلغاء مطلوب'; END IF;
  UPDATE public.trips SET status = 'cancelled', cancel_reason = p_reason WHERE id = p_trip_id AND status NOT IN ('delivered','closed','cancelled');
  IF NOT FOUND THEN RAISE EXCEPTION 'لا يمكن إلغاء هذه الرحلة'; END IF;
  DELETE FROM public.resource_bookings WHERE trip_id = p_trip_id;
END $$;

CREATE OR REPLACE FUNCTION public.review_expense(p_id uuid, p_approve boolean, p_reason text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_any_role(auth.uid(), '{owner,accountant}') THEN RAISE EXCEPTION 'الاعتماد للمحاسب فقط'; END IF;
  IF NOT p_approve AND (p_reason IS NULL OR length(trim(p_reason)) < 3) THEN RAISE EXCEPTION 'سبب الرفض مطلوب'; END IF;
  UPDATE public.expenses SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END, reject_reason = p_reason, reviewed_by = auth.uid(), reviewed_at = now()
  WHERE id = p_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'المصروف تمت مراجعته مسبقًا'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.settle_advance(p_id uuid) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; spent numeric;
BEGIN
  IF NOT public.has_any_role(auth.uid(), '{owner,accountant}') THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT * INTO a FROM public.advances WHERE id = p_id FOR UPDATE;
  IF a.status = 'settled' THEN RAISE EXCEPTION 'السلفة مسواة مسبقًا'; END IF;
  SELECT COALESCE(sum(amount),0) INTO spent FROM public.expenses
   WHERE driver_id = a.driver_id AND status = 'approved' AND payment_method = 'advance'
     AND (a.trip_id IS NULL OR trip_id = a.trip_id) AND spent_at >= a.issued_at;
  UPDATE public.advances SET status = 'settled', settled_at = now(), settled_expenses = spent, balance = a.amount - spent WHERE id = p_id;
  RETURN a.amount - spent;
END $$;

CREATE OR REPLACE FUNCTION public.create_invoice_from_trips(p_customer_id uuid, p_trip_ids uuid[], p_discount numeric DEFAULT 0)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv_id uuid; sub numeric; rate numeric; terms int; cnt int;
BEGIN
  IF NOT public.has_any_role(auth.uid(), '{owner,accountant}') THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT count(*) INTO cnt FROM public.trips t JOIN public.transport_orders o ON o.id = t.order_id
   WHERE t.id = ANY(p_trip_ids) AND o.customer_id = p_customer_id AND t.status IN ('delivered','closed');
  IF cnt <> array_length(p_trip_ids,1) THEN RAISE EXCEPTION 'كل الرحلات يجب أن تكون مسلّمة وتابعة لنفس العميل'; END IF;
  IF EXISTS (SELECT 1 FROM public.invoice_lines WHERE trip_id = ANY(p_trip_ids)) THEN RAISE EXCEPTION 'إحدى الرحلات مفوترة مسبقًا'; END IF;
  SELECT vat_rate INTO rate FROM public.company_settings WHERE id = 1;
  SELECT payment_terms_days INTO terms FROM public.customers WHERE id = p_customer_id;
  INSERT INTO public.invoices(customer_id, due_at, vat_rate) VALUES (p_customer_id, current_date + COALESCE(terms,30), COALESCE(rate,15)) RETURNING id INTO inv_id;
  INSERT INTO public.invoice_lines(invoice_id, trip_id, description, amount)
  SELECT inv_id, t.id, 'نقل ' || t.origin_city || ' → ' || t.dest_city || ' (' || t.number || ')', COALESCE(f.revenue,0)
  FROM public.trips t LEFT JOIN public.trip_financials f ON f.trip_id = t.id WHERE t.id = ANY(p_trip_ids);
  SELECT sum(amount) INTO sub FROM public.invoice_lines WHERE invoice_id = inv_id;
  UPDATE public.invoices SET subtotal = sub, discount = COALESCE(p_discount,0),
    vat = round((sub - COALESCE(p_discount,0)) * COALESCE(rate,15) / 100, 2),
    total = round((sub - COALESCE(p_discount,0)) * (1 + COALESCE(rate,15) / 100), 2)
  WHERE id = inv_id;
  RETURN inv_id;
END $$;

CREATE OR REPLACE FUNCTION public.allocate_payment(p_payment_id uuid, p_invoice_id uuid, p_amount numeric) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; inv record; used numeric; paid numeric;
BEGIN
  IF NOT public.has_any_role(auth.uid(), '{owner,accountant}') THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT * INTO p FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  SELECT * INTO inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF inv.customer_id <> p.customer_id THEN RAISE EXCEPTION 'الفاتورة لعميل مختلف'; END IF;
  IF inv.status <> 'approved' THEN RAISE EXCEPTION 'يجب اعتماد الفاتورة أولًا'; END IF;
  SELECT COALESCE(sum(amount),0) INTO used FROM public.payment_allocations WHERE payment_id = p_payment_id;
  SELECT COALESCE(sum(amount),0) INTO paid FROM public.payment_allocations WHERE invoice_id = p_invoice_id;
  IF used + p_amount > p.amount THEN RAISE EXCEPTION 'المبلغ يتجاوز رصيد الدفعة غير الموزع (%)', p.amount - used; END IF;
  IF paid + p_amount > inv.total THEN RAISE EXCEPTION 'المبلغ يتجاوز المتبقي على الفاتورة (%)', inv.total - paid; END IF;
  INSERT INTO public.payment_allocations(payment_id, invoice_id, amount) VALUES (p_payment_id, p_invoice_id, p_amount)
  ON CONFLICT (payment_id, invoice_id) DO UPDATE SET amount = payment_allocations.amount + EXCLUDED.amount;
END $$;

CREATE OR REPLACE FUNCTION public.driver_my_trips() RETURNS TABLE (
  id uuid, number text, status text, stage text, exception text, origin_city text, dest_city text,
  planned_start timestamptz, planned_end timestamptz, actual_start timestamptz, distance_km numeric,
  tractor_id uuid, tractor_code text, trailer_id uuid, trailer_code text, cargo_type text, quantity numeric, unit text, weight_kg numeric,
  order_number text, customer_name text, consignee text, pickup_name text, delivery_name text, delivery_instructions text,
  dest_lat double precision, dest_lng double precision, origin_lat double precision, origin_lng double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.number, t.status, t.stage, t.exception, t.origin_city, t.dest_city, t.planned_start, t.planned_end, t.actual_start, t.distance_km,
    t.tractor_id, tk.code, t.trailer_id, tl.code, o.cargo_type, o.quantity, o.unit, o.weight_kg, o.number, c.name, o.consignee, lp.name, ld.name, ld.instructions,
    ld.lat, ld.lng, lp.lat, lp.lng
  FROM public.trips t
  LEFT JOIN public.assets tk ON tk.id = t.tractor_id
  LEFT JOIN public.assets tl ON tl.id = t.trailer_id
  LEFT JOIN public.transport_orders o ON o.id = t.order_id
  LEFT JOIN public.customers c ON c.id = o.customer_id
  LEFT JOIN public.locations lp ON lp.id = COALESCE(t.origin_location_id, o.pickup_location_id)
  LEFT JOIN public.locations ld ON ld.id = COALESCE(t.dest_location_id, o.delivery_location_id)
  WHERE t.driver_id = public.current_driver_id() AND t.status NOT IN ('draft','cancelled')
  ORDER BY (t.status = 'in_progress') DESC, t.planned_start DESC NULLS LAST
$$;

GRANT EXECUTE ON FUNCTION public.assign_trip_resources, public.record_trip_event, public.close_trip, public.cancel_trip, public.review_expense,
  public.settle_advance, public.create_invoice_from_trips, public.allocate_payment, public.driver_my_trips, public.has_role, public.has_any_role,
  public.is_staff, public.current_driver_id TO authenticated;

INSERT INTO public.company_settings(id) VALUES (1);

CREATE POLICY "auth upload attachments" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'attachments' AND (public.is_staff(auth.uid()) OR (storage.foldername(name))[1] = auth.uid()::text));
CREATE POLICY "read attachments" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'attachments' AND (public.is_staff(auth.uid()) OR (storage.foldername(name))[1] = auth.uid()::text));
