/**
 * Enterprise Identity Infrastructure
 * 
 * Database schema for production-complete enterprise authentication:
 * - Identity providers
 * - Identity links (external → local)
 * - Role mappings
 * - Sessions
 * - Audit events
 */

-- ============================================================================
-- Identity Providers
-- ============================================================================

CREATE TABLE IF NOT EXISTS identity_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Provider configuration (JSONB for flexibility)
  configuration JSONB NOT NULL,
  provisioning JSONB NOT NULL,
  authorization JSONB NOT NULL,
  security JSONB NOT NULL,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  
  -- Constraints
  CONSTRAINT identity_providers_tenant_name_unique 
    UNIQUE (tenant_id, ((configuration->>'name')::text))
);

CREATE INDEX idx_identity_providers_tenant ON identity_providers(tenant_id);
CREATE INDEX idx_identity_providers_type ON identity_providers USING GIN ((configuration->'type'));
CREATE INDEX idx_identity_providers_enabled ON identity_providers USING GIN ((configuration->'enabled'));

COMMENT ON TABLE identity_providers IS 'External identity provider configurations (Azure AD, SAML, LDAP, etc.)';
COMMENT ON COLUMN identity_providers.configuration IS 'Provider-specific configuration (type, credentials, endpoints)';
COMMENT ON COLUMN identity_providers.provisioning IS 'JIT provisioning policy (mode, allowed domains, default role)';
COMMENT ON COLUMN identity_providers.authorization IS 'Authorization policy (require mapped role, IP restrictions, session limits)';
COMMENT ON COLUMN identity_providers.security IS 'Security policy (MFA requirement, authentication age, assurance level)';

-- ============================================================================
-- Enterprise Identity Links
-- ============================================================================

CREATE TABLE IF NOT EXISTS enterprise_identity_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Composite identity key
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES identity_providers(id) ON DELETE CASCADE,
  provider_type TEXT NOT NULL,
  
  -- Local user
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- External identity (immutable)
  external_subject TEXT NOT NULL,
  
  -- External identity attributes (mutable, for display/audit)
  external_email TEXT,
  external_username TEXT,
  
  -- Authentication tracking
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_authenticated_at TIMESTAMPTZ,
  authentication_count INTEGER NOT NULL DEFAULT 0,
  
  -- Additional metadata
  metadata JSONB,
  
  -- CRITICAL: Unique constraint on external identity
  CONSTRAINT enterprise_identity_links_unique 
    UNIQUE (tenant_id, provider_id, external_subject)
);

CREATE INDEX idx_identity_links_user ON enterprise_identity_links(user_id, tenant_id);
CREATE INDEX idx_identity_links_provider ON enterprise_identity_links(provider_id);
CREATE INDEX idx_identity_links_email ON enterprise_identity_links(tenant_id, LOWER(external_email));
CREATE INDEX idx_identity_links_last_auth ON enterprise_identity_links(last_authenticated_at DESC);

COMMENT ON TABLE enterprise_identity_links IS 'Immutable links between external identities and local users';
COMMENT ON COLUMN enterprise_identity_links.external_subject IS 'Provider-issued immutable identifier (oid, NameID, entryUUID)';
COMMENT ON CONSTRAINT enterprise_identity_links_unique IS 'Prevents duplicate identity links';

-- ============================================================================
-- Enterprise Role Mappings
-- ============================================================================

CREATE TABLE IF NOT EXISTS enterprise_role_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES identity_providers(id) ON DELETE CASCADE,
  
  -- External group identifier
  external_group TEXT NOT NULL,
  
  -- Local role
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  
  -- Mapping priority (higher = more important)
  priority INTEGER NOT NULL DEFAULT 0,
  
  -- Whether mapping is enabled
  enabled BOOLEAN NOT NULL DEFAULT true,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Ensure unique mapping per provider/group/role
  CONSTRAINT enterprise_role_mappings_unique 
    UNIQUE (tenant_id, provider_id, external_group, role_id)
);

CREATE INDEX idx_role_mappings_provider ON enterprise_role_mappings(provider_id);
CREATE INDEX idx_role_mappings_group ON enterprise_role_mappings(tenant_id, provider_id, external_group);
CREATE INDEX idx_role_mappings_enabled ON enterprise_role_mappings(enabled) WHERE enabled = true;
CREATE INDEX idx_role_mappings_priority ON enterprise_role_mappings(priority DESC);

COMMENT ON TABLE enterprise_role_mappings IS 'Maps external IdP groups to local application roles';
COMMENT ON COLUMN enterprise_role_mappings.external_group IS 'External group identifier (Azure group name/ID, LDAP DN, SAML attribute)';
COMMENT ON COLUMN enterprise_role_mappings.priority IS 'Mapping priority when multiple groups match (higher wins)';

-- ============================================================================
-- Authentication Sessions
-- ============================================================================

CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- User and tenant
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES tenant_memberships(id) ON DELETE CASCADE,
  
  -- Refresh token (hashed)
  refresh_token_hash TEXT NOT NULL,
  
  -- Authentication context
  authentication_method TEXT NOT NULL,
  provider_id UUID REFERENCES identity_providers(id) ON DELETE SET NULL,
  mfa BOOLEAN NOT NULL DEFAULT false,
  authenticated_at TIMESTAMPTZ NOT NULL,
  
  -- Session lifecycle
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  
  -- Session metadata
  ip_address INET,
  user_agent TEXT,
  device_id TEXT,
  location JSONB,
  
  -- Index on refresh token hash for lookup
  CONSTRAINT auth_sessions_refresh_token_unique UNIQUE (refresh_token_hash)
);

CREATE INDEX idx_auth_sessions_user ON auth_sessions(user_id, revoked_at, expires_at);
CREATE INDEX idx_auth_sessions_tenant ON auth_sessions(tenant_id);
CREATE INDEX idx_auth_sessions_membership ON auth_sessions(membership_id);
CREATE INDEX idx_auth_sessions_provider ON auth_sessions(provider_id, revoked_at);
CREATE INDEX idx_auth_sessions_expires ON auth_sessions(expires_at) WHERE revoked_at IS NULL;
CREATE INDEX idx_auth_sessions_last_used ON auth_sessions(last_used_at DESC);

COMMENT ON TABLE auth_sessions IS 'Application authentication sessions with refresh tokens';
COMMENT ON COLUMN auth_sessions.refresh_token_hash IS 'SHA-256 hash of opaque refresh token';
COMMENT ON COLUMN auth_sessions.authentication_method IS 'How user authenticated (PASSWORD, OIDC, SAML, LDAP, etc.)';
COMMENT ON COLUMN auth_sessions.mfa IS 'Whether MFA was used during authentication';

-- ============================================================================
-- Authentication Transactions (OIDC/SAML state)
-- ============================================================================

CREATE TABLE IF NOT EXISTS auth_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES identity_providers(id) ON DELETE CASCADE,
  
  -- Protocol state
  state_hash TEXT NOT NULL,
  nonce_hash TEXT,
  pkce_verifier_encrypted TEXT,
  saml_request_id TEXT,
  
  -- Redirect target
  redirect_uri TEXT,
  
  -- Lifecycle
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  
  -- Prevent state reuse
  CONSTRAINT auth_transactions_state_unique UNIQUE (state_hash)
);

CREATE INDEX idx_auth_transactions_expires ON auth_transactions(expires_at);
CREATE INDEX idx_auth_transactions_consumed ON auth_transactions(consumed_at) WHERE consumed_at IS NULL;

COMMENT ON TABLE auth_transactions IS 'Temporary state for OIDC/SAML authentication flows';
COMMENT ON COLUMN auth_transactions.state_hash IS 'SHA-256 hash of OAuth state parameter';
COMMENT ON COLUMN auth_transactions.nonce_hash IS 'SHA-256 hash of OIDC nonce';
COMMENT ON COLUMN auth_transactions.pkce_verifier_encrypted IS 'Encrypted PKCE code verifier';

-- ============================================================================
-- Audit Events
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Event classification
  event_type TEXT NOT NULL,
  event_category TEXT NOT NULL DEFAULT 'authentication',
  
  -- Context
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  provider_id UUID REFERENCES identity_providers(id) ON DELETE SET NULL,
  session_id UUID REFERENCES auth_sessions(id) ON DELETE SET NULL,
  
  -- Request metadata
  ip_address INET,
  user_agent TEXT,
  
  -- Event data
  event_data JSONB,
  
  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_events_type ON audit_events(event_type);
CREATE INDEX idx_audit_events_category ON audit_events(event_category);
CREATE INDEX idx_audit_events_tenant ON audit_events(tenant_id, created_at DESC);
CREATE INDEX idx_audit_events_user ON audit_events(user_id, created_at DESC);
CREATE INDEX idx_audit_events_provider ON audit_events(provider_id, created_at DESC);
CREATE INDEX idx_audit_events_created ON audit_events(created_at DESC);

-- Partition by month for large deployments
-- CREATE TABLE audit_events_y2024m01 PARTITION OF audit_events
--   FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

COMMENT ON TABLE audit_events IS 'Audit trail for authentication and authorization events';
COMMENT ON COLUMN audit_events.event_type IS 'Specific event (ENTERPRISE_LOGIN_SUCCESS, ROLE_MAPPING_FAILED, etc.)';
COMMENT ON COLUMN audit_events.event_category IS 'Event category (authentication, authorization, provisioning, admin)';

-- ============================================================================
-- SAML Assertion Tracking (Replay Prevention)
-- ============================================================================

CREATE TABLE IF NOT EXISTS saml_assertions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES identity_providers(id) ON DELETE CASCADE,
  
  -- Assertion identifier
  assertion_id TEXT NOT NULL,
  
  -- Expiration
  expires_at TIMESTAMPTZ NOT NULL,
  
  -- Prevent replay
  CONSTRAINT saml_assertions_unique UNIQUE (provider_id, assertion_id)
);

CREATE INDEX idx_saml_assertions_expires ON saml_assertions(expires_at);

COMMENT ON TABLE saml_assertions IS 'Tracks SAML assertion IDs to prevent replay attacks';

-- Automatically delete expired assertions
CREATE OR REPLACE FUNCTION cleanup_expired_saml_assertions()
RETURNS void AS $$
BEGIN
  DELETE FROM saml_assertions WHERE expires_at < now() - interval '1 hour';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to revoke all sessions for a user
CREATE OR REPLACE FUNCTION revoke_user_sessions(
  p_user_id UUID,
  p_reason TEXT DEFAULT 'Administrative action'
)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE auth_sessions
  SET revoked_at = now(),
      revoked_reason = p_reason
  WHERE user_id = p_user_id
    AND revoked_at IS NULL;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Function to revoke all sessions for a provider
CREATE OR REPLACE FUNCTION revoke_provider_sessions(
  p_provider_id UUID,
  p_reason TEXT DEFAULT 'Provider disabled'
)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE auth_sessions
  SET revoked_at = now(),
      revoked_reason = p_reason
  WHERE provider_id = p_provider_id
    AND revoked_at IS NULL;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up expired sessions and transactions
CREATE OR REPLACE FUNCTION cleanup_expired_auth_records()
RETURNS void AS $$
BEGIN
  -- Delete old expired sessions (keep for 30 days after expiry/revocation)
  DELETE FROM auth_sessions
  WHERE (expires_at < now() - interval '30 days')
     OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '30 days');
  
  -- Delete expired transactions
  DELETE FROM auth_transactions
  WHERE expires_at < now() - interval '1 hour';
  
  -- Delete expired SAML assertions
  PERFORM cleanup_expired_saml_assertions();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Triggers
-- ============================================================================

-- Update timestamp trigger for identity_providers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_identity_providers_updated_at
  BEFORE UPDATE ON identity_providers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_enterprise_role_mappings_updated_at
  BEFORE UPDATE ON enterprise_role_mappings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Security: Row-Level Security (Optional)
-- ============================================================================

-- Enable RLS on sensitive tables
-- ALTER TABLE identity_providers ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE enterprise_identity_links ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;

-- Example RLS policy: Users can only see their own sessions
-- CREATE POLICY auth_sessions_user_policy ON auth_sessions
--   FOR SELECT
--   USING (user_id = current_setting('app.current_user_id')::uuid);

-- ============================================================================
-- Grants (Adjust based on your application user)
-- ============================================================================

-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_user;

-- ============================================================================
-- Sample Data (Development Only - Remove in Production)
-- ============================================================================

-- Example identity provider (Azure AD)
-- INSERT INTO identity_providers (tenant_id, configuration, provisioning, authorization, security)
-- VALUES (
--   'your-tenant-id',
--   '{"type": "AZURE_AD", "enabled": true, "name": "Corporate Azure AD", ...}',
--   '{"mode": "JIT", "allowedDomains": ["company.com"], ...}',
--   '{"requireMappedRole": true, ...}',
--   '{"requireMfa": true, ...}'
-- );
