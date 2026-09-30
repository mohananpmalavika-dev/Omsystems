-- Enable ONLY the "Helmet worn inside bank / branch" rule across all cameras.
-- Disable all other detection rules.

-- 1. In analytics_rules: Ensure 'helmet-worn' is enabled for all cameras and disable all other rules.
UPDATE analytics_rules
SET enabled = true, updated_at = NOW()
WHERE detection_type = 'helmet-worn';

UPDATE analytics_rules
SET enabled = false, updated_at = NOW()
WHERE detection_type != 'helmet-worn' AND enabled = true;

-- 2. In nbfc_analytics_rules: Keep 'helmet-worn' active and disable all other detector types.
UPDATE nbfc_analytics_rules
SET enabled = true, state = 'ACTIVE', updated_at = NOW()
WHERE detector_type = 'helmet-worn';

UPDATE nbfc_analytics_rules
SET enabled = false, state = 'INACTIVE', updated_at = NOW()
WHERE detector_type != 'helmet-worn' AND enabled = true;

-- 3. Ensure alert suppression is not blocking helmet alerts.
DELETE FROM alert_suppression_config;
