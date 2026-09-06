# Production readiness workflow gate

Run this gate against a production-like stack before release:

1. Start Postgres, control plane, media gateway, recorder, dashboard, Prometheus, Grafana, and Alertmanager with non-development secrets.
2. Enroll a test branch and at least two cameras.
3. Confirm the command center reports a timestamped telemetry truth state.
4. Open the live wall and verify a real stream session is created.
5. Stop recording for one test camera and verify the branch becomes at risk.
6. Create or ingest an incident, open its supporting video, and assign a response action.
7. Export evidence and verify its checksum/chain-of-custody metadata.
8. Stop the edge agent, confirm stale telemetry is shown, restart it, and confirm recovery to current.
9. Confirm Prometheus receives HTTP/database metrics and Alertmanager receives a test alert.

The dashboard E2E suite covers the operator navigation and truth-state presentation. The remaining steps require real camera/media fixtures and should run in a protected integration environment.