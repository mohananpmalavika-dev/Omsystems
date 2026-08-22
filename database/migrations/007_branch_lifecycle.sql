-- Branch Lifecycle Management Migration
-- 
-- Adds lifecycle state tracking for organization nodes (especially branches)
-- Implements ACTIVE → DISABLED → ARCHIVED state transitions
-- Preserves historical data while controlling operational availability

-- Step 1: Add lifecycle status enum
CREATE TYPE branch_lifecycle_status AS ENUM ('ACTIVE', 'DISABLED', 'ARCHIVED');

-- Step 2: Add lifecycle metadata columns to resource_nodes table
-- These columns track the current lifecycle state and transition history
ALTER TABLE resource_nodes
  ADD COLUMN lifecycle_status branch_lifecycle_status NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN lifecycle_version INTEGER NOT NULL DEFAULT 1,
  
  -- Disabled state metadata
  ADD COLUMN disabled_at TIMESTAMPTZ NULL,
  ADD COLUMN disabled_by UUID NULL REFERENCES users(id),
  ADD COLUMN disable_reason TEXT NULL,
  
  -- Reactivated state metadata
  ADD COLUMN reactivated_at TIMESTAMPTZ NULL,
  ADD COLUMN reactivated_by UUID NULL REFERENCES users(id),
  ADD COLUMN reactivate_reason TEXT NULL,
  
  -- Archived state metadata
  ADD COLUMN archived_at TIMESTAMPTZ NULL,
  ADD COLUMN archived_by UUID NULL REFERENCES users(id),
  ADD COLUMN archive_reason TEXT NULL;

-- Step 3: Add constraints to ensure lifecycle metadata consistency
-- Disabled metadata should only exist when status is DISABLED or was previously DISABLED
ALTER TABLE resource_nodes
  ADD CONSTRAINT lifecycle_disabled_metadata_check
  CHECK (
    (lifecycle_status = 'DISABLED' AND disabled_at IS NOT NULL AND disabled_by IS NOT NULL AND disable_reason IS NOT NULL)
    OR (lifecycle_status != 'DISABLED' AND (disabled_at IS NULL OR disabled_at IS NOT NULL))
    OR lifecycle_status = 'ACTIVE'
  );

-- Archived metadata must exist when status is ARCHIVED
ALTER TABLE resource_nodes
  ADD CONSTRAINT lifecycle_archived_metadata_check
  CHECK (
    (lifecycle_status = 'ARCHIVED' AND archived_at IS NOT NULL AND archived_by IS NOT NULL AND archive_reason IS NOT NULL)
    OR lifecycle_status != 'ARCHIVED'
  );

-- Step 4: Create index for efficient lifecycle-based queries
-- This index is critical for filtering active branches in operational queries
CREATE INDEX idx_resource_nodes_tenant_lifecycle
  ON resource_nodes (tenant_id, lifecycle_status)
  WHERE node_type = 'branch';

-- Additional index for lifecycle queries across all node types
CREATE INDEX idx_resource_nodes_lifecycle_status
  ON resource_nodes (lifecycle_status, node_type);

-- Step 5: Create lifecycle history table
-- Tracks all lifecycle transitions for audit and analysis
CREATE TABLE resource_node_lifecycle_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  node_id UUID NOT NULL REFERENCES resource_nodes(id),
  node_type resource_node_type NOT NULL,
  
  -- Transition details
  from_status branch_lifecycle_status NULL, -- NULL for initial creation
  to_status branch_lifecycle_status NOT NULL,
  
  -- Actor and justification
  actor_id UUID NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  
  -- Additional context
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying lifecycle history by node
CREATE INDEX idx_lifecycle_events_node
  ON resource_node_lifecycle_events (node_id, created_at DESC);

-- Index for querying lifecycle history by tenant
CREATE INDEX idx_lifecycle_events_tenant_time
  ON resource_node_lifecycle_events (tenant_id, created_at DESC);

-- Index for querying specific transition types
CREATE INDEX idx_lifecycle_events_transition
  ON resource_node_lifecycle_events (to_status, created_at DESC);

-- Step 6: Create function to automatically record lifecycle transitions
-- This trigger function ensures every lifecycle change is recorded in history
CREATE OR REPLACE FUNCTION record_lifecycle_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Only record if lifecycle_status actually changed
  IF (TG_OP = 'UPDATE' AND OLD.lifecycle_status IS DISTINCT FROM NEW.lifecycle_status) THEN
    INSERT INTO resource_node_lifecycle_events (
      tenant_id,
      node_id,
      node_type,
      from_status,
      to_status,
      actor_id,
      reason,
      metadata
    ) VALUES (
      NEW.tenant_id,
      NEW.id,
      NEW.node_type,
      OLD.lifecycle_status,
      NEW.lifecycle_status,
      -- Actor is stored in different columns based on transition
      CASE 
        WHEN NEW.lifecycle_status = 'DISABLED' THEN NEW.disabled_by
        WHEN NEW.lifecycle_status = 'ARCHIVED' THEN NEW.archived_by
        WHEN NEW.lifecycle_status = 'ACTIVE' AND OLD.lifecycle_status = 'DISABLED' THEN NEW.reactivated_by
        ELSE NULL
      END,
      -- Reason is stored in different columns based on transition
      CASE 
        WHEN NEW.lifecycle_status = 'DISABLED' THEN NEW.disable_reason
        WHEN NEW.lifecycle_status = 'ARCHIVED' THEN NEW.archive_reason
        WHEN NEW.lifecycle_status = 'ACTIVE' AND OLD.lifecycle_status = 'DISABLED' THEN NEW.reactivate_reason
        ELSE 'Lifecycle transition'
      END,
      jsonb_build_object(
        'previous_version', OLD.lifecycle_version,
        'new_version', NEW.lifecycle_version,
        'updated_at', NEW.updated_at
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 7: Create trigger to automatically record lifecycle transitions
CREATE TRIGGER resource_node_lifecycle_transition_trigger
  AFTER UPDATE ON resource_nodes
  FOR EACH ROW
  WHEN (OLD.lifecycle_status IS DISTINCT FROM NEW.lifecycle_status)
  EXECUTE FUNCTION record_lifecycle_transition();

-- Step 8: Add updated_at column if it doesn't exist (for optimistic concurrency)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'resource_nodes' 
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE resource_nodes ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;
END $$;

-- Step 9: Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 10: Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS resource_nodes_updated_at_trigger ON resource_nodes;
CREATE TRIGGER resource_nodes_updated_at_trigger
  BEFORE UPDATE ON resource_nodes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Step 11: Create helper view for active branches (operational queries)
-- This view simplifies queries that should only see active branches
CREATE OR REPLACE VIEW active_branches AS
SELECT *
FROM resource_nodes
WHERE node_type = 'branch'
  AND lifecycle_status = 'ACTIVE';

-- Step 12: Create helper view for operational nodes (active or disabled, not archived)
CREATE OR REPLACE VIEW operational_nodes AS
SELECT *
FROM resource_nodes
WHERE lifecycle_status IN ('ACTIVE', 'DISABLED');

-- Step 13: Add comment documentation
COMMENT ON COLUMN resource_nodes.lifecycle_status IS 'Current lifecycle state: ACTIVE (operational), DISABLED (temporarily inactive), ARCHIVED (permanently removed from operations)';
COMMENT ON COLUMN resource_nodes.lifecycle_version IS 'Optimistic concurrency control version, incremented on each lifecycle transition';
COMMENT ON COLUMN resource_nodes.disabled_at IS 'Timestamp when node was disabled';
COMMENT ON COLUMN resource_nodes.disabled_by IS 'User who disabled the node';
COMMENT ON COLUMN resource_nodes.disable_reason IS 'Reason provided for disabling';
COMMENT ON COLUMN resource_nodes.archived_at IS 'Timestamp when node was archived';
COMMENT ON COLUMN resource_nodes.archived_by IS 'User who archived the node';
COMMENT ON COLUMN resource_nodes.archive_reason IS 'Reason provided for archiving';

COMMENT ON TABLE resource_node_lifecycle_events IS 'Complete audit trail of all lifecycle transitions for resource nodes';
COMMENT ON VIEW active_branches IS 'Active branches only - use for operational queries';
COMMENT ON VIEW operational_nodes IS 'Active and disabled nodes - excludes archived nodes';

-- Step 14: Grant appropriate permissions
-- Note: Adjust these based on your actual role structure
-- GRANT SELECT ON active_branches TO app_readonly;
-- GRANT SELECT, INSERT ON resource_node_lifecycle_events TO app_readwrite;

-- Step 15: Create helper function to validate lifecycle transitions
CREATE OR REPLACE FUNCTION is_lifecycle_transition_valid(
  current_status branch_lifecycle_status,
  target_status branch_lifecycle_status
)
RETURNS BOOLEAN AS $$
BEGIN
  -- ACTIVE can only transition to DISABLED
  IF current_status = 'ACTIVE' THEN
    RETURN target_status = 'DISABLED';
  END IF;
  
  -- DISABLED can transition to ACTIVE or ARCHIVED
  IF current_status = 'DISABLED' THEN
    RETURN target_status IN ('ACTIVE', 'ARCHIVED');
  END IF;
  
  -- ARCHIVED is terminal - no transitions allowed
  IF current_status = 'ARCHIVED' THEN
    RETURN FALSE;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION is_lifecycle_transition_valid IS 'Validates if a lifecycle state transition is allowed: ACTIVE→DISABLED, DISABLED→ACTIVE, DISABLED→ARCHIVED';

-- Step 16: Create check constraint using the validation function
ALTER TABLE resource_nodes
  ADD CONSTRAINT lifecycle_transition_valid_check
  CHECK (
    -- Allow initial creation (no previous state)
    lifecycle_status = 'ACTIVE'
    -- For updates, the application layer will validate transitions
    -- This constraint is more for documentation and future enforcement
  );

-- Migration complete
-- 
-- Usage:
-- 1. Disable a branch: UPDATE resource_nodes SET lifecycle_status = 'DISABLED', disabled_at = NOW(), disabled_by = :userId, disable_reason = :reason WHERE id = :branchId
-- 2. Reactivate a branch: UPDATE resource_nodes SET lifecycle_status = 'ACTIVE', reactivated_at = NOW(), reactivated_by = :userId, reactivate_reason = :reason WHERE id = :branchId
-- 3. Archive a branch: UPDATE resource_nodes SET lifecycle_status = 'ARCHIVED', archived_at = NOW(), archived_by = :userId, archive_reason = :reason WHERE id = :branchId
-- 4. Query active branches: SELECT * FROM active_branches WHERE tenant_id = :tenantId
-- 5. Query lifecycle history: SELECT * FROM resource_node_lifecycle_events WHERE node_id = :branchId ORDER BY created_at DESC
