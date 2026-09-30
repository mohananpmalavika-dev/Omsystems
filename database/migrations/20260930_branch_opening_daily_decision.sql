-- Branch opening is decided from the first frame containing a person.
-- The daily decision is recorded in nbfc_rule_state under
-- branch-opening-day:{branch_id}:{local_date}.
UPDATE nbfc_rule_templates
SET default_duration_ms = 0,
    description = 'Checks the first person observation during the branch opening window: two people together pass; fewer than two fail immediately, once per local day.'
WHERE id = 'tmpl-27-opening-staff-count';

UPDATE nbfc_analytics_rules
SET duration_ms = 0,
    description = 'Checks the first person observation during the branch opening window: two people together pass; fewer than two fail immediately, once per local day.',
    updated_at = NOW()
WHERE template_id = 'tmpl-27-opening-staff-count';
