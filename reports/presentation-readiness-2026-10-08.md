# Branch camera and helmet presentation check — 8 October 2026

## Latest status — 12:35 PM IST

The Bettaih Channel 5 reported bent-forward miss is corrected in deployed helmet version **1.3.3**: the 10:08:13 AM recording frame now detects at **93.4% classifier confidence**. The frame was used as confirmed training feedback; fresh walking coverage still needs a live test. **84 regression tests passed**, analytics typecheck/build passed, and 53 confirmed negative frames produced zero alerts. The final server fingerprints confirm this release remains active after the other editor's deployment.

**Live branch alerts are currently blocked by missing frames.** The Hajipur, Kollam, and Peravaruni collectors last sent heartbeats at approximately **12:00 PM IST**, following restart commands; the 12:35 PM check confirmed no newer heartbeats despite stale database `online` labels. The post-fix branch snapshot had zero fresh frames. The current healthy helmet engine is receiving excluded Local Camera Pilot feeds, which do not establish branch readiness. Collector installation locations are needed for recovery. The requested presentation scope remains the original 35 active branch cameras; this work did not activate the additional two Kollam cameras that appeared during the investigation.

Fire/smoke remains degraded. A fresh wearer test, actual alert delivery, and operator-browser popup/audio verification remain required after branch ingestion is restored. See the [completed Bettaih fix and remaining blocker](bettiah-walking-fix-2026-10-08.md) for current evidence and rollback details.

## Earlier check — historical status, superseded above

The branch feeds and helmet rules are operational. Complete helmet detection on every camera is **not yet verified**: the Bettaih Channel 5 recording still contains missed walking/bent-forward helmet frames. A fresh wearer test and operator-browser popup/audio check remain necessary.

At **11:52:51 AM IST**, all **37 currently active branch cameras** had enabled helmet-worn rules and frames younger than 90 seconds. The fleet grew from 35 to 37 through two additional Kollam cameras during the investigation. Local Camera Pilot was excluded as requested. Camera activation and branch mappings were not changed by this work.

The continuity check saw 36 cameras advance immediately. Bettaih Channel 8 subsequently advanced in the final snapshot. Per-camera status endpoints return a global operational engine state with unknown stream status and no inference timing; they do not establish individual camera inference coverage.

The validated helmet release was deployed at **11:44:59 AM IST**. It restores independent localized-head evidence, the strong person gate, minimum source-head size, clipped-head rejection, and consecutive confirmation for weaker evidence. It additionally searches the native upper-body crop when no associated head was found, including nearby people. Server source and runtime checksums were verified. Other concurrent local source edits were preserved; use the pinned release package when reproducing this deployment.

Validation: **82 helmet regression tests and 8 dashboard alert tests passed**. Offline real-frame replay retained Kollam Channel 4 and Channel 8 walking detections and produced **zero alerts on 20 confirmed negatives**, including a carried helmet. No production events were submitted by these replays.

Bettaih replay improved from five to six alert frames out of twelve: the newly recovered image is **already seated at 10:08:19 AM**, two seconds before the previous first result. The earlier bent-forward image remains below the helmet evidence threshold at both 640×360 and 960×540. This is an improvement in seated recognition, not a verified fix of the walking miss or the original historical delivery failure.

Final analytics health: helmet healthy, required models loaded, zero reported frame-processing failures, and notification integration operational. There are 50 dashboard helmet delivery records in the last 24 hours with no failed/pending records. These records include an unverified recent Bettaih event; a separate local workflow posts archived images with current timestamps, so that event is not accepted as fresh live validation. Automated popup tests use mocked audio and cannot confirm sound in the presentation browser.

Fire/smoke is degraded because its model failed the responsiveness self-test. Therefore this check does not certify all alert types.

Before presenting, enable **POPUPS ON** and activate alert audio in the operator browser. Conduct a fresh 30-second helmet wearer walk-through and record its branch, channel, capture time, resulting alert, and visible popup/audio delivery.

Evidence: [final fleet snapshot](presentation-final-snapshot-2026-10-08.json), [continuity check](presentation-frame-continuity-final-2026-10-08.json), [analytics health](presentation-analytics-health-final-2026-10-08.json), [deployment](presentation-native-retry-deployment-2026-10-08.json), [regression tests](presentation-native-retry-tests-2026-10-08.json), [real-frame replay](presentation-native-retry-replay-2026-10-08.json), [Bettaih replay](presentation-bettiah-native-retry-2026-10-08.json), [higher-resolution miss trace](presentation-walking-hd-trace-2026-10-08.json).

Pinned package: `tmp/presentation-helmet-native-retry-20261008/package-20261008061412292.tar.gz`.
Server rollback: `/opt/sentinel-grid/presentation-releases/20261008061412292/rollback.sh`.
