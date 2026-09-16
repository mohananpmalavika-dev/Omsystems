-- ============================================================================
-- Rate Limit Counters Table
-- ============================================================================
-- Stores rate limit counters for API rate limiting
-- Used as fallback when Redis is unavailable

CREATE TABLE IF NOT EXISTS rate_limit_counters (
    key VARCHAR(255) PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_rate_limit_counters_expires_at 
    ON rate_limit_counters(expires_at);

-- Auto-cleanup old entries
CREATE OR REPLACE FUNCTION cleanup_expired_rate_limits()
RETURNS void AS $$
BEGIN
    DELETE FROM rate_limit_counters WHERE expires_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_rate_limit_counter_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_rate_limit_counter_timestamp
    BEFORE UPDATE ON rate_limit_counters
    FOR EACH ROW
    EXECUTE FUNCTION update_rate_limit_counter_timestamp();

-- Comment
COMMENT ON TABLE rate_limit_counters IS 'Stores rate limit counters for API throttling';
