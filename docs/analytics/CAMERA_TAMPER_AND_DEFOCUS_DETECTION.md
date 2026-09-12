# Camera Tamper & Defocus Detection (`analytics.camera_tamper`)

## 1. Executive Summary & Capabilities

The **Camera Tamper & Defocus Detection System** provides authoritative, production-ready computer vision analysis running directly on edge appliances and central analytics nodes. It safeguards banking and enterprise surveillance infrastructure against physical sabotage, optical blinding, intentional lens obstruction, vandalism (spray paint), and accidental camera displacement or focus degradation.

Unlike naive heuristic systems or mock endpoints, this system evaluates genuine pixel-level statistical metrics using:
- **Discrete 8-Connected Laplacian Operator Variance** for objective sharpness and focus quantification.
- **ITU-R BT.601 Luminance & Histogram Saturation Metrics** for spotlight, laser, and headlight glare detection.
- **Luminance Collapse & Variance Floor Verification** for physical lens covering and total darkness obstruction.
- **Multi-Block Structural Similarity (SSIM) & L1 Distance** for structural scene shifts and physical mount repositioning.
- **Sobel Gradient Magnitude & Shannon Spatial Entropy** for spray paint and pigment occlusion.
- **Multi-Frame Sustained State Machine** for false-positive suppression against transient illumination anomalies.

---

## 2. Mathematical & Algorithmic Formulations

### 2.1 Luminance Extraction (ITU-R BT.601)
Raw RGB frames are projected into perceived photometric luminance $Y$:
$$Y(x, y) = 0.299 \cdot R(x, y) + 0.587 \cdot G(x, y) + 0.114 \cdot B(x, y)$$

Luminance mean ($\mu$) and variance ($\sigma^2$) across $N = W \times H$ pixels:
$$\mu = \frac{1}{N} \sum_{i=1}^N Y_i, \quad \sigma^2 = \frac{1}{N} \sum_{i=1}^N (Y_i - \mu)^2$$

### 2.2 Defocus Detection via Laplacian Variance
Defocusing attenuates high spatial frequency content. Sharp image edges produce steep gradients with large positive and negative second spatial derivatives, whereas blurred images exhibit smooth gradients with near-zero second derivatives.

The 8-connected discrete Laplacian operator $\nabla^2 I$ is applied:
$$\nabla^2 I(x, y) = \sum_{dy=-1}^{1} \sum_{dx=-1}^{1} K(dx, dy) \cdot Y(x + dx, y + dy)$$
where:
$$K = \begin{bmatrix} -1 & -1 & -1 \\ -1 & 8 & -1 \\ -1 & -1 & -1 \end{bmatrix}$$

The sharpness index is quantified by the variance of the Laplacian response:
$$\text{LapVar} = \text{Var}(\nabla^2 I) = \frac{1}{(W-2)(H-2)} \sum_{x, y} \left( \nabla^2 I(x, y) - \mu_{\nabla^2} \right)^2$$
- **In-Focus Frame**: $\text{LapVar} \ge 150 - 2000+$
- **Defocused / Smeared Lens**: $\text{LapVar} < 80 - 100$ while $\mu \in [20, 235]$

### 2.3 Blinding / Spotlight Glare Detection
When a direct flashlight, laser pointer, or vehicle spotlight is directed at the camera lens:
- Mean luminance $\mu \ge 240$ (or highlight fraction $Y_i \ge 240$ exceeds $85\%$).
- Spatial variance collapses ($\sigma^2 < 40$) inside the saturated region.
- Classified as `P1 CRITICAL` blinding event.

### 2.4 Lens Covering / Blackout Detection
When an opaque object (cloth, bag, tape, hand, cardboard) covers the lens:
- Mean luminance $\mu \le 15$.
- Spatial variance $\sigma^2 < 15$.
- Historical baseline check ensures the camera was previously illuminated ($\mu_{\text{base}} \ge 20$), preventing false alarms on powered-off cameras.
- Classified as `P1 CRITICAL` covering event.

### 2.5 Camera Movement & Scene Shift (SSIM)
To detect camera rotation or displacement, multi-block Structural Similarity Index (SSIM) and L1 distance are computed against the calibrated baseline:
$$\text{SSIM}(x, y) = \frac{(2 \mu_x \mu_y + C_1)(2 \sigma_{xy} + C_2)}{(\mu_x^2 + \mu_y^2 + C_1)(\sigma_x^2 + \sigma_y^2 + C_2)}$$
$$\text{SceneChange} = \frac{1}{N \cdot 255} \sum_{i=1}^N |Y_{\text{curr}}(i) - Y_{\text{base}}(i)|$$
- When $\text{SSIM} < 0.35$ and $\text{SceneChange} \ge 0.65$ with normal contrast and focus, camera repositioning is confirmed (`P2 HIGH`).

### 2.6 Spray Paint Detection
Spray paint creates an opaque, translucent, or speckled pigment coating:
- Sharp drop in Sobel edge density ($> 65\%$ loss of high-frequency contours).
- Spatial Shannon entropy collapse:
  $$H = -\sum_{k=0}^{255} p(k) \log_2(p(k) + \epsilon)$$
  Entropy drops by $\ge 1.8$ bits from the baseline.
- Mid-range luminance persists ($30 \le \mu \le 220$), distinguishing spray paint from pure black covering or blinding.

---

## 3. Database Schema

### `camera_tamper_events`
Authoritative audit records of detected optical tampering:
| Column | Type | Description |
|---|---|---|
| `id` | `uuid` (PK) | Unique event identifier |
| `tenant_id` | `uuid` (FK) | Multi-tenant isolation |
| `camera_id` | `uuid` (FK) | Affected camera |
| `branch_id` | `uuid` (FK) | Branch location |
| `tamper_type` | `text` | `blinding`, `covering`, `movement`, `defocus`, `spray` |
| `severity` | `text` | `P1`, `P2`, `P3`, `P4` |
| `confidence` | `float` | 0.0 - 1.0 calibrated confidence |
| `metrics` | `jsonb` | Complete metric breakdown (LapVar, luminance, SSIM, edge density, entropy) |
| `status` | `text` | `detected`, `acknowledged`, `resolved`, `false_positive` |
| `snapshot_url` | `text` | Tamper evidence snapshot |
| `detected_at` | `timestamptz` | Detection timestamp |

### `camera_tamper_baselines`
Stores reference optical characteristics for each monitored camera:
| Column | Type | Description |
|---|---|---|
| `camera_id` | `uuid` (PK) | Camera identifier |
| `baseline_luminance` | `float` | Reference average luminance |
| `baseline_variance` | `float` | Reference spatial variance |
| `baseline_edge_density`| `float` | Reference Sobel edge ratio |
| `baseline_entropy` | `float` | Reference Shannon entropy |
| `baseline_laplacian_variance` | `float` | Reference focus sharpness score |
| `reference_histogram` | `jsonb` | 256-bin luminance distribution |
| `calibrated_at` | `timestamptz` | Calibration timestamp |

### `camera_tamper_configs`
Per-camera sensitivity and threshold overrides:
| Setting | Default | Description |
|---|---|---|
| `debounce_frames` | `5` | Sustained frames required for confirmation |
| `defocus_threshold` | `100.0` | Laplacian variance trigger threshold |
| `blinding_threshold` | `240.0` | Saturated luminance trigger threshold |
| `covering_threshold` | `15.0` | Blackout luminance trigger threshold |
| `movement_threshold` | `0.65` | Scene shift distance threshold |
| `spray_threshold` | `0.70` | Spray pigment edge drop threshold |

---

## 4. REST API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/v1/analytics/tamper/events` | `GET` | Filtered list of historical tamper events |
| `/v1/analytics/tamper/events/:id` | `GET` | Detailed incident record |
| `/v1/analytics/tamper/events/:id/status` | `PATCH` | Acknowledge or resolve an incident |
| `/v1/analytics/tamper/events` | `POST` | Ingest tamper event from edge agent |
| `/v1/analytics/tamper/analyze-frame` | `POST` | Real-time statistical analysis on raw frame |
| `/v1/analytics/tamper/baselines/:cameraId` | `GET` | Retrieve camera baseline |
| `/v1/analytics/tamper/baselines/:cameraId/recalibrate` | `POST` | Recalibrate camera reference baseline |
| `/v1/analytics/tamper/config/:cameraId` | `GET` | Retrieve sensitivity configuration |
| `/v1/analytics/tamper/config/:cameraId` | `PUT` | Update sensitivity configuration |
| `/v1/analytics/tamper/stats` | `GET` | Aggregated tamper statistics |

---

## 5. Operations & Incident Response Runbook

1. **P1 Blinding / Spotlight**:
   - Immediate SOC audio alert.
   - Dispatch physical security guards to camera sector.
   - Correlate with adjacent overlapping cameras to track perpetrators.
2. **P1 Lens Covering**:
   - Immediately verify camera health. If camera is covered during branch business hours, escalate to bank branch manager.
3. **P2 Defocus / Blurring**:
   - Auto-create maintenance work order for field technician.
   - Clean dome and refocus lens module.
4. **P2 Camera Movement**:
   - Review camera angle against golden reference frame snapshot.
   - If intentional realignment, operator clicks "Recalibrate Baseline".
