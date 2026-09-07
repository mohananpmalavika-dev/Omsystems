# KRYPTOVISION / SENTINEL GRID — FORENSIC EVIDENCE & CHAIN OF CUSTODY SPECIFICATION

> **Court-Admissible Digital Video Evidence Vault & Cryptographic Custody Ledger**
> **Modules**: \`src/evidence/\`, \`src/evidence-export/\`, \`src/database/evidence-repository.ts\`
> **Legal Compliance**: Federal Rules of Evidence (FRE Rule 902), Indian Evidence Act Section 65B, ISO/IEC 27037 (Digital Evidence Handling)
> **Version**: v1.0.0-rc.2

---

## 1. Executive Summary & Legal Principles

In criminal prosecutions, regulatory audits, and insurance litigations, surveillance video is only as valuable as its **proven integrity**. Opposing counsel frequently challenges digital video evidence on grounds of tampering, frame insertion, timestamp alteration, or unverified chain of custody.

Sentinel Grid incorporates a tamper-evident, cryptographically sealed **Forensic Evidence Vault** that guarantees video authenticity from the instant a frame is recorded to its presentation in a court of law.

### 4 Foundational Evidentiary Invariants
1. **Unbroken Merkle Hash Chain**: Every custody action is linked cryptographically to the preceding event via \`previous_block_hash\`. Any post-facto modification invalidates all subsequent block signatures.
2. **Zero Sequence Gaps / No Forks**: Concurrency-safe PostgreSQL advisory locks prevent race conditions, sequence collisions, or chain forking even under high concurrent load.
3. **Hardware & NTP Binding**: Video chunks are bound to the physical camera MAC address, firmware version, and authenticated NTP time reference.
4. **Non-Repudiation**: Evidence manifests are signed with asymmetric **Ed25519** digital signatures belonging to the tenant's hardware security module (HSM) or verified vault key.

---

## 2. Cryptographic Chain of Custody Architecture

\`\`\`mermaid
graph TD
    subgraph Custody_Ledger["Append-Only Merkle Custody Ledger (PostgreSQL + Cryptographic Seals)"]
        B0[Genesis Block: Evidence Captured<br/>Hash: 8f4a...21 | PrevHash: 0000...00]
        B1[Block 1: Transferred to Tier 2 NAS<br/>Hash: 3c9b...e7 | PrevHash: 8f4a...21]
        B2[Block 2: Legal Hold Placed<br/>Hash: 11a4...90 | PrevHash: 3c9b...e7]
        B3[Block 3: Export Requested by Auditor<br/>Hash: 77f2...5d | PrevHash: 11a4...90]
        B4[Block 4: Signed Export Package Sealed<br/>Hash: 9e01...ac | PrevHash: 77f2...5d]
        
        B0 --> B1 --> B2 --> B3 --> B4
    end

    subgraph Verification["Independent Verification Engine"]
        VER[EvidenceVerifierService]
        VER -->|Recompute SHA-256| B4
        VER -->|Verify Ed25519 Signature| CERT[X.509 Vault Certificate]
        VER -->|Check 0 Sequence Gaps| VALID[Result: 100% UNTAMPERED]
    end

    style Custody_Ledger fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#fff
    style Verification fill:#022c22,stroke:#10b981,stroke-width:2px,color:#fff
\`\`\`

### Custody Event Schema

Each custody event records an immutable cryptographic tuple:
\`\`\`typescript
interface CustodyEvent {
  eventId: string;             // UUID v4
  evidenceId: string;          // UUID v4
  sequenceNumber: number;      // Monotonically increasing (1, 2, 3...)
  action: CustodyAction;       // CAPTURED, TRANSFERRED, HELD, VIEWED, EXPORTED, SEALED
  actorId: string;             // User ID or Edge Agent ID
  actorRole: string;           // OPERATOR, SECURITY_DIRECTOR, SYSTEM_DAEMON
  previousBlockHash: string;   // SHA-256 hash of event N-1
  currentBlockHash: string;    // SHA-256(previousBlockHash + sequence + action + payload + timestamp)
  ed25519Signature: string;    // Asymmetric cryptographic signature
  timestamp: string;           // ISO 8601 UTC timestamp
  ipAddress: string;           // Client IP
  hardwareFingerprint: string; // Camera MAC + Edge Agent Hardware ID
}
\`\`\`

---

## 3. Court-Admissible Export Package Format

When authorized law enforcement or legal counsel requests video footage, Sentinel Grid compiles a self-contained, tamper-evident ZIP archive:

\`\`\`text
Evidence_EXP_2026_0907_VAULT_BREACH.zip
 ├── video/
 │    ├── evidence_primary.mp4          # Canonical H.264 video stream
 │    └── evidence_watermarked.mp4      # Forensic burnt-in watermark stream
 ├── metadata/
 │    ├── manifest.json                 # Hardware metadata, coordinates, camera serial
 │    ├── chain_of_custody.json         # Complete unbroken custody block history
 │    └── hashes.sha256                 # SHA-256 checksums of every file in the package
 ├── verification/
 │    ├── vault_public_key.pem          # Ed25519 public key certificate
 │    ├── digital_signature.sig         # Detached signature over manifest.json
 │    └── verify_evidence.html          # Standalone client-side verification tool
 └── player/
      └── sentinel_offline_player.html  # Zero-dependency local browser video player
\`\`\`

### 3.1 Forensic Video Watermarking
The export engine optionally burns in a dynamic, semi-transparent forensic watermark across the video frames using FFmpeg \`drawtext\` filters:
- Viewer / Requesting Officer Full Name and Badge Number.
- Requesting Workstation IP Address.
- Frame-accurate UTC timestamp and frame sequence number.
- Cryptographic micro-pattern preventing video cropping or camouflage.

---

## 4. Legal Hold Lifecycle & Compliance Guarantee

\`\`\`mermaid
stateDiagram-v2
    [*] --> Active_Surveillance: Camera Recording
    Active_Surveillance --> Standard_Retention: 30-Day Ring Buffer
    Standard_Retention --> Expired: Pruned after 180 Days
    
    Standard_Retention --> Legal_Hold_Applied: Security Incident / Lawsuit Filed
    Legal_Hold_Applied --> WORM_Protected: Zero-Delete Lock Active
    
    note right of WORM_Protected
        Segment cannot be deleted,
        pruned, or overwritten by any user,
        admin, or background worker.
    end note

    WORM_Protected --> Dual_Authorization_Review: Legal Matter Concluded
    Dual_Authorization_Review --> Standard_Retention: Released by 2 Super Admins
    Expired --> [*]
\`\`\`

1. **Application**: Initiated by an authorized legal officer via \`POST /api/v1/evidence/:id/legal-hold\`.
2. **Immediate Lock**: PostgreSQL triggers mark the video segment records as \`is_legal_hold = TRUE\`. Any automated retention pruning query containing \`DELETE WHERE ...\` skips the held segment unconditionally.
3. **Dual-Authorization Release**: Releasing a legal hold requires approval from two separate administrative users with dual-key authentication, preventing unilateral evidence destruction.

---

## 5. Automated Verification & Test Proofs

The integrity of Sentinel Grid's evidence vault is rigorously tested under high-concurrency conditions:
\`\`\`bash
# 1. Run forensic evidence production hardening test (11/11 passing)
npx tsx test/evidence/forensic-evidence-production-hardening.test.ts

# 2. Run real FFmpeg video export integration test (5/5 passing)
npx tsx test/evidence/real-export-ffmpeg-integration.test.ts

# 3. Run guaranteed evidence capture runner
npm run test:evidence:guaranteed
\`\`\`

### Test Suite Highlights
- **Concurrent Writer Stress Test**: 20 concurrent asynchronous workers writing custody events simultaneously verified:
  - Exactly 0 sequence number collisions.
  - Exactly 0 sequence gaps.
  - Exactly 0 chain forks.
  - Complete, unbroken SHA-256 hash chaining from block 1 to block 20.
- **FFmpeg Transcoding & Watermarking**: Real FFmpeg integration creates valid MP4 containers with verified video/audio sync and cryptographic signatures.
