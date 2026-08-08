-- Migration: WebSocket Authentication Support
-- Description: Ensures database schema supports WebSocket authentication and permissions
-- Date: 2025-02-08

-- Ensure user_branch_assignments table exists with proper indexes
CREATE TABLE IF NOT EXISTS user_branch_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMP NOT NULL DEFAULT now(),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(user_id, branch_id)
);

-- Index for fast user permission lookups
CREATE INDEX IF NOT EXISTS idx_user_branch_assignments_user_id 
ON user_branch_assignments(user_id);

-- Index for branch-based queries
CREATE INDEX IF NOT EXISTS idx_user_branch_assignments_branch_id 
ON user_branch_assignments(branch_id);

-- Ensure global_user_sessions table exists for session validation
CREATE TABLE IF NOT EXISTS global_user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  global_user_id UUID NOT NULL,
  token_hash TEXT NOT NULL,
  originating_server_id UUID,
  valid_on_servers UUID[],
  issued_at TIMESTAMP NOT NULL DEFAULT now(),
  expires_at TIMESTAMP NOT NULL,
  last_used_at TIMESTAMP NOT NULL DEFAULT now(),
  revoked_at TIMESTAMP,
  revoked_reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Index for fast session lookups
CREATE INDEX IF NOT EXISTS idx_global_user_sessions_id 
ON global_user_sessions(id) WHERE revoked_at IS NULL;

-- Index for user session queries
CREATE INDEX IF NOT EXISTS idx_global_user_sessions_user 
ON global_user_sessions(global_user_id) WHERE revoked_at IS NULL;

-- Index for session cleanup
CREATE INDEX IF NOT EXISTS idx_global_user_sessions_expires 
ON global_user_sessions(expires_at) WHERE revoked_at IS NULL;

-- Ensure users table has status column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'status'
  ) THEN
    ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
  END IF;
END $$;

-- Index for active user lookups
CREATE INDEX IF NOT EXISTS idx_users_tenant_status 
ON users(tenant_id, status);

-- Ensure branches table has region and status columns
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'branches' AND column_name = 'region'
  ) THEN
    ALTER TABLE branches ADD COLUMN region TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'branches' AND column_name = 'status'
  ) THEN
    ALTER TABLE branches ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
  END IF;
END $$;

-- Index for region-based queries
CREATE INDEX IF NOT EXISTS idx_branches_region 
ON branches(tenant_id, region) WHERE region IS NOT NULL;

-- Index for active branches
CREATE INDEX IF NOT EXISTS idx_branches_status 
ON branches(tenant_id, status);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for user_branch_assignments
DROP TRIGGER IF EXISTS update_user_branch_assignments_updated_at ON user_branch_assignments;
CREATE TRIGGER update_user_branch_assignments_updated_at
BEFORE UPDATE ON user_branch_assignments
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE user_branch_assignments IS 'Stores user access permissions for specific branches';
COMMENT ON TABLE global_user_sessions IS 'Stores active user sessions for authentication and WebSocket validation';
COMMENT ON COLUMN users.status IS 'User account status: active, suspended, inactive, deleted';
COMMENT ON COLUMN branches.region IS 'Geographic region identifier for branch grouping';
COMMENT ON COLUMN branches.status IS 'Branch operational status: active, inactive, maintenance';

-- Grant appropriate permissions (adjust role names as needed)
-- GRANT SELECT ON user_branch_assignments TO app_user;
-- GRANT SELECT ON global_user_sessions TO app_user;
-- GRANT SELECT ON users TO app_user;
-- GRANT SELECT ON branches TO app_user;

COMMIT;
