-- CCTV Infrastructure Enhancement
-- Adds camera location types, installation specifications, and enhanced capabilities

-- Camera installation location types
CREATE TYPE camera_location_type AS ENUM (
  'branch-entrance',
  'branch-exit',
  'cash-counter',
  'manager-cabin',
  'strong-room',
  'vault',
  'locker-room',
  'atm-cabin',
  'parking-area',
  'perimeter-fence',
  'staircase',
  'corridor',
  'server-room',
  'lobby',
  'teller-area',
  'safe-deposit',
  'other'
);

-- Physical camera types
CREATE TYPE physical_camera_type AS ENUM (
  'dome-indoor',
  'dome-outdoor',
  'bullet-indoor',
  'bullet-outdoor',
  'ptz',
  'fixed',
  'thermal',
  'license-plate-recognition',
  'panoramic',
  'fisheye'
);

-- Environmental rating standards
CREATE TYPE weatherproof_rating AS ENUM (
  'IP20', 'IP33', 'IP44', 'IP54', 'IP65', 'IP66', 'IP67', 'IP68'
);

-- Video compression standards
CREATE TYPE video_codec AS ENUM (
  'H264', 'H265', 'H265+', 'MJPEG', 'MPEG4', 'Smart264'
);

-- Enhance cameras table with installation and technical specifications
ALTER TABLE cameras
  ADD COLUMN location_type camera_location_type,
  ADD COLUMN physical_type physical_camera_type,
  ADD COLUMN installation_date date,
  ADD COLUMN warranty_expires_at date,
  ADD COLUMN serial_number text,
  ADD COLUMN mac_address macaddr,
  ADD COLUMN firmware_version text,
  ADD COLUMN ip_address inet,
  ADD COLUMN installation_notes text;

-- Create detailed camera specifications table
CREATE TABLE camera_specifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id uuid NOT NULL UNIQUE REFERENCES cameras(id) ON DELETE CASCADE,
  
  -- Video specifications
  resolution_mp numeric(4,2) NOT NULL CHECK (resolution_mp > 0),
  resolution_width integer NOT NULL CHECK (resolution_width > 0),
  resolution_height integer NOT NULL CHECK (resolution_height > 0),
  frame_rate integer NOT NULL DEFAULT 25 CHECK (frame_rate > 0 AND frame_rate <= 120),
  video_codec video_codec NOT NULL DEFAULT 'H264',
  bitrate_kbps integer CHECK (bitrate_kbps > 0),
  
  -- Optical specifications
  field_of_view_horizontal integer CHECK (field_of_view_horizontal > 0 AND field_of_view_horizontal <= 360),
  field_of_view_vertical integer CHECK (field_of_view_vertical > 0 AND field_of_view_vertical <= 180),
  focal_length_mm numeric(5,2),
  lens_type text,
  
  -- Night vision and lighting
  has_night_vision boolean NOT NULL DEFAULT false,
  ir_distance_meters integer CHECK (ir_distance_meters >= 0),
  has_wdr boolean NOT NULL DEFAULT false,
  min_illumination_lux numeric(10,4),
  
  -- Environmental specifications
  weatherproof_rating weatherproof_rating,
  operating_temp_min integer,
  operating_temp_max integer,
  vandal_resistant boolean NOT NULL DEFAULT false,
  
  -- Power and connectivity
  power_consumption_watts numeric(6,2),
  power_supply_type text,
  poe_class text,
  
  -- Storage requirements
  storage_days integer NOT NULL DEFAULT 30 CHECK (storage_days > 0),
  avg_storage_per_day_gb numeric(10,2),
  
  -- Additional features
  has_two_way_audio boolean NOT NULL DEFAULT false,
  has_motion_detection boolean NOT NULL DEFAULT false,
  has_analytics boolean NOT NULL DEFAULT false,
  analytics_features jsonb NOT NULL DEFAULT '[]'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX camera_specifications_camera_idx ON camera_specifications (camera_id);
CREATE INDEX camera_specifications_resolution_idx ON camera_specifications (resolution_mp, frame_rate);

-- Camera installation compliance tracking
CREATE TABLE camera_installation_compliance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id uuid NOT NULL UNIQUE REFERENCES cameras(id) ON DELETE CASCADE,
  
  -- Compliance checks
  meets_resolution_requirement boolean NOT NULL DEFAULT false,
  meets_frame_rate_requirement boolean NOT NULL DEFAULT false,
  meets_coverage_requirement boolean NOT NULL DEFAULT false,
  meets_retention_requirement boolean NOT NULL DEFAULT false,
  proper_lighting boolean NOT NULL DEFAULT false,
  proper_angle boolean NOT NULL DEFAULT false,
  
  -- Documentation
  compliance_notes text,
  last_inspection_date date,
  next_inspection_date date,
  inspector_name text,
  
  -- Privacy and regulatory
  audio_recording_compliant boolean NOT NULL DEFAULT true,
  privacy_mask_configured boolean NOT NULL DEFAULT false,
  signage_installed boolean NOT NULL DEFAULT false,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX camera_installation_compliance_camera_idx 
  ON camera_installation_compliance (camera_id);
CREATE INDEX camera_installation_compliance_inspection_idx 
  ON camera_installation_compliance (next_inspection_date);

-- Branch location camera requirements
CREATE TABLE branch_camera_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_node_id uuid NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  location_type camera_location_type NOT NULL,
  
  -- Requirements
  required_count integer NOT NULL DEFAULT 1 CHECK (required_count > 0),
  actual_count integer NOT NULL DEFAULT 0 CHECK (actual_count >= 0),
  min_resolution_mp numeric(4,2) NOT NULL DEFAULT 2.0,
  min_frame_rate integer NOT NULL DEFAULT 25,
  requires_night_vision boolean NOT NULL DEFAULT false,
  requires_audio boolean NOT NULL DEFAULT false,
  requires_ptz boolean NOT NULL DEFAULT false,
  requires_lpr boolean NOT NULL DEFAULT false, -- License Plate Recognition
  
  -- Priority and compliance
  priority integer NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  is_regulatory_requirement boolean NOT NULL DEFAULT false,
  compliance_standard text,
  
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE (branch_node_id, location_type)
);

CREATE INDEX branch_camera_requirements_branch_idx 
  ON branch_camera_requirements (branch_node_id);
CREATE INDEX branch_camera_requirements_compliance_idx 
  ON branch_camera_requirements (branch_node_id)
  WHERE actual_count < required_count;

-- Create a view for camera coverage gaps
CREATE VIEW branch_camera_coverage_gaps AS
SELECT 
  bcr.branch_node_id,
  rn.name AS branch_name,
  bcr.location_type,
  bcr.required_count,
  bcr.actual_count,
  bcr.required_count - bcr.actual_count AS gap_count,
  bcr.priority,
  bcr.is_regulatory_requirement,
  bcr.compliance_standard
FROM branch_camera_requirements bcr
JOIN resource_nodes rn ON bcr.branch_node_id = rn.id
WHERE bcr.actual_count < bcr.required_count;

-- Create a view for camera compliance summary
CREATE VIEW camera_compliance_summary AS
SELECT 
  c.id AS camera_id,
  c.resource_node_id,
  rn.name AS camera_name,
  c.branch_node_id,
  bn.name AS branch_name,
  c.location_type,
  c.physical_type,
  c.status,
  cs.resolution_mp,
  cs.frame_rate,
  cs.has_night_vision,
  cs.ir_distance_meters,
  cs.weatherproof_rating,
  cic.meets_resolution_requirement,
  cic.meets_frame_rate_requirement,
  cic.meets_coverage_requirement,
  cic.meets_retention_requirement,
  cic.last_inspection_date,
  cic.next_inspection_date,
  CASE 
    WHEN cic.meets_resolution_requirement 
      AND cic.meets_frame_rate_requirement 
      AND cic.meets_coverage_requirement 
      AND cic.meets_retention_requirement 
      THEN 'compliant'
    ELSE 'non-compliant'
  END AS compliance_status
FROM cameras c
JOIN resource_nodes rn ON c.resource_node_id = rn.id
JOIN resource_nodes bn ON c.branch_node_id = bn.id
LEFT JOIN camera_specifications cs ON c.id = cs.camera_id
LEFT JOIN camera_installation_compliance cic ON c.id = cic.camera_id;

-- Function to update actual camera count for a location
CREATE OR REPLACE FUNCTION update_branch_camera_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.location_type IS NOT NULL THEN
    INSERT INTO branch_camera_requirements (branch_node_id, location_type, actual_count)
    VALUES (NEW.branch_node_id, NEW.location_type, 1)
    ON CONFLICT (branch_node_id, location_type) 
    DO UPDATE SET actual_count = branch_camera_requirements.actual_count + 1;
  ELSIF TG_OP = 'DELETE' AND OLD.location_type IS NOT NULL THEN
    UPDATE branch_camera_requirements
    SET actual_count = GREATEST(0, actual_count - 1)
    WHERE branch_node_id = OLD.branch_node_id 
      AND location_type = OLD.location_type;
  ELSIF TG_OP = 'UPDATE' 
    AND OLD.location_type IS DISTINCT FROM NEW.location_type THEN
    -- Decrease old location count
    IF OLD.location_type IS NOT NULL THEN
      UPDATE branch_camera_requirements
      SET actual_count = GREATEST(0, actual_count - 1)
      WHERE branch_node_id = OLD.branch_node_id 
        AND location_type = OLD.location_type;
    END IF;
    -- Increase new location count
    IF NEW.location_type IS NOT NULL THEN
      INSERT INTO branch_camera_requirements (branch_node_id, location_type, actual_count)
      VALUES (NEW.branch_node_id, NEW.location_type, 1)
      ON CONFLICT (branch_node_id, location_type) 
      DO UPDATE SET actual_count = branch_camera_requirements.actual_count + 1;
    END IF;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER maintain_branch_camera_count
  AFTER INSERT OR UPDATE OR DELETE ON cameras
  FOR EACH ROW
  EXECUTE FUNCTION update_branch_camera_count();

-- Add comments for documentation
COMMENT ON TABLE camera_specifications IS 
  'Detailed technical specifications for each camera including resolution, frame rate, field of view, and environmental ratings';

COMMENT ON TABLE camera_installation_compliance IS 
  'Tracks compliance with installation standards, regulatory requirements, and inspection schedules';

COMMENT ON TABLE branch_camera_requirements IS 
  'Defines required camera coverage for each location type within a branch';

COMMENT ON VIEW branch_camera_coverage_gaps IS 
  'Shows locations where actual camera count is less than required count';

COMMENT ON VIEW camera_compliance_summary IS 
  'Consolidated view of camera specifications and compliance status for reporting';
