/**
 * Rollback MFA Rate Limiting Tables
 * 
 * WARNING: This will permanently delete all MFA security event history
 * and restriction data. Use with caution.
 */

-- Drop triggers
DROP TRIGGER IF EXISTS mfa_restrictions_updated_at ON mfa_restrictions;
DROP FUNCTION IF EXISTS update_mfa_restrictions_updated_at();

-- Drop tables
DROP TABLE IF EXISTS mfa_restrictions CASCADE;
DROP TABLE IF EXISTS mfa_security_events CASCADE;

-- Drop types
DROP TYPE IF EXISTS mfa_subject_type CASCADE;
DROP TYPE IF EXISTS mfa_restriction_type CASCADE;
DROP TYPE IF EXISTS mfa_security_event_type CASCADE;
-- Note: mfa_method type may be used elsewhere, don't drop it

-- Success message
DO $$ 
BEGIN 
  RAISE NOTICE 'MFA rate limiting tables dropped successfully';
END $$;
