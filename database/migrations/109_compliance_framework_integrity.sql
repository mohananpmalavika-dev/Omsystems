-- Compliance frameworks and certificates are business identifiers.  Make
-- duplicates impossible within a tenant while retaining the original display
-- casing and allowing separate tenants to use the same standard.
CREATE UNIQUE INDEX IF NOT EXISTS compliance_frameworks_tenant_name_unique
  ON compliance_frameworks (tenant_id, lower(btrim(name)));

CREATE UNIQUE INDEX IF NOT EXISTS compliance_frameworks_id_tenant_unique
  ON compliance_frameworks (id, tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS compliance_certificates_tenant_number_unique
  ON compliance_certificates (tenant_id, lower(btrim(certificate_number)));

CREATE UNIQUE INDEX IF NOT EXISTS compliance_policies_tenant_name_unique
  ON compliance_policies (tenant_id, lower(btrim(policy_name)));

CREATE UNIQUE INDEX IF NOT EXISTS compliance_assessments_id_tenant_unique
  ON compliance_assessments (id, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS compliance_requirements_id_tenant_unique
  ON compliance_requirements (id, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS compliance_controls_id_tenant_unique
  ON compliance_controls (id, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS compliance_tests_id_tenant_unique
  ON compliance_tests (id, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS compliance_findings_tenant_number_unique
  ON compliance_findings (tenant_id, lower(btrim(finding_number)));

-- A framework id alone does not ensure a policy has the same tenant. This
-- prevents new cross-tenant relationships without invalidating legacy rows.
ALTER TABLE compliance_policies
  DROP CONSTRAINT IF EXISTS compliance_policies_framework_tenant_fk;
ALTER TABLE compliance_policies
  ADD CONSTRAINT compliance_policies_framework_tenant_fk
  FOREIGN KEY (framework_id, tenant_id)
  REFERENCES compliance_frameworks (id, tenant_id) NOT VALID;

ALTER TABLE compliance_findings
  DROP CONSTRAINT IF EXISTS compliance_findings_assessment_tenant_fk;
ALTER TABLE compliance_findings
  ADD CONSTRAINT compliance_findings_assessment_tenant_fk
  FOREIGN KEY (assessment_id, tenant_id)
  REFERENCES compliance_assessments (id, tenant_id) NOT VALID;
ALTER TABLE compliance_findings
  DROP CONSTRAINT IF EXISTS compliance_findings_requirement_tenant_fk;
ALTER TABLE compliance_findings
  ADD CONSTRAINT compliance_findings_requirement_tenant_fk
  FOREIGN KEY (requirement_id, tenant_id)
  REFERENCES compliance_requirements (id, tenant_id) NOT VALID;
ALTER TABLE compliance_findings
  DROP CONSTRAINT IF EXISTS compliance_findings_control_tenant_fk;
ALTER TABLE compliance_findings
  ADD CONSTRAINT compliance_findings_control_tenant_fk
  FOREIGN KEY (control_id, tenant_id)
  REFERENCES compliance_controls (id, tenant_id) NOT VALID;
ALTER TABLE compliance_findings
  DROP CONSTRAINT IF EXISTS compliance_findings_test_tenant_fk;
ALTER TABLE compliance_findings
  ADD CONSTRAINT compliance_findings_test_tenant_fk
  FOREIGN KEY (test_id, tenant_id)
  REFERENCES compliance_tests (id, tenant_id) NOT VALID;

ALTER TABLE compliance_frameworks
  DROP CONSTRAINT IF EXISTS compliance_frameworks_review_date_valid;
ALTER TABLE compliance_frameworks
  ADD CONSTRAINT compliance_frameworks_review_date_valid
  CHECK (review_date IS NULL OR effective_date IS NULL OR review_date >= effective_date);

ALTER TABLE compliance_policies
  DROP CONSTRAINT IF EXISTS compliance_policies_review_date_valid;
ALTER TABLE compliance_policies
  ADD CONSTRAINT compliance_policies_review_date_valid
  CHECK (review_date IS NULL OR effective_date IS NULL OR review_date >= effective_date);

ALTER TABLE compliance_policies
  DROP CONSTRAINT IF EXISTS compliance_policies_automated_deletion_retention_valid;
ALTER TABLE compliance_policies
  ADD CONSTRAINT compliance_policies_automated_deletion_retention_valid
  CHECK (
    automatic_deletion_eligibility = false OR
    (normal_retention_days IS NULL OR normal_retention_days > 0) AND
    (hot_storage_days IS NULL OR hot_storage_days > 0) AND
    (warm_storage_days IS NULL OR warm_storage_days > 0) AND
    (cold_storage_days IS NULL OR cold_storage_days > 0)
  ) NOT VALID;

ALTER TABLE compliance_assessments
  DROP CONSTRAINT IF EXISTS compliance_assessments_period_valid;
ALTER TABLE compliance_assessments
  ADD CONSTRAINT compliance_assessments_period_valid
  CHECK (assessment_period_end IS NULL OR assessment_period_start IS NULL OR assessment_period_end >= assessment_period_start);

-- Keep the operational dashboard view aligned with the fields returned by the
-- API.  The original view did not expose verified controls and labelled high
-- findings as critical, which made the dashboard either fail at query time or
-- overstate the severity of the tenant's findings.
--
-- `total_evidence` retains its original name for backwards compatibility; the
-- repository aliases it to `evidenceCollected` at the API boundary.
CREATE OR REPLACE VIEW compliance_dashboard_summary AS
SELECT
  f.tenant_id,
  f.id AS framework_id,
  f.name AS framework_name,
  COUNT(DISTINCT r.id) AS total_requirements,
  COUNT(DISTINCT c.id) AS total_controls,
  COUNT(DISTINCT c.id) FILTER (
    WHERE c.implementation_status IN ('implemented', 'verified')
  ) AS implemented_controls,
  COUNT(DISTINCT cf.id) FILTER (WHERE cf.status = 'open') AS open_findings,
  COUNT(DISTINCT cf.id) FILTER (
    WHERE cf.status = 'open' AND cf.severity = 'critical'
  ) AS critical_findings,
  COUNT(DISTINCT ce.id) AS total_evidence,
  COUNT(DISTINCT ca.id) AS total_assessments,
  MAX(ca.updated_at) AS last_assessment_date,
  COUNT(DISTINCT c.id) FILTER (
    WHERE c.implementation_status = 'verified'
  ) AS controls_verified
FROM compliance_frameworks f
LEFT JOIN compliance_requirements r
  ON r.framework_id = f.id AND r.tenant_id = f.tenant_id
LEFT JOIN compliance_controls c
  ON c.requirement_id = r.id AND c.tenant_id = f.tenant_id
LEFT JOIN compliance_findings cf
  ON cf.requirement_id = r.id AND cf.tenant_id = f.tenant_id
LEFT JOIN compliance_evidence ce
  ON ce.requirement_id = r.id AND ce.tenant_id = f.tenant_id
LEFT JOIN compliance_assessments ca
  ON ca.framework_id = f.id AND ca.tenant_id = f.tenant_id
WHERE f.status = 'active'
GROUP BY f.tenant_id, f.id, f.name;
