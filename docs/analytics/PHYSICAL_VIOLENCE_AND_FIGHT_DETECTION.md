# Physical Violence & Fight Detection (`analytics.violence`)

## 1. Overview & Capability Contract

The **Physical Violence & Fight Detection** subsystem (`analytics.violence`) provides real-time detection of violent physical altercations, mutual combat, assaults, and chaotic brawls across surveillance camera streams.

- **Capability ID**: `analytics.violence`
- **Maturity**: `CapabilityMaturity.PRODUCTION`
- **Category**: `ANALYTICS`
- **Zero Mock / Anti-Simulation**: Backed by real Lucas-Kanade optical flow matrix inversion, Shannon directional turbulence entropy, kinematic acceleration/jerk derivation, and PostgreSQL persistence.

---

## 2. Mathematical Foundation

### A. Lucas-Kanade Optical Flow with Tikhonov Regularization
Between consecutive frames $I(t)$ and $I(t + \Delta t)$, the optical flow constraint is:
$$I_x u + I_y v + I_t = 0$$

Over an $N \times N$ patch with Tikhonov regularizer $\lambda$:
$$\begin{bmatrix} \sum I_x^2 + \lambda & \sum I_x I_y \\ \sum I_x I_y & \sum I_y^2 + \lambda \end{bmatrix} \begin{bmatrix} u \\ v \end{bmatrix} = - \begin{bmatrix} \sum I_x I_t \\ \sum I_y I_t \end{bmatrix}$$

- **Kinetic Motion Energy**:
  $$\bar{E}_k = \frac{1}{2N} \sum_{i=1}^N (u_i^2 + v_i^2)$$
- **Directional Turbulence (Angular Shannon Entropy)**:
  Quantizing flow vector angles $\theta_i = \operatorname{atan2}(v_i, u_i)$ into 8 directional octants with probability $p_k$:
  $$H(\theta) = -\sum_{k=0}^7 p_k \log_2(p_k), \quad S_{\text{turb}} = \frac{H(\theta)}{\log_2(8)}$$
  Laminar motion (pedestrians walking, camera panning) produces concentrated angles ($S_{\text{turb}} < 0.35$), while combat and grappling yield chaotic multi-directional vectors ($S_{\text{turb}} > 0.60$).

### B. Rapid Limb Kinematics & Ballistic Strikes
For tracked keypoints $\vec{p}(t)$:
- **Velocity**: $\vec{v}(t) = \frac{\Delta \vec{p}}{\Delta t}$
- **Acceleration**: $\vec{a}(t) = \frac{\Delta \vec{v}}{\Delta t}$
- **Jerk**: $\vec{j}(t) = \frac{\Delta \vec{a}}{\Delta t}$

Strikes (punches, kicks, shoves) are identified when acceleration exceeds the threshold ($a \ge 30\text{ px/s}^2$) accompanied by significant jerk impulse ($j \ge 36\text{ px/s}^3$) or rapid velocity reversals.

---

## 3. Database Schema

### `violence_detection_events`
- `id` (UUID PK)
- `tenant_id` (UUID FK)
- `camera_id` (UUID FK)
- `confidence` (numeric 5,4)
- `severity` ('P1' | 'P2' | 'P3')
- `optical_flow_energy` (numeric 10,4)
- `turbulence_score` (numeric 10,4)
- `max_limb_acceleration` (numeric 10,4)
- `strike_count` (integer)
- `participant_count` (integer)
- `participant_track_ids` (text[])
- `interaction_box` (jsonb)
- `metrics` (jsonb)
- `review_status` ('pending' | 'confirmed' | 'false_positive' | 'escalated')
- `reviewed_by` (UUID FK users)
- `reviewed_at` (timestamptz)
- `review_notes` (text)
- `occurred_at` (timestamptz)

### `violence_detection_configs`
Per-camera sensitivity, min confidence, optical flow threshold, limb acceleration threshold, confirmation duration, cooldown, and alert severity overrides.

---

## 4. REST API Endpoints

- `GET /v1/analytics/violence/events`: Filtered list of historical violence events.
- `GET /v1/analytics/violence/events/:id`: Incident details with telemetry metrics.
- `POST /v1/analytics/violence/events/:id/review`: Human-in-the-loop validation action.
- `POST /v1/analytics/violence/analyze`: On-demand programmatic frame and track analysis.
- `GET /v1/analytics/violence/config/:cameraId`: Retrieve camera-specific thresholds.
- `PUT /v1/analytics/violence/config/:cameraId`: Update camera-specific thresholds.
- `GET /v1/analytics/violence/stats`: Fleet-wide altercation metrics and confirmation rates.
