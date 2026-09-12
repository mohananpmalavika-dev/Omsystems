-- Migration 142: Production LDAP & Active Directory Directory Sync (security.ldap)
-- Persistent tables for multi-tenant LDAPS synchronization, automatic Organizational Unit (OU)
-- hierarchy mapping, user group mapping, delta sync tracking, and detailed audit history.

-- 1. LDAP / Active Directory Sync Configurations
CREATE TABLE IF NOT EXISTS ldap_sync_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(128) NOT NULL UNIQUE,
    provider_id VARCHAR(128) NOT NULL,
    name VARCHAR(128) NOT NULL DEFAULT 'Enterprise Active Directory',
    server_url TEXT NOT NULL, -- e.g. ldaps://ad.bank.internal:636
    bind_dn TEXT NOT NULL,
    bind_secret_ref TEXT NOT NULL,
    base_dn TEXT NOT NULL,
    user_search_base TEXT,
    user_search_filter TEXT NOT NULL DEFAULT '(&(objectCategory=person)(objectClass=user))',
    group_search_base TEXT,
    group_search_filter TEXT NOT NULL DEFAULT '(&(objectCategory=group)(objectClass=group))',
    ou_search_base TEXT,
    ou_search_filter TEXT NOT NULL DEFAULT '(objectClass=organizationalUnit)',
    attribute_mapping JSONB NOT NULL DEFAULT '{
        "username": "sAMAccountName",
        "email": "mail",
        "displayName": "displayName",
        "firstName": "givenName",
        "lastName": "sn",
        "telephone": "telephoneNumber",
        "title": "title",
        "department": "department",
        "memberOf": "memberOf",
        "userAccountControl": "userAccountControl",
        "whenChanged": "whenChanged",
        "modifyTimestamp": "modifyTimestamp"
    }'::jsonb,
    ou_mapping_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
    group_mapping_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
    sync_interval_cron VARCHAR(64) NOT NULL DEFAULT '0 */6 * * *',
    sync_mode VARCHAR(32) NOT NULL DEFAULT 'INCREMENTAL', -- 'FULL' or 'INCREMENTAL'
    deactivate_missing_users BOOLEAN NOT NULL DEFAULT TRUE,
    revoke_sessions_on_deactivate BOOLEAN NOT NULL DEFAULT TRUE,
    tls_require_trusted_ca BOOLEAN NOT NULL DEFAULT TRUE,
    tls_ca_certs TEXT[] NOT NULL DEFAULT '{}',
    page_size INTEGER NOT NULL DEFAULT 500,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    last_sync_timestamp TIMESTAMPTZ,
    highest_usn BIGINT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ldap_sync_config_tenant ON ldap_sync_configurations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ldap_sync_config_provider ON ldap_sync_configurations(provider_id);
CREATE INDEX IF NOT EXISTS idx_ldap_sync_config_enabled ON ldap_sync_configurations(is_enabled);

-- 2. LDAP Directory Synchronization Audit History
CREATE TABLE IF NOT EXISTS ldap_sync_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(128) NOT NULL,
    provider_id VARCHAR(128) NOT NULL,
    sync_mode VARCHAR(32) NOT NULL, -- 'FULL', 'INCREMENTAL', 'DRY_RUN'
    status VARCHAR(32) NOT NULL, -- 'RUNNING', 'SUCCESS', 'PARTIAL_SUCCESS', 'FAILED'
    users_discovered INTEGER NOT NULL DEFAULT 0,
    users_created INTEGER NOT NULL DEFAULT 0,
    users_updated INTEGER NOT NULL DEFAULT 0,
    users_deactivated INTEGER NOT NULL DEFAULT 0,
    groups_discovered INTEGER NOT NULL DEFAULT 0,
    groups_mapped INTEGER NOT NULL DEFAULT 0,
    ous_discovered INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    high_water_mark TIMESTAMPTZ,
    error_summary TEXT,
    errors JSONB NOT NULL DEFAULT '[]'::jsonb,
    sync_details JSONB NOT NULL DEFAULT '{}'::jsonb,
    initiated_by VARCHAR(128) NOT NULL DEFAULT 'system-scheduler',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ldap_sync_history_tenant ON ldap_sync_history(tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ldap_sync_history_status ON ldap_sync_history(status);
CREATE INDEX IF NOT EXISTS idx_ldap_sync_history_provider ON ldap_sync_history(provider_id);

-- 3. Discovered Organizational Unit (OU) Hierarchy Cache
CREATE TABLE IF NOT EXISTS ldap_ou_hierarchy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(128) NOT NULL,
    dn TEXT NOT NULL,
    ou_name VARCHAR(256) NOT NULL,
    parent_dn TEXT,
    canonical_path TEXT NOT NULL,
    depth INTEGER NOT NULL DEFAULT 0,
    mapped_department VARCHAR(128),
    mapped_branch_id VARCHAR(128),
    mapped_role VARCHAR(64),
    raw_attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_ldap_ou_tenant_dn UNIQUE (tenant_id, dn)
);

CREATE INDEX IF NOT EXISTS idx_ldap_ou_tenant_path ON ldap_ou_hierarchy(tenant_id, canonical_path);
CREATE INDEX IF NOT EXISTS idx_ldap_ou_parent ON ldap_ou_hierarchy(tenant_id, parent_dn);

-- 4. LDAP / AD Security Group to Application Role Mappings
CREATE TABLE IF NOT EXISTS ldap_group_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(128) NOT NULL,
    provider_id VARCHAR(128) NOT NULL,
    group_dn TEXT NOT NULL,
    group_name VARCHAR(256) NOT NULL,
    target_role VARCHAR(64) NOT NULL,
    target_clearance_tags TEXT[] NOT NULL DEFAULT '{}',
    priority INTEGER NOT NULL DEFAULT 100,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_ldap_group_mapping UNIQUE (tenant_id, provider_id, group_dn, target_role)
);

CREATE INDEX IF NOT EXISTS idx_ldap_group_mappings_lookup ON ldap_group_mappings(tenant_id, provider_id, is_enabled);
CREATE INDEX IF NOT EXISTS idx_ldap_group_mappings_group ON ldap_group_mappings(tenant_id, group_dn);
