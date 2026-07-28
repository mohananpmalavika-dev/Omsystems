# Phase 6 user acceptance test and sign-off

UAT must run in a production-like environment using client-approved branches, roles, notification recipients and retention policy. The release script accepts only an explicit JSON sign-off; the example remains `approved: false` by design.

| ID | Acceptance scenario | Required evidence |
| --- | --- | --- |
| UAT-01 | HO summary shows every authorized branch and correct healthy/warning/critical totals | Screenshot, API response and reconciliation sheet |
| UAT-02 | Branch drill-down shows all authorized cameras, recorder, HDD, internet and retention status | Branch sample across every region |
| UAT-03 | Retention below policy is red and creates an operational exception | Recording timeline and alert ID |
| UAT-04 | P1 alert produces sound/pop-up, live view, snapshot/clip, SMS, email and phone attempt | Alert and provider attempt IDs with timestamps |
| UAT-05 | P2/P3/P4 follow the exact notification matrix | One test alert per severity and delivery audit |
| UAT-06 | Two operators acknowledge the same alert concurrently without conflicting final state | Audit trail and both client responses |
| UAT-07 | Daily CSV/XLSX/PDF totals reconcile and scheduled email arrives | Run ID, checksums and delivery ID |
| UAT-08 | Region/branch/device/severity/state/date filters restrict results correctly | Export samples and expected counts |
| UAT-09 | Unauthorized user cannot view another tenant/branch/camera or signed artifact | 401/403 evidence and audit record |
| UAT-10 | Branch WAN outage recovers and at least 99% of buffered events replay without duplication | Phase 5 evidence file |
| UAT-11 | Backup restores to an isolated database inside approved RPO/RTO | Backup manifest, restore output and validation record |
| UAT-12 | 400 branches, 5,000 cameras and 100 users meet the approved 24-hour SLO gate | Production-certified scale evidence |

Blockers include tenant leakage, data loss, missed P1 routing, report corruption, restore failure, unresolved critical/high security findings, or unmet contracted scale/SLO thresholds. Copy `deploy/approvals/uat-signoff.example.json`, attach evidence references, obtain client approval, then provide that file to `UAT_SIGNOFF_FILE` during release preflight.
