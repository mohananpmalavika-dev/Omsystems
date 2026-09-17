-- Voice Biometric Authentication System
-- Enables passwordless login through voice identification with anti-spoofing protection
-- Requires consent-based enrollment and provides comprehensive audit logging

-- Voice authentication method enum
CREATE TYPE voice_auth_method AS ENUM (
  'speaker_identification',    -- Identify user from voice alone
  'speaker_verification',      -- Verify claimed identity with voice
  'voice_mfa',                 -- Voice as additional factor with password/OTP
  'voice_passphrase',          -- Voice + specific passphrase
  'challenge_response'         -- Challenge-response for liveness
);

-- Voice enrollment status enum
CREATE TYPE voice_enrollment_status AS ENUM (
  'pending',           -- Enrollment initiated but not completed
  'in_progress',       -- User is recording samples
  'completed',         -- Enrollment successful with sufficient quality
  'failed',            -- Enrollment failed quality checks
  'expired',           -- Enrollment expired (user needs to re-enroll)
  'revoked'            -- User or admin revoked the voice profile
);

-- Voice authentication result enum
CREATE TYPE voice_auth_result AS ENUM (
  'success',           -- Authentication successful
  'rejected',          -- Voice didn't match any profile
  'low_confidence',    -- Match confidence below threshold
  'quality_failed',    -- Audio quality too poor
  'liveness_failed',   -- Liveness/anti-spoofing check failed
  'replay_detected',   -- Replay attack detected
  'synthetic_detected', -- Synthetic/deepfake voice detected
  'profile_expired',   -- Voice profile needs re-enrollment
  'account_locked'     -- Account locked due to failed attempts
);

-- Voice profiles table - stores speaker embeddings and enrollment metadata
CREATE TABLE voice_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  
  -- Enrollment metadata
  enrollment_status voice_enrollment_status NOT NULL DEFAULT 'pending',
  enrollment_completed_at timestamptz,
  samples_count integer NOT NULL DEFAULT 0,
  minimum_samples_required integer NOT NULL DEFAULT 3,
  
  -- Voice embedding data (encrypted at rest)
  speaker_embedding_vector vector(512),  -- 512-dimensional speaker embedding
  embedding_model_version text NOT NULL,
  embedding_confidence_score numeric(5,4),  -- 0.0000 to 1.0000
  
  -- Quality metrics
  average_snr_db numeric(6,2),  -- Signal-to-noise ratio
  average_duration_seconds numeric(6,2),
  enrollment_quality_score numeric(5,4),  -- Overall enrollment quality
  
  -- Security and consent
  consent_given boolean NOT NULL DEFAULT false,
  consent_timestamp timestamptz,
  consent_ip_address inet,
  passphrase_required boolean NOT NULL DEFAULT false,
  passphrase_hash text,  -- If passphrase-based auth is enabled
  
  -- Profile lifecycle
  expires_at timestamptz,  -- Optional expiration for periodic re-enrollment
  last_used_at timestamptz,
  successful_auth_count integer NOT NULL DEFAULT 0,
  failed_auth_count integer NOT NULL DEFAULT 0,
  
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES users(id),
  
  -- Constraints
  UNIQUE (user_id, tenant_id),
  CHECK (samples_count >= 0),
  CHECK (samples_count <= 20),  -- Max 20 enrollment samples
  CHECK (enrollment_quality_score IS NULL OR (enrollment_quality_score >= 0 AND enrollment_quality_score <= 1)),
  CHECK (embedding_confidence_score IS NULL OR (embedding_confidence_score >= 0 AND embedding_confidence_score <= 1)),
  CHECK (consent_given = false OR consent_timestamp IS NOT NULL)
);

-- Indexes for voice profiles
CREATE INDEX voice_profiles_user_idx ON voice_profiles (user_id);
CREATE INDEX voice_profiles_tenant_idx ON voice_profiles (tenant_id);
CREATE INDEX voice_profiles_status_idx ON voice_profiles (enrollment_status);
CREATE INDEX voice_profiles_expiry_idx ON voice_profiles (expires_at) WHERE expires_at IS NOT NULL;

-- Voice enrollment samples - stores individual audio samples used for enrollment
CREATE TABLE voice_enrollment_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_profile_id uuid NOT NULL REFERENCES voice_profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  
  -- Sample metadata
  sample_sequence integer NOT NULL,  -- Order of samples (1, 2, 3, etc.)
  audio_duration_seconds numeric(6,2) NOT NULL,
  sample_rate_hz integer NOT NULL,
  audio_format text NOT NULL,  -- 'wav', 'mp3', 'webm', etc.
  
  -- Audio storage (stored encrypted or in secure blob storage)
  audio_blob_uri text,  -- URI to audio file in blob storage
  audio_blob_size_bytes integer,
  audio_hash text NOT NULL,  -- SHA256 hash of audio for integrity
  
  -- Quality metrics
  snr_db numeric(6,2),  -- Signal-to-noise ratio
  speech_detected boolean NOT NULL DEFAULT true,
  silence_ratio numeric(5,4),  -- Ratio of silence vs speech
  clipping_detected boolean NOT NULL DEFAULT false,
  
  -- Embedding for this specific sample
  sample_embedding vector(512),
  embedding_confidence numeric(5,4),
  
  -- Quality checks
  quality_passed boolean NOT NULL DEFAULT false,
  quality_score numeric(5,4),
  quality_failure_reasons text[],
  
  -- Metadata
  recorded_at timestamptz NOT NULL DEFAULT now(),
  ip_address inet,
  user_agent text,
  
  UNIQUE (voice_profile_id, sample_sequence),
  CHECK (audio_duration_seconds > 0 AND audio_duration_seconds <= 30),
  CHECK (sample_rate_hz >= 8000 AND sample_rate_hz <= 48000),
  CHECK (sample_sequence > 0),
  CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 1))
);

-- Indexes for enrollment samples
CREATE INDEX voice_enrollment_samples_profile_idx ON voice_enrollment_samples (voice_profile_id);
CREATE INDEX voice_enrollment_samples_user_idx ON voice_enrollment_samples (user_id);
CREATE INDEX voice_enrollment_samples_recorded_idx ON voice_enrollment_samples (recorded_at DESC);

-- Voice authentication attempts - audit log for all authentication attempts
CREATE TABLE voice_authentication_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid REFERENCES users(id),  -- NULL if identification failed
  voice_profile_id uuid REFERENCES voice_profiles(id),
  
  -- Authentication details
  auth_method voice_auth_method NOT NULL,
  auth_result voice_auth_result NOT NULL,
  confidence_score numeric(5,4),  -- Match confidence
  similarity_score numeric(5,4),  -- Embedding similarity score
  threshold_required numeric(5,4),  -- Threshold that was required
  
  -- Audio metadata
  audio_duration_seconds numeric(6,2),
  audio_quality_score numeric(5,4),
  snr_db numeric(6,2),
  
  -- Security checks
  liveness_check_passed boolean,
  liveness_confidence numeric(5,4),
  replay_probability numeric(5,4),
  synthetic_probability numeric(5,4),
  
  -- Session information
  session_id uuid,  -- Links to user_sessions if successful
  ip_address inet,
  user_agent text,
  device_fingerprint text,
  
  -- Additional context
  passphrase_verified boolean,
  challenge_text text,  -- If challenge-response was used
  mfa_verified boolean,  -- If voice was used as MFA
  
  -- Failure details
  failure_reason text,
  failure_details jsonb,
  
  -- Timestamps
  attempted_at timestamptz NOT NULL DEFAULT now(),
  processing_duration_ms integer,
  
  CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
  CHECK (similarity_score IS NULL OR (similarity_score >= 0 AND similarity_score <= 1))
);

-- Indexes for authentication attempts
CREATE INDEX voice_auth_attempts_user_idx ON voice_authentication_attempts (user_id);
CREATE INDEX voice_auth_attempts_tenant_idx ON voice_authentication_attempts (tenant_id);
CREATE INDEX voice_auth_attempts_result_idx ON voice_authentication_attempts (auth_result);
CREATE INDEX voice_auth_attempts_time_idx ON voice_authentication_attempts (attempted_at DESC);
CREATE INDEX voice_auth_attempts_session_idx ON voice_authentication_attempts (session_id);
CREATE INDEX voice_auth_attempts_ip_idx ON voice_authentication_attempts (ip_address);

-- Voice authentication settings per tenant
CREATE TABLE voice_authentication_settings (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id),
  
  -- Feature flags
  enabled boolean NOT NULL DEFAULT false,
  require_liveness_check boolean NOT NULL DEFAULT true,
  require_anti_spoofing boolean NOT NULL DEFAULT true,
  allow_voice_only_login boolean NOT NULL DEFAULT false,
  require_mfa boolean NOT NULL DEFAULT true,
  
  -- Thresholds
  similarity_threshold numeric(5,4) NOT NULL DEFAULT 0.7500,  -- 75% similarity required
  liveness_threshold numeric(5,4) NOT NULL DEFAULT 0.8000,  -- 80% liveness confidence
  quality_threshold numeric(5,4) NOT NULL DEFAULT 0.6000,  -- 60% audio quality
  
  -- Enrollment requirements
  minimum_enrollment_samples integer NOT NULL DEFAULT 3,
  maximum_enrollment_samples integer NOT NULL DEFAULT 10,
  enrollment_expiry_days integer,  -- NULL = never expires
  
  -- Security settings
  max_failed_attempts integer NOT NULL DEFAULT 5,
  lockout_duration_minutes integer NOT NULL DEFAULT 30,
  session_timeout_minutes integer NOT NULL DEFAULT 60,
  
  -- Models and processing
  embedding_model_name text NOT NULL DEFAULT 'ecapa-tdnn-512',
  embedding_dimension integer NOT NULL DEFAULT 512,
  anti_spoofing_model_name text,
  
  -- Audit and compliance
  retain_audio_samples boolean NOT NULL DEFAULT false,
  audio_retention_days integer,
  require_consent boolean NOT NULL DEFAULT true,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id uuid REFERENCES users(id),
  
  CHECK (similarity_threshold >= 0.5 AND similarity_threshold <= 1.0),
  CHECK (minimum_enrollment_samples >= 1 AND minimum_enrollment_samples <= 20),
  CHECK (maximum_enrollment_samples >= minimum_enrollment_samples)
);

-- Insert default settings for existing tenants
INSERT INTO voice_authentication_settings (tenant_id)
SELECT id FROM tenants
ON CONFLICT (tenant_id) DO NOTHING;

-- Voice authentication anti-spoofing logs
CREATE TABLE voice_anti_spoofing_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authentication_attempt_id uuid NOT NULL REFERENCES voice_authentication_attempts(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  
  -- Detection results
  is_spoofed boolean NOT NULL,
  spoofing_type text,  -- 'replay', 'synthetic', 'deepfake', 'voice-conversion'
  detection_confidence numeric(5,4) NOT NULL,
  
  -- Analysis details
  spectral_analysis jsonb,  -- Spectral features analysis
  temporal_analysis jsonb,  -- Temporal patterns
  model_scores jsonb,  -- Scores from different anti-spoofing models
  
  -- Audio characteristics that triggered detection
  suspicious_features text[],
  
  detected_at timestamptz NOT NULL DEFAULT now(),
  
  CHECK (detection_confidence >= 0 AND detection_confidence <= 1)
);

CREATE INDEX voice_anti_spoofing_logs_attempt_idx ON voice_anti_spoofing_logs (authentication_attempt_id);
CREATE INDEX voice_anti_spoofing_logs_tenant_idx ON voice_anti_spoofing_logs (tenant_id);
CREATE INDEX voice_anti_spoofing_logs_spoofed_idx ON voice_anti_spoofing_logs (is_spoofed, detected_at DESC);

-- Function to check if voice profile is valid and active
CREATE OR REPLACE FUNCTION is_voice_profile_valid(p_voice_profile_id uuid)
RETURNS boolean AS $$
DECLARE
  v_status voice_enrollment_status;
  v_expires_at timestamptz;
  v_user_status user_status;
BEGIN
  SELECT vp.enrollment_status, vp.expires_at, u.status
  INTO v_status, v_expires_at, v_user_status
  FROM voice_profiles vp
  JOIN users u ON vp.user_id = u.id
  WHERE vp.id = p_voice_profile_id;

  -- Check if profile exists
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Check user account status
  IF v_user_status NOT IN ('active', 'pending_activation') THEN
    RETURN false;
  END IF;

  -- Check enrollment status
  IF v_status != 'completed' THEN
    RETURN false;
  END IF;

  -- Check expiration
  IF v_expires_at IS NOT NULL AND v_expires_at < now() THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Function to record voice authentication attempt
CREATE OR REPLACE FUNCTION record_voice_auth_attempt(
  p_tenant_id uuid,
  p_user_id uuid,
  p_voice_profile_id uuid,
  p_auth_method voice_auth_method,
  p_auth_result voice_auth_result,
  p_confidence_score numeric DEFAULT NULL,
  p_ip_address inet DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_attempt_id uuid;
BEGIN
  INSERT INTO voice_authentication_attempts (
    tenant_id,
    user_id,
    voice_profile_id,
    auth_method,
    auth_result,
    confidence_score,
    ip_address
  )
  VALUES (
    p_tenant_id,
    p_user_id,
    p_voice_profile_id,
    p_auth_method,
    p_auth_result,
    p_confidence_score,
    p_ip_address
  )
  RETURNING id INTO v_attempt_id;

  -- Update voice profile statistics
  IF p_auth_result = 'success' THEN
    UPDATE voice_profiles
    SET 
      successful_auth_count = successful_auth_count + 1,
      last_used_at = now()
    WHERE id = p_voice_profile_id;
  ELSE
    UPDATE voice_profiles
    SET failed_auth_count = failed_auth_count + 1
    WHERE id = p_voice_profile_id;
  END IF;

  -- Log to audit events
  INSERT INTO audit_events (
    tenant_id,
    actor_user_id,
    action,
    outcome,
    source_ip,
    details
  )
  VALUES (
    p_tenant_id,
    p_user_id,
    'voice_authentication.' || p_auth_method::text,
    CASE WHEN p_auth_result = 'success' THEN 'success' ELSE 'failure' END,
    p_ip_address,
    jsonb_build_object(
      'auth_result', p_auth_result,
      'confidence_score', p_confidence_score,
      'attempt_id', v_attempt_id
    )
  );

  RETURN v_attempt_id;
END;
$$ LANGUAGE plpgsql;

-- Function to complete voice enrollment
CREATE OR REPLACE FUNCTION complete_voice_enrollment(
  p_voice_profile_id uuid,
  p_embedding_vector numeric[],
  p_quality_score numeric
)
RETURNS void AS $$
DECLARE
  v_samples_count integer;
  v_min_samples integer;
BEGIN
  -- Get sample counts
  SELECT samples_count, minimum_samples_required
  INTO v_samples_count, v_min_samples
  FROM voice_profiles
  WHERE id = p_voice_profile_id;

  -- Check if enough samples
  IF v_samples_count < v_min_samples THEN
    RAISE EXCEPTION 'Insufficient samples for enrollment: % of % required', 
      v_samples_count, v_min_samples;
  END IF;

  -- Update profile
  UPDATE voice_profiles
  SET 
    enrollment_status = 'completed',
    enrollment_completed_at = now(),
    speaker_embedding_vector = p_embedding_vector::vector,
    enrollment_quality_score = p_quality_score,
    updated_at = now()
  WHERE id = p_voice_profile_id;

  -- Log completion
  INSERT INTO audit_events (
    tenant_id,
    actor_user_id,
    action,
    outcome,
    details
  )
  SELECT 
    tenant_id,
    user_id,
    'voice_enrollment.completed',
    'success',
    jsonb_build_object(
      'profile_id', p_voice_profile_id,
      'samples_count', v_samples_count,
      'quality_score', p_quality_score
    )
  FROM voice_profiles
  WHERE id = p_voice_profile_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_voice_profiles_updated_at
  BEFORE UPDATE ON voice_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_voice_auth_settings_updated_at
  BEFORE UPDATE ON voice_authentication_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- View for voice authentication analytics
CREATE VIEW voice_authentication_analytics AS
SELECT 
  vaa.tenant_id,
  vaa.user_id,
  u.username,
  u.email,
  u.display_name,
  vaa.auth_method,
  vaa.auth_result,
  vaa.confidence_score,
  vaa.liveness_check_passed,
  vaa.replay_probability,
  vaa.synthetic_probability,
  vaa.ip_address,
  vaa.attempted_at,
  vp.enrollment_quality_score,
  vp.successful_auth_count,
  vp.failed_auth_count
FROM voice_authentication_attempts vaa
LEFT JOIN users u ON vaa.user_id = u.id
LEFT JOIN voice_profiles vp ON vaa.voice_profile_id = vp.id;

-- View for voice enrollment status
CREATE VIEW voice_enrollment_status_view AS
SELECT 
  vp.id as profile_id,
  vp.user_id,
  u.username,
  u.email,
  u.display_name,
  vp.tenant_id,
  vp.enrollment_status,
  vp.enrollment_completed_at,
  vp.samples_count,
  vp.minimum_samples_required,
  vp.enrollment_quality_score,
  vp.consent_given,
  vp.consent_timestamp,
  vp.expires_at,
  vp.last_used_at,
  vp.successful_auth_count,
  vp.failed_auth_count,
  vp.created_at,
  CASE 
    WHEN vp.expires_at IS NOT NULL AND vp.expires_at < now() THEN true
    ELSE false
  END as is_expired,
  CASE
    WHEN vp.enrollment_status = 'completed' AND (vp.expires_at IS NULL OR vp.expires_at > now()) THEN true
    ELSE false
  END as is_active
FROM voice_profiles vp
JOIN users u ON vp.user_id = u.id;

-- Comments for documentation
COMMENT ON TABLE voice_profiles IS 'User voice biometric profiles with speaker embeddings for authentication';
COMMENT ON TABLE voice_enrollment_samples IS 'Individual audio samples recorded during voice enrollment process';
COMMENT ON TABLE voice_authentication_attempts IS 'Audit log of all voice authentication attempts with anti-spoofing results';
COMMENT ON TABLE voice_authentication_settings IS 'Tenant-level configuration for voice authentication system';
COMMENT ON TABLE voice_anti_spoofing_logs IS 'Detailed logs of anti-spoofing detection results';

COMMENT ON COLUMN voice_profiles.speaker_embedding_vector IS 'High-dimensional voice embedding vector for speaker identification';
COMMENT ON COLUMN voice_profiles.enrollment_quality_score IS 'Overall quality score of enrollment (0.0 to 1.0)';
COMMENT ON COLUMN voice_profiles.consent_given IS 'User consent for voice biometric data collection and processing';

COMMENT ON FUNCTION is_voice_profile_valid IS 'Validates if a voice profile is active and can be used for authentication';
COMMENT ON FUNCTION record_voice_auth_attempt IS 'Records voice authentication attempt with result and updates statistics';
COMMENT ON FUNCTION complete_voice_enrollment IS 'Completes voice enrollment after sufficient quality samples are collected';

-- Grant permissions (adjust based on your role structure)
-- GRANT SELECT ON voice_authentication_analytics TO auditor;
-- GRANT SELECT ON voice_enrollment_status_view TO company_admin, hq_admin;
