# Digital Twin

Sentinel Grid now has an operational 2D Digital Twin in the deployed control plane and dashboard. It combines branch inventory, camera and recorder telemetry, access-control events, AI alerts, floor plans, zones, heat maps and investigation playback in one spatial view.

The production path is 2D first. The 2.5D and 3D selectors currently provide progressive floor-plan extrusion, field-of-view and status overlays; they do not claim BIM, CAD or glTF model ingestion.

## Operator and editor workflow

- `/digital-twin` lists every accessible branch and summarizes configured floors, placed objects and active alerts.
- `/digital-twin/branches/:branchId` is the live operator view.
- `/digital-twin/branches/:branchId/editor` enables floor-plan upload, inventory binding, drag placement and zone drawing for users with `device:configure`.
- Opening a camera exposes authorized HLS through the existing live-media session API.
- Door, sensor and equipment events change the placed object's state. Critical markers pulse and can be acknowledged or resolved.
- The timeline combines Digital Twin events, operational telemetry and AI alerts. Playback reconstructs the state at a selected time.

Coordinates are normalized to the floor plan (`0..1`) so replacing or resizing a plan does not move mapped devices.

## Live status model

| Visual | Meaning |
| --- | --- |
| Green | Online/healthy; camera recording when telemetry verifies it |
| Yellow | Camera online but not recording |
| Blue | Door open with authorization |
| Orange | Door held, degraded device, triggered sensor or battery warning |
| Red | Offline, forced entry, panic, fire, tamper or critical failure |
| Purple | Active AI alert at the bound camera |
| Grey | Unbound object or no current telemetry |

The latest timestamp wins between device telemetry and spatial events. A recovered device therefore cannot remain red because an older event is still in history.

## Spatial AI and heat maps

Active analytics alerts are mapped to the normalized position of their bound camera and appear in live state, incident heat maps, the timeline and historical replay. This is explicitly returned as a `camera-location approximation`; a camera-frame detection is not presented as an exact floor coordinate without a calibration transform.

Available heat maps are:

- `operational`: placed devices with warning or critical state;
- `people_security`: active spatial/AI security alerts;
- `incidents`: severity-weighted spatial alerts;
- `door_usage`: door events projected onto the door's placed position.

## APIs

All routes use the normal platform session, tenant scope and branch authorization.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/v1/digital-twin/branches` | Accessible branch twins |
| POST | `/v1/digital-twin/branches/:branchId/bootstrap` | Create the branch building and ground floor |
| GET | `/v1/digital-twin/branches/:branchId/live` | Multi-floor live state |
| POST | `/v1/digital-twin/floors` | Add a floor |
| POST | `/v1/digital-twin/floor-plans` | Upload a validated PNG, JPEG, SVG or PDF as base64 JSON |
| GET | `/v1/digital-twin/floor-plans/:planId/content` | Authorized plan content |
| GET | `/v1/digital-twin/floors/:floorId/floor-plan-versions` | Plan history |
| POST | `/v1/digital-twin/objects` | Place and optionally bind an object |
| PATCH | `/v1/digital-twin/objects/:objectId/position` | Persist normalized drag position |
| POST | `/v1/digital-twin/device-bindings` | Bind an existing object |
| GET | `/v1/digital-twin/objects/:objectId/nearby-cameras` | Distance-ranked cameras on the floor |
| POST | `/v1/digital-twin/zones` | Draw a normalized polygon zone |
| POST | `/v1/digital-twin/events` | Ingest an idempotent door/sensor/equipment event |
| GET | `/v1/digital-twin/floors/:floorId/state` | Consolidated live state; optional `heatmap` query |
| GET | `/v1/digital-twin/floors/:floorId/timeline` | Investigation events |
| GET | `/v1/digital-twin/floors/:floorId/playback` | Reconstructed state at `at` |
| POST | `/v1/digital-twin/alerts/:alertId/acknowledge` | Acknowledge a spatial alert |
| POST | `/v1/digital-twin/alerts/:alertId/resolve` | Resolve a spatial alert |
| GET | `/v1/digital-twin/events/stream` | Tenant/branch/floor-scoped SSE invalidation stream |

Floor-plan uploads are limited to 25 MiB. Magic bytes are checked, filenames are sanitized and SVG scripts, event handlers, `foreignObject`, JavaScript links and external HTTP links are rejected.

## Event contract

An integration gateway can map an access-control or sensor observation with:

```json
{
  "floorId": "floor-id",
  "twinObjectId": "placed-door-id",
  "deviceType": "door",
  "deviceId": "door-controller-7",
  "eventType": "door_forced",
  "state": "forced_entry",
  "previousState": "closed_secure",
  "severity": "critical",
  "source": "access-control",
  "idempotencyKey": "controller-7:event-9182",
  "occurredAt": "2026-07-30T10:02:00.000Z",
  "metadata": {
    "description": "Forced door contact transition"
  }
}
```

Repeated tenant/idempotency-key pairs return the existing event and do not create a second alert.

## Authorization and audit

- View: `recording:view`
- Configure floors, plans, objects, bindings, zones and event adapters: `device:configure`
- Timeline/playback: `incident:view`
- Acknowledge/resolve: `alerts:acknowledge`

Configuration and alert lifecycle changes are written to both the Digital Twin audit log and the platform audit trail.

## Storage and deployment

Apply migrations `037_digital_twin_core.sql`, `040_digital_twin_operational_events.sql` and `041_digital_twin_binding_scope.sql`. The latter migrations add the immutable event stream, one binding per placed object, branch-scoped device uniqueness and support for vendor string identifiers.

Set `DIGITAL_TWIN_ASSET_ROOT` to a durable, private filesystem path. The default `./digital-twin-assets` is suitable for local development only. On a container host, mount persistent storage at this path; an ephemeral filesystem will lose uploaded plan bytes even though plan metadata remains in PostgreSQL.

## Verification

```text
npm run typecheck
npm test -- --run test/digital-twin.test.ts
npm run typecheck --workspace @sentinel/dashboard
npm run build
```

The focused suite covers authorization, safe floor-plan uploads and versioning, normalized placement preservation, camera recording state, event/telemetry ordering, idempotent forced-door alerts, heat maps, timeline playback, AI spatial projection, nearby cameras, alert lifecycle and audit records.

## Deferred advanced work

The following remain advanced phases rather than present-tense claims: calibrated camera-frame-to-floor homography, automated blind-spot analysis, people-journey tracking, emergency route simulation, full glTF/GLB rendering, IFC/DXF/DWG conversion, BIM semantics, cross-floor path reconstruction and federated multi-site 3D scenes.
