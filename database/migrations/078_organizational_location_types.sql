-- Add the physical location levels used by the organization hierarchy.
-- Kept separate because PostgreSQL enum values must be committed before use.
ALTER TYPE resource_node_type ADD VALUE IF NOT EXISTS 'floor';
ALTER TYPE resource_node_type ADD VALUE IF NOT EXISTS 'location';
