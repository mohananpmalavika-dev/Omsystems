-- ============================================
-- Enterprise Integration Hub Schema
-- ============================================
-- Comprehensive integration framework for connecting with
-- external systems: IAM, ITSM, messaging, SIEM, industrial protocols

-- ===========================================
-- Table: integration_configs
-- ===========================================
CREATE TABLE IF NOT EXISTS integration_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Basic configuration
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL, -- azure_ad, ldap, servicenow, slack, splunk, etc.
  category VARCHAR(50) NOT NULL, -- identity, itsm, messaging, siem, monitoring, industrial
  status VARCHAR(20) NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'error', 'testing')),
  enabled BOOLEAN NOT NULL DEFAULT false,
  
  -- Configuration and credentials (encrypted)
  config JSONB NOT NULL DEFAULT '{}',
  credentials JSONB NOT NULL DEFAULT '{}',
  
  -- Event subscription
  subscribed_events JSONB NOT NULL DEFAULT '[]', -- Array of event types
  
  -- Retry configuration
  retry_config JSONB,
  
  -- Rate limiting
  rate_limit_config JSONB,
  
  -- Timestamps and status
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_success_at TIMESTAMP WITH TIME ZONE,
  last_error_at TIMESTAMP WITH TIME ZONE,
  last_error TEXT,
  
  -- Constraints
  UNIQUE(tenant_id, name)
);

CREATE INDEX idx_integration_configs_tenant ON integration_configs(tenant_id);
CREATE INDEX idx_integration_configs_type ON integration_configs(type, tenant_id);
CREATE INDEX idx_integration_configs_category ON integration_configs(category, tenant_id);
CREATE INDEX idx_integration_configs_status ON integration_configs(status) WHERE enabled = true;
CREATE INDEX idx_integration_configs_events ON integration_configs USING gin(subscribed_events);

COMMENT ON TABLE integration_configs IS 'Integration connector configurations for external systems';
COMMENT ON COLUMN integration_configs.config IS 'Integration-specific configuration (non-sensitive)';
COMMENT ON COLUMN integration_configs.credentials IS 'Encrypted credentials and API keys';
COMMENT ON COLUMN integration_configs.subscribed_events IS 'Array of event types this integration subscribes to';

-- ===========================================
-- Table: integration_events
-- ===========================================
CREATE TABLE IF NOT EXISTS integration_events (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Event classification
  event_type VARCHAR(100) NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Event data
  payload JSONB NOT NULL,
  
  -- Context
  user_id UUID REFERENCES users(id),
  camera_id UUID REFERENCES cameras(id),
  branch_id UUID REFERENCES resource_nodes(id),
  alert_id UUID,
  incident_id UUID,
  
  -- Source
  source_system VARCHAR(100) NOT NULL,
  source_ip INET,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_integration_events_tenant ON integration_events(tenant_id, timestamp DESC);
CREATE INDEX idx_integration_events_type ON integration_events(event_type, tenant_id);
CREATE INDEX idx_integration_events_timestamp ON integration_events(timestamp DESC);
CREATE INDEX idx_integration_events_user ON integration_events(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_integration_events_camera ON integration_events(camera_id) WHERE camera_id IS NOT NULL;
CREATE INDEX idx_integration_events_branch ON integration_events(branch_id) WHERE branch_id IS NOT NULL;

-- Partition by month for better performance
-- CREATE TABLE integration_events_YYYY_MM PARTITION OF integration_events
-- FOR VALUES FROM ('YYYY-MM-01') TO ('YYYY-MM+1-01');

COMMENT ON TABLE integration_events IS 'Centralized event log for all integration triggers';

-- ===========================================
-- Table: integration_responses
-- ===========================================
CREATE TABLE IF NOT EXISTS integration_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES integration_configs(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES integration_events(id) ON DELETE CASCADE,
  
  -- Response details
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  success BOOLEAN NOT NULL,
  external_id VARCHAR(255), -- ID in external system (ticket number, message ID)
  external_url TEXT, -- Deep link to external resource
  response JSONB,
  error TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_integration_responses_integration ON integration_responses(integration_id, timestamp DESC);
CREATE INDEX idx_integration_responses_event ON integration_responses(event_id);
CREATE INDEX idx_integration_responses_success ON integration_responses(success, integration_id);
CREATE INDEX idx_integration_responses_external ON integration_responses(external_id) WHERE external_id IS NOT NULL;

COMMENT ON TABLE integration_responses IS 'Response log from external integrations';
COMMENT ON COLUMN integration_responses.external_id IS 'Reference ID in external system (ServiceNow incident number, Jira issue key, etc.)';

-- ===========================================
-- Table: webhook_deliveries
-- ===========================================
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES integration_configs(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES integration_events(id) ON DELETE CASCADE,
  
  -- Webhook details
  url TEXT NOT NULL,
  method VARCHAR(10) NOT NULL DEFAULT 'POST',
  headers JSONB NOT NULL DEFAULT '{}',
  payload JSONB NOT NULL,
  
  -- Delivery status
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'retrying')),
  http_status INTEGER,
  response TEXT,
  error TEXT,
  attempts INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sent_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_webhook_deliveries_integration ON webhook_deliveries(integration_id, created_at DESC);
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status, created_at) WHERE status IN ('pending', 'retrying');
CREATE INDEX idx_webhook_deliveries_event ON webhook_deliveries(event_id);

COMMENT ON TABLE webhook_deliveries IS 'Webhook delivery queue and history';

-- ===========================================
-- Table: integration_audit_log
-- ===========================================
CREATE TABLE IF NOT EXISTS integration_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES integration_configs(id) ON DELETE SET NULL,
  
  -- Audit details
  action VARCHAR(50) NOT NULL, -- create, update, delete, enable, disable, test
  actor_user_id UUID REFERENCES users(id),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Changes
  old_config JSONB,
  new_config JSONB,
  
  -- Context
  source_ip INET,
  user_agent TEXT
);

CREATE INDEX idx_integration_audit_tenant ON integration_audit_log(tenant_id, timestamp DESC);
CREATE INDEX idx_integration_audit_integration ON integration_audit_log(integration_id, timestamp DESC) WHERE integration_id IS NOT NULL;
CREATE INDEX idx_integration_audit_actor ON integration_audit_log(actor_user_id, timestamp DESC) WHERE actor_user_id IS NOT NULL;

COMMENT ON TABLE integration_audit_log IS 'Audit trail for integration configuration changes';

-- ===========================================
-- View: vw_integration_health
-- ===========================================
CREATE OR REPLACE VIEW vw_integration_health AS
SELECT 
  ic.id,
  ic.tenant_id,
  ic.name,
  ic.type,
  ic.category,
  ic.status,
  ic.enabled,
  ic.last_success_at,
  ic.last_error_at,
  ic.last_error,
  
  -- Event statistics (last 24 hours)
  COUNT(DISTINCT ir.id) FILTER (WHERE ir.timestamp >= NOW() - INTERVAL '24 hours') as events_24h,
  COUNT(DISTINCT ir.id) FILTER (WHERE ir.timestamp >= NOW() - INTERVAL '24 hours' AND ir.success = true) as successful_24h,
  COUNT(DISTINCT ir.id) FILTER (WHERE ir.timestamp >= NOW() - INTERVAL '24 hours' AND ir.success = false) as failed_24h,
  
  -- Success rate
  CASE 
    WHEN COUNT(DISTINCT ir.id) FILTER (WHERE ir.timestamp >= NOW() - INTERVAL '24 hours') > 0
    THEN ROUND(100.0 * COUNT(DISTINCT ir.id) FILTER (WHERE ir.timestamp >= NOW() - INTERVAL '24 hours' AND ir.success = true) / 
         COUNT(DISTINCT ir.id) FILTER (WHERE ir.timestamp >= NOW() - INTERVAL '24 hours'), 2)
    ELSE NULL
  END as success_rate_24h,
  
  -- Availability status
  CASE
    WHEN ic.enabled = false THEN 'disabled'
    WHEN ic.last_error_at > ic.last_success_at THEN 'error'
    WHEN ic.last_success_at > NOW() - INTERVAL '1 hour' THEN 'healthy'
    WHEN ic.last_success_at IS NULL THEN 'never_connected'
    ELSE 'degraded'
  END as health_status

FROM integration_configs ic
LEFT JOIN integration_responses ir ON ir.integration_id = ic.id
GROUP BY ic.id;

COMMENT ON VIEW vw_integration_health IS 'Real-time health metrics for all integrations';

-- ===========================================
-- View: vw_integration_marketplace
-- ===========================================
CREATE OR REPLACE VIEW vw_integration_marketplace AS
SELECT 
  type,
  category,
  COUNT(*) as instances,
  COUNT(*) FILTER (WHERE enabled = true) as enabled_instances,
  COUNT(DISTINCT tenant_id) as tenants_using,
  MIN(created_at) as first_deployed,
  MAX(updated_at) as last_updated
FROM integration_configs
GROUP BY type, category
ORDER BY tenants_using DESC, instances DESC;

COMMENT ON VIEW vw_integration_marketplace IS 'Integration usage statistics across all tenants';

-- ===========================================
-- Function: record_integration_audit
-- ===========================================
CREATE OR REPLACE FUNCTION record_integration_audit()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO integration_audit_log (
    tenant_id,
    integration_id,
    action,
    old_config,
    new_config
  ) VALUES (
    COALESCE(NEW.tenant_id, OLD.tenant_id),
    COALESCE(NEW.id, OLD.id),
    CASE
      WHEN TG_OP = 'INSERT' THEN 'create'
      WHEN TG_OP = 'UPDATE' THEN 'update'
      WHEN TG_OP = 'DELETE' THEN 'delete'
    END,
    CASE WHEN TG_OP != 'INSERT' THEN row_to_json(OLD) END,
    CASE WHEN TG_OP != 'DELETE' THEN row_to_json(NEW) END
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger for audit logging
DROP TRIGGER IF EXISTS integration_configs_audit_trigger ON integration_configs;
CREATE TRIGGER integration_configs_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON integration_configs
FOR EACH ROW EXECUTE FUNCTION record_integration_audit();

-- ===========================================
-- Function: cleanup_old_integration_events
-- ===========================================
CREATE OR REPLACE FUNCTION cleanup_old_integration_events(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM integration_events
  WHERE timestamp < NOW() - (retention_days || ' days')::INTERVAL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_integration_events IS 'Delete integration events older than specified retention period';

-- ===========================================
-- Grants
-- ===========================================
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON integration_configs TO app_user;
    GRANT SELECT, INSERT ON integration_events TO app_user;
    GRANT SELECT, INSERT ON integration_responses TO app_user;
    GRANT SELECT, INSERT, UPDATE ON webhook_deliveries TO app_user;
    GRANT SELECT ON integration_audit_log TO app_user;
    GRANT SELECT ON vw_integration_health TO app_user;
    GRANT SELECT ON vw_integration_marketplace TO app_user;
    GRANT EXECUTE ON FUNCTION cleanup_old_integration_events TO app_user;
  END IF;
END $$;

-- ===========================================
-- Sample Data (Optional - for testing)
-- ===========================================
/*
INSERT INTO integration_configs (
  tenant_id,
  name,
  type,
  category,
  status,
  enabled,
  config,
  subscribed_events
) VALUES (
  '00000000-0000-0000-0000-000000000001', -- Replace with actual tenant_id
  'Production Azure AD',
  'azure_ad',
  'identity',
  'active',
  true,
  '{"tenantId": "your-tenant-id", "clientId": "your-client-id"}'::jsonb,
  '["user.login", "user.created", "user.updated"]'::jsonb
);
*/
