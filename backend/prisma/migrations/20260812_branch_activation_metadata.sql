-- Branch Activation Metadata Schema
-- Tracks detailed activation information and configuration

CREATE TABLE IF NOT EXISTS branch_activation_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    provisioning_job_id UUID REFERENCES provisioning_jobs(id),
    
    activated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    health_score INTEGER CHECK (health_score >= 0 AND health_score <= 100),
    
    network_config JSONB,
    camera_count INTEGER DEFAULT 0,
    storage_capacity_bytes BIGINT,
    retention_days INTEGER,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_branch_activation UNIQUE(branch_id, activated_at)
);

CREATE INDEX idx_branch_activation_metadata_branch ON branch_activation_metadata(branch_id);
CREATE INDEX idx_branch_activation_metadata_job ON branch_activation_metadata(provisioning_job_id);

-- Add activation tracking to branches table if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'branches' AND column_name = 'activated_at'
    ) THEN
        ALTER TABLE branches ADD COLUMN activated_at TIMESTAMP WITH TIME ZONE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'branches' AND column_name = 'health_score'
    ) THEN
        ALTER TABLE branches ADD COLUMN health_score INTEGER CHECK (health_score >= 0 AND health_score <= 100);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'branches' AND column_name = 'deactivated_at'
    ) THEN
        ALTER TABLE branches ADD COLUMN deactivated_at TIMESTAMP WITH TIME ZONE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'branches' AND column_name = 'deactivation_reason'
    ) THEN
        ALTER TABLE branches ADD COLUMN deactivation_reason TEXT;
    END IF;
END $$;

-- Recording schedules table
CREATE TABLE IF NOT EXISTS recording_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    
    schedule_type VARCHAR(50) NOT NULL DEFAULT 'continuous', -- continuous, scheduled, motion
    enabled BOOLEAN DEFAULT true,
    
    schedule_config JSONB, -- for scheduled recordings
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_camera_schedule UNIQUE(camera_id)
);

CREATE INDEX idx_recording_schedules_camera ON recording_schedules(camera_id);
CREATE INDEX idx_recording_schedules_branch ON recording_schedules(branch_id, enabled);

-- Camera analytics configuration
CREATE TABLE IF NOT EXISTS camera_analytics_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    
    rules_enabled BOOLEAN DEFAULT true,
    motion_detection BOOLEAN DEFAULT true,
    object_detection BOOLEAN DEFAULT false,
    face_detection BOOLEAN DEFAULT false,
    license_plate_recognition BOOLEAN DEFAULT false,
    
    config JSONB, -- advanced analytics configuration
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_camera_analytics UNIQUE(camera_id)
);

CREATE INDEX idx_camera_analytics_config_camera ON camera_analytics_config(camera_id);
CREATE INDEX idx_camera_analytics_config_branch ON camera_analytics_config(branch_id);

-- Branch health checks schedule
CREATE TABLE IF NOT EXISTS branch_health_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    
    check_type VARCHAR(50) NOT NULL, -- network, cameras, storage, recording
    schedule_cron VARCHAR(100), -- cron expression for scheduling
    enabled BOOLEAN DEFAULT true,
    
    last_check_at TIMESTAMP WITH TIME ZONE,
    last_status VARCHAR(20), -- pass, fail, degraded
    last_score INTEGER,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_branch_health_check UNIQUE(branch_id, check_type)
);

CREATE INDEX idx_branch_health_checks_branch ON branch_health_checks(branch_id, enabled);
CREATE INDEX idx_branch_health_checks_schedule ON branch_health_checks(enabled, last_check_at);

-- System events table for activation events
CREATE TABLE IF NOT EXISTS system_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    tenant_id UUID,
    
    data JSONB,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_system_events_entity ON system_events(entity_type, entity_id, created_at DESC);
CREATE INDEX idx_system_events_type ON system_events(event_type, created_at DESC);
CREATE INDEX idx_system_events_tenant ON system_events(tenant_id, created_at DESC);

-- Comments
COMMENT ON TABLE branch_activation_metadata IS 'Detailed activation information for branches';
COMMENT ON TABLE recording_schedules IS 'Recording schedules for cameras';
COMMENT ON TABLE camera_analytics_config IS 'Analytics configuration per camera';
COMMENT ON TABLE branch_health_checks IS 'Scheduled health checks for branches';
COMMENT ON TABLE system_events IS 'System-wide events log';
