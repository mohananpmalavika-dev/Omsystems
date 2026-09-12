-- Migration 132: Transactional Outbox, Idempotent Inbox, and Central Immutable Audit Platform
-- Enterprise reliability, exactly-once event publication, and hash-chained audit ledger.

CREATE TABLE IF NOT EXISTS event_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id VARCHAR(64) NOT NULL UNIQUE,
    tenant_id VARCHAR(64) NOT NULL,
    aggregate_type VARCHAR(64) NOT NULL,
    aggregate_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    schema_version VARCHAR(16) NOT NULL DEFAULT '1.0.0',
    correlation_id VARCHAR(64) NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    payload JSONB NOT NULL,
    published BOOLEAN NOT NULL DEFAULT false,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_outbox_unpublished 
    ON event_outbox (published, created_at ASC) 
    WHERE published = false;

CREATE INDEX IF NOT EXISTS idx_event_outbox_tenant_aggregate 
    ON event_outbox (tenant_id, aggregate_type, aggregate_id);

CREATE TABLE IF NOT EXISTS event_inbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id VARCHAR(64) NOT NULL,
    consumer_id VARCHAR(64) NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    result VARCHAR(32) NOT NULL DEFAULT 'SUCCESS',
    CONSTRAINT uq_inbox_event_consumer UNIQUE (event_id, consumer_id)
);

CREATE INDEX IF NOT EXISTS idx_event_inbox_event 
    ON event_inbox (event_id);

CREATE TABLE IF NOT EXISTS central_audit_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    actor_id VARCHAR(64) NOT NULL,
    actor_role VARCHAR(64),
    action VARCHAR(64) NOT NULL,
    resource_type VARCHAR(64) NOT NULL,
    resource_id VARCHAR(64) NOT NULL,
    before_state JSONB,
    after_state JSONB,
    reason TEXT,
    client_ip VARCHAR(64),
    session_id VARCHAR(64),
    correlation_id VARCHAR(64) NOT NULL,
    result VARCHAR(16) NOT NULL DEFAULT 'SUCCESS',
    record_hash VARCHAR(64) NOT NULL,
    previous_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_central_audit_tenant_action 
    ON central_audit_ledger (tenant_id, action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_central_audit_resource 
    ON central_audit_ledger (resource_type, resource_id);

CREATE INDEX IF NOT EXISTS idx_central_audit_correlation 
    ON central_audit_ledger (correlation_id);
