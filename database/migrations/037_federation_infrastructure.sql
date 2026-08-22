-- Federation Infrastructure for Multi-Region Control Centers
-- Enables enterprise-grade federated VMS with global monitoring and disaster recovery

-- Federation server roles
CREATE TYPE federation_server_role AS ENUM (
  'global_command_center',  -- Top-level global monitoring
  'regional_control_center', -- Regional server
  'backup_server',          -- DR backup
  'edge_server'             -- Edge/remote location server
);

-- Federation server status
CREATE TYPE federation_server_status AS ENUM (
  'online',
  'degraded',
  'offline',
  'maintenance',
  'failover_active'
);

-- Sync status
CREATE TYPE sync_status AS ENUM (
  'synced',
  'syncing',
  'pending',
  'failed',
  'conflict'
);

-- Federated Servers Registry
-- Central registry of all servers in the federation
CREATE TABLE federated_servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text NOT NULL UNIQUE, -- Globally unique server identifier
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  
  -- Server identification
  name text NOT NULL,
  description text,
  role federation_server_role NOT NULL,
  
  -- Geographic and organizational context
  country_code text NOT NULL CHECK (length(country_code) = 2), -- ISO 3166-1 alpha-2
  region text NOT NULL,
  area text,
  timezone text NOT NULL DEFAULT 'UTC',
  
  -- Connection details
  base_url text NOT NULL, -- https://region-south.example.com
  api_url text NOT NULL,
  websocket_url text,
  
  -- Authentication
  shared_secret_hash text NOT NULL, -- For server-to-server auth
  public_key text, -- For certificate-based auth
  
  -- Server status and health
  status federation_server_status NOT NULL DEFAULT 'offline',
  last_heartbeat timestamptz,
  last_seen_at timestamptz,
  health_score numeric(5,2) DEFAULT 0 CHECK (health_score BETWEEN 0 AND 100),
  
  -- Capacity tracking
  total_cameras integer NOT NULL DEFAULT 0,
  online_cameras integer NOT NULL DEFAULT 0,
  total_branches integer NOT NULL DEFAULT 0,
  storage_capacity_gb bigint,
  storage_used_gb bigint,
  
  -- Performance metrics
  avg_response_time_ms integer,
  requests_per_minute integer,
  bandwidth_mbps integer,
  
  -- Disaster Recovery
  primary_server_id uuid REFERENCES federated_servers(id), -- NULL if primary
  backup_server_id uuid REFERENCES federated_servers(id),
  failover_priority integer DEFAULT 100 CHECK (failover_priority BETWEEN 1 AND 1000),
  auto_failover_enabled boolean NOT NULL DEFAULT true,
  
  -- Configuration
  sync_enabled boolean NOT NULL DEFAULT true,
  sync_interval_seconds integer NOT NULL DEFAULT 60,
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id),
  
  -- Constraints
  CHECK (role != 'backup_server' OR primary_server_id IS NOT NULL)
);

CREATE INDEX federated_servers_tenant_idx ON federated_servers (tenant_id);
CREATE INDEX federated_servers_role_idx ON federated_servers (role, status);
CREATE INDEX federated_servers_status_idx ON federated_servers (status, last_heartbeat);
CREATE INDEX federated_servers_region_idx ON federated_servers (tenant_id, region, country_code);
CREATE INDEX federated_servers_primary_idx ON federated_servers (primary_server_id) WHERE primary_server_id IS NOT NULL;

-- Regional Metadata Mapping
-- Maps organizational nodes to regional servers
CREATE TABLE regional_server_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  server_id uuid NOT NULL REFERENCES federated_servers(id) ON DELETE CASCADE,
  scope_node_id uuid NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE (scope_node_id, server_id)
);

CREATE INDEX regional_server_mappings_server_idx ON regional_server_mappings (server_id);
CREATE INDEX regional_server_mappings_node_idx ON regional_server_mappings (scope_node_id);

-- Global User Identity
-- Unified user identity across all federated servers
CREATE TABLE global_user_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  global_user_id uuid NOT NULL, -- Unique across all servers
  username text NOT NULL,
  email text NOT NULL,
  
  -- Local user mappings
  local_user_id uuid REFERENCES users(id), -- NULL if not provisioned locally
  
  -- Server affinity (preferred server for this user)
  preferred_server_id uuid REFERENCES federated_servers(id),
  
  -- Global roles and permissions
  global_role user_role NOT NULL DEFAULT 'viewer',
  can_access_all_regions boolean NOT NULL DEFAULT false,
  accessible_regions text[], -- Array of region identifiers
  
  -- Federation metadata
  last_login_server_id uuid REFERENCES federated_servers(id),
  last_login_at timestamptz,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE (tenant_id, global_user_id),
  UNIQUE (tenant_id, username),
  UNIQUE (tenant_id, email)
);

CREATE INDEX global_user_identities_tenant_idx ON global_user_identities (tenant_id);
CREATE INDEX global_user_identities_global_id_idx ON global_user_identities (global_user_id);
CREATE INDEX global_user_identities_local_idx ON global_user_identities (local_user_id) WHERE local_user_id IS NOT NULL;

-- Global Sessions (federated authentication tokens)
CREATE TABLE global_user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  global_user_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  
  -- Server affinity
  originating_server_id uuid NOT NULL REFERENCES federated_servers(id),
  valid_on_servers uuid[], -- Array of server IDs where token is valid
  
  -- Session metadata
  ip_address inet,
  user_agent text,
  
  -- Expiry
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  
  -- Revocation
  revoked_at timestamptz,
  revoked_reason text,
  
  CHECK (expires_at > issued_at)
);

CREATE INDEX global_user_sessions_tenant_idx ON global_user_sessions (tenant_id);
CREATE INDEX global_user_sessions_user_idx ON global_user_sessions (global_user_id);
CREATE INDEX global_user_sessions_expiry_idx ON global_user_sessions (expires_at) WHERE revoked_at IS NULL;
CREATE INDEX global_user_sessions_token_idx ON global_user_sessions (token_hash);

-- Federation Sync Jobs
-- Tracks metadata synchronization between servers
CREATE TABLE federation_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  
  -- Source and destination
  source_server_id uuid NOT NULL REFERENCES federated_servers(id),
  destination_server_id uuid NOT NULL REFERENCES federated_servers(id),
  
  -- Sync details
  sync_type text NOT NULL CHECK (sync_type IN ('full', 'incremental', 'realtime')),
  entity_type text NOT NULL, -- 'cameras', 'alerts', 'incidents', 'users', 'recordings', 'analytics'
  
  -- Status
  status sync_status NOT NULL DEFAULT 'pending',
  started_at timestamptz,
  completed_at timestamptz,
  
  -- Progress tracking
  total_records integer,
  synced_records integer DEFAULT 0,
  failed_records integer DEFAULT 0,
  
  -- Performance
  duration_seconds integer,
  bandwidth_mbps numeric(10,2),
  
  -- Error handling
  error_message text,
  retry_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  CHECK (source_server_id != destination_server_id)
);

CREATE INDEX federation_sync_jobs_status_idx ON federation_sync_jobs (status, next_retry_at);
CREATE INDEX federation_sync_jobs_server_idx ON federation_sync_jobs (source_server_id, destination_server_id);
CREATE INDEX federation_sync_jobs_entity_idx ON federation_sync_jobs (entity_type, status);

-- Server Health History
CREATE TABLE federation_server_health_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  server_id uuid NOT NULL REFERENCES federated_servers(id) ON DELETE CASCADE,
  
  -- Health metrics
  status federation_server_status NOT NULL,
  health_score numeric(5,2) NOT NULL,
  
  -- Performance metrics
  response_time_ms integer,
  cpu_usage numeric(5,2),
  memory_usage numeric(5,2),
  disk_usage numeric(5,2),
  
  -- Capacity
  active_connections integer,
  requests_per_minute integer,
  bandwidth_mbps integer,
  
  -- Camera stats
  total_cameras integer,
  online_cameras integer,
  offline_cameras integer,
  
  -- Errors
  error_count integer DEFAULT 0,
  warning_count integer DEFAULT 0,
  
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX federation_server_health_history_server_time_idx 
  ON federation_server_health_history (server_id, recorded_at DESC);
CREATE INDEX federation_server_health_history_time_idx 
  ON federation_server_health_history (recorded_at DESC);

-- Cross-Server Search Cache
-- Caches search results from remote servers for performance
CREATE TABLE cross_server_search_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  
  -- Search query
  query_hash text NOT NULL,
  query_type text NOT NULL, -- 'vehicle', 'face', 'object', 'incident'
  query_params jsonb NOT NULL,
  
  -- Server results
  server_id uuid NOT NULL REFERENCES federated_servers(id) ON DELETE CASCADE,
  result_count integer NOT NULL DEFAULT 0,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  
  -- Cache metadata
  cached_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  hit_count integer NOT NULL DEFAULT 0,
  last_accessed_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE (query_hash, server_id)
);

CREATE INDEX cross_server_search_cache_query_idx ON cross_server_search_cache (query_hash, expires_at);
CREATE INDEX cross_server_search_cache_expiry_idx ON cross_server_search_cache (expires_at);
CREATE INDEX cross_server_search_cache_server_idx ON cross_server_search_cache (server_id);

-- Global Alert Correlation
-- Correlates alerts across multiple regional servers
CREATE TABLE global_alert_correlations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  correlation_id text NOT NULL UNIQUE,
  
  -- Correlation type
  correlation_type text NOT NULL, -- 'temporal', 'spatial', 'entity', 'pattern'
  confidence_score numeric(5,2) NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  
  -- Time window
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  
  -- Geographic scope
  regions text[],
  server_ids uuid[],
  
  -- Alert details
  alert_count integer NOT NULL DEFAULT 0,
  severity text NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
  
  -- Entity tracking (e.g., vehicle plate, face ID)
  tracked_entity_type text,
  tracked_entity_id text,
  
  -- Pattern detection
  pattern_name text,
  pattern_confidence numeric(5,2),
  
  -- Investigation
  investigated boolean NOT NULL DEFAULT false,
  investigation_notes text,
  incident_created boolean NOT NULL DEFAULT false,
  incident_id uuid,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CHECK (ended_at >= started_at)
);

CREATE INDEX global_alert_correlations_tenant_idx ON global_alert_correlations (tenant_id);
CREATE INDEX global_alert_correlations_time_idx ON global_alert_correlations (started_at, ended_at);
CREATE INDEX global_alert_correlations_severity_idx ON global_alert_correlations (severity, investigated);
CREATE INDEX global_alert_correlations_entity_idx ON global_alert_correlations (tracked_entity_type, tracked_entity_id);

-- Correlated Alert Members
CREATE TABLE global_alert_correlation_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id uuid NOT NULL REFERENCES global_alert_correlations(id) ON DELETE CASCADE,
  
  -- Alert reference
  server_id uuid NOT NULL REFERENCES federated_servers(id),
  local_alert_id uuid NOT NULL,
  
  -- Alert details
  alert_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  branch_id uuid,
  camera_id uuid,
  
  -- Entity data
  entity_data jsonb,
  
  added_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE (correlation_id, server_id, local_alert_id)
);

CREATE INDEX global_alert_correlation_members_correlation_idx 
  ON global_alert_correlation_members (correlation_id);
CREATE INDEX global_alert_correlation_members_server_idx 
  ON global_alert_correlation_members (server_id, local_alert_id);

-- Failover Events
CREATE TABLE federation_failover_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  
  -- Servers involved
  failed_server_id uuid NOT NULL REFERENCES federated_servers(id),
  active_server_id uuid NOT NULL REFERENCES federated_servers(id),
  
  -- Event details
  event_type text NOT NULL CHECK (event_type IN ('automatic', 'manual', 'planned')),
  reason text NOT NULL,
  
  -- Timeline
  detected_at timestamptz NOT NULL,
  initiated_at timestamptz NOT NULL,
  completed_at timestamptz,
  restored_at timestamptz, -- When original server comes back
  
  -- Impact
  affected_branches integer,
  affected_cameras integer,
  affected_users integer,
  downtime_seconds integer,
  
  -- Success
  status text NOT NULL CHECK (status IN ('in_progress', 'completed', 'failed', 'rolled_back')),
  success boolean,
  error_message text,
  
  -- Audit
  triggered_by uuid REFERENCES users(id),
  metadata jsonb DEFAULT '{}'::jsonb,
  
  CHECK (initiated_at >= detected_at)
);

CREATE INDEX federation_failover_events_tenant_idx ON federation_failover_events (tenant_id);
CREATE INDEX federation_failover_events_failed_server_idx ON federation_failover_events (failed_server_id);
CREATE INDEX federation_failover_events_time_idx ON federation_failover_events (detected_at DESC);

-- Replication Queue
-- Tracks data that needs to be replicated to other servers
CREATE TABLE federation_replication_queue (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  
  -- Source
  source_server_id uuid NOT NULL REFERENCES federated_servers(id),
  
  -- Destination
  destination_server_id uuid NOT NULL REFERENCES federated_servers(id),
  
  -- Payload
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
  payload jsonb NOT NULL,
  
  -- Status
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  priority integer NOT NULL DEFAULT 100 CHECK (priority BETWEEN 1 AND 1000),
  
  -- Retry logic
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 3,
  next_retry_at timestamptz,
  
  -- Timing
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  
  -- Error handling
  error_message text,
  
  CHECK (source_server_id != destination_server_id)
);

CREATE INDEX federation_replication_queue_status_idx 
  ON federation_replication_queue (status, priority, next_retry_at)
  WHERE status IN ('pending', 'failed');
CREATE INDEX federation_replication_queue_dest_idx 
  ON federation_replication_queue (destination_server_id, status);
CREATE INDEX federation_replication_queue_entity_idx 
  ON federation_replication_queue (entity_type, entity_id);

-- Federation Audit Trail
-- Unified audit log across all servers
CREATE TABLE federation_audit_trail (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  
  -- Source server
  server_id uuid NOT NULL REFERENCES federated_servers(id),
  
  -- Actor
  global_user_id uuid,
  local_user_id uuid REFERENCES users(id),
  actor_name text NOT NULL,
  
  -- Action
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  
  -- Result
  outcome text NOT NULL CHECK (outcome IN ('success', 'failure', 'partial')),
  
  -- Context
  source_ip inet,
  user_agent text,
  
  -- Federation context
  cross_server_operation boolean NOT NULL DEFAULT false,
  affected_servers uuid[],
  
  -- Details
  details jsonb DEFAULT '{}'::jsonb,
  
  -- Timing
  occurred_at timestamptz NOT NULL DEFAULT now(),
  
  -- Chain of custody
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid()
);

CREATE INDEX federation_audit_trail_tenant_time_idx 
  ON federation_audit_trail (tenant_id, occurred_at DESC);
CREATE INDEX federation_audit_trail_server_idx 
  ON federation_audit_trail (server_id, occurred_at DESC);
CREATE INDEX federation_audit_trail_user_idx 
  ON federation_audit_trail (global_user_id, occurred_at DESC);
CREATE INDEX federation_audit_trail_action_idx 
  ON federation_audit_trail (action, resource_type);
CREATE INDEX federation_audit_trail_correlation_idx 
  ON federation_audit_trail (correlation_id);

-- Federation License Tracking
CREATE TABLE federation_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  
  -- License details
  license_key text NOT NULL UNIQUE,
  license_type text NOT NULL, -- 'enterprise', 'regional', 'branch'
  
  -- Capacity
  max_servers integer NOT NULL,
  max_cameras integer NOT NULL,
  max_users integer,
  
  -- Features
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  
  -- Validity
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  
  -- Current usage
  active_servers integer NOT NULL DEFAULT 0,
  active_cameras integer NOT NULL DEFAULT 0,
  active_users integer NOT NULL DEFAULT 0,
  
  -- Metadata
  issued_to text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  CHECK (expires_at > issued_at)
);

CREATE INDEX federation_licenses_tenant_idx ON federation_licenses (tenant_id);
CREATE INDEX federation_licenses_expiry_idx ON federation_licenses (expires_at, is_active);

-- Server License Allocations
CREATE TABLE federation_server_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid NOT NULL REFERENCES federation_licenses(id) ON DELETE CASCADE,
  server_id uuid NOT NULL REFERENCES federated_servers(id) ON DELETE CASCADE,
  
  allocated_cameras integer NOT NULL,
  allocated_users integer,
  
  allocated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE (license_id, server_id)
);

CREATE INDEX federation_server_licenses_license_idx ON federation_server_licenses (license_id);
CREATE INDEX federation_server_licenses_server_idx ON federation_server_licenses (server_id);

-- Functions and Triggers

-- Update server updated_at timestamp
CREATE OR REPLACE FUNCTION update_federated_server_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_federated_server_timestamp
  BEFORE UPDATE ON federated_servers
  FOR EACH ROW
  EXECUTE FUNCTION update_federated_server_timestamp();

-- Auto-expire global sessions
CREATE OR REPLACE FUNCTION expire_global_sessions()
RETURNS void AS $$
BEGIN
  UPDATE global_user_sessions
  SET revoked_at = now(),
      revoked_reason = 'expired'
  WHERE expires_at < now()
    AND revoked_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Function to get server routing for a resource
CREATE OR REPLACE FUNCTION get_server_for_resource(
  p_tenant_id uuid,
  p_scope_node_id uuid
) RETURNS uuid AS $$
DECLARE
  v_server_id uuid;
  v_node_path ltree;
BEGIN
  -- Get the resource node path
  SELECT path INTO v_node_path
  FROM resource_nodes
  WHERE id = p_scope_node_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Find the most specific server mapping
  SELECT rsm.server_id INTO v_server_id
  FROM regional_server_mappings rsm
  JOIN resource_nodes rn ON rn.id = rsm.scope_node_id
  WHERE rsm.tenant_id = p_tenant_id
    AND v_node_path <@ rn.path
    AND rsm.is_primary = true
  ORDER BY nlevel(rn.path) DESC
  LIMIT 1;
  
  RETURN v_server_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- View: Federation Dashboard Summary
CREATE VIEW federation_dashboard_summary AS
SELECT 
  fs.tenant_id,
  COUNT(DISTINCT fs.id) as total_servers,
  COUNT(DISTINCT fs.id) FILTER (WHERE fs.status = 'online') as online_servers,
  COUNT(DISTINCT fs.id) FILTER (WHERE fs.status = 'offline') as offline_servers,
  COUNT(DISTINCT fs.id) FILTER (WHERE fs.status = 'degraded') as degraded_servers,
  COUNT(DISTINCT fs.region) as total_regions,
  SUM(fs.total_cameras) as total_cameras,
  SUM(fs.online_cameras) as online_cameras,
  SUM(fs.total_branches) as total_branches,
  SUM(fs.storage_capacity_gb) as total_storage_gb,
  SUM(fs.storage_used_gb) as used_storage_gb,
  AVG(fs.health_score) as avg_health_score,
  MAX(fs.last_heartbeat) as last_heartbeat
FROM federated_servers fs
WHERE fs.status != 'maintenance'
GROUP BY fs.tenant_id;

-- View: Active Correlations
CREATE VIEW active_global_correlations AS
SELECT 
  gac.*,
  COUNT(gacm.id) as member_alert_count,
  array_agg(DISTINCT gacm.server_id) as involved_servers
FROM global_alert_correlations gac
LEFT JOIN global_alert_correlation_members gacm ON gacm.correlation_id = gac.id
WHERE gac.investigated = false
  AND gac.created_at > now() - interval '24 hours'
GROUP BY gac.id;

-- Comments
COMMENT ON TABLE federated_servers IS 
  'Registry of all servers in the federation (global command center, regional control centers, backup servers)';
COMMENT ON TABLE global_user_identities IS 
  'Unified user identity across all federated servers for SSO';
COMMENT ON TABLE federation_sync_jobs IS 
  'Tracks metadata synchronization jobs between regional servers';
COMMENT ON TABLE global_alert_correlations IS 
  'Correlates alerts across multiple regions to detect coordinated incidents';
COMMENT ON TABLE federation_replication_queue IS 
  'Queue for real-time data replication between servers';
COMMENT ON TABLE federation_audit_trail IS 
  'Unified audit trail aggregating events from all federated servers';
