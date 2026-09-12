# Abandoned & Unattended Object Detection (`analytics.abandoned_object`)

## 1. Executive Summary & Capabilities

The **Abandoned & Unattended Object Detection System** provides production-grade computer vision analysis operating across edge appliances and central analytics servers. It safeguards banking branches, ATM vestibules, sterile cash transfer zones, safe deposit vault perimeters, and transit corridors against unattended luggage, abandoned packages, suspicious containers, and egress route obstruction.

Unlike mock or heuristic placeholders, this system evaluates genuine pixel-level video frames and spatial object kinematics using:
- **ITU-R BT.601 Photometric Luminance Conversion** for consistent contrast processing across illumination changes.
- **Dual-Rate Background Adaptation & Block Differencing** for separating moving persons from static foreground deposits.
- **Centroid Euclidean Drift & IoU Multi-Frame Tracking** for verifying that an object has remained stationary without false triggers from transient stops.
- **Jordan Curve Theorem Ray-Casting** for sub-pixel Point-In-Polygon sensitive zone containment.
- **Depositor & Owner Proximity Kinematics** for tracking owner separation distance and distinguishing attended items from abandoned threats.
- **PostgreSQL Event & Audit State Management** with full multi-tenant isolation, parameterized queries, and zero mock data.

---

## 2. Mathematical & Algorithmic Formulations

### 2.1 Photometric Luminance Projection (ITU-R BT.601)
Raw RGB/RGBA frame buffers from RTSP camera streams are projected into perceived luminance $Y$:
$$Y(x, y) = 0.299 \cdot R(x, y) + 0.587 \cdot G(x, y) + 0.114 \cdot B(x, y)$$

### 2.2 Dual-Rate Background Differencing
To detect deposited items without locking onto momentary passerby foot traffic, running background models are adapted:
$$B(t) = (1 - \alpha) B(t-1) + \alpha \cdot Y(t)$$
- $\alpha = 0.05$ slow adaptation rate for stationary background stabilization.
- Pixel difference mask:
$$M(x, y) = \begin{cases} 1 & \text{if } |Y(x, y) - B(x, y)| > \theta_{\text{diff}} \\ 0 & \text{otherwise} \end{cases}$$
where $\theta_{\text{diff}} = 26 - 28$ grayscale levels.

### 2.3 Connected Component Block Agglomeration
Foreground activity is aggregated across $8 \times 8$ pixel spatial blocks. Connected active blocks are clustered using 4-connected flood-fill into candidate bounding boxes:
$$B = \{ (x, y, w, h) \mid \text{Area}(B) \in [A_{\min}, A_{\max}] \}$$
- Filtering out sub-pixel sensor noise ($A < 120\text{ px}$) and massive scene-wide illumination shifts ($A > 50,000\text{ px}$).

### 2.4 Centroid Drift & Stationary State Verification
For each detected blob in frame $t$ matched to existing tracked blob $B_{\text{prev}}$:
- Centroid: $C = (x + w/2, y + h/2)$
- Euclidean displacement:
$$\Delta C = \|C(t) - C(t-1)\| = \sqrt{(x_t - x_{t-1})^2 + (y_t - y_{t-1})^2}$$
- **Stationary Condition**: $\Delta C \le \delta_{\text{stationary}}$ (typically $12 - 15$ pixels).
- **Dwell Time Accumulation**:
$$\tau_{\text{dwell}}(t) = t - t_{\text{stationary\_since}}$$

### 2.5 Sensitive Zone Point-In-Polygon Containment (Ray Casting)
Sensitive security perimeters (e.g. ATM vestibule, vault anteroom) are defined as arbitrary $N$-sided polygons $[(x_1, y_1), \dots, (x_n, y_n)]$.
For an object centroid $(C_x, C_y)$, a ray is projected horizontally to $+ \infty$:
$$\text{Inside} = \left( \sum_{i=1}^n \mathbb{I}\left( y_i > C_y \ne y_{i+1} > C_y \land C_x < \frac{(x_{i+1} - x_i)(C_y - y_i)}{y_{i+1} - y_i} + x_i \right) \right) \pmod 2 \equiv 1$$

### 2.6 Owner Proximity & Departure Kinematics
When a person places an object, the system detects person bounding boxes $P_k$:
$$d_{\text{owner}}(t) = \min_{k} \|C_{\text{blob}} - C(P_k)\|$$
- **Attended State**: $d_{\text{owner}} \le D_{\text{prox}}$ ($120\text{ px}$).
- **Owner Separated**: $d_{\text{owner}} > D_{\text{prox}}$ or person departs frame.
- **Unattended Condition**: $\tau_{\text{dwell}} \ge T_{\text{unattended}}$ (e.g., 45–60 seconds) with owner separated.
- **Abandoned Escalation**: $\tau_{\text{dwell}} \ge T_{\text{abandoned}}$ (e.g., 120–180 seconds).

---

## 3. Threat Severity & Dispatch Matrix

| Zone Type | Dwell Time | Owner Proximity | Severity | Classification | Action Required |
|---|---|---|---|---|---|
| **Sterile Zone / Vault** | $\ge 30\text{ s}$ | Separated | `P1 CRITICAL` | `suspicious_package` | Immediate guard dispatch & audible alarm |
| **Emergency Exit** | $\ge 45\text{ s}$ | Any | `P1 CRITICAL` | `unattended_object` | Clear fire escape corridor obstruction |
| **Cash Counter** | $\ge 45\text{ s}$ | $> 120\text{ px}$ | `P2 HIGH` | `unattended_object` | Cashier alert & CCTV focus |
| **ATM Vestibule** | $\ge 60\text{ s}$ | $> 120\text{ px}$ | `P2 HIGH` | `unattended_object` | On-screen prompt & security notification |
| **Public Lobby** | $\ge 180\text{ s}$ | Departed | `P2 HIGH` | `abandoned_object` | Security patrol verification |
| **Corridor / Hallway** | $\ge 120\text{ s}$ | $> 150\text{ px}$ | `P3 MEDIUM` | `unattended_object` | Guard log review |

---

## 4. Database Schema (PostgreSQL Migration 122)

```sql
-- Monitored Sensitive Zones
CREATE TABLE abandoned_object_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES resource_nodes(id) ON DELETE SET NULL,
  camera_id uuid REFERENCES cameras(id) ON DELETE SET NULL,
  zone_name text NOT NULL,
  zone_type text NOT NULL CHECK (zone_type IN (
    'sterile_zone', 'atm_vestibule', 'cash_counter', 'vault_perimeter',
    'emergency_exit', 'customer_lobby', 'hallway', 'baggage_area'
  )),
  polygon jsonb NOT NULL DEFAULT '[]'::jsonb,
  sensitivity text NOT NULL DEFAULT 'high',
  unattended_threshold_seconds integer NOT NULL DEFAULT 60,
  abandoned_threshold_seconds integer NOT NULL DEFAULT 180,
  min_blob_area_pixels integer NOT NULL DEFAULT 150,
  max_blob_area_pixels integer NOT NULL DEFAULT 50000,
  enabled boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Abandoned Object Incident Events
CREATE TABLE abandoned_object_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  zone_id uuid REFERENCES abandoned_object_zones(id) ON DELETE SET NULL,
  branch_id uuid REFERENCES resource_nodes(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'unattended_object', 'abandoned_object', 'removed_object', 'suspicious_package'
  )),
  object_type text NOT NULL CHECK (object_type IN (
    'backpack', 'suitcase', 'box', 'parcel', 'handbag', 'generic_blob', 'duffel_bag'
  )),
  severity text NOT NULL CHECK (severity IN ('P1', 'P2', 'P3', 'P4')),
  confidence double precision NOT NULL,
  bounding_box jsonb NOT NULL DEFAULT '{}'::jsonb,
  dwell_time_seconds integer NOT NULL DEFAULT 0,
  owner_track_id text,
  owner_distance_pixels double precision,
  status text NOT NULL DEFAULT 'detected' CHECK (status IN (
    'detected', 'investigating', 'cleared', 'false_positive', 'escalated'
  )),
  snapshot_url text,
  thermal_score double precision,
  notes text,
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
```

---

## 5. REST API Reference

All endpoints require standard tenant authorization headers (`x-tenant-id`).

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/v1/analytics/abandoned-objects/events` | List events with pagination and filters |
| `GET` | `/v1/analytics/abandoned-objects/events/:id` | Retrieve single event by ID |
| `POST` | `/v1/analytics/abandoned-objects/events` | Ingest edge telemetry event |
| `PATCH` | `/v1/analytics/abandoned-objects/events/:id/status` | Update incident status (`investigating`, `cleared`, `escalated`) |
| `GET` | `/v1/analytics/abandoned-objects/zones` | List registered sensitive zones |
| `POST` | `/v1/analytics/abandoned-objects/zones` | Create monitored sensitive zone polygon |
| `PUT` | `/v1/analytics/abandoned-objects/zones/:id` | Update zone thresholds or geometry |
| `DELETE` | `/v1/analytics/abandoned-objects/zones/:id` | Delete monitored zone |
| `GET` | `/v1/analytics/abandoned-objects/stats` | Real-time operational summary metrics |
| `POST` | `/v1/analytics/abandoned-objects/analyze-frame` | Real-time static blob frame analysis endpoint |
| `GET` | `/v1/analytics/abandoned-objects/config/:cameraId` | Retrieve camera detector sensitivity settings |
| `PUT` | `/v1/analytics/abandoned-objects/config/:cameraId` | Update camera sensitivity settings |
