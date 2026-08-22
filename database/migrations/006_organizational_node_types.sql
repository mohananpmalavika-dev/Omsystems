-- PostgreSQL requires newly-added enum values to be committed before they are
-- used by later statements. Keep this migration separate from hierarchy data.
ALTER TYPE resource_node_type ADD VALUE IF NOT EXISTS 'headquarters';
ALTER TYPE resource_node_type ADD VALUE IF NOT EXISTS 'zone';
ALTER TYPE resource_node_type ADD VALUE IF NOT EXISTS 'area';
