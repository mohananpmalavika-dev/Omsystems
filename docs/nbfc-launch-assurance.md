# NBFC launch assurance plan

This is an execution checklist, not a claim of certification or independent testing.

## Independent penetration test

Before each pilot moves to production, engage an independent CREST-aligned or equivalent qualified assessor. Provide a written scope covering the dashboard BFF, control plane, media gateway, recording engine, edge agent, mobile/web clients, tenant isolation, APIs, identity flows, and production cloud/Kubernetes configuration.

Required evidence:

- Rules of engagement, asset list, test dates, and assessor independence statement.
- Severity-rated report with reproducible findings and affected version/build identifiers.
- Remediation owner, due date, verification evidence, and formal risk acceptance for any remaining finding.
- Retest report confirming closure of critical and high findings before production cutover.

## ISO 27001 / SOC 2 readiness

Create a named security owner and an evidence register. Start with these control groups:

| Control group | Minimum evidence |
| --- | --- |
| Asset and vendor management | Inventory, owners, classification, vendor risk reviews |
| Access control | Joiner/mover/leaver tests, quarterly access reviews, SSO/MFA settings |
| Secure delivery | Code review, CI results, dependency scans, signed releases, SBOM |
| Operations | Monitoring, incident exercises, backup/restore tests, change approvals |
| Privacy | Data map, retention schedule, DPIA, lawful-purpose and export audit evidence |
| Availability | SLOs, capacity tests, recovery objectives, failover/restore exercises |

Do not market ISO 27001 or SOC 2 compliance until an accredited certification body or licensed CPA has completed the relevant engagement.

## Pilot exit criteria

A pilot advances only when all are true:

- Signed authorization and data-processing terms are in place.
- Branch scope, users, hardware, retention, and escalation contacts are documented.
- Baseline outcomes are captured before rollout and measured after at least 30 days.
- Critical/high penetration-test findings are remediated or formally accepted by the pilot sponsor.
- A branch recovery and evidence-export drill has passed.
