# Enterprise Recipient Resolution Subsystem Architecture

## 1. Executive Summary

In a multi-branch surveillance operations network (400+ branches), notification delivery is only reliable when the platform can deterministically answer three questions:
1. **Who is responsible right now?** (Branch Manager, Regional Security Officer, Active Shift Operator, After-Hours On-Call Officer)
2. **Which delivery endpoints can reach them?** (Verified phone, verified email, active push tokens, live dashboard)
3. **Why were they selected?** (Audit trail preserving all matching reasons and selector versions)

```
                              Alert Generated
                                     │
                                     ▼
                          NotificationPolicyEngine
                                     │
                                     ▼
                          RecipientResolver (Strategy)
                                     │
        ┌───────────────────┬────────┴───────────┬───────────────────┐
        ▼                   ▼                    ▼                   ▼
   Branch Roles       Region Roles         Tenant Roles        On-Call Shifts
  (Branch Manager)  (Regional Security)    (HO Operator)    (After-Hours Duty)
        │                   │                    │                   │
        └───────────────────┼────────────────────┴───────────────────┘
                            │
                            ▼
                User Directory & Endpoints
            (E.164 Normalization + Verification)
                            │
                            ▼
               Candidate Deduplication & Union
              (Union of channels: SMS + Email + Voice)
                            │
                            ▼
               ResolvedRecipients + Outbox Jobs
                            │
                            ▼
                   Notification Worker
            (Twilio, Exotel, SMTP, Push, WebRTC)
```

---

## 2. Operational Invariants

### 2.1 Multi-Role User Deduplication & Channel Union
When a single user satisfies multiple operational selectors (e.g. an individual who is simultaneously the **Regional Security Officer** requiring SMS+Voice, and the **After-Hours Duty Officer** requiring SMS+Email):
- The user is merged into **1 single recipient** to avoid duplicate calls.
- Both operational reasons are retained: `reasons: ["REGIONAL_SECURITY", "ON_CALL"]`.
- The merged channels are a complete **union** of requirements: `SMS + Email + Voice`.

### 2.2 Strict Phone Verification Enforcement
- **P1 Voice & SMS calls are strictly prohibited from dispatching to unverified phone numbers.**
- If an unverified number is encountered, delivery is suppressed and an explicit `PHONE_UNVERIFIED` diagnostic warning is emitted.

### 2.3 Strict Tenant Isolation
- All role assignments, shifts, on-call rotations, user profiles, and contact endpoints are isolated by `tenantId`.

---

## 3. Preflight & Readiness Audit Tools

Administrators can audit readiness and test resolution rules before live emergencies:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/v1/notifications/test-resolution` | `POST` | Previews exact resolved people and endpoints for any branch, priority, and date/time. |
| `/api/v1/notifications/readiness` | `GET` | Verifies whether all 4 critical roles (Branch Manager, Regional Security, HO Operator, Duty Officer) have verified phone endpoints. |
| `/api/v1/notifications/dispatch` | `POST` | Dispatches critical notifications through the transactional outbox. |
| `/api/v1/notifications/voice/ivr` | `GET/POST` | Twilio/Exotel IVR callback (Press 1 to ACK, Press 2 to repeat). |
