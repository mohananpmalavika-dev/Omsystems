-- Migration 133: Production Hardening for Two-Way Audio Talkback (video.talkback)
-- Establishes durable session tracking, single-talker camera mutex leases,
-- device capability persistence, and operational telemetry.

CREATE TABLE IF NOT EXISTS talkback_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    camera_id UUID NOT NULL,
    user_id UUID NOT NULL,
    session_token_hash BYTEA NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'initiating',
    purpose VARCHAR(32) NOT NULL DEFAULT 'talk',
    adapter VARCHAR(120) NOT NULL DEFAULT 'onvif-rtsp-backchannel',
    audio_codec VARCHAR(32) DEFAULT 'PCMA',
    sample_rate INTEGER DEFAULT 8000,
    channel_count INTEGER DEFAULT 1,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    duration_ms INTEGER DEFAULT 0,
    bytes_sent BIGINT DEFAULT 0,
    packets_sent INTEGER DEFAULT 0,
    error_code VARCHAR(64),
    error_message TEXT,
    client_ip VARCHAR(64),
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS talkback_active_leases (
    camera_id UUID PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES talkback_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    lease_expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS talkback_device_capabilities (
    camera_id UUID PRIMARY KEY,
    supported BOOLEAN NOT NULL DEFAULT false,
    transport VARCHAR(64) NOT NULL DEFAULT 'none',
    codecs TEXT[] DEFAULT ARRAY['PCMA', 'PCMU']::TEXT[],
    sample_rates INTEGER[] DEFAULT ARRAY[8000]::INTEGER[],
    verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performant filtering and active lease lookups
CREATE INDEX IF NOT EXISTS idx_talkback_sessions_camera_status 
    ON talkback_sessions (camera_id, status);

CREATE INDEX IF NOT EXISTS idx_talkback_sessions_tenant_started 
    ON talkback_sessions (tenant_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_talkback_sessions_user_started 
    ON talkback_sessions (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_talkback_active_leases_expires 
    ON talkback_active_leases (lease_expires_at);
