-- Migration 141: Attribute-Based Access Control (ABAC - security.abac)
-- Contextual access rules based on time of day, network subnet, and user clearance tags.
-- Zero mock data — fully durable persistence for policies, user clearance profiles, and evaluation audit trails.

-- 1. ABAC Policies Table
CREATE TABLE IF NOT EXISTS abac_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    effect VARCHAR(16) NOT NULL DEFAULT 'PERMIT', -- 'PERMIT' or 'DENY'
    priority INTEGER NOT NULL DEFAULT 100, -- Higher number evaluates first
    actions TEXT[] NOT NULL DEFAULT '{"*"}',
    resource_types TEXT[] NOT NULL DEFAULT '{"*"}',
    resource_classifications TEXT[] NOT NULL DEFAULT '{"*"}',
    branch_scope TEXT[] NOT NULL DEFAULT '{"ALL"}',
    roles TEXT[] NOT NULL DEFAULT '{"*"}',
    time_rule JSONB, -- { startTime: "09:00", endTime: "18:00", timezone: "UTC", daysOfWeek: [1,2,3,4,5], allowOvernight: false }
    network_rule JSONB, -- { allowedSubnets: ["10.0.0.0/8"], deniedSubnets: ["10.50.0.0/16"], requireVpnOrIntranet: false }
    clearance_rule JSONB, -- { minClearanceLevel: "CONFIDENTIAL", requiredClearanceTags: ["VAULT_ACCESS"], matchMode: "ALL", prohibitedClearanceTags: [] }
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_abac_policies_tenant 
    ON abac_policies (tenant_id);

CREATE INDEX IF NOT EXISTS idx_abac_policies_active_priority 
    ON abac_policies (is_active, priority DESC);

-- 2. User Clearance Profiles Table
CREATE TABLE IF NOT EXISTS abac_user_clearances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(128) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    clearance_level VARCHAR(32) NOT NULL DEFAULT 'UNCLASSIFIED', -- 'UNCLASSIFIED', 'RESTRICTED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'
    clearance_tags TEXT[] NOT NULL DEFAULT '{}',
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at TIMESTAMPTZ,
    revocation_reason TEXT,
    issued_by VARCHAR(128) NOT NULL DEFAULT 'security-admin',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_abac_user_clearance UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_abac_user_clearance_lookup 
    ON abac_user_clearances (tenant_id, user_id);

CREATE INDEX IF NOT EXISTS idx_abac_user_clearance_level 
    ON abac_user_clearances (clearance_level);

CREATE INDEX IF NOT EXISTS idx_abac_user_clearance_tags 
    ON abac_user_clearances USING GIN (clearance_tags);

-- 3. ABAC Access Evaluation Audit Log Table
CREATE TABLE IF NOT EXISTS abac_evaluation_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(128) NOT NULL,
    action VARCHAR(64) NOT NULL,
    resource_type VARCHAR(64) NOT NULL DEFAULT 'CAMERA',
    resource_id VARCHAR(128),
    resource_branch_id VARCHAR(64) NOT NULL,
    resource_classification VARCHAR(64),
    source_ip VARCHAR(64) NOT NULL,
    request_time TIMESTAMPTZ NOT NULL,
    decision VARCHAR(16) NOT NULL, -- 'PERMIT' or 'DENY'
    reason TEXT NOT NULL,
    applied_policies TEXT[] NOT NULL DEFAULT '{}',
    policy_hash VARCHAR(64) NOT NULL,
    evaluation_details JSONB NOT NULL DEFAULT '{}'::jsonb,
    latency_ms NUMERIC(8, 2) NOT NULL DEFAULT 0.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_abac_audit_tenant_time 
    ON abac_evaluation_audit_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_abac_audit_user_time 
    ON abac_evaluation_audit_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_abac_audit_decision 
    ON abac_evaluation_audit_logs (decision);
