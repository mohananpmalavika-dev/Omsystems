-- AI Intelligence Layer Migration
-- Adds tables for:
-- 1. Alert Correlation & Incident Clustering
-- 2. SOP Engine & Workflow Orchestration
-- 3. Investigation Reports
-- 4. Evidence Packages & Chain of Custody
-- 5. Video Search & Semantic Indexing

-- ============================================================================
-- 1. ALERT CORRELATION & INCIDENT CLUSTERING
-- ============================================================================

-- Alert Clusters (correlated incidents)
CREATE TABLE IF NOT EXISTS alert_clusters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    cluster_id VARCHAR(100) NOT NULL UNIQUE,
    
    -- Alerts in this cluster
    alert_ids UUID[] NOT NULL DEFAULT '{}',
    
    -- Classification
    incident_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
    
    -- Location
    branch_id UUID REFERENCES resource_nodes(id),
    camera_ids UUID[] NOT NULL DEFAULT '{}',
    
    -- Time Range
    first_occurred_at TIMESTAMPTZ NOT NULL,
    last_occurred_at TIMESTAMPTZ NOT NULL,
    duration_seconds INTEGER NOT NULL,
    
    -- Statistics
    alert_count INTEGER NOT NULL DEFAULT 0,
    unique_cameras INTEGER NOT NULL DEFAULT 0,
    confidence NUMERIC(3, 2) NOT NULL DEFAULT 0.5,
    
    -- Correlation Analysis
    correlation_factors JSONB NOT NULL DEFAULT '{}',
    root_cause TEXT,
    impact_level VARCHAR(50) NOT NULL DEFAULT 'medium-impact',
    auto_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Indexes
    CONSTRAINT valid_confidence CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX idx_alert_clusters_tenant ON alert_clusters(tenant_id);
CREATE INDEX idx_alert_clusters_branch ON alert_clusters(branch_id);
CREATE INDEX idx_alert_clusters_occurred_at ON alert_clusters(first_occurred_at DESC);
CREATE INDEX idx_alert_clusters_severity ON alert_clusters(severity);
CREATE INDEX idx_alert_clusters_incident_type ON alert_clusters(incident_type);
CREATE INDEX idx_alert_clusters_camera_ids ON alert_clusters USING GIN(camera_ids);

-- Incident Summaries (shift/daily/executive)
CREATE TABLE IF NOT EXISTS incident_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Period
    period VARCHAR(50) NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    branch_id UUID REFERENCES resource_nodes(id),
    
    -- Metrics
    total_alerts INTEGER NOT NULL DEFAULT 0,
    total_incidents INTEGER NOT NULL DEFAULT 0,
    reduction_ratio NUMERIC(5, 2) NOT NULL DEFAULT 0,
    critical_incidents INTEGER NOT NULL DEFAULT 0,
    high_priority_incidents INTEGER NOT NULL DEFAULT 0,
    operational_issues INTEGER NOT NULL DEFAULT 0,
    
    -- Categorized Incidents
    security_incidents JSONB NOT NULL DEFAULT '{}',
    infrastructure_incidents JSONB NOT NULL DEFAULT '{}',
    
    -- Analytics
    incidents_by_type JSONB NOT NULL DEFAULT '{}',
    incidents_by_severity JSONB NOT NULL DEFAULT '{}',
    incidents_by_branch JSONB NOT NULL DEFAULT '{}',
    top_incidents JSONB NOT NULL DEFAULT '[]',
    
    -- Averages
    average_alerts_per_incident NUMERIC(5, 2) NOT NULL DEFAULT 0,
    average_response_time NUMERIC(10, 2),
    
    -- Timestamps
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_incident_summaries_tenant ON incident_summaries(tenant_id);
CREATE INDEX idx_incident_summaries_period ON incident_summaries(period_start DESC, period_end DESC);
CREATE INDEX idx_incident_summaries_branch ON incident_summaries(branch_id);

-- ============================================================================
-- 2. SOP ENGINE & WORKFLOW ORCHESTRATION
-- ============================================================================

-- SOP Definitions
CREATE TABLE IF NOT EXISTS sop_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Metadata
    name VARCHAR(255) NOT NULL,
    description TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
    
    -- Application Rules
    incident_types VARCHAR(100)[] NOT NULL DEFAULT '{}',
    severity_levels VARCHAR(20)[] NOT NULL DEFAULT '{}',
    applicable_branch_types VARCHAR(100)[] DEFAULT '{}',
    applicable_zones VARCHAR(100)[] DEFAULT '{}',
    conditions JSONB DEFAULT '[]',
    
    -- SOP Content
    steps JSONB NOT NULL DEFAULT '[]',
    escalation_rules JSONB NOT NULL DEFAULT '[]',
    sla_minutes INTEGER,
    
    -- Audit
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    published_by UUID,
    archived_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sop_definitions_tenant ON sop_definitions(tenant_id);
CREATE INDEX idx_sop_definitions_status ON sop_definitions(status);
CREATE INDEX idx_sop_definitions_incident_types ON sop_definitions USING GIN(incident_types);

-- SOP Executions
CREATE TABLE IF NOT EXISTS sop_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sop_id UUID NOT NULL REFERENCES sop_definitions(id) ON DELETE RESTRICT,
    sop_version INTEGER NOT NULL,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Context
    incident_id UUID REFERENCES incidents(id) ON DELETE CASCADE,
    alert_id UUID,
    branch_id UUID REFERENCES resource_nodes(id),
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'in-progress' 
        CHECK (status IN ('in-progress', 'completed', 'cancelled', 'escalated', 'failed')),
    
    -- Progress
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    started_by UUID NOT NULL,
    current_step_number INTEGER NOT NULL DEFAULT 1,
    completed_steps INTEGER NOT NULL DEFAULT 0,
    total_steps INTEGER NOT NULL,
    progress NUMERIC(5, 2) NOT NULL DEFAULT 0,
    
    -- SLA Tracking
    sla_deadline TIMESTAMPTZ,
    sla_status VARCHAR(20) NOT NULL DEFAULT 'on-time' 
        CHECK (sla_status IN ('on-time', 'at-risk', 'breached')),
    
    -- Escalation
    escalated BOOLEAN NOT NULL DEFAULT FALSE,
    escalation_history JSONB NOT NULL DEFAULT '[]',
    
    -- Results
    step_results JSONB NOT NULL DEFAULT '[]',
    summary TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sop_executions_tenant ON sop_executions(tenant_id);
CREATE INDEX idx_sop_executions_sop ON sop_executions(sop_id);
CREATE INDEX idx_sop_executions_incident ON sop_executions(incident_id);
CREATE INDEX idx_sop_executions_status ON sop_executions(status);
CREATE INDEX idx_sop_executions_started_at ON sop_executions(started_at DESC);
CREATE INDEX idx_sop_executions_sla_status ON sop_executions(sla_status) WHERE status = 'in-progress';

-- ============================================================================
-- 3. INVESTIGATION REPORTS
-- ============================================================================

-- Investigation Reports
CREATE TABLE IF NOT EXISTS investigation_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_number VARCHAR(100) NOT NULL UNIQUE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    
    -- Report Type
    report_type VARCHAR(50) NOT NULL 
        CHECK (report_type IN ('preliminary', 'detailed', 'executive', 'court-evidence')),
    status VARCHAR(20) NOT NULL DEFAULT 'draft' 
        CHECK (status IN ('draft', 'pending-review', 'approved', 'final')),
    
    -- Report Content
    incident_summary JSONB NOT NULL,
    executive_summary JSONB NOT NULL,
    timeline JSONB NOT NULL DEFAULT '[]',
    scene_description JSONB NOT NULL,
    person_analysis JSONB,
    vehicle_analysis JSONB,
    camera_path_reconstruction JSONB NOT NULL,
    access_control_events JSONB,
    operator_response JSONB NOT NULL,
    root_cause_analysis JSONB NOT NULL,
    evidence_inventory JSONB NOT NULL,
    findings JSONB NOT NULL,
    sop_compliance JSONB,
    recommendations JSONB NOT NULL,
    conclusions JSONB NOT NULL,
    
    -- Approvals
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    finalized_at TIMESTAMPTZ,
    
    -- Export
    export_formats VARCHAR(20)[] NOT NULL DEFAULT '{}',
    exported_at TIMESTAMPTZ,
    report_path TEXT,
    
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_investigation_reports_tenant ON investigation_reports(tenant_id);
CREATE INDEX idx_investigation_reports_incident ON investigation_reports(incident_id);
CREATE INDEX idx_investigation_reports_status ON investigation_reports(status);
CREATE INDEX idx_investigation_reports_type ON investigation_reports(report_type);
CREATE INDEX idx_investigation_reports_created_at ON investigation_reports(created_at DESC);

-- ============================================================================
-- 4. EVIDENCE PACKAGES & CHAIN OF CUSTODY
-- ============================================================================

-- Evidence Packages
CREATE TABLE IF NOT EXISTS evidence_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_number VARCHAR(100) NOT NULL UNIQUE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    
    -- Configuration
    title VARCHAR(255) NOT NULL,
    description TEXT,
    package_type VARCHAR(50) NOT NULL 
        CHECK (package_type IN ('investigation', 'court-evidence', 'police-submission', 'insurance-claim', 'internal-audit', 'compliance')),
    
    -- Contents Selection
    include_original_video BOOLEAN NOT NULL DEFAULT TRUE,
    include_investigation_clips BOOLEAN NOT NULL DEFAULT TRUE,
    include_snapshots BOOLEAN NOT NULL DEFAULT TRUE,
    include_timeline BOOLEAN NOT NULL DEFAULT TRUE,
    include_alert_logs BOOLEAN NOT NULL DEFAULT TRUE,
    include_access_logs BOOLEAN NOT NULL DEFAULT FALSE,
    include_system_logs BOOLEAN NOT NULL DEFAULT FALSE,
    include_documents BOOLEAN NOT NULL DEFAULT TRUE,
    include_reports BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'draft' 
        CHECK (status IN ('draft', 'collecting', 'ready', 'downloaded', 'expired', 'revoked')),
    collection_progress NUMERIC(5, 2) NOT NULL DEFAULT 0,
    
    -- Evidence Items
    total_items INTEGER NOT NULL DEFAULT 0,
    total_size_bytes BIGINT NOT NULL DEFAULT 0,
    
    -- Integrity
    manifest_hash VARCHAR(64) NOT NULL DEFAULT '',
    package_hash VARCHAR(64),
    digitally_signed BOOLEAN NOT NULL DEFAULT FALSE,
    signature_algorithm VARCHAR(50),
    signature TEXT,
    signed_by UUID,
    signed_at TIMESTAMPTZ,
    
    -- Chain of Custody
    current_custodian UUID,
    
    -- Storage
    storage_path TEXT,
    manifest_path TEXT,
    expires_at TIMESTAMPTZ,
    
    -- Metadata
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    generated_at TIMESTAMPTZ,
    first_accessed_at TIMESTAMPTZ,
    last_accessed_at TIMESTAMPTZ,
    access_count INTEGER NOT NULL DEFAULT 0,
    
    -- Export
    export_format VARCHAR(20) NOT NULL DEFAULT 'zip' 
        CHECK (export_format IN ('zip', 'tar', 'encrypted-zip')),
    encrypted BOOLEAN NOT NULL DEFAULT FALSE,
    encryption_method VARCHAR(50),
    
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_evidence_packages_tenant ON evidence_packages(tenant_id);
CREATE INDEX idx_evidence_packages_incident ON evidence_packages(incident_id);
CREATE INDEX idx_evidence_packages_status ON evidence_packages(status);
CREATE INDEX idx_evidence_packages_type ON evidence_packages(package_type);
CREATE INDEX idx_evidence_packages_created_at ON evidence_packages(created_at DESC);
CREATE INDEX idx_evidence_packages_custodian ON evidence_packages(current_custodian);

-- Evidence Items
CREATE TABLE IF NOT EXISTS evidence_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID REFERENCES evidence_packages(id) ON DELETE CASCADE,
    
    -- Item Type
    item_type VARCHAR(50)
        CHECK (item_type IS NULL OR item_type IN ('video-original', 'video-clip', 'snapshot', 'document', 'log-file', 'report', 'metadata')),
    title VARCHAR(255),
    description TEXT,
    
    -- Source
    source_type VARCHAR(100),
    source_id VARCHAR(255),
    camera_id UUID,
    timestamp TIMESTAMPTZ,
    
    -- File Information
    file_name VARCHAR(255),
    file_path TEXT,
    mime_type VARCHAR(100),
    size_bytes BIGINT NOT NULL DEFAULT 0,
    
    -- Integrity
    checksum_algorithm VARCHAR(20) DEFAULT 'sha256'
        CHECK (checksum_algorithm IS NULL OR checksum_algorithm IN ('sha256', 'sha512')),
    checksum_value VARCHAR(128),
    
    -- Classification
    classification VARCHAR(20) DEFAULT 'original'
        CHECK (classification IS NULL OR classification IN ('original', 'derivative', 'enhanced', 'annotated')),
    derived_from UUID REFERENCES evidence_items(id),
    
    -- Metadata
    metadata JSONB,
    
    -- Timestamps
    captured_at TIMESTAMPTZ,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    verified_at TIMESTAMPTZ
);

ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS package_id UUID;
ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS item_type VARCHAR(50);
ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS source_type VARCHAR(100);
ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS source_id VARCHAR(255);
ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS camera_id UUID;
ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ;
ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS file_name VARCHAR(255);
ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS file_path TEXT;
ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100);
ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS size_bytes BIGINT NOT NULL DEFAULT 0;
ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS checksum_algorithm VARCHAR(20) DEFAULT 'sha256';
ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS checksum_value VARCHAR(128);
ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS classification VARCHAR(20) DEFAULT 'original';
ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ;
ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS added_at TIMESTAMPTZ;
ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_evidence_items_package ON evidence_items(package_id);
CREATE INDEX IF NOT EXISTS idx_evidence_items_type ON evidence_items(item_type);
CREATE INDEX IF NOT EXISTS idx_evidence_items_camera ON evidence_items(camera_id);
CREATE INDEX IF NOT EXISTS idx_evidence_items_timestamp ON evidence_items(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_items_classification ON evidence_items(classification);

-- Chain of Custody Events
CREATE TABLE IF NOT EXISTS chain_of_custody_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID REFERENCES evidence_packages(id) ON DELETE CASCADE,
    
    -- Event Type
    event_type VARCHAR(20) NOT NULL 
        CHECK (event_type IN ('created', 'accessed', 'transferred', 'modified', 'verified', 'exported', 'downloaded', 'shared', 'revoked')),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Performer
    performed_by UUID NOT NULL,
    performed_by_role VARCHAR(100),
    source_ip INET,
    user_agent TEXT,
    location TEXT,
    
    -- Transfer Details
    transferred_from UUID,
    transferred_to UUID,
    transfer_method VARCHAR(100),
    receipt_acknowledged BOOLEAN,
    
    -- Evidence State
    items_affected UUID[] DEFAULT '{}',
    hash_before VARCHAR(64),
    hash_after VARCHAR(64),
    
    -- Purpose and Authorization
    purpose TEXT,
    "authorization" TEXT,
    
    -- Notes
    notes TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE chain_of_custody_events ADD COLUMN IF NOT EXISTS package_id UUID;
ALTER TABLE chain_of_custody_events ADD COLUMN IF NOT EXISTS event_type VARCHAR(20);
ALTER TABLE chain_of_custody_events ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ;
ALTER TABLE chain_of_custody_events ADD COLUMN IF NOT EXISTS performed_by UUID;
ALTER TABLE chain_of_custody_events ADD COLUMN IF NOT EXISTS performed_by_role VARCHAR(100);
ALTER TABLE chain_of_custody_events ADD COLUMN IF NOT EXISTS source_ip INET;
ALTER TABLE chain_of_custody_events ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE chain_of_custody_events ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE chain_of_custody_events ADD COLUMN IF NOT EXISTS transferred_from UUID;
ALTER TABLE chain_of_custody_events ADD COLUMN IF NOT EXISTS transferred_to UUID;
ALTER TABLE chain_of_custody_events ADD COLUMN IF NOT EXISTS transfer_method VARCHAR(100);
ALTER TABLE chain_of_custody_events ADD COLUMN IF NOT EXISTS receipt_acknowledged BOOLEAN;
ALTER TABLE chain_of_custody_events ADD COLUMN IF NOT EXISTS items_affected UUID[];
ALTER TABLE chain_of_custody_events ADD COLUMN IF NOT EXISTS hash_before VARCHAR(64);
ALTER TABLE chain_of_custody_events ADD COLUMN IF NOT EXISTS hash_after VARCHAR(64);
ALTER TABLE chain_of_custody_events ADD COLUMN IF NOT EXISTS purpose TEXT;
ALTER TABLE chain_of_custody_events ADD COLUMN IF NOT EXISTS "authorization" TEXT;
ALTER TABLE chain_of_custody_events ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE chain_of_custody_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_chain_of_custody_package ON chain_of_custody_events(package_id);
CREATE INDEX IF NOT EXISTS idx_chain_of_custody_timestamp ON chain_of_custody_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_chain_of_custody_performed_by ON chain_of_custody_events(performed_by);
CREATE INDEX IF NOT EXISTS idx_chain_of_custody_event_type ON chain_of_custody_events(event_type);

-- ============================================================================
-- 5. VIDEO SEARCH & SEMANTIC INDEXING
-- ============================================================================

-- Video Metadata Index
CREATE TABLE IF NOT EXISTS video_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES resource_nodes(id),
    segment_id UUID NOT NULL,
    
    -- Time Range
    timestamp TIMESTAMPTZ NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    duration_seconds INTEGER NOT NULL,
    
    -- Scene
    scene_type VARCHAR(50),
    lighting_condition VARCHAR(20) CHECK (lighting_condition IN ('day', 'night', 'dawn', 'dusk')),
    weather_condition VARCHAR(50),
    crowd_density VARCHAR(20) CHECK (crowd_density IN ('empty', 'sparse', 'moderate', 'crowded')),
    
    -- Embeddings (for semantic search)
    embedding vector(512),
    embedding_model VARCHAR(100),
    
    -- Indexed
    indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ
);

CREATE INDEX idx_video_metadata_tenant ON video_metadata(tenant_id);
CREATE INDEX idx_video_metadata_camera ON video_metadata(camera_id);
CREATE INDEX idx_video_metadata_branch ON video_metadata(branch_id);
CREATE INDEX idx_video_metadata_timestamp ON video_metadata(timestamp DESC);
CREATE INDEX idx_video_metadata_segment ON video_metadata(segment_id);

-- Video Objects (detected objects with attributes)
CREATE TABLE IF NOT EXISTS video_objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_metadata_id UUID NOT NULL REFERENCES video_metadata(id) ON DELETE CASCADE,
    object_id VARCHAR(100) NOT NULL,
    
    -- Object Type
    object_type VARCHAR(20) NOT NULL 
        CHECK (object_type IN ('person', 'vehicle', 'object', 'animal')),
    tracking_id VARCHAR(100),
    
    -- Time
    first_seen TIMESTAMPTZ NOT NULL,
    last_seen TIMESTAMPTZ NOT NULL,
    duration_seconds INTEGER NOT NULL,
    
    -- Bounding Boxes
    bounding_boxes JSONB NOT NULL DEFAULT '[]',
    
    -- Attributes
    attributes JSONB NOT NULL DEFAULT '{}',
    
    -- Cross-Camera Tracking
    cross_camera_tracking_id VARCHAR(100),
    related_camera_detections JSONB DEFAULT '[]',
    
    -- Embedding (for similarity search)
    embedding vector(512),
    
    -- Confidence
    confidence NUMERIC(3, 2) NOT NULL DEFAULT 0.5,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT valid_object_confidence CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX idx_video_objects_metadata ON video_objects(video_metadata_id);
CREATE INDEX idx_video_objects_type ON video_objects(object_type);
CREATE INDEX idx_video_objects_tracking_id ON video_objects(tracking_id);
CREATE INDEX idx_video_objects_cross_camera_tracking ON video_objects(cross_camera_tracking_id);
CREATE INDEX idx_video_objects_first_seen ON video_objects(first_seen DESC);
CREATE INDEX idx_video_objects_attributes ON video_objects USING GIN(attributes);

-- Video Search Queries (for analytics)
CREATE TABLE IF NOT EXISTS video_search_queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Query
    natural_language_query TEXT,
    structured_query JSONB,
    
    -- Results
    results_count INTEGER NOT NULL DEFAULT 0,
    execution_time_ms INTEGER,
    
    -- User
    performed_by UUID NOT NULL,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Success
    success BOOLEAN NOT NULL DEFAULT TRUE,
    error_message TEXT
);

CREATE INDEX idx_video_search_queries_tenant ON video_search_queries(tenant_id);
CREATE INDEX idx_video_search_queries_performed_at ON video_search_queries(performed_at DESC);
CREATE INDEX idx_video_search_queries_performed_by ON video_search_queries(performed_by);

-- ============================================================================
-- VIEWS FOR EASIER QUERYING
-- ============================================================================

-- Active SOP Executions View
CREATE OR REPLACE VIEW active_sop_executions AS
SELECT 
    e.*,
    s.name AS sop_name,
    i.incident_number,
    i.title AS incident_title,
    b.name AS branch_name
FROM sop_executions e
JOIN sop_definitions s ON e.sop_id = s.id
LEFT JOIN incidents i ON e.incident_id = i.id
LEFT JOIN resource_nodes b ON e.branch_id = b.id
WHERE e.status = 'in-progress';

-- Evidence Packages with Custody View
DROP VIEW IF EXISTS evidence_packages_with_custody;
CREATE OR REPLACE VIEW evidence_packages_with_custody AS
SELECT 
    p.*,
    i.incident_number,
    i.title AS incident_title,
    COUNT(DISTINCT e.id) AS evidence_items_count,
    COUNT(DISTINCT c.id) AS custody_events_count,
    COALESCE(SUM(e.size_bytes), 0) AS calculated_total_size
FROM evidence_packages p
JOIN incidents i ON p.incident_id = i.id
LEFT JOIN evidence_items e ON p.id = e.package_id
LEFT JOIN chain_of_custody_events c ON p.id = c.package_id
GROUP BY p.id, i.incident_number, i.title;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to update SOP execution progress
CREATE OR REPLACE FUNCTION update_sop_execution_progress()
RETURNS TRIGGER AS $$
BEGIN
    NEW.progress := (NEW.completed_steps::NUMERIC / NULLIF(NEW.total_steps, 0)) * 100;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_sop_execution_progress
    BEFORE UPDATE ON sop_executions
    FOR EACH ROW
    EXECUTE FUNCTION update_sop_execution_progress();

-- Function to update evidence package total size
CREATE OR REPLACE FUNCTION update_evidence_package_totals()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE evidence_packages
    SET 
        total_items = (SELECT COUNT(*) FROM evidence_items WHERE package_id = COALESCE(NEW.package_id, OLD.package_id)),
        total_size_bytes = (SELECT COALESCE(SUM(size_bytes), 0) FROM evidence_items WHERE package_id = COALESCE(NEW.package_id, OLD.package_id)),
        updated_at = NOW()
    WHERE id = COALESCE(NEW.package_id, OLD.package_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_evidence_package_totals
    AFTER INSERT OR UPDATE OR DELETE ON evidence_items
    FOR EACH ROW
    EXECUTE FUNCTION update_evidence_package_totals();

-- ============================================================================
-- GRANTS
-- ============================================================================

-- Grant necessary permissions (adjust as needed for your security model)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sentinel_api;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sentinel_api;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO sentinel_api;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE alert_clusters IS 'Correlated alerts grouped into meaningful incidents';
COMMENT ON TABLE incident_summaries IS 'Pre-generated incident summaries for shift, daily, and executive reporting';
COMMENT ON TABLE sop_definitions IS 'Standard Operating Procedure definitions for incident response';
COMMENT ON TABLE sop_executions IS 'Active and completed SOP workflow executions';
COMMENT ON TABLE investigation_reports IS 'Comprehensive investigation reports with timeline and evidence';
COMMENT ON TABLE evidence_packages IS 'Evidence packages with integrity verification and chain of custody';
COMMENT ON TABLE evidence_items IS 'Individual evidence items within packages';
COMMENT ON TABLE chain_of_custody_events IS 'Immutable chain of custody audit trail for evidence';
COMMENT ON TABLE video_metadata IS 'Indexed video metadata for semantic search';
COMMENT ON TABLE video_objects IS 'Detected objects in video with attributes for search';
COMMENT ON TABLE video_search_queries IS 'Video search query log for analytics';
