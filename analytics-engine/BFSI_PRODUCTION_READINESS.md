# BFSI AI production gates

The policy engine is intentionally fail-closed. It accepts a signal only when `verifiedSource` is true; this is set only by a loaded, checksum-verified model or authenticated hardware event.

Before enabling an action for a branch, complete all gates below:

1. Put a legally approved ONNX artifact and exact SHA-256 in the main model manifest. Do not use an unreviewed public model for biometric, weapon, or gunshot decisions.
2. Calibrate the camera zone, detection threshold, dwell window, and evidence retention with recorded branch footage.
3. Test alert delivery, silent panic routing and two-way speaker protocol with the SOC. Speaker actions must not auto-unlock doors or execute other physical control actions.
4. For face identity, enforce consent, local processing, liveness, temporal confirmation, human review and retention policy.
5. For audio, configure a microphone-capable stream and a separately verified audio ingestion pipeline; video-only cameras cannot produce glass-break, gunshot or scream observations.

`models/bfsi-security-manifest.example.json` lists the model contracts and the required environment variables. It does not grant production readiness merely by being present.
