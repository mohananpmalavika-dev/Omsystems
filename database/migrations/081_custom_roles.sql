-- Tenant-owned role definitions. The base role keeps existing authorization
-- ranking intact while menu access is controlled by the custom role.
CREATE TABLE IF NOT EXISTS custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  base_role user_role NOT NULL DEFAULT 'viewer',
  menu_access jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name),
  CHECK (jsonb_typeof(menu_access) = 'array')
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS custom_role_id uuid REFERENCES custom_roles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS custom_roles_tenant_idx ON custom_roles (tenant_id);
CREATE INDEX IF NOT EXISTS users_custom_role_idx ON users (custom_role_id);