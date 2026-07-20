-- Seed standard CCTV infrastructure requirements after the schema migration.
-- Populates standard camera requirements for different location types

-- This migration adds standard requirements for each location type that should
-- be applied to all branches. Actual branches can override these as needed.

-- Standard camera requirements template
-- Priority: 1 (Critical), 2 (High), 3 (Important), 4 (Standard), 5 (Optional)

-- Note: This is a template. In production, these requirements should be
-- inserted for each branch_node_id as branches are created.

-- Example: Insert standard requirements for a branch
-- Replace <branch_node_id> with actual UUID from resource_nodes table

/*
-- Critical locations (Priority 1-2)

-- Branch Entrance
INSERT INTO branch_camera_requirements (
  branch_node_id, location_type, required_count, actual_count,
  min_resolution_mp, min_frame_rate, requires_night_vision, requires_audio,
  requires_ptz, requires_lpr, priority, is_regulatory_requirement, 
  compliance_standard, notes
) VALUES (
  '<branch_node_id>', 'branch-entrance', 1, 0,
  2.0, 25, true, false, false, false, 1, true,
  'Banking Security Standards 2024',
  'Must capture face-level entry and exit, wide-angle coverage'
);

-- Branch Exit
INSERT INTO branch_camera_requirements (
  branch_node_id, location_type, required_count, actual_count,
  min_resolution_mp, min_frame_rate, requires_night_vision, requires_audio,
  requires_ptz, requires_lpr, priority, is_regulatory_requirement, 
  compliance_standard, notes
) VALUES (
  '<branch_node_id>', 'branch-exit', 1, 0,
  2.0, 25, true, false, false, false, 1, true,
  'Banking Security Standards 2024',
  'Must capture all personnel and customer exits'
);

-- Cash Counter
INSERT INTO branch_camera_requirements (
  branch_node_id, location_type, required_count, actual_count,
  min_resolution_mp, min_frame_rate, requires_night_vision, requires_audio,
  requires_ptz, requires_lpr, priority, is_regulatory_requirement, 
  compliance_standard, notes
) VALUES (
  '<branch_node_id>', 'cash-counter', 2, 0,
  2.0, 30, false, true, true, false, 1, true,
  'Banking Security Standards 2024',
  'Multiple angles required: overhead and face-level views. PTZ recommended for focused transaction monitoring.'
);

-- Strong Room/Vault
INSERT INTO branch_camera_requirements (
  branch_node_id, location_type, required_count, actual_count,
  min_resolution_mp, min_frame_rate, requires_night_vision, requires_audio,
  requires_ptz, requires_lpr, priority, is_regulatory_requirement, 
  compliance_standard, notes
) VALUES (
  '<branch_node_id>', 'strong-room', 1, 0,
  2.0, 30, true, false, false, false, 1, true,
  'Banking Security Standards 2024',
  '24/7 continuous recording, 90+ day retention, complete room coverage'
);

-- ATM Cabin
INSERT INTO branch_camera_requirements (
  branch_node_id, location_type, required_count, actual_count,
  min_resolution_mp, min_frame_rate, requires_night_vision, requires_audio,
  requires_ptz, requires_lpr, priority, is_regulatory_requirement, 
  compliance_standard, notes
) VALUES (
  '<branch_node_id>', 'atm-cabin', 1, 0,
  2.0, 25, true, false, false, false, 2, true,
  'ATM Security Guidelines 2024',
  'WDR required for varying lighting, vandal-resistant housing'
);

-- Important locations (Priority 3)

-- Manager Cabin
INSERT INTO branch_camera_requirements (
  branch_node_id, location_type, required_count, actual_count,
  min_resolution_mp, min_frame_rate, requires_night_vision, requires_audio,
  requires_ptz, requires_lpr, priority, is_regulatory_requirement, 
  compliance_standard, notes
) VALUES (
  '<branch_node_id>', 'manager-cabin', 1, 0,
  2.0, 25, false, false, false, false, 3, false,
  NULL,
  'Privacy mode may be required during non-business hours'
);

-- Locker Room
INSERT INTO branch_camera_requirements (
  branch_node_id, location_type, required_count, actual_count,
  min_resolution_mp, min_frame_rate, requires_night_vision, requires_audio,
  requires_ptz, requires_lpr, priority, is_regulatory_requirement, 
  compliance_standard, notes
) VALUES (
  '<branch_node_id>', 'locker-room', 1, 0,
  2.0, 25, false, false, false, false, 3, false,
  NULL,
  'Cover entry/exit and corridors only, not individual lockers'
);

-- Server Room
INSERT INTO branch_camera_requirements (
  branch_node_id, location_type, required_count, actual_count,
  min_resolution_mp, min_frame_rate, requires_night_vision, requires_audio,
  requires_ptz, requires_lpr, priority, is_regulatory_requirement, 
  compliance_standard, notes
) VALUES (
  '<branch_node_id>', 'server-room', 1, 0,
  2.0, 25, true, false, false, false, 3, true,
  'IT Security Policy',
  'Monitor rack access, integrate with environmental sensors'
);

-- Standard locations (Priority 4)

-- Parking Area
INSERT INTO branch_camera_requirements (
  branch_node_id, location_type, required_count, actual_count,
  min_resolution_mp, min_frame_rate, requires_night_vision, requires_audio,
  requires_ptz, requires_lpr, priority, is_regulatory_requirement, 
  compliance_standard, notes
) VALUES (
  '<branch_node_id>', 'parking-area', 2, 0,
  2.0, 15, true, false, false, true, 4, false,
  NULL,
  'LPR capability for vehicle tracking, wide coverage'
);

-- Perimeter Fence
INSERT INTO branch_camera_requirements (
  branch_node_id, location_type, required_count, actual_count,
  min_resolution_mp, min_frame_rate, requires_night_vision, requires_audio,
  requires_ptz, requires_lpr, priority, is_regulatory_requirement, 
  compliance_standard, notes
) VALUES (
  '<branch_node_id>', 'perimeter-fence', 2, 0,
  2.0, 15, true, false, false, false, 4, false,
  NULL,
  'Long-range IR (50m+), overlapping coverage zones'
);

-- Staircase
INSERT INTO branch_camera_requirements (
  branch_node_id, location_type, required_count, actual_count,
  min_resolution_mp, min_frame_rate, requires_night_vision, requires_audio,
  requires_ptz, requires_lpr, priority, is_regulatory_requirement, 
  compliance_standard, notes
) VALUES (
  '<branch_node_id>', 'staircase', 1, 0,
  2.0, 25, false, false, false, false, 4, false,
  NULL,
  'Wide-angle lens, top and bottom coverage'
);

-- Corridor
INSERT INTO branch_camera_requirements (
  branch_node_id, location_type, required_count, actual_count,
  min_resolution_mp, min_frame_rate, requires_night_vision, requires_audio,
  requires_ptz, requires_lpr, priority, is_regulatory_requirement, 
  compliance_standard, notes
) VALUES (
  '<branch_node_id>', 'corridor', 1, 0,
  2.0, 25, false, false, false, false, 4, false,
  NULL,
  'Full corridor coverage, minimal blind spots'
);

-- Lobby/Teller Area
INSERT INTO branch_camera_requirements (
  branch_node_id, location_type, required_count, actual_count,
  min_resolution_mp, min_frame_rate, requires_night_vision, requires_audio,
  requires_ptz, requires_lpr, priority, is_regulatory_requirement, 
  compliance_standard, notes
) VALUES (
  '<branch_node_id>', 'lobby', 1, 0,
  2.0, 25, false, false, false, false, 3, false,
  NULL,
  'Wide coverage of customer waiting area'
);
*/

-- Function to populate standard requirements for a new branch
CREATE OR REPLACE FUNCTION populate_branch_camera_requirements(
  p_branch_node_id uuid
)
RETURNS void AS $$
BEGIN
  -- Critical locations (Priority 1-2)
  
  INSERT INTO branch_camera_requirements (
    branch_node_id, location_type, required_count, actual_count,
    min_resolution_mp, min_frame_rate, requires_night_vision, requires_audio,
    requires_ptz, requires_lpr, priority, is_regulatory_requirement, 
    compliance_standard, notes
  ) VALUES 
  -- Branch Entrance
  (
    p_branch_node_id, 'branch-entrance', 1, 0,
    2.0, 25, true, false, false, false, 1, true,
    'Banking Security Standards 2024',
    'Must capture face-level entry and exit, wide-angle coverage'
  ),
  -- Branch Exit
  (
    p_branch_node_id, 'branch-exit', 1, 0,
    2.0, 25, true, false, false, false, 1, true,
    'Banking Security Standards 2024',
    'Must capture all personnel and customer exits'
  ),
  -- Cash Counter
  (
    p_branch_node_id, 'cash-counter', 2, 0,
    2.0, 30, false, true, true, false, 1, true,
    'Banking Security Standards 2024',
    'Multiple angles: overhead and face-level. PTZ recommended.'
  ),
  -- Strong Room/Vault
  (
    p_branch_node_id, 'strong-room', 1, 0,
    2.0, 30, true, false, false, false, 1, true,
    'Banking Security Standards 2024',
    '24/7 recording, 90+ day retention, full coverage'
  ),
  -- ATM Cabin
  (
    p_branch_node_id, 'atm-cabin', 1, 0,
    2.0, 25, true, false, false, false, 2, true,
    'ATM Security Guidelines 2024',
    'WDR required, vandal-resistant housing'
  ),
  
  -- Important locations (Priority 3)
  
  -- Manager Cabin
  (
    p_branch_node_id, 'manager-cabin', 1, 0,
    2.0, 25, false, false, false, false, 3, false,
    NULL,
    'Privacy mode during non-business hours if required'
  ),
  -- Locker Room
  (
    p_branch_node_id, 'locker-room', 1, 0,
    2.0, 25, false, false, false, false, 3, false,
    NULL,
    'Cover entry/corridors only, not individual lockers'
  ),
  -- Server Room
  (
    p_branch_node_id, 'server-room', 1, 0,
    2.0, 25, true, false, false, false, 3, true,
    'IT Security Policy',
    'Monitor rack access, integrate with environmental sensors'
  ),
  
  -- Standard locations (Priority 4)
  
  -- Parking Area
  (
    p_branch_node_id, 'parking-area', 2, 0,
    2.0, 15, true, false, false, true, 4, false,
    NULL,
    'LPR capability for vehicle tracking, wide coverage'
  ),
  -- Perimeter Fence
  (
    p_branch_node_id, 'perimeter-fence', 2, 0,
    2.0, 15, true, false, false, false, 4, false,
    NULL,
    'Long-range IR (50m+), overlapping zones'
  ),
  -- Staircase
  (
    p_branch_node_id, 'staircase', 1, 0,
    2.0, 25, false, false, false, false, 4, false,
    NULL,
    'Wide-angle lens, top and bottom coverage'
  ),
  -- Corridor
  (
    p_branch_node_id, 'corridor', 1, 0,
    2.0, 25, false, false, false, false, 4, false,
    NULL,
    'Full corridor coverage, minimal blind spots'
  ),
  -- Lobby
  (
    p_branch_node_id, 'lobby', 1, 0,
    2.0, 25, false, false, false, false, 3, false,
    NULL,
    'Wide coverage of customer waiting area'
  )
  ON CONFLICT (branch_node_id, location_type) DO NOTHING;
  
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION populate_branch_camera_requirements IS 
  'Populates standard camera requirements for a new branch based on location types';

-- Example usage (commented out - run manually for specific branches):
/*
-- Get branch node IDs
SELECT id, name, node_type 
FROM resource_nodes 
WHERE node_type = 'branch';

-- Populate requirements for a specific branch
SELECT populate_branch_camera_requirements('<branch_uuid>');

-- Or populate for all branches that don't have requirements yet
DO $$
DECLARE
  branch_record RECORD;
BEGIN
  FOR branch_record IN 
    SELECT id FROM resource_nodes WHERE node_type = 'branch'
  LOOP
    PERFORM populate_branch_camera_requirements(branch_record.id);
  END LOOP;
END $$;
*/
