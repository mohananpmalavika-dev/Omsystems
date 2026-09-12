-- Migration 127: Device, DVR, and NVR Certification Matrix
-- Banking-grade device certification catalog with compatibility levels KV-C1 through KV-C12.

CREATE TABLE IF NOT EXISTS recorder_certifications (
    id VARCHAR(64) PRIMARY KEY,
    vendor VARCHAR(64) NOT NULL,
    model_pattern VARCHAR(128) NOT NULL,
    firmware_version_pattern VARCHAR(128) NOT NULL DEFAULT '*',
    compatibility_level VARCHAR(16) NOT NULL,
    features JSONB NOT NULL,
    certification_status VARCHAR(32) NOT NULL DEFAULT 'CERTIFIED',
    tested_by VARCHAR(128) NOT NULL,
    notes TEXT,
    certified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recorder_certifications_vendor 
    ON recorder_certifications (vendor, model_pattern);

-- Seed authoritative bank device certifications
INSERT INTO recorder_certifications (id, vendor, model_pattern, firmware_version_pattern, compatibility_level, features, certification_status, tested_by, notes)
VALUES
    (
        'cert-hikvision-ds7600-nvr',
        'Hikvision',
        'DS-76*',
        'V4.*',
        'KV-C12',
        '{
            "KV-C1": "SUPPORTED",
            "KV-C2": "SUPPORTED",
            "KV-C3": "SUPPORTED",
            "KV-C4": "SUPPORTED",
            "KV-C5": "SUPPORTED",
            "KV-C6": "SUPPORTED",
            "KV-C7": "SUPPORTED",
            "KV-C8": "SUPPORTED",
            "KV-C9": "SUPPORTED",
            "KV-C10": "SUPPORTED",
            "KV-C11": "SUPPORTED",
            "KV-C12": "SUPPORTED"
        }'::jsonb,
        'TEST_REQUIRED',
        'UNTESTED - Physical Device Lab Run Required',
        'Pending physical lab hardware validation for ISAPI + ONVIF Profile S/G/T telemetry'
    ),
    (
        'cert-dahua-nvr5000',
        'Dahua',
        'NVR5*',
        'V4.000.*',
        'KV-C11',
        '{
            "KV-C1": "SUPPORTED",
            "KV-C2": "SUPPORTED",
            "KV-C3": "SUPPORTED",
            "KV-C4": "SUPPORTED",
            "KV-C5": "SUPPORTED",
            "KV-C6": "SUPPORTED",
            "KV-C7": "SUPPORTED",
            "KV-C8": "SUPPORTED",
            "KV-C9": "SUPPORTED",
            "KV-C10": "SUPPORTED",
            "KV-C11": "SUPPORTED",
            "KV-C12": "UNKNOWN"
        }'::jsonb,
        'TEST_REQUIRED',
        'UNTESTED - Physical Device Lab Run Required',
        'Pending physical lab hardware validation for Dahua RPC API and ONVIF Profile S'
    ),
    (
        'cert-cpplus-uvr-dvr',
        'CP Plus',
        'CP-UVR-*',
        '*',
        'KV-C8',
        '{
            "KV-C1": "SUPPORTED",
            "KV-C2": "SUPPORTED",
            "KV-C3": "SUPPORTED",
            "KV-C4": "SUPPORTED",
            "KV-C5": "SUPPORTED",
            "KV-C6": "UNKNOWN",
            "KV-C7": "SUPPORTED",
            "KV-C8": "SUPPORTED",
            "KV-C9": "UNSUPPORTED",
            "KV-C10": "UNSUPPORTED",
            "KV-C11": "UNKNOWN",
            "KV-C12": "UNSUPPORTED"
        }'::jsonb,
        'TEST_REQUIRED',
        'UNTESTED - Physical Device Lab Run Required',
        'Pending physical lab hardware validation for Orange/Indigo series DVRs'
    ),
    (
        'cert-cpplus-nvr',
        'CP Plus',
        'CP-NVR-*',
        '*',
        'KV-C10',
        '{
            "KV-C1": "SUPPORTED",
            "KV-C2": "SUPPORTED",
            "KV-C3": "SUPPORTED",
            "KV-C4": "SUPPORTED",
            "KV-C5": "SUPPORTED",
            "KV-C6": "SUPPORTED",
            "KV-C7": "SUPPORTED",
            "KV-C8": "SUPPORTED",
            "KV-C9": "SUPPORTED",
            "KV-C10": "SUPPORTED",
            "KV-C11": "UNKNOWN",
            "KV-C12": "UNKNOWN"
        }'::jsonb,
        'TEST_REQUIRED',
        'UNTESTED - Physical Device Lab Run Required',
        'Pending physical lab hardware validation for CP Plus Onyx & Cosmic IP NVR series'
    ),
    (
        'cert-uniview-nvr300',
        'Uniview',
        'NVR30*',
        '*',
        'KV-C9',
        '{
            "KV-C1": "SUPPORTED",
            "KV-C2": "SUPPORTED",
            "KV-C3": "SUPPORTED",
            "KV-C4": "SUPPORTED",
            "KV-C5": "SUPPORTED",
            "KV-C6": "SUPPORTED",
            "KV-C7": "SUPPORTED",
            "KV-C8": "SUPPORTED",
            "KV-C9": "SUPPORTED",
            "KV-C10": "UNKNOWN",
            "KV-C11": "UNSUPPORTED",
            "KV-C12": "UNKNOWN"
        }'::jsonb,
        'TEST_REQUIRED',
        'UNTESTED - Physical Device Lab Run Required',
        'Pending physical lab hardware validation for UNV NVR series with ONVIF Profile S/T'
    ),
    (
        'cert-onvif-profile-s',
        'ONVIF',
        'Profile-S',
        '*',
        'KV-C6',
        '{
            "KV-C1": "SUPPORTED",
            "KV-C2": "UNKNOWN",
            "KV-C3": "UNSUPPORTED",
            "KV-C4": "SUPPORTED",
            "KV-C5": "SUPPORTED",
            "KV-C6": "SUPPORTED",
            "KV-C7": "SUPPORTED",
            "KV-C8": "UNKNOWN",
            "KV-C9": "UNSUPPORTED",
            "KV-C10": "UNSUPPORTED",
            "KV-C11": "UNSUPPORTED",
            "KV-C12": "UNKNOWN"
        }'::jsonb,
        'TEST_REQUIRED',
        'UNTESTED - Physical Device Lab Run Required',
        'Pending physical lab hardware validation for standard ONVIF Profile S streaming'
    ),
    (
        'cert-generic-rtsp',
        'Generic RTSP',
        '*',
        '*',
        'KV-C1',
        '{
            "KV-C1": "SUPPORTED",
            "KV-C2": "UNSUPPORTED",
            "KV-C3": "UNSUPPORTED",
            "KV-C4": "UNKNOWN",
            "KV-C5": "UNSUPPORTED",
            "KV-C6": "UNSUPPORTED",
            "KV-C7": "UNSUPPORTED",
            "KV-C8": "UNSUPPORTED",
            "KV-C9": "UNSUPPORTED",
            "KV-C10": "UNSUPPORTED",
            "KV-C11": "UNSUPPORTED",
            "KV-C12": "UNSUPPORTED"
        }'::jsonb,
        'CERTIFIED',
        'KryptoVision Standard Compliance',
        'Baseline RTSP live stream only; no recording/PTZ control via NVR'
    )
ON CONFLICT (id) DO NOTHING;
