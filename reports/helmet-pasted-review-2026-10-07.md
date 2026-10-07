# Review of the pasted walking-person analysis

Reviewed against the current source on 7 October 2026. This work changed local
code and offline validation tools only; it did not deploy services, change live
rules, modify Windows certificate trust or submit production events.

## Corrections applied

1. Removed the newly added 8%-of-frame person-width and normalized aspect-ratio
   restrictions. They could reject a narrow side-on person, and their geometry
   does not establish human presence. Restored the existing legacy 20% height
   gate rather than adopting an unvalidated 18% relaxation. The adapted path
   retains strong person confidence, 72 source-pixel body height, 20x20 source
   head pixels and independent full-head verification. A regression now covers
   a narrow legacy person with usable localized helmet evidence.
2. Replaced incorrect compiled-module imports with the actual nested TypeScript
   output paths. Both scripts work from the repository root or engine directory.
3. Replaced canvas/RGBA input with existing sharp-based RGB24 decoding. Raw
   captures must supply valid source dimensions and the exact RGB byte count.
4. Added an offline sequence runner with a labelled manifest. Missing files,
   empty datasets, unlabelled positives/negatives, duplicate frame filenames,
   non-increasing timestamps and failed expectations fail the run. Non-fast
   positive cases need multiple real captures. Confirmation state is reset
   between cases; model sessions are closed even on failure.
5. Count helmet wearers using aggregate compliantCount metadata. A mixed scene
   with one helmet wearer and one bare-headed person expects one helmet wearer,
   not two helmet-worn results. A negative case fails if any frame alerts.
6. Replaced the fabricated black-image/person debug test with a health-only mode
   or an explicitly supplied real frame. Configuration printed by the tool is
   the configuration actually used, matching analytics-pipeline defaults.
7. Rewrote the guide to remove unsupported accuracy percentages, fixed latency,
   FPS claims, invented API examples and claims that model presence proves
   readiness. No environment threshold changes were made by this review.

## Configuration facts missing from the pasted analysis

The candidate object threshold 0.35 does not mean every 0.35-confidence person
can produce an adapted helmet alert. That path requires person confidence 0.80
and the source-pixel/head gates. Raising HELMET_CONFIDENCE_THRESHOLD from 0.75
to 0.88 is not automatically an accuracy fix and needs field evaluation.

An empty HELMET_HEAD_EVIDENCE_CAMERAS disables the adapted model in the default
detector. '*' enables it globally. In the analytics pipeline fast alerts default
to enabled unless explicitly set to false. Strong adapted full-head scores can
confirm on one capture; weaker evidence needs multiple distinct observations.
Face and pose vetoes describe legacy verification, not the adapted full-head
path that supports visible faces inside a helmet/visor.

The HD camera allowlist and gateway capture changes from the prior walking fix
are still relevant. Neither shape heuristics nor confidence changes restore
source detail that the gateway has already discarded.

## Verification

- 91 tests passed across helmet head verification, false-alarm regression and
  the new offline replay tests.
- Analytics TypeScript build and JavaScript syntax checks passed.
- Both CLI help modes passed; the debug health mode loaded models, clearly
  reported that no real frame was supplied, and closed its model sessions.
- With adapted head evidence enabled, the replacement runner passed three
  saved sequences (16 real captures): CH4 walking positive, CH8 user-confirmed
  helmet positive, and CH9 unrelated-background/clipped-view abstention control.
  Expected maximum helmet wearer counts were 1, 1 and 0. Zero production events
  were submitted. This is not a new CH9 positive walking validation.
- A run without head evidence enabled correctly failed both positive sequences
  instead of claiming readiness. That legacy comparison is retained separately.
- Whitespace checks passed for the modified analytics files. The full-worktree
  check also reports a pre-existing trailing blank line in the independently
  edited scratch/deploy-analytics-fix.mjs.

Evidence: [adapted replay](helmet-pasted-review-replay-2026-10-07.json),
[legacy comparison](helmet-pasted-review-legacy-replay-2026-10-07.json), and
[corrected guide](../analytics-engine/HELMET_DETECTION_WALKING_PERSONS.md).

Deployment and a new CH9 walking pass remain separate release/field steps.
The pasted claim that the module is fully ready is not supported by these
limited replay samples alone.
