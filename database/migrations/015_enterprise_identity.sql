-- Enterprise Identity Features Migration
-- SAML, OIDC, LDAP, MFA, SCIM, Privileged Access

-- ============================================================================
-- SAML Sessions
-- ============================================================================

CREATE TABLE IF NOT EXISTS saml_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid NOT NULL REFERENCES users(id),
  name_id text NOT NULL,
  session_index text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX saml_sessions_user_idx ON saml_sessions(user_id);
CREATE INDEX saml_sessions_expires_idx ON saml_sessions(expires_at) WHERE revoked_at IS NULL;

-- ============================================================================
-- OIDC Sessions
-- ============================================================================

CREATE TABLE IF NOT EXISTS oidc_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid NOT NULL REFERENCES users(id),
  access_token text NOT NULL,
  refresh_token text,
  id_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX oidc_sessions_user_idx ON oidc_sessions(user_id);
CREATE INDEX oidc_sessions_expires_idx ON oidc_sessions(expires_at) WHERE revoked_at IS NULL;

-- ============================================================================
-- LDAP Sessions
-- ============================================================================

CREATE TABLE IF NOT EXISTS ldap_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid NOT NULL REFERENCES users(id),
  ldap_dn text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX ldap_sessions_user_idx ON ldap_sessions(user_id);
CREATE INDEX ldap_sessions_expires_idx ON ldap_sessions(expires_at) WHERE revoked_at IS NULL;

-- ============================================================================
-- User Groups
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  description text,
  source text NOT NULL DEFAULT 'manual', -- manual, saml, oidc, ldap, scim
  external_id text, -- ID from external system
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, name)
);

CREATE INDEX user_groups_tenant_idx ON user_groups(tenant_id);

-- ============================================================================
-- User Group Memberships
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_group_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  group_id uuid NOT NULL REFERENCES user_groups(id),
  source text NOT NULL DEFAULT 'manual', -- manual, saml, oidc, ldap, scim
  created_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, group_id)
);

CREATE INDEX user_group_memberships_user_idx ON user_group_memberships(user_id);
CREATE INDEX user_group_memberships_group_idx ON user_group_memberships(group_id);

-- ============================================================================
-- MFA Configurations
-- ============================================================================

CREATE TYPE mfa_method AS ENUM ('totp', 'sms', 'email', 'backup_code');

CREATE TABLE IF NOT EXISTS mfa_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  method mfa_method NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  verified boolean NOT NULL DEFAULT false,
  secret text, -- For TOTP
  phone_number text, -- For SMS
  email text, -- For email OTP
  backup_codes jsonb, -- Hashed backup codes array
  created_at timestamptz NOT NULL DEFAULT NOW(),
  verified_at timestamptz,
  UNIQUE(user_id, method)
);

CREATE INDEX mfa_configurations_user_idx ON mfa_configurations(user_id);

-- ============================================================================
-- MFA OTP Codes
-- ============================================================================

CREATE TABLE IF NOT EXISTS mfa_otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  method mfa_method NOT NULL,
  code_hash text NOT NULL,
  phone_number text,
  email text,
  expires_at timestamptz NOT NULL,
  used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX mfa_otp_codes_user_expires_idx ON mfa_otp_codes(user_id, expires_at) WHERE used = false;

-- ============================================================================
-- MFA Verification Log
-- ============================================================================

CREATE TABLE IF NOT EXISTS mfa_verification_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  method mfa_method NOT NULL,
  success boolean NOT NULL,
  ip_address inet,
  user_agent text,
  verified_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX mfa_verification_log_user_time_idx ON mfa_verification_log(user_id, verified_at DESC);

-- ============================================================================
-- MFA Policies
-- ============================================================================

CREATE TABLE IF NOT EXISTS mfa_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) UNIQUE,
  enforced boolean NOT NULL DEFAULT false,
  allowed_methods mfa_method[] NOT NULL DEFAULT '{totp,sms,email}',
  grace_period_days integer NOT NULL DEFAULT 7,
  require_for_roles text[] NOT NULL DEFAULT '{}',
  exempt_roles text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Privileged Access Requests
-- ============================================================================

CREATE TYPE privileged_access_status AS ENUM ('pending', 'approved', 'denied', 'expired', 'revoked');

CREATE TABLE IF NOT EXISTS privileged_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid NOT NULL REFERENCES users(id),
  requested_role text NOT NULL,
  reason text NOT NULL,
  duration_hours integer NOT NULL,
  status privileged_access_status NOT NULL DEFAULT 'pending',
  approver_id uuid REFERENCES users(id),
  approved_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES users(id),
  session_recording_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX privileged_access_requests_user_idx ON privileged_access_requests(user_id);
CREATE INDEX privileged_access_requests_status_idx ON privileged_access_requests(status);

-- ============================================================================
-- Add authentication provider columns to users table
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'users' AND column_name = 'auth_provider') THEN
    ALTER TABLE users ADD COLUMN auth_provider text DEFAULT 'local';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'users' AND column_name = 'saml_name_id') THEN
    ALTER TABLE users ADD COLUMN saml_name_id text;
    ALTER TABLE users ADD COLUMN saml_attributes jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'users' AND column_name = 'oidc_sub') THEN
    ALTER TABLE users ADD COLUMN oidc_sub text;
    ALTER TABLE users ADD COLUMN oidc_claims jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'users' AND column_name = 'ldap_dn') THEN
    ALTER TABLE users ADD COLUMN ldap_dn text;
    ALTER TABLE users ADD COLUMN ldap_attributes jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'users' AND column_name = 'last_login_at') THEN
    ALTER TABLE users ADD COLUMN last_login_at timestamptz;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS users_saml_name_id_idx ON users(saml_name_id) WHERE saml_name_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_oidc_sub_idx ON users(oidc_sub) WHERE oidc_sub IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_ldap_dn_idx ON users(ldap_dn) WHERE ldap_dn IS NOT NULL;
