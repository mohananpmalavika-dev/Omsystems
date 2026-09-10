INSERT INTO organizational_hierarchy_rules (parent_type, child_type, is_valid, display_order)
VALUES
  ('branch', 'building', true, 3), ('branch', 'floor', true, 4),
  ('branch', 'location', true, 5), ('branch', 'location-group', true, 6),
  ('building', 'floor', true, 1), ('building', 'location', true, 2),
  ('building', 'location-group', true, 3), ('floor', 'location', true, 1),
  ('floor', 'location-group', true, 2), ('location', 'location-group', true, 1),
  ('location', 'camera-group', true, 2), ('location-group', 'camera-group', true, 1)
ON CONFLICT (parent_type, child_type)
DO UPDATE SET is_valid = EXCLUDED.is_valid, display_order = EXCLUDED.display_order;
