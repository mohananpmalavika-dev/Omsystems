# Clock & Time-Drift Monitoring Subsystem Architecture

## 1. Executive Overview

In banking surveillance, timestamps are critical legal evidence. Video footage recorded with inaccurate timestamps can invalidate investigation trails, fail audit compliance, and misrepresent sequence of events.

The platform treats clock synchronization and time drift as first-class evidence controls across three physical tiers:
1. **Edge Gateway Clock**: Synchronized via Linux `chrony` / `systemd-timesyncd` against internal stratum NTP.
2. **Recorder Clock (NVR/DVR)**: Queried via vendor APIs (Dahua CGI, Hikvision ISAPI, ONVIF).
3. **IP Camera Clock**: Queried via ONVIF Device Management API.

```
                  Authoritative Internal NTP (Stratum 1/2)
                                     │
                                     ▼
                   Edge Gateway Reference Clock (Linux)
                                     │
               ┌─────────────────────┴─────────────────────┐
               ▼                                           ▼
      NVR/DVR Recorder Clock                      IP Camera Clocks
  (Dahua CGI / Hikvision / ONVIF)                (ONVIF Probe APIs)
               │                                           │
               └─────────────────────┬─────────────────────┘
                                     │
                                     ▼
                       ClockOffsetEstimator
                      (RTT Latency Midpoint)
                                     │
                                     ▼
                        ClockMonitoringService
            (Anti-Flapping, Drift Rates, NTP Whitelists)
                                     │
          ┌──────────────────────────┼──────────────────────────┐
          ▼                          ▼                          ▼
Branch Rollup Card           Fleet Time Dashboard       Clock Sync Audit Log
(Gateway + NVR + CAM)        (Worst Drift Ranking)      (Traceable Remediation)
```

---

## 2. Mathematical & Operational Rules

### 2.1 Latency-Compensated Offset Estimation
Rather than comparing naive server reception timestamps, the estimator calculates network midpoint compensation:
$$T_{\text{ref}} = T_{\text{start}} + \frac{\text{RTT}}{2}, \quad \text{Offset } (\Delta t) = T_{\text{device}} - T_{\text{ref}}$$

For jitter-prone links, multi-sample probes take the median offset.

### 2.2 Threshold Classifications
- $|\Delta t| \le 5.0\text{s} \implies \text{SYNCHRONIZED}$ (Green)
- $5.0\text{s} < |\Delta t| \le 30.0\text{s} \implies \text{WARNING}$ (Amber)
- $|\Delta t| > 30.0\text{s} \implies \text{CRITICAL}$ (Red)

### 2.3 Derivative Drift Rate Derivation
$$\text{Drift Rate (sec/hour)} = \frac{\Delta \text{offset}}{\Delta \text{hours}}$$

### 2.4 Timezone & DST Misconfiguration Detection
Detects whole-hour discrepancies (e.g. $+19,800\text{s} = +5.5\text{h}$ UTC vs IST, or $3600\text{s} = 1\text{h}$ DST shift) and flags `timezoneMismatch: true`.

### 2.5 Approved NTP Whitelisting
Enforces that devices only sync against approved internal banking NTP servers (`time.bank.internal`, `10.100.1.5`). Public/unapproved servers (`pool.ntp.org`) trigger policy warnings.

### 2.6 Forensic Immutability & Traceable Remediation
- Original device timestamps are preserved verbatim in alert and clip metadata.
- All manual/automated sync actions record user ID, before/after offset, and reason in `clock_sync_audit`.

---

## 3. REST Control-Plane APIs

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/v1/clock-health/branches/:id` | `GET` | Complete branch clock health (Gateway, Recorder, Cameras, Cross-Offsets). |
| `/api/v1/clock-health/fleet/summary` | `GET` | Fleet-wide compliance summary and worst-drift rankings. |
| `/api/v1/clock-health/devices/:id/history` | `GET` | Historical drift time-series for a specific device. |
| `/api/v1/clock-health/poll` | `POST` | Ingest new clock probe measurement. |
| `/api/v1/clock-health/devices/:id/sync` | `POST` | Audited time synchronization trigger. |
| `/api/v1/clock-health/audit` | `GET` | Audit log of all clock synchronization actions. |
