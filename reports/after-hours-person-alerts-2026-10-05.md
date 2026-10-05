# After-hours person P1 alerts

Applied to the live KryptoVision GCP server on 5 October 2026 for OM Systems Pilot.

- Enabled all 43 existing, unarchived `person` rules across Bettaih (8), Hajipur (8), Local Camera Pilot (10), PERAVARUNI (9), and Rajkot (8).
- Set severity to P1 and the daily Asia/Kolkata schedule to 20:00 inclusive through 08:00 exclusive. Interpreted the user's "morning 8 pm" as 8 AM.
- Person detection includes recognised staff and unknown visitors; no identity exemption or zone restriction applies to these rules.
- Kept the existing 65% confidence threshold, zero minimum duration, 60-second cooldown, recipients and evidence policies. Existing deduplication and false-alarm feedback still apply.
- Verified that no person or all-types suppression configuration blocks these rules. Left the separate disabled NBFC and vault rules unchanged.
- Saved complete before/after rule settings in `audit_events` under `analytics.after_hours_person_configured` in the same transaction.

The deployed control-plane repository and alert engine passed 4,214 read-only checks across all 43 rules, seven days, known/unknown-person metadata, and daytime/nighttime boundaries. Matches start at 20:00 and stop at 08:00; matching events resolve to P1. No synthetic alerts were created and no service restart or code deployment was needed. This validates configured matching behavior; actual detection requires an available camera feed and a person observation meeting the confidence threshold.

Operational artifacts:

- `scratch/set-after-hours-person-20261005.sql`: applied transaction with configuration assertions and audit backup. Do not replay blindly; it records a new audit snapshot each time.
- `scratch/verify-after-hours-person-live-20261005.mjs`: read-only verification against the deployed alert engine.
- `scratch/after-hours-person-server.mjs`: runs an explicitly supplied SQL or JavaScript file on the existing server connection.

## Alert name update — 6 October 2026

Deployed the requested exact title **Person Detected after office hour** for person rules whose schedule crosses midnight. Future alerts use this title; the two existing overnight P1 alerts were renamed, with their previous titles recorded in `audit_events` under `analytics.after_hours_person_alerts_renamed`. Neither had an incident title needing renaming.

The deployment modifies only the alert-title function in the currently deployed control-plane image and its server source. The previous image and source are retained at `/tmp/sentinel-person-alert-name-20261006` and Docker tag `sentinel-gcp-control-plane:before-person-alert-name-20261006`. Candidate title checks and the control-plane readiness check passed. Read-only verification then checked all 43 saved rules for the exact title and repeated all 4,214 schedule checks successfully without generating alerts. P1 severity and the daily 20:00–08:00 Asia/Kolkata window remain intact.

A broader local analytics/severity run had 17 passing checks and two failures: an application startup hook timeout and a bundle test expecting vault/ATM rules absent from the current bundle. Those failures are outside the changed title function. Direct local title checks cover overnight naming and preservation of ordinary person and helmet titles.
