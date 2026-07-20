-- Organizational Hierarchy Enhancement
-- Adds HQ (headquarters), Zone, and Area levels to the existing hierarchy
-- Company -> HQ -> Zone -> Region -> Area -> Branch

-- Create a table to track the organizational hierarchy rules
CREATE TABLE organizational_hierarchy_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_type resource_node_type NOT NULL,
  child_type resource_node_type NOT NULL,
  is_valid boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parent_type, child_type)
);

-- Insert valid hierarchy relationships
INSERT INTO organizational_hierarchy_rules (parent_type, child_type, is_valid, display_order)
VALUES
  ('company', 'headquarters', true, 1),
  ('company', 'division', true, 2), -- Keep for backward compatibility
  ('headquarters', 'zone', true, 1),
  ('zone', 'region', true, 1),
  ('region', 'area', true, 1),
  ('area', 'branch', true, 1),
  ('branch', 'camera-group', true, 1),
  ('camera-group', 'camera', true, 1),
  ('branch', 'camera', true, 2), -- Direct branch to camera relationship
  -- Legacy paths for backward compatibility
  ('division', 'region', true, 3),
  ('region', 'branch', true, 3)
ON CONFLICT (parent_type, child_type) DO NOTHING;

-- Create function to validate hierarchy before insert/update
CREATE OR REPLACE FUNCTION validate_resource_node_hierarchy()
RETURNS TRIGGER AS $$
DECLARE
  parent_node_type resource_node_type;
  is_relationship_valid boolean;
BEGIN
  -- Root nodes (company) don't need validation
  IF NEW.parent_id IS NULL THEN
    IF NEW.node_type != 'company' THEN
      RAISE EXCEPTION 'Only company nodes can be root nodes';
    END IF;
    RETURN NEW;
  END IF;

  -- Get parent node type
  SELECT node_type INTO parent_node_type
  FROM resource_nodes
  WHERE id = NEW.parent_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent node not found';
  END IF;

  -- Check if this parent-child relationship is valid
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

-- Apply validation trigger
CREATE TRIGGER enforce_hierarchy_rules
  BEFORE INSERT OR UPDATE ON resource_nodes
  FOR EACH ROW
  EXECUTE FUNCTION validate_resource_node_hierarchy();

-- Add metadata columns to resource_nodes for better organization management
ALTER TABLE resource_nodes
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS address jsonb,
  ADD COLUMN IF NOT EXISTS contact_info jsonb,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Create unique constraint on tenant + code
CREATE UNIQUE INDEX resource_nodes_tenant_code_idx 
  ON resource_nodes (tenant_id, code) 
  WHERE code IS NOT NULL;

-- Create index for active nodes
CREATE INDEX resource_nodes_active_idx ON resource_nodes (tenant_id, is_active);

-- Function to get full hierarchy path for a node
CREATE OR REPLACE FUNCTION get_node_hierarchy_path(node_id uuid)
RETURNS TABLE (
  id uuid,
  node_type resource_node_type,
  name text,
  code text,
  level integer
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE hierarchy AS (
    -- Base case: start with the given node
    SELECT 
      rn.id,
      rn.node_type,
      rn.name,
      rn.code,
      rn.parent_id,
      1 as level
    FROM resource_nodes rn
    WHERE rn.id = node_id
    
    UNION ALL
    
    -- Recursive case: get parent nodes
    SELECT 
      rn.id,
      rn.node_type,
      rn.name,
      rn.code,
      rn.parent_id,
      h.level + 1
    FROM resource_nodes rn
    INNER JOIN hierarchy h ON rn.id = h.parent_id
  )
  SELECT h.id, h.node_type, h.name, h.code, h.level
  FROM hierarchy h
  ORDER BY h.level DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get all descendant nodes
CREATE OR REPLACE FUNCTION get_descendant_nodes(node_id uuid, include_inactive boolean DEFAULT false)
RETURNS TABLE (
  id uuid,
  node_type resource_node_type,
  name text,
  code text,
  path ltree,
  depth integer
) AS $$
DECLARE
  node_path ltree;
BEGIN
  -- Get the path of the starting node
  SELECT rn.path INTO node_path
  FROM resource_nodes rn
  WHERE rn.id = node_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Node not found: %', node_id;
  END IF;

  -- Return all nodes under this path
  RETURN QUERY
  SELECT 
    rn.id,
    rn.node_type,
    rn.name,
    rn.code,
    rn.path,
    nlevel(rn.path) - nlevel(node_path) as depth
  FROM resource_nodes rn
  WHERE rn.path <@ node_path
    AND rn.id != node_id
    AND (include_inactive OR rn.is_active = true)
  ORDER BY rn.path;
END;
$$ LANGUAGE plpgsql;

-- Create view for organizational hierarchy with statistics
CREATE OR REPLACE VIEW organizational_hierarchy_view AS
SELECT 
  rn.id,
  rn.tenant_id,
  rn.parent_id,
  rn.node_type,
  rn.name,
  rn.code,
  rn.path,
  rn.description,
  rn.is_active,
  nlevel(rn.path) as hierarchy_level,
  (SELECT count(*) 
   FROM resource_nodes children 
   WHERE children.parent_id = rn.id 
   AND children.is_active = true) as direct_children_count,
  (SELECT count(*) 
   FROM resource_nodes descendants 
   WHERE descendants.path <@ rn.path 
   AND descendants.id != rn.id
   AND descendants.node_type = 'branch'
   AND descendants.is_active = true) as total_branches_count,
  (SELECT count(*) 
   FROM cameras c
   JOIN resource_nodes cn ON c.resource_node_id = cn.id
   WHERE cn.path <@ rn.path
   AND c.status != 'offline') as active_cameras_count,
  rn.created_at,
  rn.updated_at
FROM resource_nodes rn;

-- Update trigger for updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_resource_nodes_updated_at
  BEFORE UPDATE ON resource_nodes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE organizational_hierarchy_rules IS 
  'Defines valid parent-child relationships in the organizational hierarchy';

COMMENT ON FUNCTION get_node_hierarchy_path IS 
  'Returns the full path from a node up to the root company node';

COMMENT ON FUNCTION get_descendant_nodes IS 
  'Returns all nodes below the specified node in the hierarchy';

COMMENT ON VIEW organizational_hierarchy_view IS 
  'Consolidated view of organizational structure with statistics';

COMMENT ON COLUMN resource_nodes.code IS 
  'Unique alphanumeric code for the organizational unit (e.g., HQ001, Z01, R001)';

COMMENT ON COLUMN resource_nodes.address IS 
  'JSON object containing address fields: street, city, state, postal_code, country';

COMMENT ON COLUMN resource_nodes.contact_info IS 
  'JSON object containing contact details: phone, email, contact_person';
