-- Migration 141: OpenID Connect (OIDC) Single Sign-On Production Infrastructure (security.oidc)
-- Persistent storage for multi-tenant OIDC configurations (Google Workspace, Okta, Generic OIDC)
-- and security audit logs for SSO authentication lifecycle.

-- 1. OIDC Tenant Configurations Table
CREATE TABLE IF NOT EXISTS oidc_tenant_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(128) NOT NULL UNIQUE,
    provider VARCHAR(64) NOT NULL, -- 'google', 'okta', 'generic', 'azure-ad', 'auth0', 'keycloak'
    issuer_url TEXT NOT NULL,
    client_id VARCHAR(256) NOT NULL,
    client_secret TEXT,
    redirect_uri TEXT NOT NULL,
    scopes TEXT[] NOT NULL DEFAULT '{"openid", "profile", "email"}',
    authorization_endpoint TEXT,
    token_endpoint TEXT,
    userinfo_endpoint TEXT,
    jwks_uri TEXT,
    hosted_domain VARCHAR(256), -- For Google Workspace domain restriction (hd claim)
    allowed_domains TEXT[] NOT NULL DEFAULT '{}', -- Allowed email domain whitelist
    attribute_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
    role_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
    default_role VARCHAR(64) NOT NULL DEFAULT 'BANK_OPERATOR',
    require_pkce BOOLEAN NOT NULL DEFAULT TRUE,
    require_state_validation BOOLEAN NOT NULL DEFAULT TRUE,
    clock_tolerance_seconds INTEGER NOT NULL DEFAULT 60,
    session_duration_seconds INTEGER NOT NULL DEFAULT 28800, -- 8 hours
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oidc_tenant_configs_tenant 
    ON oidc_tenant_configs (tenant_id);

CREATE INDEX IF NOT EXISTS idx_oidc_tenant_configs_provider 
    ON oidc_tenant_configs (provider);

CREATE INDEX IF NOT EXISTS idx_oidc_tenant_configs_enabled 
    ON oidc_tenant_configs (is_enabled);

-- 2. OIDC Security Audit Events Table
CREATE TABLE IF NOT EXISTS oidc_audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(128) NOT NULL,
    event_type VARCHAR(64) NOT NULL, -- 'LOGIN_INITIATED', 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'TOKEN_REFRESHED', 'SESSION_REVOKED', 'CONFIG_SAVED', 'CONFIG_DELETED'
    user_id VARCHAR(128),
    email VARCHAR(256),
    provider VARCHAR(64) NOT NULL,
    client_ip VARCHAR(64),
    user_agent TEXT,
    reason TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oidc_audit_events_tenant 
    ON oidc_audit_events (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_oidc_audit_events_user 
    ON oidc_audit_events (user_id);

CREATE INDEX IF NOT EXISTS idx_oidc_audit_events_type 
    ON oidc_audit_events (event_type);
