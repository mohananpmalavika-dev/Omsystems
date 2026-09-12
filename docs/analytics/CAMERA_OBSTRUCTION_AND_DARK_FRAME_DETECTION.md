# Camera Obstruction & Dark Frame Detection (`analytics.camera_obstruction`)

## 1. Executive Summary & Capabilities

The **Camera Obstruction & Dark Frame Detection System** provides production-ready, mathematically rigorous heuristic frame analysis running on edge appliances and central analytics nodes. It monitors enterprise and banking CCTV streams to guarantee optical continuity, flagging:
- **Physical Lens Covering / Occlusion**: Cloth, cardboard, tape, hands, bags, or foreign stickers covering part or all of the lens.
- **Dark Frames / Optical Blackout**: Power loss to IR illuminators, complete loss of lighting, disconnected analog inputs, or lens caps causing total darkness.
- **Loss of Visual Variance / Sensor Flatline**: Sensor freeze, uniform test screens (gray/blue screen), dead video feeds, or extreme contrast collapse where spatial variance $\sigma^2 \to 0$.
- **Partial Lens Obstruction**: Multi-tile spatial grid decomposition ($4 \times 4$ or $8 \times 8$) isolating localized obstructions with bounding boxes while allowing unaffected quadrants to continue surveillance.
- **Night-Scene False-Alarm Discrimination**: Preserves edge gradient energy and local contrast to distinguish legitimate low-light night scenes from true optical blackouts.

---

## 2. Mathematical & Heuristic Formulations

### 2.1 Luminance Extraction (ITU-R BT.601)
Raw RGB frames are projected into photometric luminance $Y$:
$$Y(x, y) = 0.299 \cdot R(x, y) + 0.587 \cdot G(x, y) + 0.114 \cdot B(x, y)$$

Global mean ($\mu$) and global variance ($\sigma^2$) across $N = W \times H$ pixels:
$$\mu = \frac{1}{N} \sum_{i=1}^N Y_i, \quad \sigma^2 = \frac{1}{N} \sum_{i=1}^N (Y_i - \mu)^2$$

### 2.2 Multi-Tile Spatial Grid Decomposition
The image plane is subdivided into an $R \times C$ regular grid (default $4 \times 4 = 16$ tiles).
For each tile $k$:
- Local mean: $\mu_k = \frac{1}{|T_k|} \sum_{i \in T_k} Y_i$
- Local spatial variance: $\sigma_k^2 = \frac{1}{|T_k|} \sum_{i \in T_k} (Y_i - \mu_k)^2$
- Local edge score: $E_k = \frac{1}{|T_k| \cdot 255} \sum_{x, y \in T_k} (|Y(x+1, y) - Y(x, y)| + |Y(x, y+1) - Y(x, y)|)$

A tile is flagged **obstructed** if:
$$\left(\mu_k \le \tau_{\text{dark}} \land \sigma_k^2 < 6.0\right) \lor \left(\sigma_k^2 < \tau_{\text{floor}} \land E_k < 0.025\right)$$

The overall spatial obstruction percentage is:
$$\text{ObstructionPercent} = \frac{\sum_{k} \mathbb{I}(\text{tile } k \text{ is obstructed})}{R \cdot C} \times 100\%$$

Encompassing bounding boxes are computed across contiguous clusters of obstructed tiles:
$$[x_{\min}, y_{\min}, w_{\text{obs}}, h_{\text{obs}}]$$

### 2.3 Dark Frame / Optical Blackout Detection
When optical input is cut off:
- Global mean luminance $\mu \le \tau_{\text{dark}}$ (default $\le 8.0$).
- Shadow fraction $S = \frac{1}{N} \sum_{i=1}^N \mathbb{I}(Y_i \le 12) \ge 0.90$.
- Global variance $\sigma^2 < \tau_{\text{floor}}$ (default $< 12.0$).
- **Night Scene Filter**: If edge density $\ge 0.03$ or $\sigma^2 \ge 25.0$, the scene is an actively illuminated IR night view, suppressing false positive dark frame alarms.
- **Classification**: `P1 CRITICAL` `dark_frame`.

### 2.4 Loss of Visual Variance (Sensor Flatline)
When a sensor flatlines or outputs a uniform test/blue/gray screen:
- Global spatial variance $\sigma^2 < \tau_{\text{floor}}$ (default $< 12.0$).
- Normalized Sobel edge density $< 0.02$.
- Shannon entropy $H = -\sum_{k=0}^{255} p_k \log_2(p_k) < 2.5$ (where natural scenes have $H \in [4.5, 7.8]$).
- **Classification**: `P1 CRITICAL` `variance_loss`.

### 2.5 Full vs. Partial Lens Covering
- **Full Lens Covering**: $\text{ObstructionPercent} \ge 70\%$ and $(\sigma^2 < 25.0 \lor H < 3.5) \implies$ `P1 CRITICAL` `lens_covering`.
- **Partial Lens Covering**: $25\% \le \text{ObstructionPercent} < 70\% \implies$ `P2 HIGH` (or `P3` if $< 50\%$) `partial_obstruction`.

---

## 3. Architecture & Data Flow

```
+---------------------------+       +-------------------------------+
| Decoded RTSP Frame Stream | ----> |  Edge-Agent Obstruction       |
| (RGB / Grayscale Buffer)  |       |  Analyzer (Zero-Copy Buffer)  |
+---------------------------+       +-------------------------------+
              |                                     |
              v                                     v
+-------------------------------+       +-------------------------------+
| Central Analytics Engine      |       | Fastify REST Control Plane    |
| CameraObstructionDetector     | ----> | /v1/analytics/obstruction/*   |
| (BaseDetector Implementation) |       +-------------------------------+
+-------------------------------+                       |
                                                        v
                                        +-------------------------------+
                                        | PostgreSQL Persistent Vault   |
                                        | - camera_obstruction_events   |
                                        | - camera_obstruction_baselines|
                                        | - camera_obstruction_configs  |
                                        +-------------------------------+
                                                        |
                                                        v
                                        +-------------------------------+
                                        | Dashboard Workspace           |
                                        | - 4x4 Grid Heatmap            |
                                        | - Real-Time Frame Simulator   |
                                        | - Incident Audit & Review     |
                                        +-------------------------------+
```

---

## 4. REST API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/v1/analytics/obstruction/events` | List historical obstruction events with filtering by camera, type, severity, status, date |
| `GET` | `/v1/analytics/obstruction/events/:id` | Retrieve detailed obstruction event record including full tile analysis breakdown |
| `PATCH` | `/v1/analytics/obstruction/events/:id/status` | Update incident status (`acknowledged`, `resolved`, `false_positive`) with notes |
| `POST` | `/v1/analytics/obstruction/events` | Ingest edge telemetry event into persistent audit vault |
| `POST` | `/v1/analytics/obstruction/analyze-frame` | Real-time heuristic frame analysis with Base64 payload or raw buffer |
| `GET` | `/v1/analytics/obstruction/stats` | Aggregated fleet optical health metrics, active P1/P2 incidents, cameras at risk |
| `GET` | `/v1/analytics/obstruction/baselines/:cameraId` | Retrieve calibrated optical baseline profile |
| `POST` | `/v1/analytics/obstruction/baselines/:cameraId/recalibrate` | Trigger baseline recalibration from sample frame |
| `GET` | `/v1/analytics/obstruction/config/:cameraId` | Get per-camera threshold configuration |
| `PUT` | `/v1/analytics/obstruction/config/:cameraId` | Update per-camera sensitivity, variance floor, darkness threshold |

---

## 5. Automated Verification & Zero Mock Data Guarantee

This implementation contains **zero mock data**. All endpoints, edge analyzers, and central detectors evaluate genuine mathematical formulas:
- Matrix Laplacian operators
- ITU-R BT.601 photometric conversions
- Spatial variance formulas
- Shannon entropy calculations
- 16-tile spatial partitioning
- Multi-frame temporal debouncing (3 frames default)

Automated test suite:
```bash
npx vitest run test/analytics/camera-obstruction-detection.test.ts
npx tsx scripts/verify-capability-truth.ts
```
