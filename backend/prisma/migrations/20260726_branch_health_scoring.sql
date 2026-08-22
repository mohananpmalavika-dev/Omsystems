-- Branch Health Scoring Schema
-- Comprehensive health scoring system for multi-branch operations

-- Branch Health Scores (historical tracking)
CREATE TABLE IF NOT EXISTS branch_health_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    
    -- Overall health
    overall_score INTEGER NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
    overall_status VARCHAR(20) NOT NULL CHECK (overall_status IN ('healthy', 'warning', 'critical', 'unknown')),
    
    -- Component scores
    camera_score INTEGER CHECK (camera_score >= 0 AND camera_score <= 100),
    camera_status VARCHAR(20) CHECK (camera_status IN ('healthy', 'warning', 'critical', 'unknown')),
    
    recording_score INTEGER CHECK (recording_score >= 0 AND recording_score <= 100),
    recording_status VARCHAR(20) CHECK (recording_status IN ('healthy', 'warning', 'critical', 'unknown')),
    
    storage_score INTEGER CHECK (storage_score >= 0 AND storage_score <= 100),
    storage_status VARCHAR(20) CHECK (storage_status IN ('healthy', 'warning', 'critical', 'unknown')),
    
    network_score INTEGER CHECK (network_score >= 0 AND network_score <= 100),
    network_status VARCHAR(20) CHECK (network_status IN ('healthy', 'warning', 'critical', 'unknown')),
    
    power_score INTEGER CHECK (power_score >= 0 AND power_score <= 100),
    power_status VARCHAR(20) CHECK (power_status IN ('healthy', 'warning', 'critical', 'unknown')),
    
    edge_agent_score INTEGER CHECK (edge_agent_score >= 0 AND edge_agent_score <= 100),
    edge_agent_status VARCHAR(20) CHECK (edge_agent_status IN ('healthy', 'warning', 'critical', 'unknown')),
    
    -- Detailed component data
    component_details_json JSONB,
    
    -- Timestamp
    calculated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    CONSTRAINT branch_health_scores_unique_calculation UNIQUE(branch_id, calculated_at)
);

CREATE INDEX idx_branch_health_scores_branch ON branch_health_scores(branch_id, calculated_at DESC);
CREATE INDEX idx_branch_health_scores_status ON branch_health_scores(overall_status, calculated_at DESC);
CREATE INDEX idx_branch_health_scores_score ON branch_health_scores(overall_score DESC);
CREATE INDEX idx_branch_health_scores_tenant ON branch_health_scores(tenant_id, calculated_at DESC);

-- Add health columns to branches table if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='branches' AND column_name='health_status') THEN
        ALTER TABLE branches ADD COLUMN health_status VARCHAR(20) DEFAULT 'unknown';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='branches' AND column_name='health_score') THEN
        ALTER TABLE branches ADD COLUMN health_score INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='branches' AND column_name='last_health_check') THEN
        ALTER TABLE branches ADD COLUMN last_health_check TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_branches_health_status ON branches(health_status);
CREATE INDEX IF NOT EXISTS idx_branches_health_score ON branches(health_score DESC);
