# Disposed ONNX session correction — local only

The production Local Camera Pilot Channel 8 frame path returned HTTP 500 with `Session already disposed.` while an isolated detector with freshly loaded models confirmed the same helmet wearer. The model cache returned native sessions directly to adapters that retain them for the service lifetime. Optional sessions could be unloaded after their last acquisition even while adapters continued using them.

`analytics-engine/src/model-manager.ts` now returns managed session handles. Each inference refreshes cache activity and obtains the current native session; a retained adapter transparently reloads an evicted optional model. Concurrent reloads share one load. Idle and memory eviction skip in-flight inference, and forced unload waits for existing inference before disposal. Shutdown clears its cleanup timer and releases required sessions as well.

Helmet classification thresholds, head-verification logic, alert rules, and confirmation requirements were not changed.

Validation completed:

- 65 focused model-manager, helmet-verification, and false-alert tests passed.
- 27 additional inference/API compatibility cases passed. The initial run passed 25 cases and timed out in two native-model startup cases at the default 20-second limit; those two passed when rerun with a 60-second allowance. The filtered rerun skipped the 11 API cases already exercised, rather than rerunning them.
- All five new lifetime regressions fail against pre-correction source `4f817046`, including the reproduced disposed-session exception and disposal during inference.
- Analytics typecheck, fresh compiled build, compiled JavaScript syntax, and whitespace checks passed.
- Real ONNX session validation passed: an existing pose adapter ran successfully after its optional native session was disposed and reloaded; concurrent retained consumers also succeeded. Helmet head-localizer execution passed. No diagnostic events were submitted.

The user explicitly instructed **do not deploy**. No package upload, production file update, service restart, or deployment was performed. Production runtime recovery and a new live helmet alert have not been verified with this correction.

The code-only local archive is `tmp/model-session-fix-20261006.tar.gz`. Its files contain source, compiled code, checksums, and validation/deployment scripts; no camera frames, model binaries, or credentials are included. The deployment script has not been run.
