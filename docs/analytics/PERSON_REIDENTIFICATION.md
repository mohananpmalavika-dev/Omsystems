# Multi-Camera Person Re-Identification (Re-ID) (`analytics.re_identification`)

## Executive Overview
**Multi-Camera Person Re-Identification (Re-ID)** is an enterprise-grade surveillance and visual intelligence capability engineered for banking branches, corporate headquarters, transit hubs, and retail chains. It extracts deep visual appearance embeddings (512-dimensional L2-normalized feature vectors) from detected person bounding boxes across disparate, non-overlapping camera viewpoints to track continuous individual movement trajectories, reconstruct journey paths, identify repeat visitors, and perform cross-camera probe matching with zero mock data.

---

## Core Algorithmic Architecture

### 1. Mathematical Feature & Quality Extraction (`reid-feature-extractor.ts`)

```
   Raw Video Stream ──► Person Detection / Tracklet
                              │
                    ┌─────────▼─────────┐
                    │ Image Preprocess  │ (Resize, Aspect Ratio, Sharpness, Illumination)
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │ 3-Part Spatial    │ ──► Head & Shoulders (Upper 25%)
                    │ Decomposition     │ ──► Torso & Clothing (Middle 45%)
                    │                   │ ──► Lower Body & Shoes (Lower 30%)
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │ 512-d L2 Vector   │ ──► ||f||₂ = 1.0 (Unit Hypersphere)
                    └─────────┬─────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
      Cosine Similarity               Euclidean Distance
   S(u, v) = (u · v) / (||u|| ||v||)   D(u, v) = √(∑(uᵢ - vᵢ)²)
```

- **Feature Vector Dimension**: 512 floating-point values normalized to unit length on a hypersphere ($\|v\|_2 = 1.0$), ensuring that cosine similarity is exactly equal to dot product:
  $$\text{sim}(u, v) = \mathbf{u} \cdot \mathbf{v} = \sum_{i=1}^{512} u_i v_i$$
- **Spatial Part Decomposition**: Person crops are decomposed into 3 vertical spatial partitions:
  - **Upper Body (0% - 25%)**: Headwear, hair, collar, face contour, and upper shoulders.
  - **Torso (25% - 70%)**: Shirt, jacket, coat, backpack straps, primary clothing patterns.
  - **Lower Body (70% - 100%)**: Trousers, skirts, footwear, bag bottoms.
- **Image Quality Scoring**: Sightings evaluate aspect ratio compliance (ideal pedestrian ratio ~2.0–2.8), Laplacian variance sharpness score, and luminance contrast to yield a bounded quality factor $Q \in [0.1, 1.0]$.
- **Quality-Weighted Average Pooling (QWAP)**: For multi-frame tracklets, embeddings are aggregated weighted by instantaneous frame sharpness:
  $$\mathbf{f}_{\text{tracklet}} = \frac{\sum_{k=1}^K Q_k \mathbf{f}_k}{\left\|\sum_{k=1}^K Q_k \mathbf{f}_k\right\|_2}$$
- **Exponential Moving Average (EMA) Identity Gallery**: When new sightings are confirmed for an existing global identity, gallery feature representations adaptively update without catastrophic forgetting:
  $$\mathbf{f}_{\text{gallery}}^{(t)} = \text{normalize}\left((1 - \alpha)\mathbf{f}_{\text{gallery}}^{(t-1)} + \alpha \mathbf{f}_{\text{sighting}}\right), \quad \alpha \in [0.05, 0.20]$$

---

## Multi-Camera Topology & Spatio-Temporal Validator (`reid-topology.ts`)

Cross-camera Re-ID relies on spatial reality constraints to eliminate visual false positives (e.g., two unrelated visitors wearing identical dark suits). The topology engine strictly enforces:

1. **Causal Time Ordering**: A sighting at Camera B cannot precede the sighting at Camera A if the individual was detected moving from A to B:
   $$\Delta t = t_{\text{curr}} - t_{\text{prev}} > 0$$
2. **Minimum Transit Duration**: Enforces physical transit barriers (e.g., distance between Lobby Cam 01 and 2nd Floor Cam 04 requires at least 15 seconds walking time):
   $$\Delta t \ge \tau_{\min}(A, B)$$
3. **Maximum Transit Window**: Sets timeout horizons where an individual would have left the premises or altered clothing:
   $$\Delta t \le \tau_{\max}(A, B)$$
4. **Velocity Plausibility**: For cameras with Euclidean distance mappings, transit speed must fall within realistic human pedestrian bounds ($0.2\text{ m/s} \le v \le 7.0\text{ m/s}$).
5. **Integrated Match Scoring**:
   $$\text{Score}_{\text{composite}} = w_{\text{vis}} \cdot S_{\text{visual}} + w_{\text{temp}} \cdot S_{\text{temporal}}$$

---

## Database Architecture (`database/migrations/119_person_reidentification_hardening.sql`)

### Tables & Relational Schema
1. **`reid_global_identities`**: Master registry of identified individuals, storing canonical 512-d feature vectors, cumulative sighting counts, first/last seen timestamps, primary branch ID, confidence score, and optional VIP/watchlisted tags.
2. **`reid_camera_sightings`**: High-throughput audit table recording every camera detection event with camera ID, branch ID, timestamp, tracklet duration, bounding box coordinates, visual quality metrics, spatial partition vectors, and full 512-d feature vectors.
3. **`reid_camera_topology`**: Camera-to-camera directed graph edge table specifying minimum transit seconds, maximum transit seconds, physical distance in meters, and bidirectional traversal flags.
4. **`reid_probe_searches`**: Historical query log capturing probe searches, matched candidate IDs, similarity ranks, and operator inspection results.

---

## Fastify REST API Endpoints (`src/routes/reid.routes.ts`)

Registered securely under prefix `/v1/analytics/reid`:

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/v1/analytics/reid/sightings` | Ingest real-time camera tracklet sighting with feature embedding, perform topology-aware match, and update global identity. |
| `POST` | `/v1/analytics/reid/probe` | Search global gallery with a 512-d visual vector or image crop with similarity thresholds and top-$K$ limits. |
| `GET` | `/v1/analytics/reid/identities` | Paginated listing of global tracked identities filtered by branch, date range, or VIP status. |
| `GET` | `/v1/analytics/reid/identities/:id` | Retrieve comprehensive profile for a specific global identity. |
| `GET` | `/v1/analytics/reid/identities/:id/journey` | Reconstruct chronological cross-camera trajectory, transit speeds, and dwell times. |
| `GET` | `/v1/analytics/reid/topology` | Fetch current camera adjacency graph and transit constraint matrix. |
| `POST` | `/v1/analytics/reid/topology` | Upsert inter-camera edge constraints, distance, and transit time windows. |
| `GET` | `/v1/analytics/reid/stats` | System telemetry including total identities, sightings, today's unique visitors, and average confidence. |

---

## Dashboard Workspace (`dashboard/components/person-reid-workspace.tsx`)

The dashboard UI provides an enterprise control console for surveillance operators and branch managers:

1. **Telemetry KPI Strip**: Real-time counters for Total Tracked Identities, Active Cross-Camera Sightings, 24h Unique Individuals, and Mean Feature Match Confidence.
2. **Interactive Person Journey Timeline**: Chronological breadcrumb view tracing an individual's path across branch cameras, indicating camera name, transit duration, dwell time, and match similarity.
3. **Probe Image & Feature Search**: Upload or paste image data to extract embeddings and perform instant vector nearest-neighbor matching against the branch gallery.
4. **Live Sighting Ingestion Stream**: Real-time event log of recent camera detections with quality ratings, bounding box coordinates, and identity assignments.
5. **Camera Topology Graph Matrix**: Interactive grid and node editor to view and configure minimum/maximum transit times and distances between branch cameras.

---

## Production Verification & Test Suite

The system has been verified through automated unit, integration, and typecheck tests:
- **`test/analytics/person-reidentification.test.ts`**:
  - Unit normalization of 512-d feature vectors to $\|v\|_2 = 1.0$.
  - Cosine similarity and Euclidean distance invariance properties.
  - Quality-Weighted Average Pooling (QWAP) across variable-quality frames.
  - EMA gallery updating dynamics.
  - Spatial part decomposition (upper, torso, lower partitions).
  - Multi-camera spatio-temporal validation (enforcing causal order, minimum transit, maximum timeout).
  - End-to-end sighting ingestion and trajectory assembly.
  - Probe search nearest-neighbor rank retrieval.
- **Capability Matrix**: Hardened to `CapabilityMaturity.PRODUCTION` in `config/capabilities/platform-capabilities.ts`.
- **Zero Mock Policy**: Direct PostgreSQL persistence with production schema migrations and real API client bindings.
