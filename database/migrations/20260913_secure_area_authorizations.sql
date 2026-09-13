-- Branch/location scoped authorization records for cash counters and lockers.
-- History is append-only: a reassignment closes the prior row and creates a new
-- row, preserving the date-wise compliance report and locker-change evidence.
CREATE TABLE IF NOT EXISTS secure_area_authorized_persons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  location_id uuid REFERENCES resource_nodes(id) ON DELETE SET NULL,
  employee_code text NOT NULL,
  full_name text NOT NULL,
  designation text,
  phone text,
  email text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, employee_code)
);

CREATE TABLE IF NOT EXISTS secure_area_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  location_id uuid REFERENCES resource_nodes(id) ON DELETE SET NULL,
  area_type text NOT NULL CHECK (area_type IN ('cash_counter', 'locker')),
  area_name text NOT NULL,
  authorized_person_id uuid NOT NULL REFERENCES secure_area_authorized_persons(id) ON DELETE RESTRICT,
  effective_date date NOT NULL DEFAULT current_date,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  change_reason text,
  assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_until IS NULL OR effective_until >= effective_from)
);

CREATE INDEX IF NOT EXISTS secure_area_authorizations_scope_date_idx
  ON secure_area_authorizations (tenant_id, branch_id, location_id, area_type, effective_date DESC);
CREATE INDEX IF NOT EXISTS secure_area_authorizations_active_idx
  ON secure_area_authorizations (tenant_id, branch_id, area_type, area_name)
  WHERE effective_until IS NULL;

-- This is the separate immutable operational alert/report record required for
-- every locker-authority replacement. It is intentionally not a UI-only toast.
CREATE TABLE IF NOT EXISTS locker_authorization_change_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  location_id uuid REFERENCES resource_nodes(id) ON DELETE SET NULL,
  locker_name text NOT NULL,
  previous_authorization_id uuid REFERENCES secure_area_authorizations(id) ON DELETE SET NULL,
  new_authorization_id uuid NOT NULL REFERENCES secure_area_authorizations(id) ON DELETE RESTRICT,
  changed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  change_reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS locker_authorization_change_alerts_scope_date_idx
  ON locker_authorization_change_alerts (tenant_id, branch_id, created_at DESC);
