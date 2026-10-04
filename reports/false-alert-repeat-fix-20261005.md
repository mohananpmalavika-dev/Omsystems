# False alert repeat feedback — 5 October 2026

Marking an analytics alert as a false alarm now saves feedback for the reviewed
object or scene. Subsequent matching detections remain in the event history but
produce no new alert, notification, siren command, or evidence capture.
Other objects/scenes remain eligible to alert immediately, including during the
normal resolved-alert cooldown. The camera's alert type stays enabled.

Feedback is scoped to tenant, camera, and rule. Matching requires a compatible
model, zone, and explicit event correlation where supplied. For tracked objects,
IDs and tracker scope must agree; image appearance must also agree when available.
For untracked objects, both a tightly overlapping box and similar image appearance
are required. A box or detection type alone never permanently suppresses an alert.
Additional objects, changed appearance, missing evidence, different tracker
sessions, and changed models remain alertable.

The signature uses compact RGB samples from the original unannotated event
snapshot. It stays attached to the original evidence shown for review even when
later detections have coalesced into that alert. PostgreSQL stores the feedback
durably; ingestion and review share a camera transaction lock. Existing alerts
can derive signatures from their original stored event when first marked.
Queued or retrying notifications are cancelled on review. Notifications already
being processed or delivered cannot be recalled.

The dashboard reports whether identifying evidence was sufficient to activate
repeat suppression. Image matching is conservative and approximate: substantial
lighting or geometry changes may alert again, and visually indistinguishable
objects cannot be guaranteed distinct. Without an explicit tracker session,
track-only feedback is scoped to the event's date. This is feedback filtering,
not retraining the detector.

## Validation

- 10 new tests passed: authenticated ingestion/review, repeat suppression beyond
  cooldown, immediate new-object alerts, visual changes at the same location,
  missing/corrupt evidence, original reviewed evidence, stale review rejection,
  models/zones/tracker sessions/additional objects, scene-only matching, camera
  isolation, and PostgreSQL transaction behavior using a mocked pool.
- 24 existing analytics/command-center/branch-opening tests passed.
- One existing camera AI bundle assertion fails: it expects 35 capabilities/350
  created rules, while the unchanged bundle returns 34/340. That test and bundle
  were not modified.
- Backend and dashboard TypeScript checks passed. Diff whitespace check passed.
- No live PostgreSQL integration or production deployment was performed.

## Activation

Apply `database/migrations/20261004_false_alarm_scene_feedback.sql` before
deploying the updated control plane, then deploy the dashboard. The new columns
are required by the updated alert queries. No analytics-engine deployment is
needed: it already sends the original snapshot in event metadata.
Historical false alarms marked before this fix are not automatically backfilled;
marking them again will derive feedback where original evidence is available.
