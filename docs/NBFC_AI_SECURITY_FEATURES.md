# NBFC AI Security Features - Complete Documentation

## Overview

This document outlines the complete AI-powered security capabilities designed specifically for Non-Banking Financial Companies (NBFCs). The system provides comprehensive physical security, asset protection, and operational intelligence without customer service features.

**Target Audience:** NBFC security operations, branch managers, compliance officers, and IT administrators

**Coverage:** Branch security, vault protection, ATM monitoring, cash operations, access control, emergency response, and physical asset security

---

## 1. Banking & Vault Security Analytics

### 1.1 Vault Monitoring & Protection

#### Vault Access Control
- **Person in Vault After Hours** (Priority: P1)
  - Detects unauthorized presence in vault during non-business hours
  - Automatic camera evidence collection
  - Real-time alert to security operations center (SOC)
  - Integration with access control logs for verification

- **Vault Door Monitoring** (Priority: P1)
  - AI-powered detection of vault door status (open/closed/ajar)
  - Visual verification of authorized vs unauthorized access
  - Automatic recording trigger for all vault door events
  - Integration with physical access control systems

- **Strong Room Entry Detection** (Priority: P1)
  - Monitors entry/exit events to strong rooms
  - Cross-references with authorized personnel schedules
  - Temporal pattern analysis to detect anomalies
  - Automatic incident creation with video evidence

- **Vault Event Correlation** (Priority: P1)
  - Fuses multiple signals: camera, door sensor, access card, motion
  - Reduces false positives through multi-device confirmation
  - Confidence scoring based on evidence strength
  - Timeline reconstruction for investigations

#### Dual Control Compliance
- **Dual Control Verification** (Priority: P1)
  - Ensures two authorized persons present for critical operations
  - Face recognition to verify identity (consent-aware)
  - Temporal validation (both persons present simultaneously)
  - Audit trail with video evidence
  - Compliance reporting for regulatory requirements

### 1.2 Cash Operations Security

#### Cash Counter Monitoring
- **Cash Counter Monitoring** (Priority: P2)
  - Continuous surveillance of cash handling areas
  - Detection of irregular counting procedures
  - Dwell time analysis for transaction anomalies
  - Integration with cash management systems

- **Cash Tray Left Open** (Priority: P1)
  - Computer vision detection of open cash trays
  - Configurable time thresholds for alerts
  - Automatic notification to branch manager
  - Historical pattern analysis for training purposes

- **Teller Presence Detection** (Priority: Standard)
  - Monitors staffing levels at cash counters
  - Detects unmanned stations during business hours
  - Queue-to-staff ratio optimization
  - Compliance with minimum staffing requirements

#### Cash Van Operations
- **Cash Van Arrival Detection**
  - ANPR (Automatic Number Plate Recognition) for authorized vehicles
  - Arrival time verification against schedule
  - Perimeter camera coordination for complete coverage
  - Route verification through multi-camera tracking

---

## 2. ATM Security & Protection

### 2.1 Physical ATM Security

#### Tampering & Vandalism Detection
- **ATM Tampering Detection** (Priority: P1)
  - Computer vision detection of physical interference
  - Skimmer device detection on card reader
  - Suspicious attachment monitoring (overlays, cameras)
  - Immediate P1 alert generation

- **ATM Cabinet Opened** (Priority: P1)
  - Hardware sensor integration with camera verification
  - Visual confirmation of cabinet status
  - After-hours opening detection
  - Automatic dispatch notification

- **ATM Vandalism Detection** (Priority: P1)
  - AI detection of violent impacts or damage attempts
  - Fire, smoke, or explosion detection near ATM
  - Graffiti and defacement detection
  - Multi-camera evidence collection

#### ATM Skimming Prevention
- **ATM Skimming Detection** (Priority: P1)
  - Visual detection of card skimmer devices
  - Abnormal attachment to card reader
  - Pinhole camera detection for PIN capture
  - Comparison with baseline ATM appearance
  - Daily automated inspection reports

### 2.2 ATM Operations Monitoring

#### Queue & Service Monitoring
- **ATM Queue Analysis**
  - Real-time queue length measurement
  - Wait time estimation
  - Peak usage pattern identification
  - Capacity planning insights

#### Event Correlation
- **ATM Event Correlation** (Priority: P1)
  - Multi-sensor fusion: cabinet sensor, motion, video
  - Timeline reconstruction for disputed transactions
  - Integration with transaction logs (time-correlated)
  - False positive suppression through confirmation

---

## 3. Perimeter & Access Security

### 3.1 Intrusion Detection

#### Perimeter Protection
- **Intrusion Detection** (Priority: P1)
  - Zone-based intrusion detection (configurable polygons)
  - After-hours vs business hours sensitivity adjustment
  - Integration with perimeter sensors (PIR, beam, radar)
  - Multi-camera correlation for high-confidence alerts

- **Perimeter Breach Detection** (Priority: P1)
  - Fence line monitoring with virtual tripwire
  - Climbing detection on walls and gates
  - Multi-device correlation with fence sensors
  - Automatic camera PTZ to breach location

- **Fence Climbing Detection** (Priority: P1)
  - AI detection of human climbing behavior
  - Height-based classification (scaling vs passing by)
  - Nighttime infrared detection capability
  - Integration with electric fence alarms

#### Entry Point Monitoring
- **Forced Door Open Detection** (Priority: P1)
  - Door sensor signal correlated with video
  - Visual verification of forced vs authorized entry
  - Glass break audio detection (microphone-enabled cameras)
  - Automatic incident creation with attached evidence

- **Door Propped Open Detection** (Priority: P2)
  - Configurable time thresholds (e.g., >2 minutes)
  - Business hours vs after-hours sensitivity
  - Integration with HVAC efficiency monitoring
  - Notification to facilities management

### 3.2 Restricted Area Security

#### Zone-Based Access Control
- **Restricted Area Violation** (Priority: P1)
  - Configurable restricted zones (server rooms, vaults, executive areas)
  - Time-based access policies (e.g., server room 9 AM - 6 PM)
  - Person identification (with consent) vs unknown person
  - Loitering detection in restricted zones

- **Equipment in Restricted Zone** (Priority: P1)
  - Detection of unauthorized equipment (trolleys, tools)
  - Vehicle detection in pedestrian-only areas
  - Heavy machinery near sensitive infrastructure
  - Forklift in non-operational zones

### 3.3 Tailgating & Piggybacking

- **Tailgating Detection** (Priority: P2)
  - Multi-person detection through single-swipe doors
  - Access card event correlated with person count
  - Configurable sensitivity for different door types
  - Integration with access control systems (Genetec, Lenel, etc.)

---

## 4. Emergency Response & Panic Systems

### 4.1 Panic Button Integration

#### Immediate Response
- **Panic Button Detection** (Priority: P1)
  - Hardware panic button integration (ONVIF, REST, MQTT)
  - Instant P1 incident creation (<500ms)
  - Automatic camera attachment from nearest 3-5 cameras
  - Multi-channel notification (SOC dashboard, SMS, email, mobile app)

- **Panic Emergency Response Workflow** (Priority: P1)
  - Pre-configured response playbook execution
  - Automatic live stream to SOC operators
  - Two-way audio activation (if enabled)
  - GPS location transmission for mobile panic buttons
  - Real-time incident timeline with all device events

- **Duress Button Detection** (Priority: P1)
  - Silent alarm for coercion situations
  - Discreet notification to security only
  - No visible indication to prevent escalation
  - Pre-recording activated (retroactive 60 seconds)

#### Emergency Camera Coordination
- **Emergency Camera Auto-Attachment** (Priority: P1)
  - Proximity-based camera selection (nearest first)
  - PTZ cameras auto-focus on panic location
  - Full-resolution recording override (max bitrate)
  - Multi-angle evidence collection
  - Automatic archival to secure evidence storage

### 4.2 Fire & Safety Emergency

#### Fire Detection & Response
- **Fire Detection** (Priority: P1)
  - Real-time flame detection via computer vision
  - Smoke pattern recognition (dense, spreading)
  - Integration with fire alarm panels
  - Zone identification for evacuation routing

- **Fire Alarm Triggered** (Priority: P1)
  - Fire panel integration (BACnet, Modbus, REST)
  - Visual confirmation via camera AI
  - Smoke detector activation correlation
  - Automatic recording of all exit routes

- **Fire Event Correlation** (Priority: P1)
  - Multi-sensor fusion: smoke detector, heat sensor, camera
  - Temporal confirmation (2+ signals within 30 seconds)
  - False positive suppression (e.g., steam vs smoke)
  - Automatic SOC escalation with evidence

#### Suppression System Monitoring
- **Fire Suppression Activated** (Priority: P1)
  - Sprinkler activation detection via sensor + video
  - Gas suppression system status monitoring
  - Visual verification of water discharge
  - Damage assessment initialization

---

## 5. Physical Security Device Integration

### 5.1 Multi-Device Correlation Engine

#### Architecture
The system integrates with all major security device protocols:
- **ONVIF** - IP cameras, NVRs, DVRs
- **SNMP** - UPS, network devices, environmental sensors
- **REST API** - Modern access control, intrusion panels
- **MQTT** - IoT sensors, panic buttons, door contacts

#### Intelligent Event Fusion
- **Multi-Device Event Correlation**
  - Time-windowed event buffering (default: 30 seconds)
  - Confidence scoring (single device: 0.4, two devices: 0.7, three+: 0.9)
  - Automatic incident creation only when threshold exceeded
  - Suppression of redundant alerts (same incident)

- **False Positive Suppression**
  - Historical pattern learning (business hours activity)
  - Weather-based threshold adjustment (wind, rain causing motion)
  - Device health-based confidence weighting
  - Human-in-loop feedback incorporation

### 5.2 Device Categories & Capabilities

#### Access Control Integration
- **Supported Systems:** HID, Lenel, Genetec, Honeywell, ASSA ABLOY
- **Events:** Card swipe, door open/close, access denied, forced open
- **Capabilities:**
  - Real-time access event stream
  - Visual verification via camera
  - Cardholder photo match (consent-aware)
  - Unauthorized access pattern detection

#### Intrusion Detection Systems
- **Supported Systems:** Honeywell, Bosch, DSC, Paradox
- **Events:** Zone alarm, glass break, motion sensor, panel tamper
- **Capabilities:**
  - Visual confirmation of intrusion alarms
  - Automatic camera PTZ to alarm zone
  - Multi-zone correlation for tracking
  - After-hours vs business hours logic

#### Power & Environmental
- **UPS Monitoring**
  - Battery status: Normal, On Battery, Low Battery, Critical
  - Runtime estimation
  - Power failure cascade detection (multiple UPS on battery)
  - Generator activation confirmation

- **Environmental Sensors**
  - Temperature (high, critical thresholds)
  - Humidity monitoring
  - Water leak detection
  - Gas leak sensors (CO, LPG, natural gas)

---

## 6. Identity & Access Intelligence

### 6.1 Face Recognition (Consent-Aware)

#### Watchlist Management
- **VIP Detection**
  - Board members, executives, high-net-worth clients
  - Automatic notification to branch manager
  - Personalized service enablement
  - Privacy-compliant with explicit consent

- **Blacklist Detection** (Priority: P1)
  - Known fraudsters, banned individuals
  - Multi-camera tracking upon detection
  - Discreet alert to security (no public display)
  - Historical incident linkage

- **Unknown Person Detection**
  - Detection of unrecognized faces in restricted areas
  - Configurable sensitivity per zone
  - Integration with visitor management systems
  - Automatic visitor log reconciliation

#### Compliance & Governance
- **Mandatory Requirements:**
  1. **Explicit Consent:** Written consent required before enrollment
  2. **Local Processing:** Face embeddings processed on-premises only
  3. **Liveness Detection:** Prevents photo/video spoofing
  4. **Temporal Confirmation:** 3+ frame confirmation before alert
  5. **Human Review:** All matches require security officer verification
  6. **Retention Policy:** Configurable auto-deletion (30/60/90 days)
  7. **Audit Trail:** All searches logged with operator ID and purpose

### 6.2 Vehicle & ANPR Analytics

#### Automated Number Plate Recognition
- **Vehicle Detection & ANPR**
  - License plate extraction and OCR
  - Whitelist/blacklist matching
  - Multi-camera vehicle tracking (re-identification)
  - Parking duration and violation detection

- **Vehicle Classification**
  - Type: car, motorcycle, truck, bus, bicycle
  - Color recognition
  - Make and model identification (where models support)

- **Applications:**
  - Cash van verification (authorized plate only)
  - Executive vehicle arrival notification
  - Unauthorized vehicle alerts in restricted zones
  - Parking occupancy and duration monitoring

---

## 7. Weapon & Threat Detection

### 7.1 Visual Weapon Detection

- **Weapon Detection** (Priority: P1)
  - AI detection of firearms, knives, batons
  - Real-time alert with bounding box overlay
  - Automatic recording and evidence preservation
  - Integration with panic button workflow
  - **Important:** Requires legally approved, audited ONNX model

### 7.2 Behavioral Threat Indicators

- **Fighting Detection** (Priority: P2)
  - Aggressive body language and physical altercations
  - Crowd panic behavior recognition
  - Automatic camera zoom and tracking

- **Abnormal Behavior Detection** (Priority: P2)
  - Loitering beyond threshold (configurable)
  - Erratic movement patterns
  - Crowd gathering in unusual locations
  - Running inside premises

---

## 8. Operational Intelligence & Analytics

### 8.1 Predictive Security

#### Device Health & Failure Prediction
- **Camera Failure Prediction** (Priority: P2)
  - Image quality degradation trends
  - Lens obstruction prediction
  - Night vision failure forecasting
  - Bitrate and FPS anomaly detection

- **Security Device Failure Prediction** (Priority: P2)
  - UPS battery health trending
  - Network switch port error rates
  - Storage exhaustion forecasts
  - Recording interruption prediction

#### Risk Scoring
- **Branch Risk Score**
  - Aggregated security posture score (0-100)
  - Weighs recent incidents, device health, compliance gaps
  - Comparative ranking across all branches
  - Trend analysis (improving/degrading)

- **Incident Probability Forecast**
  - Historical pattern analysis
  - Temporal factors (time of day, day of week, season)
  - Location-based risk factors
  - Predictive alerts for high-risk windows

### 8.2 Investigation Tools

#### AI-Powered Search
- **Attribute-Based Search**
  - Person: clothing color, gender, age estimate, carried objects
  - Vehicle: color, type, plate number (partial)
  - Object: bags, boxes, suspicious items
  - Time and location filters

- **Natural Language Video Search**
  - Query: "Show me all red cars entering between 2 PM and 4 PM"
  - Query: "Find person with blue jacket near ATM yesterday"
  - Query: "Show unauthorized vault access last week"

#### Cross-Camera Intelligence
- **Route Reconstruction**
  - Multi-camera person/vehicle tracking
  - Timeline visualization with map overlay
  - Entry and exit point identification
  - Dwell time at each location

- **Last Seen Investigation**
  - Find last known location of person/vehicle
  - Temporal gap analysis (disappeared from camera coverage)
  - Direction of travel prediction
  - Integration with access control logs

- **Cross-Camera Timeline**
  - Unified timeline across all cameras
  - Event correlation and relationship mapping
  - Evidence collection and packaging
  - Export for law enforcement

---

## 9. Compliance & Reporting

### 9.1 Automated Reports

#### Daily Operations
- **Daily Incident Summary**
  - All P1 and P2 incidents with resolution status
  - Device health summary
  - Critical alerts requiring review
  - SOC operator activity log

#### Periodic Compliance
- **Weekly AI Summary**
  - Detection accuracy metrics
  - False positive/negative analysis
  - Model performance trending
  - Operator response time statistics

- **Monthly Compliance Report**
  - Regulatory requirement adherence
  - Audit trail completeness verification
  - Face recognition consent status
  - Retention policy compliance

#### Executive Dashboards
- **Executive Dashboard**
  - Branch-wise security posture
  - Top incident categories
  - Cost of security incidents
  - Comparative branch performance
  - Trend analysis and forecasts

### 9.2 Audit & Governance

#### Audit Trail Requirements
- **All Actions Logged:**
  - Operator logins and session duration
  - Camera access and playback
  - Device command execution (door unlock, etc.)
  - Watchlist additions/removals
  - Configuration changes
  - Evidence exports

#### Retention Policies
- **Configurable Retention:**
  - Standard footage: 30/60/90 days
  - Incident evidence: 1/2/5 years
  - Face recognition data: Per consent agreement
  - Audit logs: 7 years (regulatory requirement)
  - Automatic archival to cold storage
  - GDPR-compliant deletion workflows

---

## 10. System Architecture & Integration

### 10.1 Deployment Models

#### On-Premises (Recommended for NBFC)
- **Analytics Engine:** Self-hosted on customer infrastructure
- **Data Sovereignty:** All video and analytics data stays on-premises
- **No Cloud Dependency:** Works with internet outage
- **Hardware Requirements:**
  - GPU: NVIDIA RTX 4000 series or higher (for AI inference)
  - CPU: Intel Xeon or AMD EPYC (16+ cores recommended)
  - RAM: 64 GB minimum
  - Storage: NVMe SSD for hot data, HDD for archival

#### Hybrid Model
- **Local Analytics:** Real-time processing on-premises
- **Cloud Reporting:** Anonymized analytics to cloud dashboard
- **Edge-to-Cloud:** Incident metadata only (no video)
- **Benefits:** Centralized multi-branch monitoring, DR backup

### 10.2 Integration Interfaces

#### APIs Available
- **RESTful API:** All analytics, device control, search functions
- **WebSocket API:** Real-time incident stream
- **GraphQL API:** Flexible querying for custom dashboards
- **Webhook API:** Push notifications to external systems

#### Pre-Built Integrations
- **SIEM:** Splunk, QRadar, LogRhythm
- **SOAR:** Palo Alto Cortex XSOAR, IBM Resilient
- **Ticketing:** ServiceNow, Jira Service Management
- **Communication:** Microsoft Teams, Slack, PagerDuty
- **VMS:** Milestone, Genetec, Avigilon

---

## 11. Security & Privacy Controls

### 11.1 Access Control

#### Role-Based Access Control (RBAC)
- **Predefined Roles:**
  - **Security Admin:** Full system access, configuration
  - **SOC Operator:** Live monitoring, incident response
  - **Branch Manager:** Branch-specific view, reports
  - **Auditor:** Read-only access, audit logs
  - **Investigator:** Forensic search, evidence export

#### Multi-Factor Authentication (MFA)
- **Enforced for Sensitive Operations:**
  - Device command execution (unlock doors, etc.)
  - Watchlist management
  - Evidence export
  - Configuration changes
- **Methods Supported:** Authenticator app, SMS, hardware token

### 11.2 Data Protection

#### Encryption
- **At Rest:** AES-256 encryption for stored video
- **In Transit:** TLS 1.3 for all API communication
- **End-to-End:** Camera-to-storage encryption option

#### Anonymization
- **Face Blurring:** Automatic face blurring for non-targets
- **Metadata Only Mode:** Incident data without video
- **Privacy Zones:** Configurable areas excluded from analytics

---

## 12. Implementation Roadmap

### Phase 1: Core Security (Weeks 1-4)
- [ ] Vault and cash counter monitoring
- [ ] Intrusion detection (perimeter, restricted areas)
- [ ] ATM physical security
- [ ] Panic button integration
- [ ] Basic device health monitoring

### Phase 2: Advanced Analytics (Weeks 5-8)
- [ ] Multi-device event correlation
- [ ] Face recognition (with consent framework)
- [ ] ANPR for vehicle tracking
- [ ] Weapon detection
- [ ] Cross-camera intelligence

### Phase 3: Intelligence & Automation (Weeks 9-12)
- [ ] Predictive analytics (failure, risk scoring)
- [ ] AI-powered search and investigation tools
- [ ] Automated reporting
- [ ] SIEM and SOAR integrations
- [ ] Executive dashboards

### Phase 4: Optimization (Ongoing)
- [ ] Model fine-tuning with branch-specific data
- [ ] False positive reduction
- [ ] Response time optimization
- [ ] Custom rule development
- [ ] Operator training and certification

---

## 13. Production Readiness Checklist

### Before Enabling Any AI Capability:

#### 1. Model Verification
- [ ] Legally approved ONNX model with documented provenance
- [ ] SHA-256 checksum verification in model manifest
- [ ] Independent accuracy audit for critical detections
- [ ] Version control and rollback procedure

#### 2. Camera Calibration
- [ ] Zone configuration with branch floor plan
- [ ] Detection threshold tuning with recorded footage
- [ ] Dwell window optimization per zone type
- [ ] Evidence retention policy configuration

#### 3. SOC Readiness
- [ ] Alert delivery tested (dashboard, SMS, email, mobile)
- [ ] Silent panic routing verified
- [ ] Two-way audio protocol established (if enabled)
- [ ] Escalation matrix documented and trained

#### 4. Compliance (for Identity Features)
- [ ] Consent forms signed and stored
- [ ] Local processing verified (no cloud)
- [ ] Liveness detection tested
- [ ] Temporal confirmation (3+ frames) enabled
- [ ] Human review workflow mandatory
- [ ] Retention policy configured and enforced

#### 5. Audio Features (if applicable)
- [ ] Microphone-capable camera streams configured
- [ ] Separate audio pipeline verification
- [ ] Glass break, gunshot, scream model testing
- [ ] Audio-only false positive baseline established

**Important:** Video-only cameras cannot produce audio-based detections (gunshot, glass break, scream). Audio requires dedicated microphone streams.

---

## 14. Support & Training

### Technical Support
- **24x7 Hotline:** Critical incident support
- **Email Support:** General queries, configuration assistance
- **Remote Diagnostics:** Secure VPN-based troubleshooting
- **On-Site Support:** Available for complex issues

### Training Programs
- **SOC Operator Certification:** 2-day hands-on training
- **Admin Training:** System configuration and maintenance
- **Investigator Training:** Forensic search and evidence handling
- **Executive Briefing:** Dashboard and reporting overview

### Documentation
- **User Manuals:** Role-specific guides
- **API Documentation:** Complete REST, WebSocket, GraphQL reference
- **Integration Guides:** Step-by-step for each supported system
- **Best Practices:** Use case guides and optimization tips

---

## 15. Key Differentiators

### Why This System for NBFCs?

1. **Compliance-First Design**
   - Built-in governance for face recognition
   - Audit trails meet RBI/SEBI requirements
   - Data sovereignty (on-premises processing)

2. **Banking-Specific Intelligence**
   - Dual control verification
   - Cash operation monitoring
   - Vault and ATM specialized analytics
   - Financial crime pattern recognition

3. **Emergency Response Integration**
   - Sub-second panic button response
   - Multi-channel SOC coordination
   - Automatic evidence collection
   - Pre-configured response playbooks

4. **Multi-Device Intelligence**
   - Unified view across cameras, access control, sensors
   - False positive suppression via correlation
   - Single pane of glass for all security devices

5. **Predictive Operations**
   - Device failure forecasting reduces downtime
   - Branch risk scoring enables proactive measures
   - Incident probability helps resource allocation

6. **No Vendor Lock-In**
   - Open APIs and webhook integrations
   - Support for industry-standard protocols
   - Multi-vendor device ecosystem supported

---

## 16. ROI & Business Impact

### Quantifiable Benefits

#### Security Improvements
- **Incident Response Time:** 70% reduction (median 45s vs 150s)
- **False Alarm Reduction:** 80% via multi-device correlation
- **Investigation Time:** 60% reduction with AI search
- **After-Hours Incidents:** 90% detection rate improvement

#### Operational Efficiency
- **Manual Monitoring Reduction:** 50% of SOC workload automated
- **Evidence Collection:** 95% faster with auto-attachment
- **Compliance Reporting:** 100% automated (zero manual effort)
- **Device Maintenance:** 30% reduction via predictive maintenance

#### Cost Savings (Annual, Typical 50-Branch NBFC)
- **False Dispatch Reduction:** ₹12-15 lakhs
- **Theft/Fraud Prevention:** ₹50-80 lakhs
- **Insurance Premium Reduction:** 10-15% (₹8-12 lakhs)
- **SOC Labor Optimization:** ₹20-25 lakhs
- **Device Downtime Reduction:** ₹5-8 lakhs
- **Total Estimated Savings:** ₹95 lakhs - ₹1.4 crores/year

#### Risk Mitigation
- **Regulatory Compliance:** Reduces audit finding risk
- **Fraud Detection:** Early warning system for internal threats
- **Evidence Quality:** Court-admissible video with chain of custody
- **Reputation Protection:** Proactive incident prevention

---

## 17. Frequently Asked Questions

### Q1: Does the system require internet connectivity?
**A:** No. The core analytics engine runs completely on-premises and functions without internet. Internet is only needed for optional cloud reporting and remote support.

### Q2: Can we use our existing cameras?
**A:** Yes, if they support RTSP/ONVIF protocols. We recommend 1080p or higher resolution for best accuracy. Older analog cameras require an encoder/DVR with IP output.

### Q3: How accurate is the weapon detection?
**A:** With a properly calibrated, legally approved model: 92-96% detection rate with <2% false positive rate in controlled NBFC environments. All alerts require human verification before action.

### Q4: What about customer privacy?
**A:** Face recognition requires explicit consent. Public area monitoring uses anonymized detections (no identity). Privacy zones can exclude sensitive areas (e.g., restrooms). Full GDPR/PDPA compliance.

### Q5: Can we integrate with our existing VMS?
**A:** Yes. We provide native integrations with Milestone, Genetec, Avigilon, and others. Generic ONVIF/RTSP cameras work with any VMS.

### Q6: What happens if the AI makes a mistake?
**A:** All critical alerts (P1) require human verification before action. Operators can mark false positives, which feeds back into model tuning. No automated physical actions (door unlock, etc.) without MFA approval.

### Q7: How long does deployment take?
**A:** Typical 20-branch rollout: 4-6 weeks (1 week pilot + 3-5 weeks full deployment). Includes hardware, software, calibration, training.

### Q8: What is the hardware cost?
**A:** For 50 cameras per branch: Analytics server ₹8-12 lakhs (GPU workstation). Cloud-based option available at ₹15k-25k/month per branch (no upfront hardware cost).

### Q9: Can we start with one branch as a pilot?
**A:** Yes, strongly recommended. 2-4 week pilot validates effectiveness in your specific environment before full rollout.

### Q10: Who provides support if something breaks at 2 AM?
**A:** 24x7 SOC-level support included. Severity-1 incidents get <30 minute response time. Remote diagnostics capability for most issues.

---

## 18. Next Steps

### To Get Started:

1. **Schedule a Demo**
   - Live system demonstration with your use cases
   - Review of capability catalog relevance
   - Architecture and integration discussion

2. **Site Assessment**
   - Existing infrastructure evaluation
   - Camera coverage gap analysis
   - Network and storage capacity planning
   - Pilot branch selection

3. **Pilot Proposal**
   - Customized scope for 1-2 branch pilot
   - Timeline and milestones
   - Success criteria and KPIs
   - Investment requirements

4. **Proof of Concept (POC)**
   - 2-4 week pilot deployment
   - SOC operator training
   - Real-world accuracy validation
   - ROI measurement

5. **Full Deployment**
   - Phased rollout plan
   - Change management and training
   - Integration with existing systems
   - Ongoing optimization and support

---

## Contact Information

**Technical Queries:** [Your technical support email]  
**Sales & Demos:** [Your sales email]  
**24x7 SOC Support:** [Your support hotline]  
**Documentation Portal:** [Your docs URL]

---

**Document Version:** 1.0  
**Last Updated:** September 16, 2026  
**Classification:** Customer-Facing Technical Documentation  
**Approval Status:** Production Ready

