# Sentinel Grid: Privacy Governance & Data Protection Model

**Document Version:** 1.0.0-PROD  
**Legal Framework:** Digital Personal Data Protection (DPDP) Act 2023, RBI Customer Data Guidelines, ISO/IEC 27701  

---

## 1. Core Privacy Architecture

Sentinel Grid is engineered under strict **Privacy by Design** principles, ensuring that video surveillance operations across financial institutions do not infringe on individual privacy rights or violate regulatory limits.

```
+-----------------------------------------------------------------------------------------------+
|                                    PRIVACY CONTROL PIPELINE                                   |
|                                                                                               |
|  +-------------------+     +--------------------+     +-------------------+                   |
|  | Video Ingest &    | --> | Dynamic Redaction  | --> | Cryptographic     |                   |
|  | Metadata Stripper |     | & Face Blurring    |     | Export Controller |                   |
|  +-------------------+     +--------------------+     +---------+---------+                   |
|                                                                 |                             |
|                                                                 v                             |
|  +-------------------+     +--------------------+     +---------+---------+                   |
|  | Legal Hold Audit  | <-- | Role-Gated Export  | <-- | DPDP Consent &    |                   |
|  | Logging Vault     |     | Approval Workflow  |     | Policy Validator  |                   |
|  +-------------------+     +--------------------+     +-------------------+                   |
+-----------------------------------------------------------------------------------------------+
```

---

## 2. Privacy Safeguards & Data Minimization

1. **Zero Customer PII in Video Indexes:**
   - Ingested core banking events reference only opaque transaction hashes (`transactionId`) and amount brackets.
   - Customer account numbers, Aadhaar numbers, phone numbers, and names are strictly prohibited from entering CCTV search metadata.

2. **Restricted Facial Recognition Controls:**
   - **Prohibited:** Unrestricted passive face scanning of general public and bank customers.
   - **Permitted:** Opt-in authorized staff identification for secure room dual-control and known criminal watchlists provided by statutory law enforcement.
   - **Audit Gate:** Every facial match query generates an immutable audit record logging investigator identity, case number, and search rationale.

3. **Dynamic Video Redaction & Masking:**
   - Real-time blurring of sensitive transaction terminals, PIN entry keypads, and currency counter trays on public-facing monitors.
   - Export masking engine enables redaction of non-involved bystanders when preparing evidence for external judicial review.

4. **Retention Policies & Automated FIFO Purge:**
   - Routine surveillance recordings auto-purge after the configured retention window (typically 90 days).
   - Only segments tagged with an active `legal_hold = true` by an authorized Evidence Officer are preserved beyond the FIFO horizon.
