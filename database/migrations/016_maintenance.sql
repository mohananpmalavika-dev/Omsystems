CREATE TABLE IF NOT EXISTS maintenance_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact text,
  email text,
  phone text,
  address text,
  gst_number text,
  service_centers jsonb,
  escalation_matrix jsonb,
  notes text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS maintenance_vendors_tenant_idx ON maintenance_vendors (tenant_id, name);

CREATE TABLE IF NOT EXISTS amc_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contract_number text NOT NULL,
  vendor_id uuid NOT NULL REFERENCES maintenance_vendors(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  warranty text,
  coverage text,
  exclusions text,
  payment_terms text,
  cost numeric,
  renewal text,
  sla text,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS amc_contracts_tenant_idx ON amc_contracts (tenant_id, vendor_id, status);

CREATE TABLE IF NOT EXISTS maintenance_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category text NOT NULL,
  asset_type text NOT NULL,
  serial_number text,
  make text,
  model text,
  firmware_version text,
  warranty_expires_at date,
  purchase_date date,
  installation_date date,
  vendor_id uuid REFERENCES maintenance_vendors(id),
  branch_node_id uuid REFERENCES resource_nodes(id),
  location text,
  mounting_height text,
  status text NOT NULL DEFAULT 'operational',
  notes text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS maintenance_assets_tenant_idx ON maintenance_assets (tenant_id, category, status);

CREATE TABLE IF NOT EXISTS work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  work_order_number text NOT NULL,
  asset_id uuid REFERENCES maintenance_assets(id),
  branch_node_id uuid REFERENCES resource_nodes(id),
  problem text NOT NULL,
  severity text NOT NULL,
  technician text,
  vendor_id uuid REFERENCES maintenance_vendors(id),
  sla_due_at timestamptz,
  eta timestamptz,
  parts jsonb,
  cost numeric,
  root_cause text,
  action_taken text,
  verification text,
  status text NOT NULL DEFAULT 'open',
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS work_orders_tenant_idx ON work_orders (tenant_id, status, branch_node_id);
