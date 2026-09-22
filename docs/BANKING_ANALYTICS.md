# Sentinel Grid: Banking & NBFC Security Intelligence Specification

**Document Version:** 1.0.0-PROD  
**Subsystem:** BFSI Specialized Intelligence Layer  
**Regulatory Baseline:** RBI Master Directions on CCTV Surveillance, Cyber Security Framework in Banks, Cash Logistics Standards.  

---

## 1. Banking Intelligence Subsystems

### 1.1 Branch Operations & Dual-Control Opening
- **Enforcement Window:** Configured branch opening time (e.g., 08:30–09:30 AM).
- **Dual-Control Rule:** Strong room and branch outer shutter entry requires 2 authorized staff members entering within a 30-second grace window.
- **Violation Trigger:** 
  - 1 person enters alone -> `ALERT (P1)`: Single Person Branch Opening Violation.
  - 2 people enter -> `OBSERVATION`: Normal Dual-Control Opening.
  - Entrance before authorized schedule -> `ALERT (P1)`: Unauthorized Off-Hours Entry.

### 1.2 Cash Counter & Teller Oversight
- **Teller Presence:** Monitored via designated polygonal zone `CASH_COUNTER`.
- **Unattended Counter Alert:** If cash tray is unlocked or active cash is visible, but teller is absent > 45 seconds -> `ALERT (P2)`.
- **Counter Crowd Accumulation:** More than 4 customers clustering within 1.5 meters of teller barrier -> `INDICATOR (P3)` / `ALERT (P2)`.

### 1.3 Vault & Strong Room Defense
- **Door Status Monitoring:** Optical reed switch + video bounding box on vault heavy door.
- **Door Open Timer:** Vault door open > 120 seconds -> `ALERT (P1)`: Vault Door Prolonged Open.
- **Occupancy Invariants:**
  - 0 Persons inside, door closed -> NORMAL.
  - 1 Person inside alone -> `ALERT (P1)`: Vault Single-Occupancy Violation.
  - 2 Authorized Persons inside -> NORMAL OPERATION.
  - 1 Person exits leaving 1 person inside alone -> `ALERT (P1)`: Dual-Control Abandonment.

### 1.4 ATM Security Intelligence
- **Camera Obstruction / Defocus:** Spray paint, tape, or cloth over lens -> `ALERT (P1)`.
- **Card Slot Tampering / Skimming Loitering:** Individual lingering near card insertion slot > 120s without completed transaction -> `ALERT (P2)`.
- **Explainable ATM Risk Score:**
  - `NORMAL (0–20):` Uptime 100%, zero tampering, camera clear.
  - `WATCH (21–50):` Transient packet loss or loitering warning.
  - `HIGH (51–80):` Camera obstruction or off-hours physical vibration sensor alert.
  - `CRITICAL (81–100):` Confirmed tampering or camera defacement with cash dispenser sensor disconnect.

### 1.5 Cash Van Logistics Correlation
- **ANPR Match:** Registered cash transit vehicle plate verified upon arrival at branch loading zone.
- **Schedule Window:** Matches authorized transit manifest.
- **Guard Presence:** Optical detection verifies armed escort accompany cash chest transfer.

### 1.6 External Integrations: POS, CBS & Access Control
- **Access Control Mismatch:** Badge swiped for User A, but video confirms 2 individuals entering or person not matching enrolled profile -> `INVESTIGATION LEAD (P2)`: ACCESS-CAMERA MISMATCH.
- **Core Banking System (CBS) Correlation:** High-value transaction (> ₹10,00,000) or high-risk withdrawal automatically queries cameras covering counter and isolates ±10 minutes of encrypted video into an investigation package with zero customer PII.

---

## 2. Standard Banking Workflow Templates (15 Workflows)

1. **Branch Opening Dual-Control:** Automated verification of 2 designated keyholders.
2. **Branch Closing & Secure Sweep:** Perimeter lockdown check and motion verification.
3. **Cash Counter Unattended Alarm:** Real-time alert to branch manager if teller leaves counter vacant.
4. **Vault Entry Dual-Control:** Continuous multi-person verification inside strong room.
5. **Strong Room Access Log:** Automatic video snapshot logged for every entry.
6. **ATM Maintenance Verification:** Technician check-in matched with work order schedule.
7. **ATM Cash Replenishment:** Transit agency guard and custodian verification.
8. **Cash Van Arrival & Escort:** ANPR plate recognition and perimeter clearance.
9. **After-Hours Presence Detection:** Immediate P1 dispatch for any presence after branch closure.
10. **Restricted Zone Trespass:** Virtual tripwire around currency counting room.
11. **Suspicious Perimeter Loitering:** Dwell-time tracking exceeding 180 seconds.
12. **Camera Tampering / Obstruction:** Instant lens occlusion alarm.
13. **Camera Health / Link Drop:** Edge agent detection of dead video signal within 30s.
14. **Dual-Control Abandonment:** Alert triggered when second keyholder leaves vault early.
15. **Forensic Fraud Case Assembly:** Synchronized multi-camera timeline compilation.
