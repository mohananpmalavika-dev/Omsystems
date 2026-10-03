# Detector-only update: helmet 1.1.0 -> 1.1.1

Target: kryptovision-server, asia-south1-b; sentinel-gcp-analytics-engine.
Production remains unchanged until this update is approved and applied.

1. Verify SHA256SUMS.txt and upload helmet-detector.js to a new host staging directory.
2. Back up /app/dist/analytics-engine/src/detectors/helmet-detector.js from the container to that host directory before replacing it.
3. Copy the new detector into the same container path, verify its SHA-256 (f23eb7a35c08753e6e1883c08a4f7e18c11e4df59e942241c595cbf577d5bb5d), and run node --check on it.
4. Restart only sentinel-gcp-analytics-engine. Wait for /live and /health on port 8092; verify the helmet detector is healthy and the strong person-evidence check is active.
5. Verify no new false helmet events on the affected cameras. Static replays did not submit production events.

Rollback: copy the original detector from the host backup to its original container path, then restart only analytics and check health.

The runtime patch must also be included in the next analytics image rebuild using repository version 1.1.1; container recreation removes a runtime-only copy.
