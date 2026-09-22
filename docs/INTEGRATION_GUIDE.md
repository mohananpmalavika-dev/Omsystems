# Sentinel Grid: Enterprise Third-Party Integration Guide

**Document Version:** 1.0.0-PROD  
**Integration Modalities:** REST Webhooks, Kafka Event Stream, SIA DC-09, Contact ID, Syslog  
**Standard Event Protocol:** RFC 7515 JWS-Signed Idempotent Event Payloads  

---

## 1. Core Banking System (CBS) Integration

Sentinel Grid integrates with major banking cores (Infosys Finacle, TCS BaNCS, Oracle FLEXCUBE) to synchronize high-risk financial events with video evidence:

```
[Core Banking System] 
      │  HTTPS POST /api/v1/integrations/banking/transaction-event
      ▼
[Sentinel Control Plane] 
      │  Query Teller Camera (±10 min window)
      ▼
[Sentinel Recording Engine] 
      │  Extract Segments & Compute SHA-256
      ▼
[Defensible Investigation Package Created]
```

### Ingestion Payload Requirements:
- Use standard ISO 20022 or JSON event structures.
- Do NOT transmit customer name, account number, or balance into video metadata. Only transmit `tellerId`, `terminalId`, `amountBucket`, and `riskFlag`.

---

## 2. Physical Access Control System (PACS) Integration

Sentinel Grid supports direct integration with HID Mobile Access, Lenel OnGuard, Honeywell Pro-Watch, and Gallagher Command Centre:

### Event Hook:
Send door badge events to `POST /api/v1/integrations/banking/access-event`.
The integration engine automatically resolves the associated camera node and verifies visual occupancy. If access is granted but 2 people enter, an instant `TAILGATING (P2)` alert is generated.

---

## 3. SIEM & Central SOC Integration (Splunk / QRadar)

Export real-time security events to centralized SIEM:
- **Format:** Common Event Format (CEF) / JSON via TLS Syslog (Port 6514) or HTTPS Webhook.
- **Payload Schema:**
  ```json
  {
    "eventId": "evt_99182301",
    "eventType": "BANKING_DUAL_CONTROL_BREACH",
    "tenantId": "550e8400-e29b-41d4-a716-446655440000",
    "branchId": "110e8400-e29b-41d4-a716-446655440001",
    "cameraId": "b6a3e144-88d3-48b0-a517-109283746520",
    "timestamp": "2026-09-22T22:30:00Z",
    "severity": "P1",
    "source": "AI_ANALYTICS_ENGINE",
    "confidence": 0.94,
    "payload": {
      "violationType": "vault_single_occupancy",
      "durationSeconds": 45
    }
  }
  ```
