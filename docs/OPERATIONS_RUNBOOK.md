# Sentinel Grid: Security Operations Center (SOC) Runbook

**Document Version:** 1.0.0-PROD  
**Target Roles:** SOC Operators, Branch Security Officers, Regional Security Managers  
**Classification:** Operational Procedure  

---

## 1. Routine Operational Workflows

### 1.1 Shift Handover & Morning Health Digest (08:00 AM)
1. Navigate to `/role-dashboard` and review the **Morning Health Digest**.
2. Verify total branch online status across all regions:
   - Green (> 98% online): Normal operational status.
   - Amber (90–98% online): Review offline cameras list.
   - Red (< 90% online): Immediate network infrastructure triage with telecom provider.
3. Check overnight P1/P2 unacknowledged incidents.

### 1.2 Dual-Control Branch Opening Verification (08:30–09:30 AM)
1. On the **Smart Video Wall**, select layout preset `Branch Opening Grid`.
2. As branches initiate opening sequence:
   - Verify 2 authorized staff members enter within the 30-second window.
   - Green indicator displays: `Dual-Control Opening Verified`.
3. If a single person enters or opening occurs before 08:30 AM:
   - Automated P1 Alert triggers voice call to Regional Security Officer.
   - Operator initiates immediate two-way audio talkback challenge to branch.

---

## 2. Incident Triage & Response SLAs

| Priority | SLA Acknowledgment | Initial Response | Escalation Target |
| :--- | :--- | :--- | :--- |
| **P1 - Critical** (Vault breach, ATM tamper, Intrusion) | **< 60 Seconds** | < 2 Minutes | Regional Security Head, Police Control |
| **P2 - High** (Tailgating, Cash counter unattended, Obstruction)| **< 3 Minutes** | < 10 Minutes | Branch Manager, On-Duty Guard |
| **P3 - Medium** (Loitering, Queue overflow, Link jitter) | **< 15 Minutes** | < 30 Minutes | Local Branch Assistant |
| **P4 - Informational** (Storage usage warning, Maintenance note) | **< 1 Hour** | < 4 Hours | IT / Maintenance Contractor |

---

## 3. Evidence Export & Legal Hold Procedure

1. Open `/evidence` workspace.
2. Select target case or search video segments via `/video-search`.
3. Click **"Apply Legal Hold"** to exempt segments from the 90-day FIFO purge cycle.
4. Click **"Export Evidence Package"**:
   - Computes SHA-256 hash of original MP4 recording segments.
   - Embeds Section 65B Digital Certificate documenting camera serial, location, and hash.
   - Signs package with HSM digital certificate.
5. Record recipient agency details in Chain of Custody manifest.
