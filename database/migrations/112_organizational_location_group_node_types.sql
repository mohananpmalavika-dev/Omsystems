-- Kept separate from the rules migration because PostgreSQL requires enum
-- additions to commit before a later migration can use them.
ALTER TYPE resource_node_type ADD VALUE IF NOT EXISTS 'building';
ALTER TYPE resource_node_type ADD VALUE IF NOT EXISTS 'location-group';
