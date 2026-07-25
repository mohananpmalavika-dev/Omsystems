-- Bulk Configuration Schema
-- Support for bulk branch configuration management

-- Configuration templates
CREATE TABLE IF NOT EXISTS branch_config_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL, -- cameras, storage, network, general, custom
    configuration JSONB NOT NULL,
    applicable_to_types VARCHAR(50)[], -- branch types this template applies to
    
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_template_name UNIQUE(tenant_id, name)
);

CREATE INDEX idx_branch_config_templates_tenant ON branch_config_templates(tenant_id, is_active);
CREATE INDEX idx_branch_config_templates_category ON branch_config_templates(category);

-- Bulk configuration operations log
CREATE TABLE IF NOT EXISTS bulk_config_operations (
    id VARCHAR(100) PRIMARY KEY,
    tenant_id UUID NOT NULL,
    performed_by UUID NOT NULL REFERENCES users(id),
    operation_type VARCHAR(50) NOT NULL, -- update, add_cameras, update_cameras, etc
    
    target_criteria JSONB NOT NULL, -- Selection criteria used
    configuration JSONB NOT NULL, -- Configuration applied
    
    total_targeted INTEGER NOT NULL,
    success_count INTEGER NOT NULL,
    failure_count INTEGER NOT NULL,
    skipped_count INTEGER DEFAULT 0,
    
    results_summary JSONB, -- Detailed results per branch
    
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    duration_ms INTEGER
);

CREATE INDEX idx_bulk_config_operations_tenant ON bulk_config_operations(tenant_id, executed_at DESC);
CREATE INDEX idx_bulk_config_operations_user ON bulk_config_operations(performed_by, executed_at DESC);
CREATE INDEX idx_bulk_config_operations_type ON bulk_config_operations(operation_type);

-- Branch storage configuration
CREATE TABLE IF NOT EXISTS branch_storage_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    
    retention_days INTEGER DEFAULT 30,
    compression_enabled BOOLEAN DEFAULT true,
    compression_level VARCHAR(20) DEFAULT 'medium', -- low, medium, high
    
    alert_threshold_warning INTEGER DEFAULT 85,
    alert_threshold_critical INTEGER DEFAULT 95,
    
    auto_cleanup_enabled BOOLEAN DEFAULT true,
    cleanup_policy VARCHAR(50) DEFAULT 'oldest_first', -- oldest_first, low_priority_first
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_branch_storage_config UNIQUE(branch_id)
);

CREATE INDEX idx_branch_storage_config_branch ON branch_storage_config(branch_id);

-- Branch network configuration
CREATE TABLE IF NOT EXISTS branch_network_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    
    bandwidth_limit_mbps INTEGER,
    upload_limit_mbps INTEGER,
    download_limit_mbps INTEGER,
    
    vpn_enabled BOOLEAN DEFAULT true,
    vpn_endpoint VARCHAR(200),
    vpn_type VARCHAR(50) DEFAULT 'ipsec', -- ipsec, openvpn, wireguard
    
    qos_enabled BOOLEAN DEFAULT false,
    qos_settings JSONB,
    
    failover_enabled BOOLEAN DEFAULT false,
    failover_config JSONB,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_branch_network_config UNIQUE(branch_id)
);

CREATE INDEX idx_branch_network_config_branch ON branch_network_config(branch_id);

-- Add settings column to branches if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='branches' AND column_name='settings') THEN
        ALTER TABLE branches ADD COLUMN settings JSONB DEFAULT '{}';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_branches_settings ON branches USING GIN(settings);
