# Face Recognition & Watchlist Matching (`analytics.face_recognition`)

## 1. Overview & Architectural Design

The **Face Recognition & Watchlist Matching** subsystem delivers high-accuracy, zero-external-cloud facial feature extraction and biometric matching against enrolled VIP, staff, and security watchlist profiles.

The subsystem operates on an **authoritative dual-engine architecture**:
- **Production Engine (PostgreSQL 16 + `pgvector`)**:
  - Employs 512-dimensional vector embeddings with Hierarchical Navigable Small World (HNSW) indexing using cosine distance operator (`vector_cosine_ops`).
  - Scales to hundreds of thousands of enrolled identity vectors with sub-15ms search latency per frame.
  - Guarantees strict multi-tenant database isolation, cascade cleanup, and transaction safety.
- **In-Memory Analytical Engine (Fallback & Edge)**:
  - Executes pure analytical vector cosine distance computations when operating on localized edge nodes or during database maintenance failover.
  - Zero performance degradation on small-to-medium branch rosters.

---

## 2. Mathematical Vector Matching Model

Facial feature extraction models (ArcFace-R100 / OpenCV Zoo SFace INT8) generate a 512-dimensional real-valued feature vector:
$$\mathbf{v} = [v_1, v_2, \dots, v_{512}] \in \mathbb{R}^{512}$$

### L2 Unit Normalization
Every vector is rigorously normalized before storage or matching:
$$\hat{\mathbf{v}} = \frac{\mathbf{v}}{\|\mathbf{v}\|_2} = \frac{\mathbf{v}}{\sqrt{\sum_{i=1}^{512} v_i^2}}$$

### Cosine Similarity & Distance
For normalized unit vectors $\hat{\mathbf{a}}$ and $\hat{\mathbf{b}}$, the cosine similarity is the inner dot product:
$$\text{Similarity}(\hat{\mathbf{a}}, \hat{\mathbf{b}}) = \hat{\mathbf{a}} \cdot \hat{\mathbf{b}} = \sum_{i=1}^{512} a_i b_i$$

In PostgreSQL `pgvector`, the cosine distance operator `<=>` evaluates:
$$\text{Distance}_{\text{cosine}}(\mathbf{a}, \mathbf{b}) = 1 - \frac{\mathbf{a} \cdot \mathbf{b}}{\|\mathbf{a}\| \|\mathbf{b}\|}$$
Hence:
$$\text{Similarity} = 1 - (\mathbf{e}_{\text{stored}} \Leftrightarrow \mathbf{e}_{\text{probe}})$$

---

## 3. Database Schema & Indexing

The subsystem relies on normalized, audit-compliant PostgreSQL tables:

```
+---------------------+        +---------------------------+        +--------------------+
|   face_watchlists   | 1----* |   face_watchlist_persons  | 1----* |  face_embeddings   |
+---------------------+        +---------------------------+        +--------------------+
| id (UUID, PK)       |        | id (UUID, PK)             |        | id (UUID, PK)      |
| tenant_id (UUID)    |        | watchlist_id (UUID, FK)   |        | person_id (FK)     |
| name (VARCHAR)      |        | full_name (VARCHAR)       |        | embedding (vector) |
| list_type (VARCHAR) |        | external_id (VARCHAR)     |        | quality_score      |
| alert_severity (P1) |        | last_seen_at (TIMESTAMPTZ)|        | created_at         |
| alert_on_match(BOOL)|        | match_count (INTEGER)     |        +--------------------+
+---------------------+        +---------------------------+                   |
          |                                  |                                 |
          |                                  |                                 |
          +-------------------+              |                                 |
                              |              |                                 |
                              v              v                                 |
                     +---------------------------+                             |
                     |  face_recognition_events  | <---------------------------+
                     +---------------------------+
                     | id (UUID, PK)             |
                     | tenant_id (UUID)          |
                     | camera_id (UUID)          |
                     | similarity_score (NUMERIC)|
                     | face_bbox (JSONB)         |
                     | review_status (TEXT)      |
                     | reviewed_by (UUID)        |
                     | reviewed_at (TIMESTAMPTZ) |
                     +---------------------------+
                                   |
                                   | 1:N
                                   v
                     +---------------------------+
                     |    face_match_reviews     |
                     +---------------------------+
                     | id (UUID, PK)             |
                     | recognition_event_id (FK) |
                     | reviewer_id (UUID, FK)    |
                     | decision (CONFIRMED/REJ)  |
                     | notes (TEXT)              |
                     | reviewed_at (TIMESTAMPTZ) |
                     +---------------------------+
```

### Key Performance Indexes
- `face_embeddings_embedding_hnsw_idx`: HNSW index on `face_embeddings(embedding vector_cosine_ops)` with `m=16, ef_construction=64`.
- `face_recognition_events_tenant_time_idx`: Compound B-tree on `(tenant_id, occurred_at DESC)`.
- `face_recognition_events_review_status_idx`: Fast filter index on `(tenant_id, review_status, occurred_at DESC)`.
- `face_match_reviews_tenant_time_idx`: Audit index on `(tenant_id, reviewed_at DESC)`.

---

## 4. Policy Thresholds & Operating Parameters

| Policy Profile | Minimum Cosine Similarity | Recommended Use Case | False Acceptance Rate (FAR) |
| :--- | :--- | :--- | :--- |
| **VIP / Known Guest** | **0.80** | Customer greeting, concierge notification | $< 0.05\%$ |
| **Authorized Staff** | **0.82** | Employee access logs, attendance tracking | $< 0.01\%$ |
| **Blacklist / Suspect** | **0.85** | Security deterrence, vault intrusion alerts | $< 0.001\%$ |
| **High Security / P1** | **0.90** | Automated interlock, dual-custody verification | $< 0.0001\%$ |

### Image Capture Standards
- **Resolution**: Minimum 80×80 pixels bounding box on face region.
- **Illumination**: Optimal between 150 lux and 1,000 lux; avoid direct backlighting.
- **Pose Tolerance**: Yaw $\le \pm 35^\circ$, Pitch $\le \pm 25^\circ$, Roll $\le \pm 30^\circ$.

---

## 5. REST API Specifications

### A. Probe Search Against Enrolled Watchlists
`POST /v1/analytics/face-match`
```json
{
  "embedding": [0.034, -0.012, 0.089, ...], // 512 numbers
  "minSimilarity": 0.82,
  "watchlistIds": ["3fa85f64-5717-4562-b3fc-2c963f66afa6"],
  "limit": 10
}
```
**Response (200 OK)**:
```json
{
  "data": {
    "matched": true,
    "bestMatch": {
      "personId": "c8a1b412-...",
      "personName": "Rajesh Kumar",
      "watchlistId": "3fa85f64-...",
      "watchlistName": "Authorized Vault Personnel",
      "similarity": 0.9421,
      "severity": "P2"
    },
    "matches": [...]
  }
}
```

### B. Record Face Recognition Event
`POST /v1/analytics/face-events`
- Records detection, face bounding box, similarity score, and updates person's `last_seen_at` and `match_count`.
- Sets initial `review_status: "pending"`.

### C. Human-in-the-Loop Review
`POST /v1/analytics/face-events/:id/reviews`
```json
{
  "decision": "confirmed", // "confirmed" | "rejected" | "unsure"
  "notes": "Verified by SOC shift lead after multi-angle check."
}
```
**Response (201 Created)**:
```json
{
  "data": {
    "reviewId": "f7d903e1-...",
    "status": "confirmed",
    "reviewedAt": "2026-09-11T18:15:00.000Z"
  }
}
```

---

## 6. Privacy Safeguards & Compliance (GDPR / DPDP)

1. **Non-Custodial Biometrics**: Storage of raw facial images is optional; standard operations store only non-reversible 512-dimension mathematical embeddings.
2. **Audit Logging**: Every watchlist search, probe execution, and enrollment writes an immutable ledger entry to `audit_logs`.
3. **Human Review Before Consequential Action**: Automated alerts can trigger operator notifications, but consequential decisions (e.g. security dispatch, law enforcement reporting) require verified human review recorded in `face_match_reviews`.
4. **Retention Policies**: Watchlist memberships and recognition events are scoped to tenant retention windows.
