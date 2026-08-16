# Enterprise SMART & HDD Health Monitoring Architecture

## 1. Executive Summary & Core Principle

**Core Rule**: **Never reduce HDD health to a simplistic boolean `HDD: OK`.**

In enterprise banking and high-security surveillance, storage monitoring decouples physical asset telemetry from logical capacity and recording continuity:

$$\text{Storage Capacity} \neq \text{Disk Hardware Health} \neq \text{SMART Self-Test} \neq \text{RAID Array State} \neq \text{Recording Continuity}$$

```
                Physical Recorder / Host
                           │
       ┌───────────────────┼───────────────────┐
       ▼                   ▼                   ▼
  Recorder API          smartctl              SNMP
 (Dahua/Hikvision)    (-a -j JSON)        (Storage MIBs)
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                           ▼
                  Disk Evidence Collector
                           │
                           ▼
                Evidence Fusion Service
           (Hard failure overrides "Normal")
                           │
                           ▼
             Deterministic Health Evaluator
          (11-step precedence with hysteresis)
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
    Disk Health Snapshot        Predictive Engine
     - Physical: WARNING         - Failure Prob: 78%
     - SMART: PASSED             - Window: 48h
     - Capacity: 92% (CRITICAL)  - Risk: HIGH
     - Array: RAID5 DEGRADED     - Trend: +7 sectors/24h
             │                           │
             └─────────────┬─────────────┘
                           │
                           ▼
                Recording Impact Engine
               - 16 Channels at Risk
               - Retention Deficit: 61/90d
                           │
                           ▼
            Centralized Control-Plane APIs
                           │
                           ▼
          Branch Command Center & Fleet UI
```

---

## 2. Multi-Source Evidence Model

### 2.1 Physical Asset vs. Time-Series Observations
- **Asset Registration**: Disks are identified by physical serial numbers (`serialNumber`) to prevent data contamination across HDD replacements.
- **Time-Series Telemetry**: Observations capture capacity, operating hours, temperature, sector error rates, and bus error counters.

### 2.2 First-Class SMART Attributes (`SmartAttribute`)
The architecture parses and records granular ATA and NVMe SMART registers:
- **Attribute 5** (`Reallocated_Sector_Ct`): Sectors remapped to spare blocks.
- **Attribute 9** (`Power_On_Hours`): Total operational lifetime in hours.
- **Attribute 187** (`Reported_Uncorrectable_Errors`): Uncorrectable read failures.
- **Attribute 194** (`Temperature_Celsius`): Real-time spindle/board temperature.
- **Attribute 197** (`Current_Pending_Sector`): Unstable sectors awaiting reallocation.
- **Attribute 198** (`Offline_Uncorrectable`): Uncorrectable sectors found during background testing.
- **Attribute 199** (`UDMA_CRC_Error_Count`): SATA interface transmission cable errors.

---

## 3. Evidence Fusion & Precedence Evaluation

### 3.1 Hard-Failure Priority Overrides
When multiple collectors report on the same disk (e.g. `SMARTCTL` + `RECORDER_API`):
1. **SMARTCTL Hard Failure Overrides Recorder "Normal"**: An NVR firmware reporting `Normal` does not suppress physical pending sector growth detected by smartctl.
2. **Conservative Sector Error Maximization**: Highest observed pending and reallocated sector counts are retained.

### 3.2 11-Step Deterministic Evaluation Precedence
1. **Missing Disk**: Evaluated as `MISSING` (Score: 0).
2. **SMART Self-Test Failure**: Evaluated as `FAILED` (Score: 0).
3. **RAID Array Failure**: Evaluated as `FAILED` (Score: 10).
4. **Recorder Reported Failure**: Evaluated as `FAILED` (Score: 10).
5. **Critical Sector Errors**:
   - $\text{Pending Sectors} \ge 10 \implies \text{CRITICAL}$
   - $\text{Reallocated Sectors} \ge 50 \implies \text{CRITICAL}$
   - $\text{Offline Uncorrectable} \ge 5 \implies \text{CRITICAL}$
6. **Thermal Critical**: $\text{Temperature} \ge 60^\circ\text{C} \implies \text{CRITICAL}$.
7. **Capacity Critical**: $\text{Usage} \ge 95\% \implies \text{CRITICAL}$.
8. **Predictive Failure**: $\text{Failure Probability} \ge 80\% \implies \text{CRITICAL}$ / $\text{WARNING}$.
9. **Warning Indicators**:
   - $\text{Pending Sectors} \ge 1 \implies \text{WARNING}$
   - $\text{Reallocated Sectors} \ge 1 \implies \text{WARNING}$
   - $\text{Temperature} \ge 50^\circ\text{C} \implies \text{WARNING}$
   - $\text{Usage} \ge 85\% \implies \text{WARNING}$
   - $\text{RAID Array} = \text{DEGRADED} \implies \text{WARNING}$
10. **Nominal State**: `HEALTHY` (Score: 100).
11. **Telemetry Timeout**: $\text{Age} > 300\text{s} \implies \text{UNKNOWN}$ with `DISK_TELEMETRY_STALE`.

---

## 4. Rule-Based Predictive Failure Scoring

The predictive engine computes an explainable risk probability $P \in [0.0, 1.0]$:

$$\text{Score} = \sum \text{RiskFactorWeights}$$
- $\text{SMART Failed} \rightarrow +100$
- $\text{Pending Sectors} > 0 \rightarrow +25$
- $\text{Pending Sector Growth in 24h} > 0 \rightarrow +25$
- $\text{Uncorrectable Sectors} > 0 \rightarrow +30$
- $\text{Reallocated Sector Growth in 7d} > 0 \rightarrow +20$
- $\text{Temperature} \ge 55^\circ\text{C} \rightarrow +15$
- $\text{Elevated Read/Write Errors} \rightarrow +15$
- $\text{Operating in Degraded Array} \rightarrow +20$
- $\text{Power-On Hours} > 35,000\text{h} \rightarrow +10$

$$P = \min\left(\frac{\text{Score}}{100}, 1.0\right)$$

---

## 5. Storage Impact on Video Retention

Storage health explicitly correlates with camera evidence risk:
- **Recording Volume Identification**: Separates `RECORDING`, `ARCHIVE`, and `SPARE` disks.
- **Evidence Loss Risk**: Formulates operational risk level (`NONE`, `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`).
- **Retention Violation Corroboration**: Flags compliance deficit (e.g. 61 days available vs 90 days required).

---

## 6. REST Control-Plane API

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/v1/storage/disks` | `GET` | Filterable list of all monitored physical disks |
| `/api/v1/storage/disks/:id` | `GET` | Complete `DiskHealthSnapshot` and operational states |
| `/api/v1/storage/disks/:id/smart` | `GET` | Full SMART attributes register table |
| `/api/v1/storage/disks/:id/history` | `GET` | Historical time-series telemetry |
| `/api/v1/storage/disks/:id/prediction` | `GET` | Failure probability and contributing risk factors |
| `/api/v1/recorders/:id/storage` | `GET` | Recorder-level storage and RAID aggregation |
| `/api/v1/branches/:id/storage` | `GET` | Branch-level storage overview and channel impact |
| `/api/v1/storage/fleet/summary` | `GET` | Enterprise fleet counts and alert metrics |
| `/api/v1/storage/fleet/risks` | `GET` | Exception-first at-risk physical disks |

---

## 7. Frontend UI Integration

1. **`DiskHealthCard`**: Displays multi-dimensional decoupled health indicators with a direct **"SMART Details"** button.
2. **`DiskDetailModal`**: Interactive modal displaying physical hardware state, SMART table, predictive failure gauge, and historical trend metrics.
3. **`HddFleetWidget`**: Exception-first filtering tabs (`All`, `At Risk`, `SMART Alerts`).
