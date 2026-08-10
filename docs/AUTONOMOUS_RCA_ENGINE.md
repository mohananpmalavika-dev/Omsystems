# Autonomous Root Cause Analysis Engine

## Overview

The Autonomous RCA Engine transforms raw infrastructure alerts into intelligent, actionable diagnoses. Instead of showing "143 cameras offline," it provides:

> **"Probable WAN failure at Branch Cluster 7. 143 cameras affected across 27 branches. 91% confidence. First affected at 14:07. No evidence of individual camera failure."**

This document explains how to use, configure, and extend the RCA engine.

---

## Architecture

```
                     TELEMETRY
                        │
           ┌────────────┼────────────┐
           ↓            ↓            ↓
        Cameras       DVRs       Network
           │            │            │
           └────────────┼────────────┘
                        ↓
                 NORMALIZATION
                        ↓
                 EVENT STREAM
                        ↓
               ALERT CORRELATION
                        ↓
               INCIDENT CREATED
                        ↓
                ┌──────────────┐
                │  RCA ENGINE  │
                └──────┬───────┘
                       │
        ┌──────────────┼──────────────┐
        ↓              ↓              ↓
    Topology       Timeline       Telemetry
        ↓              ↓              ↓
    Dependency     Patterns       Metrics
        └──────────────┼──────────────┘
                       ↓
                 CANDIDATE CAUSES
                       ↓
               EVIDENCE SCORING
                       ↓
              NEGATIVE EVIDENCE
                       ↓
              HISTORICAL CASES
                       ↓
               CONFIDENCE SCORE
                       ↓
             STRUCTURED DIAGNOSIS
                       ↓
               ┌───────┴────────┐
               ↓                ↓
         AI Explanation      Actions
               ↓                ↓
          Command Center     Approval
                                ↓
                            Execution
                                ↓
                          Outcome feedback
                                ↓
                           RCA validation
```

---

## Key Features

### 1. **Topology-Based Reasoning**

The engine understands infrastructure dependencies:

```
ISP
 ↓
WAN Router
 ↓
Branch Network
 ↓
DVR
 ↓
Camera 1, Camera 2, Camera 3...
```

When multiple cameras fail simultaneously, it reasons:

> **"27 DVRs offline → 143 cameras offline → Probable WAN failure"**

Not:

> "143 independent camera hardware failures"

### 2. **Temporal Pattern Analysis**

Time patterns matter:

```
14:07:12 Branch 001 WAN degraded
14:07:15 Branch 002 WAN degraded
14:07:18 Branch 003 WAN degraded
...
14:08:32 Branch 027 WAN degraded
```

This simultaneous pattern indicates common cause (WAN failure), not individual failures.

### 3. **Explainable Confidence Scoring**

Every confidence score is calculated, never invented:

```
WAN failure candidate

+25  ≥10 branches affected
+20  ≥70% cameras affected
+15  failure within 2 minutes
+15  network telemetry degraded
+10  common ISP dependency
+10  DVRs healthy locally
+05  historical WAN failure pattern

= 100 points → normalized to 91% confidence
```

### 4. **Evidence Matrix**

For every diagnosis:

**Supporting Evidence**
- ✓ 27 branches affected
- ✓ 143 cameras affected
- ✓ 94-second failure window
- ✓ 27 DVR connections lost
- ✓ packet loss > 80%

**Contradicting Evidence**
- ✗ 2 branches recovered independently
- ✗ WAN router telemetry missing at 1 branch

**Missing Evidence**
- ? ISP outage confirmation
- ? Router BGP/PPP status

### 5. **Negative Evidence Analysis**

The engine actively looks for evidence AGAINST competing causes:

For "Camera hardware failure" hypothesis:
- Expected: camera-specific heartbeat loss, DVR still reachable, other cameras unaffected
- Observed: 143 cameras + 27 DVRs + simultaneous timing
- Conclusion: Camera hardware failure confidence = 4%

### 6. **Historical Learning**

Past incidents inform future diagnoses:

```
Current incident: 27 branches, 143 cameras offline
↓
Find similar incidents
↓
12 previous incidents found
↓
9 were WAN failures
2 were ISP outages
1 was router failure
↓
Confidence boosted by historical patterns
```

---

## API Endpoints

### 1. Enhanced RCA Diagnosis

```http
POST /v1/branches/:branchId/rca-diagnosis
```

**Request:**
```json
{
  "includeHistorical": true
}
```

**Response:**
```json
{
  "diagnosisId": "rca-2026-08-10-0012",
  "primaryCause": {
    "code": "wan_failure",
    "label": "WAN/Network Failure",
    "explanation": "Multiple branches lost connectivity simultaneously"
  },
  "confidenceScore": 0.91,
  "certainty": "HIGH",
  "blastRadius": {
    "summary": {
      "totalBranches": 27,
      "totalCameras": 143,
      "totalDVRs": 27,
      "totalNetworks": 27
    }
  },
  "temporalAnalysis": {
    "timeSpreadSeconds": 94,
    "simultaneousFailures": true,
    "firstFailureAt": "2026-08-10T14:07:12Z",
    "lastFailureAt": "2026-08-10T14:08:46Z"
  },
  "evidenceMatrix": {
    "supporting": [
      {
        "category": "topology",
        "description": "27 branches share WAN dependency",
        "weight": 0.9,
        "quality": "strong"
      }
    ],
    "contradicting": [],
    "missing": [
      "ISP outage confirmation",
      "Router BGP status"
    ]
  },
  "alternatives": [
    {
      "code": "isp_outage",
      "label": "ISP Regional Outage",
      "confidence": 0.72
    }
  ],
  "recommendedActions": [
    "Investigate WAN connectivity for affected cluster",
    "Check ISP status",
    "Notify affected branch managers"
  ]
}
```

### 2. RCA History

```http
GET /v1/branches/:branchId/rca-history?limit=50
```

View past RCA diagnoses for pattern analysis.

### 3. Similar Cases

```http
GET /v1/branches/:branchId/rca-diagnosis/:diagnosisId/similar-cases
```

Find historically similar incidents to learn from past outcomes.

### 4. Validate Diagnosis

```http
POST /v1/branches/:branchId/rca-diagnosis/:diagnosisId/validate
```

**Request:**
```json
{
  "actualOutcome": "WAN_FAILURE_CONFIRMED",
  "validatedBy": "user-123",
  "notes": "ISP confirmed circuit failure. Service restored after router replacement."
}
```

This creates a feedback loop for the engine to learn.

### 5. Accuracy Statistics

```http
GET /v1/rca-accuracy-stats?tenantId=tenant-123
```

Monitor how well the RCA engine is performing:

```json
{
  "totalDiagnoses": 156,
  "validated": 89,
  "accuracyRate": 0.87,
  "byRootCause": {
    "wan_failure": {
      "total": 42,
      "validated": 38,
      "accuracyRate": 0.90
    }
  }
}
```

---

## Incident Integration

### Automatic RCA Enrichment

Enable automatic RCA analysis when incidents are created:

```typescript
const orchestrator = new IncidentOrchestrator(store, logger, {
  enableRCAEnrichment: true  // Enable automatic RCA
});
```

When enabled, every incident automatically gets:
- Root cause diagnosis
- Blast radius assessment
- Predicted resolution time
- Remediation action recommendations

### Manual RCA Trigger

Trigger RCA analysis for an existing incident:

```http
POST /v1/incidents/:incidentId/rca-enrichment
```

**Response:**
```json
{
  "diagnosis": {
    "id": "rca-2026-08-10-0012",
    "rootCause": "WAN/Network Failure",
    "confidence": 0.91
  },
  "enrichment": {
    "rootCauseCode": "wan_failure",
    "affectedInfrastructure": {
      "branches": 27,
      "cameras": 143,
      "dvrs": 27
    },
    "isMultiBranchFailure": true,
    "predictedResolutionTimeMinutes": 120
  },
  "remediationActions": [
    {
      "id": "rca-action-1",
      "actionType": "investigate_network",
      "title": "Investigate WAN connectivity",
      "description": "Check primary WAN connection for 27 affected branches",
      "priority": "immediate",
      "requiresApproval": false,
      "estimatedTimeMinutes": 15
    }
  ]
}
```

### Get RCA Enrichment

```http
GET /v1/incidents/:incidentId/rca-enrichment
```

### Remediation Actions

```http
GET /v1/incidents/:incidentId/remediation-actions
```

Get all remediation actions generated by RCA for an incident.

**Approve an action:**
```http
POST /v1/incidents/remediation-actions/:actionId/approve
```

**Start execution:**
```http
POST /v1/incidents/remediation-actions/:actionId/start
```

**Mark complete:**
```http
POST /v1/incidents/remediation-actions/:actionId/complete
```

---

## Frontend Integration

### RCA Diagnosis Panel

The `RCADiagnosisPanel` component visualizes RCA results:

```tsx
import { RCADiagnosisPanel } from '@/components/rca-diagnosis-panel';

<RCADiagnosisPanel diagnosis={rcaDiagnosis} />
```

**Features:**
- Root cause overview with confidence score
- Blast radius metrics (branches/cameras/DVRs affected)
- Temporal pattern visualization
- Evidence matrix (supporting/contradicting/missing)
- Alternative diagnoses
- Recommended actions

### RCA Analysis Page

Dedicated page for RCA analysis:

```
/operations/rca-analysis
```

**Features:**
- Branch selection
- Real-time RCA analysis trigger
- Stats dashboard (confidence, cameras, branches, evidence)
- Full diagnosis details

---

## Adding New Root Cause Rules

### 1. Create Rule File

Create `src/services/command-center/rca/rules/storage-failure.ts`:

```typescript
import type { RCACandidateRule, OperationalEvent } from '../types.js';

export const storageFailureRule: RCACandidateRule = {
  code: 'storage_failure',
  label: 'Storage System Failure',
  
  detect(events: OperationalEvent[]): number {
    let score = 0;
    
    // Check for storage events
    const storageEvents = events.filter(e => 
      e.eventType === 'disk_failure' || 
      e.eventType === 'recording_stopped'
    );
    
    if (storageEvents.length >= 5) score += 30;
    
    // Check for multiple DVRs affected
    const affectedDVRs = new Set(
      events
        .filter(e => e.entity.type === 'dvr')
        .map(e => e.entity.id)
    );
    
    if (affectedDVRs.size >= 3) score += 20;
    
    // Check for common storage dependency
    const storageNodes = new Set(
      events
        .filter(e => e.eventType === 'disk_failure')
        .map(e => e.entity.id)
    );
    
    if (storageNodes.size === 1 && affectedDVRs.size >= 3) {
      score += 25; // Single storage node affecting multiple DVRs
    }
    
    return Math.min(score, 100);
  },
  
  explain(score: number): string {
    if (score >= 70) {
      return 'High probability of storage system failure affecting multiple recorders';
    } else if (score >= 40) {
      return 'Possible storage issues detected';
    }
    return 'Storage-related events observed';
  },
  
  recommendedActions(score: number): string[] {
    const actions = [
      'Check storage node health and disk status',
      'Verify RAID array status',
      'Review storage capacity and I/O metrics'
    ];
    
    if (score >= 70) {
      actions.unshift('IMMEDIATE: Investigate storage system failure');
    }
    
    return actions;
  }
};
```

### 2. Register Rule

Add to `src/services/command-center/rca/engine.ts`:

```typescript
import { storageFailureRule } from './rules/storage-failure.js';

private rules: RCACandidateRule[] = [
  wanFailureRule,
  powerFailureRule,
  dvrFailureRule,
  storageFailureRule,  // Add new rule
];
```

---

## Configuration

### Enable RCA Enrichment

In your incident orchestrator initialization:

```typescript
const orchestrator = new IncidentOrchestrator(store, logger, {
  enableRCAEnrichment: true,  // Enable automatic RCA for incidents
});
```

### Historical Case Matching

Configure similarity thresholds in `rca-store.ts`:

```typescript
// Minimum similarity score (0-1) to consider cases similar
const SIMILARITY_THRESHOLD = 0.7;

// Maximum number of similar cases to return
const MAX_SIMILAR_CASES = 10;
```

### Confidence Thresholds

Configure certainty levels in `confidence-scorer.ts`:

```typescript
const confidenceCertainty = confidence >= 0.85 ? "HIGH"
  : confidence >= 0.65 ? "MEDIUM"
  : "LOW";
```

---

## Testing RCA Engine

### 1. Simulate WAN Failure

Create test events showing simultaneous branch failures:

```typescript
const events: OperationalEvent[] = Array.from({ length: 27 }, (_, i) => ({
  id: `evt-${i}`,
  tenantId: 'tenant-123',
  timestamp: new Date(Date.now() + i * 3000).toISOString(),
  entity: { type: 'network', id: `branch-${i}` },
  branchId: `branch-${i}`,
  eventType: 'wan_down',
  severity: 'P1',
  source: 'network',
  confidence: 0.95,
}));

const diagnosis = await rcaEngine.analyze(events, {
  tenantId: 'tenant-123',
  includeHistorical: true,
});

console.log(`Root cause: ${diagnosis.primaryCause.label}`);
console.log(`Confidence: ${Math.round(diagnosis.confidenceScore * 100)}%`);
```

### 2. Test Multi-Branch Correlation

```bash
# Send test telemetry for multiple branches
curl -X POST http://localhost:3000/v1/branches/branch-001/rca-diagnosis
curl -X POST http://localhost:3000/v1/branches/branch-002/rca-diagnosis
...
```

### 3. Validate Results

```http
POST /v1/branches/:branchId/rca-diagnosis/:diagnosisId/validate
```

Feed actual outcomes back to improve accuracy.

---

## Monitoring & Metrics

### Key Metrics

1. **Accuracy Rate**: Percentage of diagnoses validated as correct
2. **Confidence Distribution**: How often the engine is highly confident
3. **Time to Diagnosis**: How quickly RCA completes
4. **Remediation Success**: How often recommended actions resolve issues

### Dashboard

View RCA metrics at:
```
/operations/rca-analysis
```

Statistics include:
- Total diagnoses performed
- Accuracy by root cause type
- Average confidence scores
- Historical trends

---

## Troubleshooting

### RCA Returns "Insufficient Evidence"

**Causes:**
- Not enough telemetry events
- Events too spread out in time
- Missing topology/dependency data

**Solutions:**
- Ensure telemetry collectors are running
- Check operational knowledge graph completeness
- Verify timeline event ingestion

### Low Confidence Scores

**Causes:**
- Ambiguous failure patterns
- Multiple competing causes
- Incomplete evidence

**Solutions:**
- Wait for more evidence to accumulate
- Check for contradicting evidence
- Review missing evidence items

### Incorrect Diagnoses

**Causes:**
- Rule weights need tuning
- Missing rule for actual cause
- Historical data skewing results

**Solutions:**
- Validate actual outcome to train the engine
- Add new rules for unhandled causes
- Review and adjust rule scoring

---

## Best Practices

### 1. Always Validate Outcomes

Feed actual resolution back to the engine:

```http
POST /v1/branches/:branchId/rca-diagnosis/:diagnosisId/validate
```

This creates a learning feedback loop.

### 2. Use Historical Context

Enable historical case matching:

```json
{
  "includeHistorical": true
}
```

Past patterns improve current diagnoses.

### 3. Review Alternative Causes

Don't only look at the primary cause. Check alternatives:

```json
{
  "alternatives": [
    {
      "code": "isp_outage",
      "confidence": 0.72
    }
  ]
}
```

### 4. Check Evidence Quality

Look at evidence quality scores:

```json
{
  "evidenceQuality": "HIGH",
  "evidenceScore": 0.85
}
```

Low evidence quality = lower diagnostic certainty.

### 5. Monitor Accuracy Over Time

Track accuracy statistics:

```http
GET /v1/rca-accuracy-stats
```

Ensure the engine maintains >80% accuracy.

---

## Roadmap

### Planned Enhancements

1. **Machine Learning Integration**: Train models on validated outcomes
2. **Probabilistic Reasoning**: Bayesian networks for complex scenarios
3. **Real-Time Adaptation**: Adjust rules based on ongoing incidents
4. **Cross-Tenant Learning**: Learn patterns across multiple deployments
5. **Predictive RCA**: Predict failures before they occur
6. **Integration with Digital Twin**: Use twin state for simulation

---

## Support

For questions or issues:

1. Check `/operations/rca-analysis` for diagnostics
2. Review accuracy statistics for patterns
3. Validate outcomes to improve the engine
4. Add custom rules for your specific infrastructure

---

## Summary

The Autonomous RCA Engine transforms Sentinel Grid from a reactive monitoring system into a proactive, intelligent operations platform. By providing explainable, confidence-scored root cause diagnoses with actionable remediation recommendations, it dramatically reduces mean time to resolution (MTTR) and operator cognitive load.

**Key Benefits:**
- ✅ Dramatic alert reduction (143 alerts → 1 diagnosis)
- ✅ Explainable confidence scoring (never invented)
- ✅ Topology-aware reasoning (understands dependencies)
- ✅ Historical learning (improves over time)
- ✅ Actionable recommendations (with approval workflow)
- ✅ Feedback-driven accuracy (validates and learns)
