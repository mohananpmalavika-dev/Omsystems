# Local Camera Pilot Channel 8 — missing helmet alert check

Camera: `26b22c59-b492-434a-aa89-163fff620af1`, branch Local Camera Pilot.

The screenshot footer identifies Local Camera Pilot, not Bettaih. The initial Bettaih check does not explain this screenshot.

At 22:40 IST on 6 October 2026, the correct camera's helmet-worn rule was enabled, unarchived, and unscheduled, with confidence 0.70, duration 1 second, and cooldown 60 seconds. Its edge heartbeat was recent, and the shared analytics cache contained a frame captured at 22:39:09 IST. No helmet event or helmet alert was found for this camera. Detector 1.2.2, helmet inference health, and notification submission reported operational.

At 23:17 IST, an isolated run used the production models on a cached frame captured at 23:16:13 IST. The 640×360 RGB frame visibly showed the room without the wearer. Object inference returned only a refrigerator observation, and the head, face, and pose models returned no observations. No helmet classification was attempted because no person was detected. No events were submitted.

This establishes current frame delivery and configuration, but does not reproduce or explain the earlier screenshot's missed detection. The submitted screenshot was unavailable as a local replay input, and the current cache had already replaced that scene. A fresh sequence showing the helmet wearer, or the original analytics frame from that period, is needed to distinguish person detection, head localization, classifier rejection, and consecutive-frame confirmation.

No production files, rules, or services were changed. No detector correction is claimed. The machine-readable isolated results are in `local-pilot-channel8-helmet-diagnosis-2026-10-06.json`.

## Follow-up with wearer present

The user returned the helmet wearer to view for a live check. At 23:19 IST, the cached RGB frame captured at 23:18:41 IST detected a person with confidence 0.8651 and a localized helmet with confidence 0.7769. Whole-head, 15% context, and 75% context classification all passed, with the weakest helmet score 0.999999697. Face and pose inference returned no observations for this frame. The isolated detector held this first frame pending temporal confirmation.

A subsequent isolated detector retained state across two naturally distinct captures at 23:21:22 and 23:21:51 IST. Both frames passed verification. The second produced a `helmet-worn` result with `requiresAlert: true` and confidence 0.999990322. No artificial timestamps were used and no diagnostic events were submitted. Details are in `local-pilot-channel8-person-present-2026-10-06.json` and `local-pilot-channel8-live-sequence-2026-10-06.json`.

Production did not create a corresponding helmet event or alert. Control-plane logs repeatedly identify this exact camera with `Analytics engine rejected edge frame`, upstream HTTP 500, returned to the edge as HTTP 502. The analytics service logs contain repeated `Session already disposed.` exceptions from `onnxruntime-node/dist/backend.js:117`. A bounded extraction counted 18 such exception messages in the recent log window; that count is log messages, not distinct failed frames. These findings establish a runtime session failure on the production processing path, while freshly loaded isolated model sessions recognize and confirm the wearer.

The healthy service/model labels do not expose this runtime failure. Which model session was disposed, and why, remain to be established before a durable code correction. A service restart would reload sessions but has not been performed. No production changes were made in this follow-up.
