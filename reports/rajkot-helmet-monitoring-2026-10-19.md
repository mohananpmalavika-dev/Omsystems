# Rajkot helmet alert investigation — 19 October 2026

All times below are IST. Monitoring is scheduled through 17:30; the final
observation summary will be appended when that window ends.

## Production changes

- The helmet detector's person-confidence minimum is **0.50** for all cameras.
  Deployment and runtime checksums are recorded in
  `helmet-person050-deployment-2026-10-19.log`.
- Detector **1.3.4** accepts complete, independently localized heads belonging
  to compact seated/overhead person boxes. The extended association region
  requires the candidate to remain at the top of the observed person.
  Compact person boxes require at least 64 native pixels of height; other
  boxes retain the 72-pixel requirement. Heads still require usable source
  pixels, complete-head classification agreement and two fresh timestamps.
- Full-head evidence handles visible faces behind clear visors. The legacy
  classifier retains its face/shell cross-check.
- Model availability checks reuse verified checksums while the model file's
  device, inode, size and modification/change times remain unchanged. This
  removes repeated hashing of every model from health/availability checks.

The final helmet-confidence rule was not changed to 0.50. The requested 0.50
change applies to the person gate that rejected the seated Rajkot wearer.

The active source and compiled detector/verifier files were backed up before
deployment. Association rollback on the server:
`/opt/sentinel-grid/helmet-association-releases/20261019/rollback.sh`.
The checksum-cache fix is retained by that rollback.

## Evidence and validation

- The original Channel 3 wearer scored approximately **0.59–0.67** as a
  person, below the former 0.80 gate. The observed body was partly hidden by
  the desk. Channel 5's overhead helmet scored approximately **0.98**, but its
  head/person geometry failed the former fixed association region.
- The corrected detector generated alerts in isolated replay of **4/15
  Channel 3 captures** and **5/15 Channel 5 captures**. Captures retain their
  real timestamps; no replay events were submitted to production.
- **20 negative images** produced no verified helmet candidates, including
  bare-head, empty-chair and carried-helmet controls. This is a bounded
  regression check, not an accuracy estimate for every camera/view.
- **99 related tests passed**. Older single-frame expectations were corrected
  to retain the deployed requirement for two distinct confirmations.
- The full analytics suite subsequently passed **166 tests**. Its calibrated
  shutter fixture now stubs the always-observed object-count path along with
  the other deliberately uninitialized inference components.
- Channel 1 automatic detection at **16:43:55.317** created an alert at
  **16:44:07.231**, approximately **11.9 seconds** later. Its annotated snapshot
  visibly encloses the worn helmet; confidence is **0.9833**.
- Further model-backed Channel 1 records occurred at 16:44:37, 16:44:55 and
  16:45:15. The latter two updated an existing incident under cooldown.
- Channel 6 has model-backed helmet evidence at **16:50:39.236**, accepted
  at **16:50:53.188**, approximately **14.0 seconds** later, confidence **0.9220**.

Evidence details are in `rajkot-confirmed-alert-2026-10-19.json`,
`rajkot-alert-source-audit-2026-10-19.json` and
`rajkot-association-validation-2026-10-19.json`.

## Remaining limits

- Channel 7's rear view can pass person detection and still be rejected by
  the complete-head classifier. Two trial feedback classifiers were rejected:
  the first missed other captured views; the second also produced a bare-head
  false positive. **Neither trial classifier was deployed.**
- Some accepted Rajkot alert records omit localized-head/model evidence.
  Their origin was not established; they are excluded from verified automatic
  detection counts. In particular, a 16:40:46 Channel 1 record has an earlier
  empty-entry snapshot and does not validate the later crossing.
- Dashboard notification rows marked `delivered` establish internal dispatcher
  acceptance. Browser popup/audio display was not independently verified.
- Kollam's gateway stopped supplying fresh AI frames after approximately
  **16:18:59**. During subsequent checks Rajkot, Bettaih, Hajipur and Peravaruni
  supplied 8/8 frames each; Kollam supplied 0/18. Thus coverage was 32/50.
- Instant alerts on every view have not been established. The verified live
  detections above took roughly 12–18 seconds from capture to acceptance.

All-camera rule coverage, frame coverage and alert monitoring are preserved in
the adjacent JSON/JSONL reports. Camera images remain in the local temporary
evidence directory rather than this report.
