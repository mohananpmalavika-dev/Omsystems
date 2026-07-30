# Requirements Document

## Introduction

Transform Sentinel Grid from reactive surveillance monitoring into predictive infrastructure management by predicting device failures before they affect recording operations. This feature enables operators to take preventive action based on time-bound failure predictions with evidence-based recommendations.

## Glossary

- **Failure Prediction**: Time-bound probability assessment that a device will fail within a specific window
- **Risk Classification**: Severity level (Monitor, Emerging, High, Critical, Imminent) based on failure probability
- **Branch Risk Score**: Composite score (0-100) evaluating overall branch infrastructure reliability
- **Time-to-Failure (TTF)**: Estimated remaining time before device failure occurs
- **Prediction Confidence**: Statistical confidence level (High/Medium/Low) in the prediction accuracy
- **Evidence**: Specific telemetry signals and trends supporting the failure prediction
- **Blast Radius**: Scope of impact if the predicted failure occurs (cameras affected, compliance risk, etc.)
- **Degradation Rate**: Rate at which device health score decreases over time
- **Prediction Horizon**: Time window (typically 30 days) for failure forecasting
- **False Positive Rate**: Percentage of predictions where failure did not occur
- **Calibration**: Process of adjusting prediction probabilities to match actual failure rates

## Requirements

### Requirement 1: Recorder Failure Prediction

**User Story:** As a VMS administrator, I want to be alerted when a recorder is likely to fail within the next 12-48 hours so that I can replace or inspect it before cameras stop recording.

#### Acceptance Criteria

1. WHEN the system detects recorder temperature increased from baseline by >25°C over 7 days, AND three or more unexpected reboots occurred within 7 days, AND storage write latency increased by >200%, THEN the system SHALL generate a recorder failure prediction with 80-95% probability
2. WHERE the recorder shows repeated heartbeat instability events (>5 missed heartbeats in 24 hours), THE system SHALL include this as evidence in the prediction
3. THE prediction SHALL specify the expected failure window in hours (e.g., "12-24 hours", "18-36 hours")
4. THE prediction SHALL display the predicted impact including number of cameras affected and compliance risk status
5. THE prediction SHALL provide recommended action (e.g., "Replace or inspect recorder immediately")
6. THE system SHALL track prediction accuracy by comparing predictions against actual recorder failures
7. WHERE similar historical failures occurred within the specified time window, THE prediction confidence SHALL be increased to "High"


### Requirement 2: Hard Disk Failure Prediction

**User Story:** As a VMS administrator, I want to be alerted when a hard disk is likely to fail within 2-4 days so that I can replace it before recording retention is affected.

#### Acceptance Criteria

1. WHEN SMART reallocated-sector count increases for 3 consecutive days, AND disk temperature exceeds 55°C, AND write latency increased by >150%, THEN the system SHALL generate a disk failure prediction with critical risk classification
2. WHERE pending sectors are detected OR uncorrectable sectors increase, THE prediction probability SHALL be elevated to 90-95% range
3. THE prediction SHALL display the disk health score trend (e.g., "Previous: 78, Current: 31")
4. THE prediction SHALL estimate remaining time in days with confidence level (e.g., "2-4 days, Confidence: 91%")
5. THE prediction SHALL identify the specific disk by location (e.g., "Disk 2", "Disk 3")
6. WHERE disk failure would affect retention compliance, THE system SHALL flag "Retention risk" in the impact assessment
7. THE prediction SHALL provide recommended action with deadline (e.g., "Replace Disk 2 before Sunday, 6:00 PM")

### Requirement 3: Internet Connectivity Failure Prediction

**User Story:** As a VMS administrator, I want to be alerted when internet connectivity is likely to degrade or fail within 6-18 hours so that I can escalate to the ISP and restore backup connections.

#### Acceptance Criteria

1. WHEN packet loss increases to >8%, AND latency variation increases by >150%, AND eleven or more WAN disconnections occur within 48 hours, THEN the system SHALL generate an internet failure prediction
2. WHERE backup ISP is unavailable, THE prediction severity SHALL be elevated to "Critical"
3. WHERE router CPU repeatedly exceeds 92%, THE system SHALL include this as evidence
4. THE prediction SHALL specify "Predicted service degradation: Within the next 12-24 hours"
5. THE prediction SHALL assess impact as "Branch connectivity" or "Remote monitoring affected"
6. THE prediction SHALL recommend specific actions (e.g., "Escalate to ISP and restore backup connection")
7. THE system SHALL track WAN outage patterns by time-of-day and day-of-week for improved prediction accuracy


### Requirement 4: Camera Failure Prediction

**User Story:** As a VMS administrator, I want to be alerted when a camera is likely to fail so that I can schedule maintenance before recording gaps occur.

#### Acceptance Criteria

1. WHEN repeated RTSP disconnects occur (>10 per day), AND frame loss rises above 15%, AND response time increases by >200%, THEN the system SHALL generate a camera failure prediction
2. WHERE PoE power fluctuations are detected (>5 power cycles in 24 hours), THE prediction probability SHALL be increased
3. WHERE image corruption OR night-mode failures occur repeatedly, THE system SHALL include this as evidence
4. WHERE camera temperature exceeds operational threshold, THE prediction SHALL flag thermal issues
5. THE prediction SHALL estimate time-to-failure based on ONVIF command failure rate and reboot frequency
6. THE system SHALL prioritize camera failure predictions by criticality (e.g., cameras covering compliance-critical areas ranked higher)
7. WHERE camera has existing maintenance history, THE prediction SHALL consider historical failure patterns

### Requirement 5: UPS and Power Failure Prediction

**User Story:** As a VMS administrator, I want to be alerted when UPS battery is likely to fail so that I can replace it before a power outage causes complete branch outage.

#### Acceptance Criteria

1. WHEN battery age exceeds manufacturer recommendation, AND battery runtime decreases by >40%, AND discharge speed increases significantly, THEN the system SHALL generate a UPS failure prediction
2. WHERE voltage variation exceeds ±10%, OR transfer frequency increases abnormally, THE prediction probability SHALL be elevated
3. WHERE load percentage consistently exceeds 85%, THE system SHALL flag capacity issues
4. WHERE charging failures are detected, THE prediction severity SHALL be set to "Critical"
5. WHERE generator availability is "unavailable", THE prediction impact SHALL include "Complete outage risk"
6. THE prediction SHALL estimate remaining operational time in days (e.g., "3-7 days")
7. THE prediction SHALL recommend "Inspect battery and test UPS" OR "Replace UPS immediately" based on severity


### Requirement 6: Storage Retention Compliance Prediction

**User Story:** As a bank VMS administrator, I want to be alerted when storage will fall below required 180-day retention within 5 days so that I can increase capacity before compliance is affected.

#### Acceptance Criteria

1. WHEN storage consumption growth rate indicates retention will fall below required threshold (e.g., 180 days for RBI compliance), THE system SHALL generate a retention failure prediction
2. WHERE storage consumption is growing faster than expected baseline, THE prediction SHALL flag "Storage growth acceleration"
3. THE prediction SHALL estimate days until retention falls below compliance level (e.g., "5 days")
4. THE prediction SHALL display cause (e.g., "Storage consumption growing faster than expected")
5. THE prediction SHALL recommend actions: "Increase capacity" OR "Reduce unsupported recording bitrate"
6. WHERE retention failure would affect audits or compliance, THE prediction SHALL flag "Compliance risk: High"
7. THE system SHALL track actual retention levels against predictions to improve forecasting accuracy

### Requirement 7: Risk Classification and Priority System

**User Story:** As a VMS administrator, I want predictions prioritized by risk level and business impact so that I can focus on the most urgent failures first.

#### Acceptance Criteria

1. WHERE prediction probability is below 40%, THE system SHALL classify as "Monitor" with no immediate action required
2. WHERE prediction probability is 40-65%, THE system SHALL classify as "Emerging risk" with action "Watch trend"
3. WHERE prediction probability is 65-80%, THE system SHALL classify as "High risk" with action "Plan maintenance"
4. WHERE prediction probability is 80-95%, THE system SHALL classify as "Critical risk" with action "Act urgently"
5. WHERE prediction probability is above 95%, THE system SHALL classify as "Imminent failure" with action "Immediate intervention"
6. THE system SHALL consider business impact factors: number of cameras affected, compliance impact, redundancy availability, branch importance, recovery time, maintenance SLA
7. WHERE a recorder with 70% failure probability affects 40 cameras with no redundancy, THE system SHALL prioritize it higher than a disk with 92% probability affecting a redundant archive
8. THE system SHALL generate a priority ranking for all predictions considering both probability and impact


### Requirement 8: Branch Risk Score

**User Story:** As a VMS administrator, I want a composite branch risk score so that I can quickly assess which branches require immediate attention.

#### Acceptance Criteria

1. THE system SHALL calculate a Branch Reliability Score from 0-100 for each branch
2. THE score SHALL aggregate: recorder risk, storage risk, network risk, power risk, camera risk, redundancy weakness, historical incident frequency
3. WHERE Branch Reliability Score falls below 40, THE system SHALL classify branch as "Critical risk"
4. THE system SHALL display risk breakdown by component: "Power risk: High", "Internet risk: Medium", "Recorder risk: Critical", "Storage risk: High", "Camera risk: Low", "Compliance risk: High"
5. THE scoring formula SHALL be weighted by component criticality (recorder and storage weighted higher than individual cameras)
6. THE system SHALL update branch risk scores every hour based on latest telemetry
7. THE risk score calculation SHALL be auditable (ability to explain why a branch received a specific score)
8. WHERE multiple components show degradation simultaneously, THE composite score SHALL reflect elevated systemic risk

### Requirement 9: Time-to-Failure Estimation

**User Story:** As a VMS administrator, I want accurate time-to-failure estimates so that I can schedule maintenance windows appropriately.

#### Acceptance Criteria

1. THE prediction SHALL specify likely failure window (e.g., "2-4 days", "12-24 hours", "3-7 days")
2. WHERE sufficient historical data exists, THE system SHALL estimate most likely failure time (e.g., "Saturday between 10:00 AM and 8:00 PM")
3. THE prediction SHALL display confidence level (High/Medium/Low) based on available data and historical accuracy
4. THE system SHALL use survival analysis OR calibrated time-series models rather than basic classification alone
5. WHERE degradation rate is linear, THE system SHALL calculate remaining time as: (current_health_score / degradation_rate_per_day)
6. WHERE degradation is accelerating, THE system SHALL adjust time-to-failure estimate accordingly
7. THE system SHALL track actual failure times against predictions to improve future time-to-failure accuracy


### Requirement 10: Prediction Evidence and Transparency

**User Story:** As a VMS administrator, I want to understand why the system predicts a failure so that I can make informed maintenance decisions.

#### Acceptance Criteria

1. THE prediction SHALL display specific evidence signals (e.g., "Recorder temperature increased from 61°C to 79°C", "Three unexpected reboots in seven days")
2. THE prediction SHALL show trend graphs for key health metrics over the past 7-30 days
3. THE prediction SHALL reference similar historical failures (e.g., "Similar historical failures occurred within 24 hours")
4. THE prediction SHALL list all evidence items that contributed to the prediction probability
5. WHERE prediction is based on rules, THE system SHALL display which rules triggered
6. WHERE prediction is based on statistical models, THE system SHALL display model confidence and feature importance
7. THE system SHALL allow drilling down into individual evidence items to view detailed telemetry
8. THE prediction SHALL indicate evidence quality (e.g., "High quality - 30 days of telemetry" vs "Limited data - 7 days only")

### Requirement 11: Predictive Operations Dashboard

**User Story:** As a VMS administrator, I want a centralized dashboard showing all predicted failures so that I can plan maintenance work efficiently.

#### Acceptance Criteria

1. THE dashboard SHALL display summary metrics: "Predicted failures in next 24 hours", "Predicted failures in next 3 days", "Branches at critical risk", "Cameras potentially affected", "Compliance risks", "Preventable failures"
2. THE dashboard SHALL display a priority table with columns: Branch, Predicted failure, Probability, Failure window, Impact, Action
3. THE priority table SHALL sort by urgency (combining probability, time-to-failure, and business impact)
4. THE dashboard SHALL allow filtering by: prediction type (recorder, disk, network, camera, UPS), risk level, branch, time window
5. THE dashboard SHALL display trend charts showing prediction volume over time
6. THE dashboard SHALL show prediction accuracy metrics: precision, recall, false-positive rate, prevented incidents
7. THE dashboard SHALL provide quick actions: "Acknowledge", "Create Work Order", "Provide Feedback"
8. THE dashboard SHALL refresh automatically every 5 minutes to show latest predictions


### Requirement 12: Integration with Root Cause Analysis (RCA)

**User Story:** As a VMS administrator, I want predictions to integrate with RCA so that the system learns from actual failures and improves prediction accuracy.

#### Acceptance Criteria

1. WHEN a prediction is generated (e.g., "Recorder temperature increasing"), THE system SHALL create a monitoring ticket
2. WHEN a predicted failure actually occurs, THE system SHALL trigger RCA automatically
3. WHEN RCA confirms the failure cause matches the prediction evidence (e.g., "RCA confirms overheating"), THE system SHALL mark prediction as "Correct"
4. WHEN RCA identifies a different failure cause, THE system SHALL mark prediction as "Incorrect" and log the discrepancy
5. THE system SHALL use prediction outcomes to adjust future prediction models (feedback loop)
6. WHERE false positives are detected, THE system SHALL reduce sensitivity for that prediction type
7. WHERE false negatives are detected (failures that were not predicted), THE system SHALL analyze missed signals and update prediction rules
8. THE system SHALL track prediction-to-failure correlation metrics: accuracy rate, average lead time, prevented failures

### Requirement 13: Integration with AI Command Center

**User Story:** As a VMS administrator, I want to query predictions using natural language so that I can quickly get answers about branch failure risks.

#### Acceptance Criteria

1. WHEN operator asks "Which branches are most likely to fail tomorrow?", THE system SHALL return top predictions with probabilities, impact, and recommendations
2. WHEN operator asks about a specific branch (e.g., "What's the risk for Branch 183?"), THE system SHALL return branch risk score, active predictions, and recommended actions
3. THE AI Command Center SHALL explain prediction priority (e.g., "Branch 183 first, because it has no recorder redundancy")
4. THE AI Command Center SHALL provide comparative analysis (e.g., "This recorder shows similar symptoms to 3 previous failures that occurred within 24 hours")
5. THE AI Command Center SHALL suggest preventive actions based on prediction type
6. THE AI Command Center SHALL answer questions about prediction accuracy (e.g., "How accurate have disk failure predictions been?")
7. THE AI Command Center responses SHALL include clickable links to detailed prediction reports


### Requirement 14: Integration with Digital Twin

**User Story:** As a VMS administrator, I want to see prediction risks visually on the branch map so that I can quickly identify problem locations.

#### Acceptance Criteria

1. WHERE a recorder has a critical prediction, THE Digital Twin SHALL display the recorder with a pulsing red indicator
2. WHERE a disk has a high risk prediction, THE Digital Twin SHALL display the disk with an orange warning indicator
3. WHERE UPS has an emerging risk, THE Digital Twin SHALL display the UPS with a yellow countdown indicator
4. WHERE network has instability risk, THE Digital Twin SHALL display the router with an internet-risk indicator
5. WHEN operator selects a device with a prediction, THE system SHALL display: prediction details, evidence, trend graph, expected failure window, blast radius, recommended maintenance, similar historical incidents
6. THE Digital Twin SHALL display branch-level risk score as a color-coded overlay (green >70, yellow 40-70, red <40)
7. THE Digital Twin SHALL allow filtering by prediction type and risk level
8. THE Digital Twin SHALL provide quick action buttons: "Create Work Order", "Acknowledge", "View Detailed Report"

### Requirement 15: Prediction Calibration and Accuracy Tracking

**User Story:** As a VMS administrator, I want prediction probabilities to be calibrated so that a "98% probability" actually means 98 out of 100 similar predictions resulted in failure.

#### Acceptance Criteria

1. THE system SHALL NOT display precise probabilities (e.g., "98%") unless the prediction model has been properly calibrated against historical outcomes
2. WHERE insufficient calibration data exists, THE system SHALL display probability ranges (e.g., "Estimated probability: 80-95%")
3. THE system SHALL track calibration metrics: predicted probability vs actual failure rate across probability buckets
4. THE system SHALL measure and display: Precision (percentage of predictions that were correct), Recall (percentage of actual failures that were predicted), False-positive rate, Missed-failure rate, Prediction lead time (average advance warning time), Prevented incidents, Maintenance cost saved
5. THE system SHALL provide a prediction performance dashboard showing accuracy trends over time
6. WHERE prediction accuracy falls below 60%, THE system SHALL flag model degradation and recommend recalibration
7. THE system SHALL support confidence adjustment based on prediction outcome feedback


### Requirement 16: Phase 1 Implementation - Rules-Based Predictions

**User Story:** As a VMS development team, we want to start with deterministic rules rather than complex ML so that we can deliver predictive capabilities quickly with explainable logic.

#### Acceptance Criteria

1. THE Phase 1 implementation SHALL use deterministic rules (e.g., "IF reallocated sectors increased for 3 consecutive days AND disk temperature > 55°C AND write latency increased > 150% THEN disk failure risk = critical")
2. THE rules SHALL be easy to explain to end users without ML expertise
3. THE rules SHALL work with limited historical data (as little as 7 days)
4. THE rules SHALL be auditable (clear documentation of which rule triggered each prediction)
5. THE rules SHALL be configurable per deployment (ability to adjust thresholds based on environment)
6. THE system SHALL track which rules generate the most accurate predictions
7. WHERE rule accuracy is low (<50%), THE system SHALL flag the rule for review and potential adjustment
8. THE system SHALL support rule versioning and A/B testing of rule variations

### Requirement 17: API Implementation

**User Story:** As a backend developer, I want RESTful APIs for prediction management so that frontend and integration systems can access prediction data.

#### Acceptance Criteria

1. THE system SHALL implement GET /v1/predictions/branches to retrieve predictions for all branches with filtering and pagination
2. THE system SHALL implement GET /v1/predictions/branches/:branchId to retrieve all predictions for a specific branch
3. THE system SHALL implement GET /v1/predictions/devices/:deviceId to retrieve predictions for a specific device
4. THE system SHALL implement GET /v1/predictions/imminent to retrieve predictions with failure expected within 24 hours
5. THE system SHALL implement GET /v1/predictions/retention-risk to retrieve storage retention compliance predictions
6. THE system SHALL implement GET /v1/predictions/network-risk to retrieve network connectivity predictions
7. THE system SHALL implement GET /v1/predictions/storage-risk to retrieve disk and storage predictions
8. THE system SHALL implement POST /v1/predictions/:predictionId/acknowledge to mark a prediction as acknowledged by an operator
9. THE system SHALL implement POST /v1/predictions/:predictionId/create-work-order to generate a maintenance work order from a prediction
10. THE system SHALL implement POST /v1/predictions/:predictionId/feedback to record prediction outcome (correct, false-positive, false-negative)
11. THE system SHALL implement GET /v1/predictions/model-performance to retrieve prediction accuracy metrics
12. ALL prediction APIs SHALL require authentication and respect tenant isolation
13. ALL prediction APIs SHALL support filtering by: time window, risk level, prediction type, branch, region


### Requirement 18: Database Schema and Data Storage

**User Story:** As a backend developer, I want a normalized database schema for prediction data so that we can efficiently store and query predictions, evidence, and outcomes.

#### Acceptance Criteria

1. THE system SHALL create table `telemetry_measurements` to store time-series device telemetry
2. THE system SHALL create table `device_health_snapshots` to store periodic health assessments
3. THE system SHALL create table `device_health_features` to store extracted features used for prediction
4. THE system SHALL create table `device_failure_events` to store confirmed device failures
5. THE system SHALL create table `device_failure_labels` to store labeled training data for future ML models
6. THE system SHALL create table `prediction_models` to store model versions and configurations
7. THE system SHALL create table `prediction_runs` to track prediction generation executions
8. THE system SHALL create table `failure_predictions` to store active predictions with structure: deviceId, branchId, predictionType, probability, expectedFailureFrom, expectedFailureTo, confidence, predictedImpact, recommendedAction
9. THE system SHALL create table `prediction_evidence` to store individual evidence items supporting each prediction
10. THE system SHALL create table `prediction_outcomes` to track whether predictions were correct
11. THE system SHALL create table `prediction_feedback` to store operator feedback on predictions
12. THE system SHALL create table `maintenance_interventions` to track preventive maintenance triggered by predictions
13. THE system SHALL create table `branch_risk_scores` to store calculated branch reliability scores
14. THE system SHALL create table `risk_suppression_rules` to store operator-defined exceptions
15. ALL prediction tables SHALL include tenant_id for multi-tenancy isolation
16. ALL prediction tables SHALL have appropriate indexes for query performance

### Requirement 19: Telemetry Collection and Feature Extraction

**User Story:** As a backend developer, I want telemetry to be collected and processed into prediction features so that the prediction engine has clean, normalized input data.

#### Acceptance Criteria

1. THE system SHALL collect recorder telemetry: CPU usage, memory usage, temperature, uptime, restart count, write latency, heartbeat events
2. THE system SHALL collect disk telemetry: SMART metrics (reallocated sectors, pending sectors, uncorrectable sectors), temperature, read/write errors, power-on hours
3. THE system SHALL collect network telemetry: packet loss, latency, jitter, DNS failures, WAN disconnections, router CPU/memory
4. THE system SHALL collect camera telemetry: RTSP disconnect count, frame loss rate, response time, PoE events, temperature
5. THE system SHALL collect UPS telemetry: battery health, runtime, discharge rate, voltage variation, load percentage
6. THE system SHALL calculate derived features: moving averages (7-day, 30-day), trend slopes, degradation rates, anomaly scores
7. THE telemetry collection frequency SHALL be: recorder/disk (5 minutes), network (1 minute), camera (30 seconds), UPS (5 minutes)
8. THE feature extraction SHALL run hourly to update prediction inputs
9. THE system SHALL normalize telemetry values to common scales for consistent threshold application
10. THE system SHALL handle missing telemetry gracefully (use last-known-good value or mark feature as unavailable)


### Requirement 20: Notification and Alerting

**User Story:** As a VMS administrator, I want to receive alerts when critical predictions are generated so that I can take immediate action.

#### Acceptance Criteria

1. WHEN a prediction with "Imminent failure" classification is generated, THE system SHALL send an immediate alert
2. WHEN a prediction with "Critical risk" classification is generated, THE system SHALL send an alert within 5 minutes
3. WHEN a prediction affects compliance (retention risk), THE system SHALL send an alert to compliance officers
4. THE alert SHALL include: branch name, device name, prediction type, probability, failure window, impact, recommended action
5. THE system SHALL support alert channels: in-app notifications, email, SMS, webhook integration
6. THE system SHALL respect alert preferences (do not disturb hours, severity thresholds)
7. THE system SHALL aggregate multiple predictions for the same branch into a single alert to avoid alert fatigue
8. THE system SHALL track alert acknowledgment and escalate unacknowledged critical alerts after 2 hours

### Requirement 21: Maintenance Workflow Integration

**User Story:** As a VMS administrator, I want predictions to automatically create maintenance work orders so that I can track and schedule preventive work.

#### Acceptance Criteria

1. WHEN a prediction reaches "Critical risk" level, THE system SHALL offer to auto-create a maintenance work order
2. THE work order SHALL include: prediction details, evidence, recommended actions, estimated time to complete, required parts/skills
3. THE work order SHALL be linked to the prediction for outcome tracking
4. WHERE a work order is completed before failure occurs, THE system SHALL mark the prediction as "Prevented"
5. WHERE maintenance is scheduled but failure occurs before completion, THE system SHALL analyze why lead time was insufficient
6. THE system SHALL support work order templates by prediction type (recorder failure → "Recorder Replacement", disk failure → "Disk Replacement")
7. THE system SHALL track maintenance cost and compare against cost of unplanned downtime to calculate ROI

### Requirement 22: Historical Data Requirements

**User Story:** As a VMS administrator, I want the system to collect sufficient historical data so that predictions become more accurate over time.

#### Acceptance Criteria

1. THE system SHALL retain device telemetry for minimum 90 days for trend analysis
2. THE system SHALL retain health snapshots for minimum 1 year for seasonal pattern detection
3. THE system SHALL retain prediction history for minimum 2 years for accuracy tracking
4. THE system SHALL retain confirmed failure events permanently for training data
5. WHERE historical data is insufficient (<30 days), THE system SHALL display reduced confidence levels
6. THE system SHALL implement data retention policies: raw telemetry (90 days), aggregated features (1 year), predictions (2 years)
7. THE system SHALL support data export for external analysis and model training


### Requirement 23: Performance and Scalability

**User Story:** As a VMS platform architect, I want the prediction system to scale to thousands of branches without performance degradation.

#### Acceptance Criteria

1. THE prediction engine SHALL process telemetry from 10,000+ devices without latency exceeding 30 seconds
2. THE branch risk score calculation SHALL complete for all branches within 5 minutes
3. THE prediction API response time SHALL be <500ms for individual predictions and <2 seconds for list queries
4. THE system SHALL support incremental prediction updates (only recalculate when relevant telemetry changes)
5. THE system SHALL implement caching for frequently accessed predictions (cache TTL: 5 minutes)
6. THE system SHALL partition prediction data by tenant for query performance
7. THE system SHALL use time-series optimized storage for telemetry data
8. THE prediction dashboard SHALL load within 2 seconds even with 1000+ active predictions

### Requirement 24: Security and Access Control

**User Story:** As a VMS security administrator, I want prediction data to be properly secured so that only authorized users can view and act on predictions.

#### Acceptance Criteria

1. ALL prediction APIs SHALL require valid authentication tokens
2. THE system SHALL enforce role-based access control: Admin (full access), Manager (view + acknowledge), Viewer (view only)
3. THE system SHALL respect tenant isolation (users can only access predictions for their tenant)
4. THE system SHALL respect branch scope restrictions (users can only access predictions for authorized branches)
5. THE system SHALL log all prediction accesses for audit trail
6. THE system SHALL encrypt sensitive data in predictions (device credentials, network details)
7. THE system SHALL support read-only access for compliance auditors
8. THE system SHALL require elevated permissions for: suppressing predictions, modifying prediction rules, accessing raw telemetry

## Correctness Properties

### Property 1: Prediction Accuracy Bounds
**Property:** For each prediction type (recorder, disk, network, camera, UPS, storage), the system SHALL maintain prediction accuracy above 60% over a rolling 90-day window. Accuracy is measured as: (True Positives + True Negatives) / (Total Predictions)

**Verification:** Track prediction outcomes continuously. WHERE accuracy falls below 60% for any prediction type, generate a model degradation alert and recommend recalibration.


### Property 2: Time-to-Failure Window Accuracy
**Property:** WHERE a prediction specifies a failure window (e.g., "12-24 hours", "2-4 days"), the actual failure SHALL occur within that window in at least 70% of cases (when failure occurs).

**Verification:** For each prediction with a specified failure window, record whether actual failure occurred within the window. Calculate: Window Accuracy = (Failures within window) / (Total failures that occurred)

### Property 3: False Positive Rate Limit
**Property:** The system SHALL maintain a false-positive rate below 30% for "Critical" and "Imminent" predictions over a rolling 90-day window.

**Verification:** Track false positives (predictions where failure did not occur within predicted window + 50% buffer). Calculate: FPR = False Positives / (False Positives + True Positives)

### Property 4: Prediction Lead Time Guarantee
**Property:** WHERE a failure is correctly predicted, the system SHALL provide at least 6 hours advance warning for recorders and disks, and at least 2 hours for network issues.

**Verification:** For each true positive, measure: Lead Time = (Actual Failure Time) - (Prediction Generated Time). Calculate percentage meeting minimum lead time threshold.

### Property 5: Branch Risk Score Consistency
**Property:** Branch Risk Score SHALL be deterministic given the same input telemetry, and SHALL change monotonically with component health degradation.

**Verification:** Test that identical telemetry inputs produce identical risk scores. Test that worsening health metrics consistently lower the risk score and improving metrics consistently raise it.

### Property 6: Prediction-to-Action Latency
**Property:** From telemetry ingestion to prediction display on dashboard SHALL complete within 10 minutes.

**Verification:** Measure end-to-end latency: telemetry_received_time → feature_extraction_time → prediction_generation_time → dashboard_display_time. Ensure p95 latency < 10 minutes.

### Property 7: Tenant Isolation Guarantee
**Property:** Predictions for tenant A SHALL NEVER be visible to users of tenant B, even in error conditions or cache failures.

**Verification:** Test multi-tenant scenarios with assertion checks. Implement query-level tenant filter enforcement. Audit logs SHALL show no cross-tenant prediction access.

