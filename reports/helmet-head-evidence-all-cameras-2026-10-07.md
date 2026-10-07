# Complete-head helmet recognition enabled for all cameras

On 7 October 2026, the user requested extending the working Kollam CH4/CH8 fix
to every camera. Detector version **1.3.1** supports `*` in
`HELMET_HEAD_EVIDENCE_CAMERAS`. Deployment now uses that wildcard, covering
existing and future camera IDs without maintaining a list.

Camera helmet rules still determine whether alerts are generated. This change
does not create or enable rules, alter their confidence/duration/cooldown
settings, or retrain the model. It extends the same complete-head verification
and confirmation behavior used by the working 1.3.0 deployment.

## Checks

**103 tests passed** in the head verification, false alarm, specialty inference
and model manager suites. New tests verify wildcard matching for different
branches and newly added camera IDs, and actual default-detector model loading
and alert generation with a wildcard configuration. Explicit camera lists and
failure when a configured model is absent remain covered. TypeScript build and
whitespace checks passed.

The earlier 19-image negative replay and raw walking validation are documented
in `reports/kollam-head-evidence-fix-2026-10-07.md`. Recognition accuracy has not
been field-verified on every camera. Those controls and the real Kollam alerts
establish the tested behavior; a wildcard setting establishes deployment scope.

## Deployment

Deployment completed as release `20261007122024644`. At **17:52:37 IST**,
production reported **AI_OPERATIONAL**, a healthy helmet detector, version
**1.3.1**, and `HELMET_HEAD_EVIDENCE_CAMERAS=*`. All six deployed runtime files
matched the locally built candidate. The feature model and learned probe
checksums matched the previously validated model.

The new image is tagged `helmet-head-20261007122024644` and `latest`. Source,
model files and the wildcard configuration are persisted on the host. The
previous working image and project settings are retained; rollback is
`/opt/sentinel-grid/helmet-head-releases/20261007122024644/rollback.sh`.

Read-only production verification is saved in
`reports/helmet-head-evidence-all-cameras-release-2026-10-07.json`. No synthetic
or replay alerts were posted during this rollout.
