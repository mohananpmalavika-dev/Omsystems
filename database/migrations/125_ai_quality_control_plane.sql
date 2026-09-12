-- ============================================================================
-- Migration: 125_ai_quality_control_plane.sql
-- Description: AI Quality Control Plane, Certified Model Registry, Hardware 
--              Profiles, Camera Commissioning & Threshold Assessments
-- ============================================================================

-- 1. AI Detectors (Core Stabilized Banking Detectors)
CREATE TABLE IF NOT EXISTS ai_detectors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE, -- INTRUSION, LINE_CROSSING, LOITERING, CROWD, TAMPER, OBSTRUCTION, PERSON_DETECTION, ANPR
    description TEXT,
    category TEXT NOT NULL DEFAULT 'perimeter_security',
    current_production_model_id TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. AI Hardware Profiles
CREATE TABLE IF NOT EXISTS ai_hardware_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    chipset TEXT NOT NULL,
    gpu_model TEXT,
    gpu_memory_gb INT NOT NULL,
    ram_gb INT NOT NULL,
    os TEXT NOT NULL,
    driver_version TEXT NOT NULL,
    cuda_version TEXT,
    tensorrt_version TEXT,
    is_edge_device BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. AI Datasets & Dataset Versions
CREATE TABLE IF NOT EXISTS ai_datasets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    detector_code TEXT NOT NULL REFERENCES ai_detectors(code),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_dataset_versions (
    id TEXT PRIMARY KEY,
    dataset_id TEXT NOT NULL REFERENCES ai_datasets(id) ON DELETE CASCADE,
    version TEXT NOT NULL,
    sample_count INT NOT NULL,
    positive_count INT NOT NULL,
    negative_count INT NOT NULL,
    storage_uri TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(dataset_id, version)
);

-- 4. AI Models & Model Versions
CREATE TABLE IF NOT EXISTS ai_models (
    id TEXT PRIMARY KEY,
    detector_id TEXT NOT NULL REFERENCES ai_detectors(id),
    name TEXT NOT NULL,
    framework TEXT NOT NULL, -- 'TensorRT', 'ONNX', 'PyTorch'
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_model_versions (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES ai_models(id) ON DELETE CASCADE,
    version TEXT NOT NULL,
    weights_uri TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    input_resolution_width INT NOT NULL DEFAULT 640,
    input_resolution_height INT NOT NULL DEFAULT 640,
    default_threshold NUMERIC(4, 3) NOT NULL DEFAULT 0.600,
    min_target_pixel_size INT NOT NULL DEFAULT 32,
    target_hardware_id TEXT REFERENCES ai_hardware_profiles(id),
    fps NUMERIC(6, 2) NOT NULL DEFAULT 25.0,
    latency_ms NUMERIC(6, 2) NOT NULL DEFAULT 15.0,
    precision NUMERIC(5, 4),
    recall NUMERIC(5, 4),
    f1_score NUMERIC(5, 4),
    false_alarms_per_hour NUMERIC(6, 2) DEFAULT 0.05,
    certification_state TEXT NOT NULL DEFAULT 'DRAFT', -- DRAFT, VALIDATING, CERTIFIED, REJECTED, DEPRECATED
    last_validated TIMESTAMPTZ,
    certified_by TEXT,
    certified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(model_id, version)
);

CREATE INDEX IF NOT EXISTS idx_ai_model_cert 
    ON ai_model_versions(certification_state);

-- 5. AI Evaluation Runs & Evaluation Metrics
CREATE TABLE IF NOT EXISTS ai_evaluation_runs (
    id TEXT PRIMARY KEY,
    model_version_id TEXT NOT NULL REFERENCES ai_model_versions(id) ON DELETE CASCADE,
    dataset_version_id TEXT NOT NULL REFERENCES ai_dataset_versions(id),
    hardware_profile_id TEXT NOT NULL REFERENCES ai_hardware_profiles(id),
    status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, RUNNING, COMPLETED, FAILED
    evaluated_by TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ai_evaluation_metrics (
    id TEXT PRIMARY KEY,
    evaluation_run_id TEXT NOT NULL REFERENCES ai_evaluation_runs(id) ON DELETE CASCADE,
    threshold NUMERIC(4, 3) NOT NULL,
    true_positives INT NOT NULL,
    false_positives INT NOT NULL,
    true_negatives INT NOT NULL,
    false_negatives INT NOT NULL,
    precision NUMERIC(5, 4) NOT NULL,
    recall NUMERIC(5, 4) NOT NULL,
    f1_score NUMERIC(5, 4) NOT NULL,
    avg_latency_ms NUMERIC(6, 2) NOT NULL,
    p95_latency_ms NUMERIC(6, 2) NOT NULL
);

-- 6. AI Camera Assignments & Threshold Tuning
CREATE TABLE IF NOT EXISTS ai_camera_assignments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    camera_id TEXT NOT NULL,
    detector_id TEXT NOT NULL REFERENCES ai_detectors(id),
    model_version_id TEXT NOT NULL REFERENCES ai_model_versions(id),
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    sensitivity TEXT NOT NULL DEFAULT 'MEDIUM', -- LOW, MEDIUM, HIGH, CUSTOM
    confidence_threshold NUMERIC(4, 3) NOT NULL DEFAULT 0.650,
    roi_polygon JSONB, -- Coordinates array [[x1, y1], [x2, y2], ...]
    min_target_size_pixels INT NOT NULL DEFAULT 32,
    minimum_duration_ms INT NOT NULL DEFAULT 500,
    camera_suitability TEXT NOT NULL DEFAULT 'SUITABLE', -- SUITABLE, SUITABLE_WITH_WARNING, NOT_SUITABLE
    suitability_details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(camera_id, detector_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_cam_assign 
    ON ai_camera_assignments(tenant_id, camera_id, is_enabled);

-- 7. Operator Feedback & False Positive Reports
CREATE TABLE IF NOT EXISTS ai_false_positive_reports (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    alert_id TEXT NOT NULL,
    camera_id TEXT NOT NULL,
    detector_id TEXT NOT NULL REFERENCES ai_detectors(id),
    model_version_id TEXT NOT NULL REFERENCES ai_model_versions(id),
    operator_id TEXT NOT NULL,
    false_positive_category TEXT NOT NULL, -- 'LIGHT_REFLECTION', 'SPIDER_WEB', 'SHADOW', 'WEATHER', 'OTHER'
    notes TEXT,
    snapshot_uri TEXT,
    reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. AI Quality Audit Log
CREATE TABLE IF NOT EXISTS ai_quality_audit (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL, -- 'MODEL_CERTIFIED', 'MODEL_REJECTED', 'THRESHOLD_TUNED', 'OVERRIDE_GRANTED'
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    before_state JSONB,
    after_state JSONB,
    reason TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Guaranteed Seeding of 8 Core Banking Detectors & Baseline Hardware
INSERT INTO ai_detectors (id, name, code, description, category) VALUES
('det-intrusion', 'Vault & Perimeter Intrusion Detection', 'INTRUSION', 'Detects human breach within secured bank zones after hours', 'perimeter_security'),
('det-line-crossing', 'Virtual Tripwire Line Crossing', 'LINE_CROSSING', 'Monitors boundary crossing around cashier cabin and server room', 'perimeter_security'),
('det-loitering', 'ATM & Branch Loitering Detection', 'LOITERING', 'Flags suspicious dwell time exceeding banking threshold', 'surveillance'),
('det-crowd', 'Banking Hall Crowd Density & Queue Length', 'CROWD', 'Estimates branch congestion and teller queue limits', 'operational_analytics'),
('det-tamper', 'Camera Tampering & Defocusing', 'TAMPER', 'Detects physical spray, redirection, or sudden defocus', 'health_security'),
('det-obstruction', 'Camera Obstruction & Lens Blockage', 'OBSTRUCTION', 'Identifies cardboard, tape, or objects masking camera view', 'health_security'),
('det-person', 'Unauthorized Person Detection', 'PERSON_DETECTION', 'High-confidence human classification in restricted areas', 'perimeter_security'),
('det-anpr', 'Automatic Number Plate Recognition', 'ANPR', 'Identifies cash van and visitor vehicles at branch gate', 'access_control')
ON CONFLICT (id) DO NOTHING;

INSERT INTO ai_hardware_profiles (id, name, chipset, gpu_model, gpu_memory_gb, ram_gb, os, driver_version, is_edge_device) VALUES
('hw-rtx-a4000', 'NVIDIA RTX A4000 Server', 'Ampere GA104', 'RTX A4000', 16, 64, 'Ubuntu 22.04 LTS', '535.129.03', false),
('hw-nvidia-l4', 'NVIDIA L4 Tensor Core', 'Ada Lovelace AD104', 'NVIDIA L4', 24, 64, 'Ubuntu 22.04 LTS', '535.129.03', false),
('hw-jetson-orin', 'NVIDIA Jetson AGX Orin Edge', 'Orin 2048-core', 'Jetson Orin Integrated', 32, 32, 'Linux for Tegra 35.4.1', 'JetPack 5.1.2', true)
ON CONFLICT (id) DO NOTHING;
