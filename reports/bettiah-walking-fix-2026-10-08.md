# Bettaih helmet walking miss — 8 October 2026

The reported Channel 5 bent-forward frame at **10:08:13 AM IST** now produces a helmet detection with **93.4% classifier confidence**. Version **1.3.3** was deployed at **12:15:37 PM IST**. The corrected detector, verifier, and classifier runtime fingerprints still matched at **12:31:52 PM IST**, after the other editor's deployment. The local source and compiled build also contain the correction.

The earlier release improved head localization but did not fix this frame: its helmet evidence remained below the unchanged 0.80 threshold. The new correction updates the head classifier using one confirmed Bettaih image at two processing resolutions and preserves native upper-body head search. Independent head localization, the strong person gate, minimum source-head size, clipped-head rejection, and contrary-evidence rejection remain in place.

## Verification and limits

- **84 targeted regression tests passed**, with zero failures. Analytics typecheck and build passed.
- Actual deployed-module replay detects the reported frame and rejects the carried-helmet frame. These isolated replays submitted **zero production events or notifications**.
- Bettaih's 12-frame sequence now gives eight detection frames, first at 10:08:13. The clipped 10:08:11 frame and the weaker/misaligned 10:08:15 frame still abstain.
- Kollam Channel 4 and Channel 8 detections remain present. **53 confirmed negative frames produced zero alerts**, including a carried helmet and pre-entry staff footage.
- A separate 16-image, 138-crop held-out set had zero misses or false positives at the 0.80 threshold. This is limited regression evidence, not a guarantee across all camera views.
- The reported Bettaih image was used as training feedback. Its successful reproduction establishes that this known miss is corrected; it is **not independent validation of unseen walking poses**. A fresh wearer walkthrough remains necessary.

## Current live blocker

At the final ingestion check at **12:35:23 PM IST**, the Hajipur gateway (feeding Bettaih, Hajipur, and Rajkot), Kollam Scanner, and Peravaruni Scanner still had their last heartbeats at approximately **12:00:06–09 PM IST**, after restart commands completed. Their database `online` labels were stale. The post-fix snapshot had **zero fresh branch-camera frames**; all nine latest-frame keys in the final ingestion check belonged to the excluded Local Camera Pilot. The analytics engine is healthy for helmet inference.

The three branch collectors were not found running on this PC or on the GCP application server. An old local SentinelGrid installation belongs to a different agent identity and an obsolete endpoint, so it cannot safely restore these current branch collectors. Their current installation location is needed to recover frame ingestion with the existing identities. A missing historical alert's exact original ingestion/delivery cause is not established by these archived-frame replays.

The database currently contains 37 active branch cameras because two Kollam cameras were added during the investigation. This work did not activate them or change branch mappings. The user's requested scope remains the original 35 active branch cameras, excluding Local Camera Pilot; the additional two have not been accepted as presentation scope.

## Release evidence

- [Deployment and isolated server replay](bettiah-walking-fix-deployment-2026-10-08.json)
- [Final live runtime fingerprints and health](bettiah-walking-fix-final-health-2026-10-08.json)
- [Root regression test results](bettiah-walking-local-tests-2026-10-08.json)
- [Classifier validation](bettiah-walking-probe-validation-2026-10-08.json)
- [Bettaih sequence replay](bettiah-walking-fixed-replay-2026-10-08.json)
- [Kollam and negative-frame replay](bettiah-walking-regression-replay-2026-10-08.json)
- [Branch ingestion and collector commands](bettiah-post-fix-ingestion-2026-10-08.json)
- [Final collector heartbeat and frame check](bettiah-post-fix-ingestion-final-2026-10-08.json)
- [Post-fix branch fleet snapshot](bettiah-walking-fix-fleet-2026-10-08.json)
- [Source reconciliation after concurrent deployment](bettiah-walking-source-reconciliation-2026-10-08.json)

Pinned release package: `tmp/bettiah-walking-fix-20261008/package-20261008064447138.tar.gz`.

Server rollback: `/opt/sentinel-grid/presentation-releases/20261008064447138/rollback.sh`.
