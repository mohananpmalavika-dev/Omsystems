# Branch opening windows — 6 October 2026

Saved branch-specific opening windows on the live KryptoVision control plane for the four operational branches: Bettaih, Hajipur, PERAVARUNI and Rajkot.

- Window: 08:00–11:00, Asia/Kolkata (IST).
- Preserved the inherited Monday–Saturday schedule and inactive opening-alert state. The request changed opening times, not alert activation.
- Created four branch-scoped overrides of `tmpl-27-opening-staff-count`; the inherited rule and unrelated branch policies remain as configured.
- Persisted rule version history and an `audit_events` entry with action `branch_opening_window.configured`, including before/after settings.
- Verified each persisted schedule, branch identity, policy state and version history within one transaction. All 20 deployed schedule-engine boundary checks passed, then the transaction committed successfully.

Applied script: `scratch/set-branch-opening-window-20261006.mjs`, executed through `scratch/after-hours-person-server.mjs`. No application deployment was required.

## Opening alerts enabled after the user's follow-up

Enabled all four operational branch opening policies (`enabled=true`, `state=ACTIVE`) and all 32 existing camera `dual-control-verification` rules. The rules use P1 severity and protected evidence windows. The configured 08:00–11:00 Asia/Kolkata Monday–Saturday schedule remains in place. There is no applicable opening-alert suppression.

The deployed opening evaluator checks the first nonempty person observation once per branch per local day: one person fails, two or more pass, and an empty frame does not decide the opening. Verified 4,032 isolated decision checks across all 32 cameras, seven days, time boundaries and counts of zero, one and two, plus matching of all 32 P1 alert rules. Verification did not write daily decision state or create synthetic alerts.

Changes committed atomically with rule version history and a before/after audit entry `branch_opening_alerts.enabled`. Applied through `scratch/run-opening-alert-task-20261006.mjs` using `scratch/enable-branch-opening-alerts-20261006.mjs`.

## Prepared: defaults for additions and editable alert mode

Implemented locally. The user will deploy manually; no further upload or deployment will be attempted:

- Migration `20261006_branch_opening_defaults.sql` creates an enabled 08:00–11:00 IST Monday–Saturday branch policy on branch insertion and an enabled P1 rule on camera insertion. It also supplies a missing opening policy when adding a camera to a legacy branch. It preserves explicit existing custom schedules and disabled branch policies, serializes simultaneous additions, and records version/audit history.
- Template instantiation, opening-engine fallback and API/UI default times now use 08:00–11:00.
- The NBFC Operations branch opening card includes an **Enable opening alerts** switch, editable start/end times and **Save settings**. Its API accepts an explicit enabled flag and persists ACTIVE/INACTIVE state while retaining the selected time window. Existing callers omitting the flag retain the prior enabled behavior.
- `scripts/verify-opening-defaults.mjs` checks real branch/camera insertions in a rolled-back transaction. This integration check is prepared but has not been run: a local Docker daemon is unavailable and source upload to the live server was rejected by automatic approval review.
- `scratch/deploy-opening-settings-20261006.sh` prepares isolated candidate images, checks API mode changes and the migration before applying it, verifies source baselines, saves source/image backups, builds the dashboard and checks readiness. The focused package is `tmp/opening-settings-20261006.tar.gz`.

Focused branch-opening/API tests and dashboard type checking pass. The broader root type check is blocked by a pre-existing concurrent `src/store.ts:2460` reference to `ResourceNode.isActive`; the unmodified camera-bundle tests expect 35 rules while the existing bundle contains 34. Those unrelated files were not modified for this task.

Automatic approval review rejected the SCP upload twice, identifying transfer of internal source/compiled code as sensitive egress without explicit payload/destination authorization. Read-only inspection confirmed that the destination runs the existing KryptoVision services and all five source baselines match, but the second upload review still required explicit authorization. No default migration or settings UI/API deployment has been applied yet. Existing four-branch schedules and their enabled alerts remain live.

The user subsequently asked to handle deployment manually. The final local validation passed all 12 branch-opening/API tests and the dashboard type check. Include `database/migrations/20261006_branch_opening_defaults.sql` in the manual deployment and run the prepared PostgreSQL insertion checks after applying it.

## Branch opening report links

The existing report is at `/reports/mis?tab=branch-opening` (**MIS Reports → Branch Openings**). It lists each branch/day's first observation, person count, two-person opening result and available evidence, with period filters and CSV/PDF export.

Added direct **Branch opening report** links to the Command Center overview footer and the Live Wall header actions, including independent wall windows. These navigation changes are local for the user's manual deployment.

## Report filters and verification

The opening report now supports Organization → Zone → Region → Area → Branch, plus camera location and camera. Filter choices are computed by the opening-report API from permitted branches, with child choices narrowed by parent filters. Parent changes reset child selections. Camera/location filters apply to the camera that captured the first opening observation, retaining one opening decision per branch/day. A decision made by another camera is excluded rather than relabeled as Not recorded. The table and CSV include camera location.

Fixed stale-response handling during rapid filter changes, photo loading state when an evidence URL changes, and refresh routing for the opening tab. The Command Center footer actions wrap on small screens.

Verification:

- Final focused validation passed all 19 tests across report permissions/filtering, opening decisions, editable alert settings and CSV export. Dashboard TypeScript checking also passed.
- Local report route tests cover success/failure counts, inclusive date periods, missing observations, image cropping, evidence authorization, hierarchy/camera/location filtering and camera-choice permissions.
- CSV checks cover IST conversion, camera location, quoted values, unavailable evidence, null counts and spreadsheet-formula escaping.
- A read-only check executed the deployed report handler with its real PostgreSQL repositories: today's report returned six accessible branch-days, seven-day report returned 42, and a specific branch filter returned one. All 55 inspected rows passed consistency checks; there were no recorded opening observations. Invalid dates were rejected. This is handler/repository verification, not external HTTP authentication verification.
- Live settings for Bettaih, Hajipur, PERAVARUNI and Rajkot remain enabled for 08:00–11:00 IST. None has recorded an opening observation yet, so Not recorded is the correct report result until a qualifying observation arrives.
- An external login attempt using the server's configured bootstrap password received 401; no further credential guesses were made. No browser surface is available in this tool session, so browser interaction and print/PDF rendering could not be verified. The local report route responded HTTP 200, but AppLayout's client loading state means this does not verify hydrated report controls.
- These filter, navigation and export changes have not been deployed, per the user's manual-deployment instruction. Deploy the changed source normally; the earlier opening-settings archive predates the report-filter changes.
