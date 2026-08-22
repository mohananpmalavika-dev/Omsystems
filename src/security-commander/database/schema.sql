-- ============================================================================
-- AI SECURITY COMMANDER - DATABASE SCHEMA
-- ============================================================================
-- This schema supports the unified security event model for correlating
-- events across cameras, DVRs, access control, network, storage, and AI.
-- ============================================================================

-- Security Events Table
-- Stores all normalized security events from all sources
CREATE TABLE IF NOT EXISTS security_events (
    id UUID PRIMARY KEY,
    
    -- Tenant context
    tenant_id UUID NOT NULL,
    enterprise_id UUID,
    region_id UUID,
    branch_id UUID,
    
    -- Event identification
    event_type VARCHAR(100) NOT NULL,
    source_type VARCHAR(50) NOT NULL,
    source_id UUID NOT NULL,
    source_name VARCHAR(255),
    
    -- Timing
    occurred_at TIMESTAMPTZ NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Classification
    severity VARCHAR(20) NOT NULL,
    confidence DOUBLE PRECISION,
    abnormality_score DOUBLE PRECISION,
    
    -- Correlation tracking
    correlation_id UUID,
    incident_id UUID,
    investigation_id UUID,
    
    -- Location (JSONB for flexibility)
    location JSONB,
    
    -- Entity references (JSONB for flexibility)
    entities JSONB,
    
    -- Evidence references (JSONB)
    evidence JSONB,
    
    -- Additional metadata (JSONB)
    metadata JSONB NOT NULL DEFAULT '{}',
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_security_events_time 
ON security_events(occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_events_tenant_time 
ON security_events(tenant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_events_branch_time 
ON security_events(branch_id, occurred_at DESC) WHERE branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_security_events_type_time 
ON security_events(event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_events_severity_time 
ON security_events(severity, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_events_source 
ON security_events(source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_security_events_correlation 
ON security_events(correlation_id) WHERE correlation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_security_events_incident 
ON security_events(incident_id) WHERE incident_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_security_events_investigation 
ON security_events(investigation_id) WHERE investigation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_security_events_abnormal 
ON security_events(abnormality_score DESC) WHERE abnormality_score >= 0.5;

-- GIN indexes for JSONB columns
CREATE INDEX IF NOT EXISTS idx_security_events_entities 
ON security_events USING GIN(entities);

CREATE INDEX IF NOT EXISTS idx_security_events_metadata 
ON security_events USING GIN(metadata);

CREATE INDEX IF NOT EXISTS idx_security_events_location 
ON security_events USING GIN(location);

-- ============================================================================
-- Incidents Table (Correlated Events)
-- ============================================================================
CREATE TABLE IF NOT EXISTS security_incidents (
    id UUID PRIMARY KEY,
    
    -- Context
    tenant_id UUID NOT NULL,
    branch_id UUID,
    zone_id UUID,
    
    -- Incident identification
    incident_type VARCHAR(100) NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    
    -- Classification
    severity VARCHAR(20) NOT NULL,
    confidence DOUBLE PRECISION NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'open',
    
    -- Timing
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    
    -- Correlation
    event_count INTEGER NOT NULL DEFAULT 0,
    fingerprint VARCHAR(255),
    
    -- Evidence
    evidence_count INTEGER NOT NULL DEFAULT 0,
    
    -- Investigation
    investigation_id UUID,
    
    -- Assignment
    assigned_to UUID,
    
    -- Root cause
    root_cause JSONB,
    
    -- Additional data
    affected_assets JSONB NOT NULL DEFAULT '[]',
    explanation TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_incidents_tenant 
ON security_incidents(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_incidents_branch 
ON security_incidents(branch_id, created_at DESC) WHERE branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_security_incidents_type 
ON security_incidents(incident_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_incidents_severity 
ON security_incidents(severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_incidents_status 
ON security_incidents(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_incidents_investigation 
ON security_incidents(investigation_id) WHERE investigation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_security_incidents_fingerprint 
ON security_incidents(fingerprint) WHERE fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_security_incidents_assigned 
ON security_incidents(assigned_to) WHERE assigned_to IS NOT NULL;

-- ============================================================================
-- Incident Events Junction Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS security_incident_events (
    id UUID PRIMARY KEY,
    incident_id UUID NOT NULL REFERENCES security_incidents(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES security_events(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(incident_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_incident_events_incident 
ON security_incident_events(incident_id);

CREATE INDEX IF NOT EXISTS idx_incident_events_event 
ON security_incident_events(event_id);

-- ============================================================================
-- Investigations Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS security_investigations (
    id UUID PRIMARY KEY,
    
    -- Context
    tenant_id UUID NOT NULL,
    
    -- Investigation details
    title VARCHAR(500) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'open',
    priority VARCHAR(20) NOT NULL DEFAULT 'medium',
    
    -- Time range
    time_range_from TIMESTAMPTZ NOT NULL,
    time_range_to TIMESTAMPTZ NOT NULL,
    
    -- Scope (JSONB for flexibility)
    scope JSONB NOT NULL,
    
    -- Summary
    summary TEXT,
    
    -- Root cause analysis
    root_cause JSONB,
    
    -- Assignment
    created_by_type VARCHAR(20) NOT NULL,
    created_by_user_id UUID,
    assigned_to UUID,
    
    -- Tags
    tags TEXT[],
    
    -- Statistics
    incident_count INTEGER NOT NULL DEFAULT 0,
    event_count INTEGER NOT NULL DEFAULT 0,
    evidence_count INTEGER NOT NULL DEFAULT 0,
    
    -- Additional data
    affected_assets JSONB NOT NULL DEFAULT '[]',
    metadata JSONB NOT NULL DEFAULT '{}',
    
    -- Timing
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_investigations_tenant 
ON security_investigations(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_investigations_status 
ON security_investigations(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_investigations_priority 
ON security_investigations(priority, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_investigations_assigned 
ON security_investigations(assigned_to) WHERE assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_security_investigations_tags 
ON security_investigations USING GIN(tags);

-- ============================================================================
-- Evidence Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS security_evidence (
    id UUID PRIMARY KEY,
    
    -- Context
    investigation_id UUID REFERENCES security_investigations(id) ON DELETE CASCADE,
    incident_id UUID REFERENCES security_incidents(id) ON DELETE CASCADE,
    
    -- Evidence details
    evidence_type VARCHAR(50) NOT NULL,
    source_id UUID NOT NULL,
    source_name VARCHAR(255),
    
    -- Timing
    timestamp TIMESTAMPTZ NOT NULL,
    
    -- Storage
    uri TEXT,
    file_path TEXT,
    storage_location VARCHAR(255),
    
    -- Integrity
    hash VARCHAR(128),
    hash_algorithm VARCHAR(20),
    
    -- File details
    size_bytes BIGINT,
    mime_type VARCHAR(100),
    duration_seconds INTEGER,
    
    -- Description
    description TEXT,
    
    -- Additional metadata
    metadata JSONB NOT NULL DEFAULT '{}',
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_evidence_investigation 
ON security_evidence(investigation_id) WHERE investigation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_security_evidence_incident 
ON security_evidence(incident_id) WHERE incident_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_security_evidence_type 
ON security_evidence(evidence_type);

CREATE INDEX IF NOT EXISTS idx_security_evidence_source 
ON security_evidence(source_id);

CREATE INDEX IF NOT EXISTS idx_security_evidence_timestamp 
ON security_evidence(timestamp DESC);

-- ============================================================================
-- Timeline Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS security_timeline (
    id UUID PRIMARY KEY,
    
    -- Context
    investigation_id UUID NOT NULL REFERENCES security_investigations(id) ON DELETE CASCADE,
    
    -- Timeline entry
    timestamp TIMESTAMPTZ NOT NULL,
    entry_type VARCHAR(50) NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    
    -- References
    event_id UUID REFERENCES security_events(id) ON DELETE SET NULL,
    incident_id UUID REFERENCES security_incidents(id) ON DELETE SET NULL,
    
    -- Classification
    severity VARCHAR(20),
    
    -- Assets
    assets JSONB,
    
    -- Evidence
    evidence_ids UUID[],
    
    -- Additional metadata
    metadata JSONB,
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_timeline_investigation 
ON security_timeline(investigation_id, timestamp ASC);

CREATE INDEX IF NOT EXISTS idx_security_timeline_event 
ON security_timeline(event_id) WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_security_timeline_incident 
ON security_timeline(incident_id) WHERE incident_id IS NOT NULL;

-- ============================================================================
-- Hypotheses Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS security_hypotheses (
    id UUID PRIMARY KEY,
    
    -- Context
    investigation_id UUID NOT NULL REFERENCES security_investigations(id) ON DELETE CASCADE,
    
    -- Hypothesis
    description TEXT NOT NULL,
    confidence DOUBLE PRECISION NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'possible',
    
    -- Evidence
    supporting_evidence_ids UUID[],
    contradicting_evidence_ids UUID[],
    
    -- Creator
    created_by_type VARCHAR(20) NOT NULL,
    created_by_user_id UUID,
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_hypotheses_investigation 
ON security_hypotheses(investigation_id, confidence DESC);

-- ============================================================================
-- Recommended Actions Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS security_recommended_actions (
    id UUID PRIMARY KEY,
    
    -- Context
    investigation_id UUID NOT NULL REFERENCES security_investigations(id) ON DELETE CASCADE,
    
    -- Action details
    action_order INTEGER NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    required BOOLEAN NOT NULL DEFAULT false,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    
    -- Completion
    completed_by UUID,
    completed_at TIMESTAMPTZ,
    notes TEXT,
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_actions_investigation 
ON security_recommended_actions(investigation_id, action_order ASC);

CREATE INDEX IF NOT EXISTS idx_security_actions_status 
ON security_recommended_actions(status);

-- ============================================================================
-- Commander Audit Log
-- ============================================================================
CREATE TABLE IF NOT EXISTS security_commander_audit (
    id UUID PRIMARY KEY,
    
    -- User context
    user_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    session_id UUID,
    
    -- Query
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    original_query TEXT NOT NULL,
    parsed_intent JSONB NOT NULL,
    
    -- Execution
    executed_queries JSONB NOT NULL DEFAULT '[]',
    execution_time_ms INTEGER,
    
    -- Results
    investigation_id UUID,
    result_status VARCHAR(20) NOT NULL,
    error_message TEXT,
    response_summary TEXT,
    
    -- Actions requested
    requested_actions JSONB,
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commander_audit_user 
ON security_commander_audit(user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_commander_audit_tenant 
ON security_commander_audit(tenant_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_commander_audit_investigation 
ON security_commander_audit(investigation_id) WHERE investigation_id IS NOT NULL;

-- ============================================================================
-- Event Baselines (for anomaly detection)
-- ============================================================================
CREATE TABLE IF NOT EXISTS security_event_baselines (
    id UUID PRIMARY KEY,
    
    -- Context
    tenant_id UUID NOT NULL,
    entity_id UUID NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    
    -- Time context
    hour_of_week SMALLINT NOT NULL, -- 0-167 (24 hours * 7 days)
    
    -- Statistical measures
    mean DOUBLE PRECISION NOT NULL,
    stddev DOUBLE PRECISION NOT NULL,
    p50 DOUBLE PRECISION NOT NULL,
    p95 DOUBLE PRECISION NOT NULL,
    p99 DOUBLE PRECISION NOT NULL,
    min_value DOUBLE PRECISION NOT NULL,
    max_value DOUBLE PRECISION NOT NULL,
    sample_count INTEGER NOT NULL,
    
    -- Calculation period
    calculated_from TIMESTAMPTZ NOT NULL,
    calculated_to TIMESTAMPTZ NOT NULL,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(tenant_id, entity_id, event_type, hour_of_week)
);

CREATE INDEX IF NOT EXISTS idx_event_baselines_entity 
ON security_event_baselines(entity_id, event_type, hour_of_week);

CREATE INDEX IF NOT EXISTS idx_event_baselines_tenant 
ON security_event_baselines(tenant_id);

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to get abnormal events in a time range
CREATE OR REPLACE FUNCTION get_abnormal_events(
    p_tenant_id UUID,
    p_from TIMESTAMPTZ,
    p_to TIMESTAMPTZ,
    p_min_score DOUBLE PRECISION DEFAULT 0.5
)
RETURNS TABLE (
    id UUID,
    event_type VARCHAR,
    occurred_at TIMESTAMPTZ,
    severity VARCHAR,
    abnormality_score DOUBLE PRECISION,
    source_type VARCHAR,
    source_id UUID,
    branch_id UUID
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id,
        e.event_type,
        e.occurred_at,
        e.severity,
        e.abnormality_score,
        e.source_type,
        e.source_id,
        e.branch_id
    FROM security_events e
    WHERE e.tenant_id = p_tenant_id
      AND e.occurred_at >= p_from
      AND e.occurred_at <= p_to
      AND e.abnormality_score >= p_min_score
    ORDER BY e.abnormality_score DESC, e.occurred_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get incident statistics
CREATE OR REPLACE FUNCTION get_security_incident_stats(
    p_tenant_id UUID,
    p_from TIMESTAMPTZ DEFAULT NULL,
    p_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    total BIGINT,
    open BIGINT,
    investigating BIGINT,
    resolved BIGINT,
    dismissed BIGINT,
    critical BIGINT,
    high BIGINT,
    medium BIGINT,
    low BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::BIGINT as total,
        COUNT(*) FILTER (WHERE status = 'open')::BIGINT as open,
        COUNT(*) FILTER (WHERE status = 'investigating')::BIGINT as investigating,
        COUNT(*) FILTER (WHERE status = 'resolved')::BIGINT as resolved,
        COUNT(*) FILTER (WHERE status = 'dismissed')::BIGINT as dismissed,
        COUNT(*) FILTER (WHERE severity = 'critical')::BIGINT as critical,
        COUNT(*) FILTER (WHERE severity = 'high')::BIGINT as high,
        COUNT(*) FILTER (WHERE severity = 'medium')::BIGINT as medium,
        COUNT(*) FILTER (WHERE severity = 'low')::BIGINT as low
    FROM security_incidents
    WHERE tenant_id = p_tenant_id
      AND (p_from IS NULL OR started_at >= p_from)
      AND (p_to IS NULL OR started_at <= p_to);
END;
$$ LANGUAGE plpgsql;
