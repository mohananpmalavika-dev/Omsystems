# Video Analytics & AI

Sentinel's analytics module is an independent detection path. It receives
normalized detections from edge or central inference adapters and submits them
to the control plane. A failed model, GPU, or analytics service cannot stop a
camera's live stream or its recording worker.

```text
Camera/NVR -> Media gateway  -> Live browser
           -> Recorder       -> Durable segments
           -> AI model       -> Analytics adapter -> Rules -> Alerts -> Incident
```

## Phase 1 detections

The API supports motion, person, vehicle, generic object, line crossing,
polygon intrusion, loitering, crowd density, camera tampering, video loss, and
fire/smoke events. Face recognition, watchlists, and ANPR are deliberately
deferred because they need separate privacy, retention, and approval controls.

Each camera rule can configure:

- a normalized polygon or line region;
- days, time window, and IANA timezone;
- object classes, minimum confidence, duration, and direction;
- P1-P5 priority and alert cooldown;
- recipients and escalation delay;
- alert-only, event-recording, or protected-incident recording policy.

Cooldown processing aggregates repeated detections into one active alert while
retaining the event log and incrementing the occurrence count. Source event IDs
are idempotent, so inference adapters can safely retry delivery.

## Start locally

`docker compose up --build` starts the analytics adapter on port 8092. The two
development keys in `compose.yaml` authenticate model adapters to the analytics
service and the analytics service to the control plane. Replace both keys in
every non-development environment.

Model adapters submit a normalized event:

```powershell
$headers = @{ "x-analytics-source-key" = "development-analytics-source-key-change-me" }
$body = @{
  tenantId = "<tenant-uuid>"
  cameraId = "<camera-uuid>"
  detectionType = "person"
  confidence = 0.91
  durationSeconds = 3
  modelVersion = "people-v1.0"
  objects = @(@{ label = "person"; confidence = 0.91 })
} | ConvertTo-Json -Depth 6

Invoke-RestMethod -Method Post -Headers $headers -ContentType application/json `
  -Body $body http://localhost:8092/internal/detections
```

The `sourceEventId` and `occurredAt` fields are optional at the adapter boundary
and generated there when absent. They are required at the authenticated control
plane boundary.

## Operator and configuration APIs

| Method | Endpoint | Permission |
| --- | --- | --- |
| GET/POST | `/v1/cameras/:id/analytics/rules` | `analytics:view` / `analytics:configure` |
| PATCH/DELETE | `/v1/cameras/:id/analytics/rules/:ruleId` | `analytics:configure` |
| GET | `/v1/analytics/alerts` | `analytics:view` within camera scope |
| POST | `/v1/analytics/alerts/:id/acknowledge` | `alerts:acknowledge` |
| POST | `/v1/analytics/alerts/:id/escalate` | `alerts:escalate` |
| PATCH | `/v1/analytics/alerts/:id` | acknowledge or configure permission |
| POST | `/v1/analytics/alerts/:id/incidents` | `alerts:escalate` |

Creating an incident links the alert to the existing live-incident workflow and
places the configured pre/post-roll recording window under legal hold.

The dashboard is available at `/analytics`. It includes branch/camera scope,
rule creation and enablement, alert filtering, acknowledgement, investigation,
escalation, incident creation, resolution, and false-alarm classification.

## Production model integration

The analytics adapter does not ship a hard-coded detector. Integrate an ONNX,
TensorRT, OpenVINO, vendor-NVR, or cloud model by converting its output to the
normalized detection contract. Edge inference is recommended for bandwidth and
resilience; central inference is useful when GPU pooling is more important.
Hybrid deployment can use both because deduplication is source-ID based.

Notification rows are written as a durable outbox with `queued` status. Connect
the approved email/SMS/Teams provider as a separate dispatcher so delivery
failures do not affect event ingestion.
