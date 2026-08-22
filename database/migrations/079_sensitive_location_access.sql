-- Location-level visibility and access controls.
ALTER TABLE resource_nodes
  ADD COLUMN IF NOT EXISTS is_sensitive boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sensitivity_level text NOT NULL DEFAULT 'normal'
    CHECK (sensitivity_level IN ('normal', 'restricted', 'highly_restricted'));

CREATE INDEX IF NOT EXISTS resource_nodes_sensitive_idx
  ON resource_nodes (tenant_id, is_sensitive)
  WHERE is_sensitive = true;

INSERT INTO organizational_hierarchy_rules (parent_type, child_type, is_valid, display_order)
VALUES
  ('branch', 'floor', true, 3),
  ('floor', 'location', true, 1),
  ('branch', 'location', true, 4),
  ('location', 'camera-group', true, 1),
  ('location', 'camera', true, 2)
ON CONFLICT (parent_type, child_type)
DO UPDATE SET is_valid = EXCLUDED.is_valid, display_order = EXCLUDED.display_order;

CREATE OR REPLACE FUNCTION validate_resource_node_hierarchy()
RETURNS TRIGGER AS $$
DECLARE
  parent_node_type text;
BEGIN
  IF NEW.parent_id IS NULL THEN
    IF NEW.node_type <> 'company' THEN
      RAISE EXCEPTION 'Only company nodes can be root nodes';
    END IF;
    RETURN NEW;
  END IF;

  SELECT node_type::text INTO parent_node_type FROM resource_nodes WHERE id = NEW.parent_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parent node not found'; END IF;

  IF (parent_node_type = 'company' AND NEW.node_type::text IN ('headquarters', 'zone', 'region', 'area', 'branch', 'division')) OR
     (parent_node_type IN ('headquarters', 'division') AND NEW.node_type::text IN ('zone', 'region', 'area', 'branch')) OR
     (parent_node_type = 'zone' AND NEW.node_type::text IN ('region', 'area', 'branch')) OR
     (parent_node_type = 'region' AND NEW.node_type::text IN ('area', 'branch')) OR
     (parent_node_type = 'area' AND NEW.node_type::text = 'branch') OR
     (parent_node_type = 'branch' AND NEW.node_type::text IN ('camera-group', 'camera', 'floor', 'location')) OR
     (parent_node_type = 'floor' AND NEW.node_type::text = 'location') OR
     (parent_node_type = 'location' AND NEW.node_type::text IN ('camera-group', 'camera')) OR
     (parent_node_type = 'camera-group' AND NEW.node_type::text = 'camera') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid hierarchy: % cannot be a child of %', NEW.node_type, parent_node_type;
END;
$$ LANGUAGE plpgsql;

COMMENT ON COLUMN resource_nodes.is_sensitive IS
  'Sensitive nodes require an explicit grant at the sensitive boundary; ancestor grants do not expose them.';
