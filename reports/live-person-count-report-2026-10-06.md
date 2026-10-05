# Live person count report

Implemented locally. The user explicitly requested no live deployment. No package transfer, server source change, image replacement or production count configuration was performed for this report.

## Report

Open `/reports/live-person-count`, or use **Live person count report** beside the Live Wall window controls, **Live person count** in the report studio, or its entry under **Evidence & assurance**.

- Branch name, total person count, report time in IST, total cameras, cameras online, cameras not working and current reporting-camera coverage. The summary and branch/region/zone groups include all three camera totals.
- Camera health uses inventory status at report time: online includes degraded connections; not working includes offline or unknown status. It is independent of inference coverage, so an online camera without a current person count stays online. Camera status totals become stale after 90 seconds without a report refresh.
- Zone, region and branch filters, with branch, region or zone grouping.
- Automatic refresh every **60 seconds**, plus refresh now, pause and resume.
- Exact starred note beneath the table: **\* Branch totals will be estimates from camera views; overlapping views can count the same person more than once.** The person-count headings also carry `*`.
- Zero represents a successful empty observation. Missing inference, unavailable cameras, and data older than 90 seconds are shown as unavailable or stale, not zero. Incomplete totals show partial coverage.
- The report follows camera inventory, so newly added branch cameras appear without creating an alert rule.

## Count feed

The authenticated frame pipeline returns an independent person-count observation from the shared object inference pass, including empty scenes. It counts persons at or above 65% confidence, independent of an alert schedule or identity. Frames without configured alert rules can still produce report observations. A missing local model returns unknown rather than an invented zero.

The control plane records only a validated engine result matching the submitted capture time, in tenant/camera-scoped Redis keys. Writes are atomic and keep the newest capture if requests finish out of order. Old/future captures are rejected and observations expire. Report access uses existing analytics permissions, with camera-level scoping and ancestor-based region/zone filters; clients do not provide count values.

The report feed creates no alert rules or notifications. `person-counting` and `occupancy-counting` matches are excluded from the shared alert rule matcher. The separately configured after-hours `person` P1 rules retain their severity, schedule and title.

## Verification

- 20 automated report/analytics adapter tests passed, covering zero observations, rule-free cameras, model unavailability, partial/stale coverage, grouping, intersecting filters, new cameras, tenant-scoped reads, permission-limited filter options and non-alerting count rules.
- The camera-health update adds coverage for status totals, grouping/filtering and independence from inference availability; all 8 report tests passed.
- Control plane, analytics engine and dashboard TypeScript checks passed.
- Browser QA passed: camera-health summary/row totals, no refresh before 60 seconds, exact starred note, cascading filters, zero/partial/unavailable displays, pause/resume, stale-data handling, failed request clearing, no runtime errors, and responsive desktop/mobile layouts.
- Desktop and mobile screenshots are in `tmp/person-count-qa/`. Their numbers are QA fixtures, not production counts.

Useful reruns:

```powershell
npm.cmd test -- test/live-person-count.test.ts analytics-engine/test/app.test.ts --maxWorkers 1 --hookTimeout 60000 --testTimeout 60000
node scripts/verify-live-person-count.mjs
npm.cmd run typecheck
npm.cmd run typecheck --workspace @sentinel/analytics-engine
npm.cmd run typecheck --workspace @sentinel/dashboard
```

No production validation was performed. Count availability after any future deployment depends on branch camera frames reaching the inference service and Redis being configured. Totals are camera-view estimates rather than unique branch occupancy; overlapping cameras and unsynchronised capture times can affect them.

## Manual deployment

The user will perform deployment manually. Update the control plane, analytics engine and dashboard together through the existing deployment workflow. The engine supplies count observations, the control plane records and scopes them, and the dashboard displays the report. Shared Redis is required; this feature adds no database migration. Once deployed, open `/reports/live-person-count` and confirm reporting-camera coverage from actual branch frames. No person-counting alert rules need enabling.

Local packaging scripts in `scratch/` and `tmp/live-person-report-package/` were prepared during implementation but were never transferred or executed on the server. They are optional deployment artifacts and must be regenerated and revalidated against any future server state before use.
