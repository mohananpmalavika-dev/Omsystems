-- Migration 010: Flexible Multi-Tier Organizational Hierarchy
-- Allows enterprise flexibility: Company -> HQ/Zone/Region/Area/Branch

-- Insert all valid hierarchy combinations
INSERT INTO organizational_hierarchy_rules (parent_type, child_type, is_valid, display_order)
VALUES
  ('company', 'headquarters', true, 1),
  ('company', 'zone', true, 2),
  ('company', 'region', true, 3),
  ('company', 'area', true, 4),
  ('company', 'branch', true, 5),
  ('company', 'division', true, 6),
  
  ('headquarters', 'zone', true, 1),
  ('headquarters', 'region', true, 2),
  ('headquarters', 'area', true, 3),
  ('headquarters', 'branch', true, 4),

  ('division', 'zone', true, 1),
  ('division', 'region', true, 2),
  ('division', 'area', true, 3),
  ('division', 'branch', true, 4),
  
  ('zone', 'region', true, 1),
  ('zone', 'area', true, 2),
  ('zone', 'branch', true, 3),
  
  ('region', 'area', true, 1),
  ('region', 'branch', true, 2),
  
  ('area', 'branch', true, 1),
  
  ('branch', 'camera-group', true, 1),
  ('branch', 'camera', true, 2),
  ('camera-group', 'camera', true, 1)
ON CONFLICT (parent_type, child_type) 
DO UPDATE SET is_valid = EXCLUDED.is_valid, display_order = EXCLUDED.display_order;

-- Update trigger validation function to support flexible multi-tier tree
CREATE OR REPLACE FUNCTION validate_resource_node_hierarchy()
RETURNS TRIGGER AS $$
DECLARE
  parent_node_type resource_node_type;
  is_relationship_valid boolean;
BEGIN
  IF NEW.parent_id IS NULL THEN
    IF NEW.node_type != 'company' THEN
      RAISE EXCEPTION 'Only company nodes can be root nodes';
    END IF;
    RETURN NEW;
  END IF;

  SELECT node_type INTO parent_node_type
  FROM resource_nodes
  WHERE id = NEW.parent_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent node not found';
  END IF;

  -- Allow standard enterprise hierarchy paths
  IF (parent_node_type = 'company' AND NEW.node_type IN ('headquarters', 'zone', 'region', 'area', 'branch', 'division')) OR
     (parent_node_type IN ('headquarters', 'division') AND NEW.node_type IN ('zone', 'region', 'area', 'branch')) OR
     (parent_node_type = 'zone' AND NEW.node_type IN ('region', 'area', 'branch')) OR
     (parent_node_type = 'region' AND NEW.node_type IN ('area', 'branch')) OR
     (parent_node_type = 'area' AND NEW.node_type = 'branch') OR
     (parent_node_type = 'branch' AND NEW.node_type IN ('camera-group', 'camera')) OR
     (parent_node_type = 'camera-group' AND NEW.node_type = 'camera') THEN
    RETURN NEW;
  END IF;

  SELECT is_valid INTO is_relationship_valid
  FROM organizational_hierarchy_rules
  WHERE parent_type = parent_node_type
    AND child_type = NEW.node_type
    AND is_valid = true;

  IF NOT FOUND OR NOT is_relationship_valid THEN
    RAISE EXCEPTION 'Invalid hierarchy: % cannot be a child of %', 
      NEW.node_type, parent_node_type;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
