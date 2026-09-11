# Production-Grade AI Video Redaction & Face Blurring
**Capability ID**: `evidence.redacted_export`  
**Compliance Standards**: GDPR (EU 2016/679 Article 32) & DPDP (India 2023 Section 8)  
**Security Level**: Forensic Grade, Cryptographically Signed, Non-Repudiable Chain of Custody

---

## 1. Overview & Regulatory Rationale

The **AI Video Redaction & Face Blurring** subsystem (`evidence.redacted_export`) provides mathematically irreversible privacy protection for exported video evidence without compromising chain-of-custody integrity or court admissibility.

### Regulatory Alignment:
* **GDPR (EU 2016/679) Article 32**: Implements technical and organisational measures to ensure a level of security appropriate to the risk, including automated pseudonymisation and irreversible redaction of third-party bystanders in Subject Access Requests (SAR).
* **DPDP Act 2023 (India) Section 8**: Enforces reasonable security safeguards to prevent personal data breach and unauthorized identification of individuals whose likeness is captured in surveillance recordings.
* **Criminal Justice Information Services (CJIS) & Forensic Standards**: Generates an ED25519-signed digital compliance certificate with SHA-256 source and destination digests, certifying the exact transformations applied without altering unredacted master records.

---

## 2. Architectural Components

```
                                  +---------------------------------------+
                                  |     Export Request (API / UI)         |
                                  |  - GDPR / DPDP Compliance Standard    |
                                  |  - Face / Plate Blurring: Enabled    |
                                  |  - Static Masking Zones: Enabled      |
                                  +-------------------+-------------------+
                                                      |
                                                      v
                                  +---------------------------------------+
                                  |        VideoRedactionService          |
                                  |  - Coordinate normalization & clamp   |
                                  |  - Fallback corridor generation       |
                                  |  - Static camera zone resolution      |
                                  +-------------------+-------------------+
                                                      |
                                                      v
+-----------------------------+   +---------------------------------------+
|  HardwareEncoderDetector    |-->|     RedactionFilterGraphBuilder       |
|  (CUDA NVENC / VA-API / CPU)|   |  - Dynamic FFmpeg filter_complex      |
+-----------------------------+   |  - boxblur / pixelate / drawbox       |
                                  |  - Security watermark overlay         |
                                  +-------------------+-------------------+
                                                      |
                                                      v
                                  +---------------------------------------+
                                  |             FFmpeg Worker             |
                                  |  - Transcode with yuv420p constraint  |
                                  |  - Audio track strip / mute           |
                                  +-------------------+-------------------+
                                                      |
                                                      v
                                  +---------------------------------------+
                                  |     Cryptographic Verification        |
                                  |  - ED25519 Compliance Certificate    |
                                  |  - evidence_redaction_logs ledger     |
                                  |  - Hash-chained Chain of Custody      |
                                  +---------------------------------------+
```

### 1. `VideoRedactionService` (`src/evidence/services/video-redaction.service.ts`)
- Authoritative service coordinating redaction parameters, normalizing normalized (0..1) or pixel coordinates into even-aligned integer bounds required by H.264/H.265 encoders.
- Resolves camera static privacy zones from `privacyPolicyService`.
- Automatically constructs privacy protection corridors (e.g. upper-body/face corridor) when explicit detection bounding boxes are absent, guaranteeing no unredacted bystander leaks.
- Issues cryptographically signed `RedactionComplianceCertificate` objects and persists entries to `evidence_redaction_logs`.

### 2. `RedactionFilterGraphBuilder` (`src/recording/hardware-encoder.ts`)
- Builds single-pass, hardware-accelerated FFmpeg `filter_complex` graphs.
- Supports three redaction modes:
  - `blur`: Gaussian boxblur (`boxblur=luma_radius=...`) for natural, forensic-grade obfuscation.
  - `pixelate`: Mosaic pixelation downscaling and upscaling with nearest-neighbor interpolation.
  - `solid`: Blackout privacy masking (`drawbox=color=black@1.0:t=fill`).
- Dynamic timestamp overlays (`enable='between(t,start,end)'`) allowing temporal bounding box redactions.
- Security watermarking (`drawtext=...`) embedding standard notices (e.g. `PRIVACY REDACTED (GDPR 2016/679 ART 32)`).

### 3. `HardwareEncoderDetector` (`src/recording/hardware-encoder.ts`)
- Auto-detects NVIDIA NVENC (`h264_nvenc`), Intel/AMD VA-API (`h264_vaapi`), Apple VideoToolbox (`h264_videotoolbox`), or software `libx264`.
- Supports manual override via `FORCE_HARDWARE_ENCODER` environment variable.

### 4. `ExportWorker` (`src/recording/export-worker.ts`)
- Integrates redaction into the export pipeline for both single-camera and multi-camera bundles (MP4, TAR, ZIP).
- Emits forensic chain of custody events (`PRIVACY_REDACTED_EXPORT`) with audit details.

---

## 3. Database Schema (`evidence_redaction_logs`)

Migration `database/migrations/116_evidence_redacted_export_hardening.sql`:

```sql
CREATE TABLE IF NOT EXISTS evidence_redaction_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    export_job_id UUID NOT NULL REFERENCES forensic_export_jobs(id) ON DELETE CASCADE,
    case_id UUID NOT NULL REFERENCES evidence_cases(id) ON DELETE CASCADE,
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'default',
    performed_by VARCHAR(255) NOT NULL,
    compliance_standard VARCHAR(32) NOT NULL DEFAULT 'GDPR',
    targets TEXT[] NOT NULL DEFAULT '{"FACES"}',
    bounding_box_count INTEGER NOT NULL DEFAULT 0,
    face_blur_applied BOOLEAN NOT NULL DEFAULT false,
    plate_blur_applied BOOLEAN NOT NULL DEFAULT false,
    static_zones_applied INTEGER NOT NULL DEFAULT 0,
    audio_action VARCHAR(32) NOT NULL DEFAULT 'REMOVE_TRACK',
    unredacted_sha256 VARCHAR(64),
    redacted_sha256 VARCHAR(64) NOT NULL,
    certificate_id VARCHAR(64) NOT NULL,
    signature TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 4. API Endpoints

### 1. Request Redacted Export
`POST /v1/evidence/cases/:caseId/exports/redacted`
```json
{
  "format": "mp4",
  "reason": "GDPR Subject Access Request disclosure to outside legal counsel",
  "redaction": {
    "complianceStandard": "GDPR",
    "faceBlur": true,
    "plateBlur": true,
    "applyStaticZones": true,
    "mode": "blur",
    "blurStrength": 24,
    "audioAction": "REMOVE_TRACK",
    "watermarkText": "PRIVACY REDACTED // GDPR SAR DISCLOSURE"
  }
}
```

### 2. Retrieve Redaction Compliance Audit & Certificate
`GET /v1/evidence/exports/:exportId/redaction-audit`
Returns the signed compliance certificate, digital signature, applied filter summary, and audit ledger records.

---

## 5. Verification & Testing

The capability is verified through automated test suites:
- `test/evidence/video-redaction-export.test.ts`: Tests coordinate normalization, certificate issuance and verification, tampered certificate detection, database logging, and real FFmpeg transcode with ffprobe validation.
- `test/recording/hardware-redaction-acceleration.test.ts`: Tests encoder detection and filter graph generation across all three masking styles.
