CREATE EXTENSION IF NOT EXISTS ltree;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE resource_node_type AS ENUM (
  'company', 'division', 'region', 'branch', 'camera-group', 'camera'
);
CREATE TYPE grant_effect AS ENUM ('allow', 'deny');
CREATE TYPE camera_status AS ENUM ('online', 'offline', 'degraded', 'unknown');

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE resource_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  parent_id uuid REFERENCES resource_nodes(id),
  node_type resource_node_type NOT NULL,
  name text NOT NULL,
  path ltree NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, path)
);

CREATE INDEX resource_nodes_path_gist_idx ON resource_nodes USING gist (path);
CREATE INDEX resource_nodes_parent_idx ON resource_nodes (parent_id);

CREATE TABLE cameras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_node_id uuid NOT NULL UNIQUE REFERENCES resource_nodes(id),
  branch_node_id uuid NOT NULL REFERENCES resource_nodes(id),
  vendor text NOT NULL,
  model text NOT NULL,
  channel integer NOT NULL CHECK (channel > 0),
  protocol text NOT NULL,
  status camera_status NOT NULL DEFAULT 'unknown',
  connection_secret_ref text NOT NULL,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  identity_subject text NOT NULL,
  display_name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, identity_subject)
);

CREATE TABLE access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid NOT NULL REFERENCES users(id),
  scope_node_id uuid NOT NULL REFERENCES resource_nodes(id),
  action text NOT NULL,
  effect grant_effect NOT NULL,
  valid_from timestamptz,
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from)
);

CREATE INDEX access_grants_user_action_idx
  ON access_grants (tenant_id, user_id, action);

CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  actor_user_id uuid REFERENCES users(id),
  action text NOT NULL,
  resource_node_id uuid REFERENCES resource_nodes(id),
  outcome text NOT NULL,
  source_ip inet,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_events_tenant_time_idx
  ON audit_events (tenant_id, occurred_at DESC);

-- A grant applies when the target path is below the grant's scope:
-- target.path <@ scope.path
