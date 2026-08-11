# Integration Guide: Migrating to Evidence-Based Architecture

## Overview

This guide shows how to migrate existing services from direct adapter calls to evidence-based architecture.

## Example: Recording Compliance Service

### Before (Old Architecture)

```typescript
// ❌ OLD: Direct adapter calls, invented values, unclear semantics
class RecordingComplianceService {
  async checkCompliance(recorder: Recorder): Promise<ComplianceResult> {
    try {
      // Direct adapter call
      const adapter = this.getAdapter(recorder);
      const status = await adapter.getRecordingStatus();
      
      // Unknown becomes false
      if (!status.recording) {
        return { compliant: false, reason: 'NOT_RECORDING' };
      }
      
      // Invented health status
      if (status.healthy) {
        return { compliant: true };
      }
      
    } catch (error) {
      // Error becomes non-compliant
      return { compliant: false, reason: 'ERROR' };
    }
  }
}
```

**Problems:**
- Direct adapter calls (tight coupling)
- `unknown` treated as `false`
- "Healthy" is invented, not observed
- Errors conflated with non-compliance
- No historical evidence
- No conflict detection

### After (New Architecture)

```typescript
// ✅ NEW: Evidence-based, explicit semantics, policy separation
import { RecorderEvidenceService } from './recorders/core/recorder-evidence.service.js';
import { RecorderEvidenceEvaluator } from './recorders/core/recorder-evidence-evaluator.js';
import { EvidenceRepository } from './recorders/persistence/evidence-repository.js';
import { isObserved } from './recorders/contracts/evidence-value.js';

class RecordingComplianceService {
  constructor(
    private readonly evidenceService: RecorderEvidenceService,
    private readonly evaluator: RecorderEvidenceEvaluator,
    private readonly repository: EvidenceRepository
  ) {}

  /**
   * Check recording compliance using latest evidence
   */
  async checkCompliance(
    recorder: Recorder
  ): Promise<RecordingComplianceResult> {
    // Get latest evidence (from cache/database)
    const evidenceSnapshot = await this.repository.getLatestEvidence(
      recorder.id
    );

    // Check evidence freshness
    const now = new Date();
    const evidenceAge = now.getTime() - evidenceSnapshot.collected_at.getTime();
    const MAX_EVIDENCE_AGE_MS = 10 * 60 * 1000; // 10 minutes

    // If evidence is stale, collect fresh evidence
    let evidence;
    if (!evidenceSnapshot || evidenceAge > MAX_EVIDENCE_AGE_MS) {
      const result = await this.evidenceService.collectEvidence({
        recorderId: recorder.id,
        tenantId: recorder.tenantId,
        branchId: recorder.branchId,
        recorderUrl: recorder.url,
        adapterType: recorder.adapterType,
        credentials: recorder.credentials,
        options: {
          priority: RequestPriority.HIGH
        }
      });

      evidence = result.evidence;
      
      // Persist new evidence
      await this.repository.saveEvidence(evidence);
    } else {
      // Use cached evidence
      evidence = this.reconstructEvidence(evidenceSnapshot);
    }

    // Evaluate evidence (policy layer)
    const assessment = this.evaluator.evaluateRecorder(evidence);

    // Build compliance result
    return this.buildComplianceResult(recorder, evidence, assessment);
  }

  /**
   * Build compliance result from assessment
   */
  private buildComplianceResult(
    recorder: Recorder,
    evidence: RecorderEvidence,
    assessment: RecorderAssessment
  ): RecordingComplianceResult {
    // Check overall reachability
    if (!isObserved(evidence.reachable) || !evidence.reachable.value) {
      return {
        recorderId: recorder.id,
        status: 'UNKNOWN',
        reason: 'RECORDER_UNREACHABLE',
        details: 'Cannot verify compliance - recorder unreachable',
        evidenceState: evidence.reachable.state,
        assessedAt: assessment.assessedAt,
        evidenceFreshness: assessment.evidenceFreshness
      };
    }

    // Check authentication
    if (!isObserved(evidence.authenticated) || !evidence.authenticated.value) {
      return {
        recorderId: recorder.id,
        status: 'UNKNOWN',
        reason: 'AUTH_FAILED',
        details: 'Cannot verify compliance - authentication failed',
        evidenceState: evidence.authenticated.state,
        assessedAt: assessment.assessedAt,
        evidenceFreshness: assessment.evidenceFreshness
      };
    }

    // Check if we have channel evidence
    if (!isObserved(evidence.channels)) {
      return {
        recorderId: recorder.id,
        status: 'UNKNOWN',
        reason: 'INSUFFICIENT_EVIDENCE',
        details: 'Cannot verify compliance - no channel evidence',
        evidenceState: evidence.channels.state,
        assessedAt: assessment.assessedAt,
        evidenceFreshness: assessment.evidenceFreshness
      };
    }

    // Evaluate per-channel compliance
    const channelResults = assessment.channels.map(channel => ({
      channelId: channel.channelId,
      compliance: channel.recordingCompliance,
      status: channel.status,
      reasons: channel.reasons,
      evidence: channel.evidence
    }));

    // Determine overall compliance
    const compliantCount = channelResults.filter(
      c => c.compliance === 'COMPLIANT'
    ).length;
    
    const nonCompliantCount = channelResults.filter(
      c => c.compliance === 'NON_COMPLIANT'
    ).length;
    
    const unknownCount = channelResults.filter(
      c => c.compliance === 'UNKNOWN'
    ).length;

    const totalEnabled = channelResults.filter(
      c => c.compliance !== 'NOT_APPLICABLE'
    ).length;

    // Compliance determination
    let status: 'COMPLIANT' | 'NON_COMPLIANT' | 'PARTIAL' | 'UNKNOWN';
    let reason: string;
    let details: string;

    if (totalEnabled === 0) {
      status = 'UNKNOWN';
      reason = 'NO_ENABLED_CHANNELS';
      details = 'No channels enabled for recording';
    } else if (nonCompliantCount > 0) {
      status = 'NON_COMPLIANT';
      reason = 'RECORDING_FAILURES';
      details = `${nonCompliantCount} of ${totalEnabled} channels not recording`;
    } else if (unknownCount === totalEnabled) {
      status = 'UNKNOWN';
      reason = 'CANNOT_VERIFY';
      details = 'Cannot verify recording status for any channel';
    } else if (unknownCount > 0) {
      status = 'PARTIAL';
      reason = 'PARTIAL_VERIFICATION';
      details = `${compliantCount} compliant, ${unknownCount} unknown`;
    } else {
      status = 'COMPLIANT';
      reason = 'ALL_RECORDING';
      details = `All ${totalEnabled} channels recording`;
    }

    return {
      recorderId: recorder.id,
      status,
      reason,
      details,
      assessedAt: assessment.assessedAt,
      evidenceFreshness: assessment.evidenceFreshness,
      channels: channelResults,
      complianceScore: this.evaluator.calculateComplianceScore(assessment.channels)
    };
  }

  /**
   * Get recording compliance history
   */
  async getComplianceHistory(
    recorderId: string,
    startTime: Date,
    endTime: Date
  ): Promise<ComplianceHistoryPoint[]> {
    const history = await this.repository.getEvidenceHistory(
      recorderId,
      startTime,
      endTime
    );

    return history.map(snapshot => {
      const evidence = this.reconstructEvidence(snapshot);
      const assessment = this.evaluator.evaluateRecorder(evidence);
      
      return {
        timestamp: snapshot.collected_at,
        compliant: assessment.channels.every(
          c => c.recordingCompliance === 'COMPLIANT'
        ),
        complianceScore: this.evaluator.calculateComplianceScore(assessment.channels),
        issues: assessment.reasons
      };
    });
  }

  /**
   * Detect recording gaps
   */
  async detectRecordingGaps(
    recorderId: string,
    channelId: string,
    startTime: Date,
    endTime: Date
  ): Promise<RecordingGap[]> {
    const history = await this.repository.getChannelEvidenceHistory(
      recorderId,
      channelId,
      startTime,
      endTime
    );

    const gaps: RecordingGap[] = [];
    let gapStart: Date | null = null;

    for (let i = 0; i < history.length; i++) {
      const current = history[i];
      const isRecording = 
        current.recording_active_state === 'OBSERVED' &&
        current.recording_active === true;

      if (!isRecording && !gapStart) {
        // Gap started
        gapStart = current.created_at;
      } else if (isRecording && gapStart) {
        // Gap ended
        gaps.push({
          start: gapStart,
          end: current.created_at,
          durationMs: current.created_at.getTime() - gapStart.getTime(),
          reason: this.determineGapReason(current)
        });
        gapStart = null;
      }
    }

    // If gap is still open
    if (gapStart) {
      gaps.push({
        start: gapStart,
        end: new Date(),
        durationMs: Date.now() - gapStart.getTime(),
        reason: 'ONGOING'
      });
    }

    return gaps;
  }

  /**
   * Get compliance trends
   */
  async getComplianceTrends(
    branchId: string,
    period: 'day' | 'week' | 'month'
  ): Promise<ComplianceTrend> {
    // Query aggregated compliance data
    const result = await this.repository.pool.query(`
      SELECT
        DATE_TRUNC($1, collected_at) as period,
        COUNT(DISTINCT recorder_id) as total_recorders,
        COUNT(DISTINCT CASE 
          WHEN recording_active_state = 'OBSERVED' 
          AND recording_active = true 
          THEN recorder_id 
        END) as compliant_recorders,
        AVG(CASE 
          WHEN recording_active_state = 'OBSERVED' 
          THEN CASE WHEN recording_active THEN 1.0 ELSE 0.0 END 
        END) * 100 as avg_compliance_percent
      FROM recorder_evidence_snapshots es
      JOIN recorder_channel_evidence ce ON ce.snapshot_id = es.id
      WHERE es.branch_id = $2
        AND es.collected_at >= NOW() - INTERVAL '30 days'
      GROUP BY period
      ORDER BY period DESC
    `, [period, branchId]);

    return {
      periods: result.rows.map(row => ({
        timestamp: row.period,
        totalRecorders: parseInt(row.total_recorders, 10),
        compliantRecorders: parseInt(row.compliant_recorders, 10),
        compliancePercent: parseFloat(row.avg_compliance_percent)
      }))
    };
  }

  /**
   * Reconstruct evidence from database row
   */
  private reconstructEvidence(row: EvidenceSnapshotRow): RecorderEvidence {
    // Convert database row back to evidence structure
    // (Implementation details omitted for brevity)
    return {
      recorderId: row.recorder_id,
      tenantId: row.tenant_id,
      branchId: row.branch_id,
      collectedAt: row.collected_at,
      primaryAdapter: row.adapter_type as any,
      reachable: {
        state: row.reachable_state,
        value: row.reachable_value,
        observedAt: row.collected_at,
        source: { adapter: row.adapter_type as any, operation: 'probe' },
        confidence: row.reachable_value !== null ? 1.0 : 0
      },
      // ... reconstruct other fields
    } as RecorderEvidence;
  }
}
```

## Key Improvements

### 1. Explicit Unknown Handling

```typescript
// ❌ OLD: Unknown becomes non-compliant
if (!status.recording) {
  return { compliant: false };
}

// ✅ NEW: Unknown stays unknown
if (!isObserved(evidence.recordingActive)) {
  return {
    status: 'UNKNOWN',
    reason: 'INSUFFICIENT_EVIDENCE'
  };
}
```

### 2. Evidence Freshness

```typescript
// ✅ NEW: Check evidence age
const evidenceAge = now.getTime() - evidence.collectedAt.getTime();
if (evidenceAge > MAX_AGE) {
  // Collect fresh evidence
}
```

### 3. Policy Separation

```typescript
// ❌ OLD: Adapter makes policy decision
adapter.isCompliant() // Wrong layer!

// ✅ NEW: Evaluator applies policy
const assessment = evaluator.evaluateRecorder(evidence);
const compliant = assessment.recordingCompliance === 'COMPLIANT';
```

### 4. Historical Analysis

```typescript
// ✅ NEW: Query evidence history
const history = await repository.getEvidenceHistory(
  recorderId,
  startTime,
  endTime
);

// Analyze trends, gaps, patterns
```

## Integration Checklist

- [ ] Update service dependencies (inject evidence service, evaluator, repository)
- [ ] Replace direct adapter calls with evidence queries
- [ ] Add evidence freshness checks
- [ ] Implement proper unknown handling
- [ ] Use evaluator for policy decisions
- [ ] Add historical analysis capabilities
- [ ] Update tests to use evidence fixtures
- [ ] Add monitoring for evidence staleness
- [ ] Configure evidence collection schedules
- [ ] Set up retention policies

## Testing Migration

```typescript
// OLD test
it('returns non-compliant when not recording', async () => {
  mockAdapter.getRecordingStatus.mockResolvedValue({ recording: false });
  const result = await service.checkCompliance(recorder);
  expect(result.compliant).toBe(false);
});

// NEW test
it('returns unknown when recording evidence unavailable', async () => {
  const evidence = {
    ...baseEvidence,
    recordingActive: unknown(source, 'Query failed')
  };
  mockRepository.getLatestEvidence.mockResolvedValue(evidence);
  
  const result = await service.checkCompliance(recorder);
  
  expect(result.status).toBe('UNKNOWN');
  expect(result.reason).toBe('INSUFFICIENT_EVIDENCE');
});
```

## Database Queries

### Get Recorders with Recording Issues

```sql
SELECT
  r.id,
  r.name,
  es.collected_at,
  COUNT(ce.id) as total_channels,
  COUNT(CASE 
    WHEN ce.recording_active_state = 'OBSERVED' 
    AND ce.recording_active = false 
    THEN 1 
  END) as stopped_channels
FROM recorders r
JOIN recorder_latest_evidence es ON es.recorder_id = r.id
JOIN recorder_channel_evidence ce ON ce.snapshot_id = es.id
WHERE ce.enabled_value = true
  AND (
    ce.recording_active_state != 'OBSERVED'
    OR ce.recording_active = false
  )
GROUP BY r.id, r.name, es.collected_at
HAVING COUNT(CASE 
  WHEN ce.recording_active_state = 'OBSERVED' 
  AND ce.recording_active = false 
  THEN 1 
END) > 0;
```

### Get Compliance Trend

```sql
SELECT
  DATE(collected_at) as date,
  COUNT(DISTINCT recorder_id) as recorders,
  ROUND(AVG(compliance_percent), 2) as avg_compliance
FROM recorder_recording_compliance
WHERE branch_id = $1
  AND collected_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(collected_at)
ORDER BY date DESC;
```

## Alert Configuration

```typescript
// Configure alerts based on evidence
const alertRules = [
  {
    name: 'Recording Stopped',
    condition: (assessment: RecorderAssessment) =>
      assessment.reasons.includes('RECORDING_STOPPED'),
    severity: 'HIGH'
  },
  {
    name: 'No Recent Archive',
    condition: (assessment: RecorderAssessment) =>
      assessment.reasons.includes('NO_RECENT_ARCHIVE'),
    severity: 'MEDIUM'
  },
  {
    name: 'Storage Critical',
    condition: (assessment: RecorderAssessment) =>
      assessment.storage?.status === 'CRITICAL',
    severity: 'HIGH'
  },
  {
    name: 'Evidence Stale',
    condition: (assessment: RecorderAssessment) =>
      assessment.evidenceFreshness === 'EXPIRED',
    severity: 'LOW'
  }
];
```

## Performance Considerations

### Caching Strategy

```typescript
// Cache evidence for short periods
const EVIDENCE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async getLatestEvidence(recorderId: string): Promise<RecorderEvidence> {
  // Check cache
  const cached = await this.cache.get(`evidence:${recorderId}`);
  if (cached && Date.now() - cached.timestamp < EVIDENCE_CACHE_TTL) {
    return cached.evidence;
  }

  // Query database
  const evidence = await this.repository.getLatestEvidence(recorderId);
  
  // Update cache
  await this.cache.set(`evidence:${recorderId}`, {
    evidence,
    timestamp: Date.now()
  });

  return evidence;
}
```

### Batch Operations

```typescript
// Check compliance for multiple recorders
async checkBatchCompliance(
  recorderIds: string[]
): Promise<Map<string, RecordingComplianceResult>> {
  // Batch evidence query
  const evidenceMap = await this.repository.getBatchLatestEvidence(recorderIds);
  
  // Parallel evaluation
  const results = await Promise.all(
    recorderIds.map(async id => {
      const evidence = evidenceMap.get(id);
      if (!evidence) return null;
      
      const assessment = this.evaluator.evaluateRecorder(evidence);
      return [id, this.buildComplianceResult(recorder, evidence, assessment)];
    })
  );

  return new Map(results.filter(r => r !== null));
}
```

## Migration Timeline

1. **Week 1:** Deploy evidence infrastructure
2. **Week 2:** Run parallel evidence collection
3. **Week 3:** Migrate compliance service (this guide)
4. **Week 4:** Migrate health dashboards
5. **Week 5:** Update alerts
6. **Week 6:** Deprecate old adapters

## Rollback Plan

If issues arise:
1. Keep old adapter code in place during migration
2. Feature flag new evidence-based path
3. Compare results between old and new
4. Switch back to old path if needed
5. Investigate discrepancies

## Success Metrics

- [ ] Evidence collection success rate > 95%
- [ ] Evidence freshness < 10 minutes
- [ ] Compliance determination accuracy = 100% (vs manual verification)
- [ ] No false non-compliant alerts
- [ ] Unknown status properly distinguished from non-compliant
- [ ] Historical analysis working
- [ ] Dashboard response time < 200ms
