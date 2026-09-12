-- Migration 126: Durable Notification Platform Engine
-- Enterprise-grade, restart-safe notification persistence, shift schedules, and delivery tracking.

CREATE TABLE IF NOT EXISTS notification_jobs (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    alert_id VARCHAR(64) NOT NULL,
    incident_id VARCHAR(64),
    channel VARCHAR(32) NOT NULL,
    priority VARCHAR(16) NOT NULL,
    recipient_id VARCHAR(64),
    recipient_name VARCHAR(255),
    destination VARCHAR(512) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    next_attempt_at TIMESTAMPTZ,
    provider VARCHAR(64),
    provider_message_id VARCHAR(255),
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    locked_by VARCHAR(64),
    locked_until TIMESTAMPTZ,
    processing_started_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancel_reason TEXT,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_jobs_status_next_attempt 
    ON notification_jobs (status, next_attempt_at) 
    WHERE status IN ('PENDING', 'PROCESSING');

CREATE INDEX IF NOT EXISTS idx_notification_jobs_tenant_alert 
    ON notification_jobs (tenant_id, alert_id);

CREATE INDEX IF NOT EXISTS idx_notification_jobs_idempotency 
    ON notification_jobs (idempotency_key);

CREATE TABLE IF NOT EXISTS notification_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id VARCHAR(64) NOT NULL REFERENCES notification_jobs(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    provider VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL,
    error_code VARCHAR(64),
    error_message TEXT,
    latency_ms NUMERIC(10, 2),
    response_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_attempts_job 
    ON notification_attempts (job_id, attempt_number);

CREATE TABLE IF NOT EXISTS notification_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id VARCHAR(64) NOT NULL REFERENCES notification_jobs(id) ON DELETE CASCADE,
    provider_message_id VARCHAR(255) NOT NULL,
    delivery_status VARCHAR(32) NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    raw_receipt JSONB
);

CREATE INDEX IF NOT EXISTS idx_notification_receipts_provider_msg 
    ON notification_receipts (provider_message_id);

CREATE TABLE IF NOT EXISTS notification_dead_letters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id VARCHAR(64) NOT NULL REFERENCES notification_jobs(id) ON DELETE CASCADE,
    tenant_id VARCHAR(64) NOT NULL,
    reason TEXT NOT NULL,
    failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notification_dead_letters_tenant 
    ON notification_dead_letters (tenant_id, failed_at);

CREATE TABLE IF NOT EXISTS notification_templates (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    name VARCHAR(128) NOT NULL,
    channel VARCHAR(32) NOT NULL,
    locale VARCHAR(16) NOT NULL DEFAULT 'en-US',
    subject_template TEXT,
    body_template TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_notification_template_tenant_name_channel UNIQUE (tenant_id, name, channel, locale)
);

CREATE TABLE IF NOT EXISTS notification_shifts (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    branch_id VARCHAR(64),
    shift_name VARCHAR(128) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    days_of_week INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5}',
    timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_shifts_branch 
    ON notification_shifts (tenant_id, branch_id);

CREATE TABLE IF NOT EXISTS notification_roster (
    id VARCHAR(64) PRIMARY KEY,
    shift_id VARCHAR(64) NOT NULL REFERENCES notification_shifts(id) ON DELETE CASCADE,
    tenant_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    role VARCHAR(64) NOT NULL,
    effective_date DATE NOT NULL,
    is_on_call BOOLEAN NOT NULL DEFAULT false,
    status VARCHAR(32) NOT NULL DEFAULT 'SCHEDULED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_roster_shift_date 
    ON notification_roster (shift_id, effective_date, is_on_call);

CREATE TABLE IF NOT EXISTS notification_on_call (
    id VARCHAR(64) PRIMARY KEY,
    schedule_key VARCHAR(128) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    priority INTEGER NOT NULL DEFAULT 1,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_on_call_lookup 
    ON notification_on_call (schedule_key, starts_at, ends_at) 
    WHERE enabled = true;
