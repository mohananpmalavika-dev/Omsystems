-- Provisioning Jobs Schema
-- Enhanced job tracking with step-level persistence and recovery support

-- Drop old provisioning_status if exists (will be replaced by new structure)
-- Keep provisioning_tokens as it's still needed

-- Main provisioning jobs table
CREATE TABLE IF NOT EXISTS provisioning_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    organization_id UUID,
    
    status VARCHAR(50) NOT NULL DEFAULT 'queued',
    current_step VARCHAR(100),
    progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
    
    config JSONB NOT NULL DEFAULT '{}',
    context JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    error_code VARCHAR(100),
    error_message TEXT,
    
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    
    created_by UUID REFERENCES users(id)
);

-- Individual provisioning steps
CREATE TABLE IF NOT EXISTS provisioning_job_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES provisioning_jobs(id) ON DELETE CASCADE,
    
    name VARCHAR(100) NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    step_order INTEGER NOT NULL,
    
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    
    attempt INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    
    result JSONB,
    error JSONB,
    
    progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
    metadata JSONB,
    
    CONSTRAINT unique_job_step UNIQUE(job_id, name)
);

-- Indexes for efficient querying
CREATE INDEX idx_provisioning_jobs_branch ON provisioning_jobs(branch_id);
CREATE INDEX idx_provisioning_jobs_status ON provisioning_jobs(status, created_at DESC);
CREATE INDEX idx_provisioning_jobs_tenant ON provisioning_jobs(tenant_id, created_at DESC);
CREATE INDEX idx_provisioning_jobs_recovery ON provisioning_jobs(status, retry_count, created_at) 
    WHERE status NOT IN ('active', 'failed', 'blocked');

CREATE INDEX idx_provisioning_job_steps_job ON provisioning_job_steps(job_id, step_order);
CREATE INDEX idx_provisioning_job_steps_status ON provisioning_job_steps(status);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_provisioning_job_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER provisioning_jobs_updated_at
    BEFORE UPDATE ON provisioning_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_provisioning_job_updated_at();

-- Comments for documentation
COMMENT ON TABLE provisioning_jobs IS 'Persistent provisioning job tracking with recovery support';
COMMENT ON TABLE provisioning_job_steps IS 'Individual steps within a provisioning job';

COMMENT ON COLUMN provisioning_jobs.status IS 'Current job status: queued, network_*, camera_*, storage_*, recording_verification, health_check, activating, active, blocked, failed';
COMMENT ON COLUMN provisioning_jobs.context IS 'Full provisioning context with step results';
COMMENT ON COLUMN provisioning_jobs.retry_count IS 'Number of retry attempts for interrupted jobs';

COMMENT ON COLUMN provisioning_job_steps.result IS 'Structured result data from completed step';
COMMENT ON COLUMN provisioning_job_steps.error IS 'Error details if step failed';
COMMENT ON COLUMN provisioning_job_steps.attempt IS 'Current attempt number for this step';
