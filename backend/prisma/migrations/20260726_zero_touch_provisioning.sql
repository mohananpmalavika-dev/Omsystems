-- Zero-Touch Provisioning Schema

CREATE TABLE IF NOT EXISTS provisioning_tokens (
    token VARCHAR(100) PRIMARY KEY,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    activated_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, activated, expired, revoked
    CONSTRAINT unique_branch_provisioning UNIQUE(branch_id)
);

CREATE INDEX idx_provisioning_tokens_branch ON provisioning_tokens(branch_id);
CREATE INDEX idx_provisioning_tokens_status ON provisioning_tokens(status, expires_at);

CREATE TABLE IF NOT EXISTS provisioning_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL, -- pending, configuring, deploying, testing, active, failed
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    steps JSONB NOT NULL DEFAULT '[]',
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_provisioning_status_branch ON provisioning_status(branch_id, started_at DESC);
CREATE INDEX idx_provisioning_status_status ON provisioning_status(status);
