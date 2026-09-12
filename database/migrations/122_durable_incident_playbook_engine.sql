-- ============================================================================
-- Migration: 122_durable_incident_playbook_engine.sql
-- Description: Durable Incident Playbooks, SOP Versions, Step Instances, 
--              Decisions, Audits, and Durable Escalation Jobs
-- ============================================================================

-- 1. Playbook Definitions (Tenant/Branch Scoped, Lifecycle Managed)
CREATE TABLE IF NOT EXISTS incident_playbook_definitions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT, -- NULL denotes tenant-wide default template
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'banking_security',
    incident_type TEXT NOT NULL,
    severity TEXT NOT NULL, -- P1, P2, P3, P4
    status TEXT NOT NULL DEFAULT 'ACTIVE', -- DRAFT, ACTIVE, RETIRED
    current_version INT NOT NULL DEFAULT 1,
    resolution_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_playbook_def_tenant_type 
    ON incident_playbook_definitions(tenant_id, incident_type, severity, status);

-- 2. Playbook Versions (Immutable Published Snapshots)
CREATE TABLE IF NOT EXISTS incident_playbook_versions (
    id TEXT PRIMARY KEY,
    definition_id TEXT NOT NULL REFERENCES incident_playbook_definitions(id) ON DELETE CASCADE,
    version INT NOT NULL,
    definition_snapshot JSONB NOT NULL,
    steps_snapshot JSONB NOT NULL,
    checksum_sha256 TEXT NOT NULL,
    published_by TEXT,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(definition_id, version)
);

-- 3. Playbook Step Definitions
CREATE TABLE IF NOT EXISTS incident_playbook_steps (
    id TEXT PRIMARY KEY,
    definition_id TEXT NOT NULL REFERENCES incident_playbook_definitions(id) ON DELETE CASCADE,
    step_order INT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    mandatory BOOLEAN NOT NULL DEFAULT true,
    depends_on JSONB DEFAULT '[]'::jsonb,
    evidence_requirements JSONB DEFAULT '{}'::jsonb,
    automated_action JSONB DEFAULT '{}'::jsonb,
    decision_outputs JSONB DEFAULT '[]'::jsonb,
    escalation_timeout_seconds INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(definition_id, step_order)
);

-- 4. Playbook Instances (Execution Engine Runtime State)
CREATE TABLE IF NOT EXISTS incident_playbook_instances (
    instance_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT,
    incident_id TEXT NOT NULL,
    playbook_id TEXT NOT NULL REFERENCES incident_playbook_definitions(id),
    playbook_version_id TEXT NOT NULL REFERENCES incident_playbook_versions(id),
    version INT NOT NULL DEFAULT 1, -- Optimistic concurrency control
    status TEXT NOT NULL DEFAULT 'IN_PROGRESS', -- IN_PROGRESS, COMPLETED, OVERRIDDEN, SUSPENDED
    current_step_order INT NOT NULL DEFAULT 1,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    resolved_by TEXT,
    override_reason TEXT,
    resolution_summary JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(incident_id)
);

CREATE INDEX IF NOT EXISTS idx_playbook_inst_tenant_incident 
    ON incident_playbook_instances(tenant_id, incident_id);

-- 5. Step Instances (Per-step execution log)
CREATE TABLE IF NOT EXISTS incident_playbook_step_instances (
    id TEXT PRIMARY KEY,
    instance_id TEXT NOT NULL REFERENCES incident_playbook_instances(instance_id) ON DELETE CASCADE,
    step_id TEXT NOT NULL,
    step_order INT NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, IN_PROGRESS, COMPLETED, SKIPPED, FAILED
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    executed_by TEXT,
    notes TEXT,
    evidence_collected JSONB DEFAULT '{}'::jsonb,
    verification_outputs JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(instance_id, step_order)
);

-- 6. Incident Decisions
CREATE TABLE IF NOT EXISTS incident_playbook_decisions (
    id TEXT PRIMARY KEY,
    instance_id TEXT NOT NULL REFERENCES incident_playbook_instances(instance_id) ON DELETE CASCADE,
    step_instance_id TEXT NOT NULL REFERENCES incident_playbook_step_instances(id) ON DELETE CASCADE,
    decision_key TEXT NOT NULL,
    chosen_option TEXT NOT NULL,
    rationale TEXT NOT NULL,
    threat_level TEXT,
    operator_id TEXT NOT NULL,
    decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Incident Escalations
CREATE TABLE IF NOT EXISTS incident_escalations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    incident_id TEXT NOT NULL,
    instance_id TEXT REFERENCES incident_playbook_instances(instance_id),
    escalation_rule_id TEXT NOT NULL,
    tier_level INT NOT NULL DEFAULT 1, -- Tier 1 (L1), Tier 2 (Regional), Tier 3 (Head Office)
    reason TEXT NOT NULL,
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_by TEXT,
    acknowledged_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_incident_escalations_tenant 
    ON incident_escalations(tenant_id, incident_id, triggered_at);

-- 8. Incident Comments
CREATE TABLE IF NOT EXISTS incident_comments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    incident_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    comment_text TEXT NOT NULL,
    is_internal BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Incident Assignments
CREATE TABLE IF NOT EXISTS incident_assignments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    incident_id TEXT NOT NULL,
    assigned_to_user_id TEXT NOT NULL,
    assigned_by_user_id TEXT NOT NULL,
    previous_assignee_id TEXT,
    assignment_reason TEXT,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Incident Audit Events (Immutable)
CREATE TABLE IF NOT EXISTS incident_audit_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    incident_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    previous_state JSONB,
    new_state JSONB,
    details JSONB DEFAULT '{}'::jsonb,
    source_ip TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_audit_tenant_incident 
    ON incident_audit_events(tenant_id, incident_id, occurred_at);

-- 11. Durable Incident Escalation Jobs
CREATE TABLE IF NOT EXISTS incident_escalation_jobs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    incident_id TEXT NOT NULL,
    rule_id TEXT NOT NULL,
    trigger_at TIMESTAMPTZ NOT NULL,
    state TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, LOCKED, EXECUTED, CANCELLED, FAILED
    retry_count INT NOT NULL DEFAULT 0,
    locked_by TEXT,
    locked_until TIMESTAMPTZ,
    idempotency_key TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    executed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_incident_escalation_jobs_due 
    ON incident_escalation_jobs(state, trigger_at) 
    WHERE state = 'PENDING';

-- 12. Guaranteed Seeding of Standard Banking SOPs
-- 12.1 P1 Vault Intrusion & Breach Response (10-Step Mandatory Bank SOP)
INSERT INTO incident_playbook_definitions (
    id, tenant_id, branch_id, name, description, category, incident_type, severity, status, current_version, resolution_policy
) VALUES (
    'vault-intrusion-p1',
    'global',
    NULL,
    'P1 Vault Intrusion & Breach Response',
    'Mandatory 10-step enterprise SOP for after-hours vault alarms, physical intrusion or human motion.',
    'banking_security',
    'VAULT_INTRUSION',
    'P1',
    'ACTIVE',
    1,
    '{"requireMandatorySteps": true, "allowOverride": true, "requireClassification": true, "requireRootCause": true}'::jsonb
) ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    status = 'ACTIVE',
    updated_at = NOW();

-- Steps for P1 Vault Intrusion
INSERT INTO incident_playbook_steps (id, definition_id, step_order, type, title, description, mandatory, evidence_requirements)
VALUES 
('vlt-step-1', 'vault-intrusion-p1', 1, 'LIVE_VIDEO_REVIEW', 'Verify Live Camera Stream', 'Open live stream for primary and secondary vault cameras to inspect scene.', true, '{"requireLiveVerification": true}'::jsonb),
('vlt-step-2', 'vault-intrusion-p1', 2, 'EVIDENCE_REVIEW', 'Review -15s/+30s Evidence Clip', 'Review pre-alarm and post-alarm evidence clip and snapshot to determine ingress.', true, '{"videoBeforeSeconds": 15, "videoAfterSeconds": 30, "snapshotRequired": true}'::jsonb),
('vlt-step-3', 'vault-intrusion-p1', 3, 'AUTOMATED_CHECK', 'Verify Branch Opening Status', 'System verifies branch business hours, holiday schedule, and opening status.', true, '{}'::jsonb),
('vlt-step-4', 'vault-intrusion-p1', 4, 'AUTOMATED_CHECK', 'Inspect Access-Control Events', 'Query biometric/card reader logs for authorized entries in previous 15 minutes.', true, '{}'::jsonb),
('vlt-step-5', 'vault-intrusion-p1', 5, 'EXTERNAL_CALL', 'Call Branch Manager', 'Call primary branch manager or keyholder to confirm if activity is authorized.', true, '{}'::jsonb),
('vlt-step-6', 'vault-intrusion-p1', 6, 'NOTIFICATION', 'Notify Regional Manager', 'Dispatch immediate high-priority alert to Regional Security Head.', true, '{}'::jsonb),
('vlt-step-7', 'vault-intrusion-p1', 7, 'ESCALATION', 'Escalate if Unacknowledged Within SLA', 'Automated trigger to Head Office SOC if branch manager does not acknowledge.', true, '{}'::jsonb),
('vlt-step-8', 'vault-intrusion-p1', 8, 'DECISION', 'Classify Incident', 'Operator records structured breach classification and threat level.', true, '{}'::jsonb),
('vlt-step-9', 'vault-intrusion-p1', 9, 'EVIDENCE_CAPTURE', 'Capture Evidence', 'Cryptographically seal forensic footage package into immutable evidence vault.', true, '{}'::jsonb),
('vlt-step-10', 'vault-intrusion-p1', 10, 'RESOLUTION_GATE', 'Mandatory Closure Reason', 'Enforce mandatory signoff with verified resolution reason and supervisor approval.', true, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Initial snapshot version for Vault Intrusion
INSERT INTO incident_playbook_versions (
    id, definition_id, version, definition_snapshot, steps_snapshot, checksum_sha256, published_by
) VALUES (
    'vault-intrusion-p1:v1',
    'vault-intrusion-p1',
    1,
    '{"id": "vault-intrusion-p1", "name": "P1 Vault Intrusion & Breach Response", "severity": "P1"}'::jsonb,
    '[{"step": 1, "title": "Verify Live Camera Stream"}, {"step": 2, "title": "Review -15s/+30s Evidence Clip"}, {"step": 3, "title": "Verify Branch Opening Status"}, {"step": 4, "title": "Inspect Access-Control Events"}, {"step": 5, "title": "Call Branch Manager"}, {"step": 6, "title": "Notify Regional Manager"}, {"step": 7, "title": "Escalate if Unacknowledged Within SLA"}, {"step": 8, "title": "Classify Incident"}, {"step": 9, "title": "Capture Evidence"}, {"step": 10, "title": "Mandatory Closure Reason"}]'::jsonb,
    'a9f8c614b102874136e05391d1e4e1a0df91b29a28c119e7a77e81404e3ab829',
    'system_seed'
) ON CONFLICT (definition_id, version) DO NOTHING;
