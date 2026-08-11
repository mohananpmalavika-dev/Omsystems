# Frontend Integration Guide: Evidence-Based Security Dashboard

## Overview

The security dashboard now uses a **provenance-based evidence system** that prevents missing data from appearing as "secure". This guide explains how to properly display evidence-based security states in the UI.

## Core Principle

```
missing evidence ≠ healthy
missing evidence = UNKNOWN
```

The frontend **must preserve this distinction** to avoid recreating the backend bug in the UI.

## API Response Structure

### New Format (Evidence-Based)

```typescript
interface SecurityDashboardResponse {
  deviceSecurity: {
    overall: {
      state: 'HEALTHY' | 'UNHEALTHY' | 'UNKNOWN';
      evidenceCoverage: number;  // 0-1
      evaluatedAt: string;       // ISO timestamp
    };
    controls: {
      secureBoot: SecurityEvidence<SecureBootData>;
      ransomwareProtection: SecurityEvidence<RansomwareData>;
      tamperProtection: SecurityEvidence<TamperProtectionData>;
      tamperCondition: SecurityEvidence<TamperConditionData>;
    };
    summary: {
      healthyControls: number;
      unhealthyControls: number;
      unknownControls: number;
      totalControls: number;
    };
  };
  collectors: {
    [key: string]: boolean;  // Collector availability
  };
}
```

### Evidence Type Structure

```typescript
type SecurityEvidence<T> =
  | HealthyEvidence<T>
  | UnhealthyEvidence<T>
  | UnknownEvidence;

interface HealthyEvidence<T> {
  state: 'HEALTHY';
  available: true;
  source: 'LIVE';
  confidence: number;
  observedAt: string;
  reason: 'VERIFIED';
  evidence: T;
}

interface UnhealthyEvidence<T> {
  state: 'UNHEALTHY';
  available: true;
  source: 'LIVE';
  confidence: number;
  observedAt: string;
  reason: 'CONTROL_FAILED';
  evidence: T;
}

interface UnknownEvidence {
  state: 'UNKNOWN';
  available: false;
  source: 'UNAVAILABLE' | 'SIMULATED';
  confidence: number;
  observedAt: string | null;
  reason: 
    | 'COLLECTOR_UNAVAILABLE'
    | 'NOT_SUPPORTED'
    | 'NOT_CONFIGURED'
    | 'STALE_EVIDENCE'
    | 'SIMULATED_DATA'
    | 'PERMISSION_DENIED'
    | 'TIMEOUT'
    | 'INVALID_RESPONSE'
    | 'NO_EVIDENCE';
}
```

## Critical: Three-State UI Pattern

### ❌ WRONG: Treating UNKNOWN as Healthy

```typescript
// DON'T DO THIS - recreates the backend bug
const isSecure = control.state !== 'UNHEALTHY';

if (isSecure) {
  return <GreenCheckmark />;
} else {
  return <RedX />;
}
```

**Problem:** This makes `UNKNOWN` appear as secure/healthy, which is the exact bug we fixed in the backend.

### ✅ CORRECT: Three Distinct States

```typescript
// DO THIS - preserve three states
switch (control.state) {
  case 'HEALTHY':
    return <HealthyIndicator control={control} />;
  
  case 'UNHEALTHY':
    return <UnhealthyIndicator control={control} />;
  
  case 'UNKNOWN':
    return <UnknownIndicator control={control} />;
}
```

## UI Component Examples

### Status Badge

```tsx
interface StatusBadgeProps {
  evidence: SecurityEvidence<any>;
}

export function SecurityStatusBadge({ evidence }: StatusBadgeProps) {
  switch (evidence.state) {
    case 'HEALTHY':
      return (
        <Badge color="green" icon={CheckCircleIcon}>
          Verified
        </Badge>
      );
    
    case 'UNHEALTHY':
      return (
        <Badge color="red" icon={XCircleIcon}>
          Failed
        </Badge>
      );
    
    case 'UNKNOWN':
      return (
        <Badge color="gray" icon={QuestionMarkCircleIcon}>
          Unknown
        </Badge>
      );
  }
}
```

### Control Card

```tsx
export function SecurityControlCard({ control, evidence }: Props) {
  const stateConfig = {
    HEALTHY: {
      icon: ShieldCheckIcon,
      color: 'green',
      title: 'Verified',
      message: `Last verified ${formatRelativeTime(evidence.observedAt)}`,
    },
    UNHEALTHY: {
      icon: ShieldExclamationIcon,
      color: 'red',
      title: 'Control Failed',
      message: `Failure detected ${formatRelativeTime(evidence.observedAt)}`,
    },
    UNKNOWN: {
      icon: QuestionMarkCircleIcon,
      color: 'gray',
      title: 'Status Unknown',
      message: getUnknownMessage(evidence.reason),
    },
  }[evidence.state];

  return (
    <Card>
      <div className={`border-l-4 border-${stateConfig.color}-500`}>
        <stateConfig.icon className={`text-${stateConfig.color}-600`} />
        <h3>{control.name}</h3>
        <p className="text-sm text-gray-600">{stateConfig.message}</p>
        
        {evidence.state === 'UNKNOWN' && (
          <UnknownReasonAlert reason={evidence.reason} />
        )}
        
        {evidence.state !== 'UNKNOWN' && (
          <ConfidenceIndicator confidence={evidence.confidence} />
        )}
      </div>
    </Card>
  );
}
```

### Unknown Reason Messages

```typescript
function getUnknownMessage(reason: string): string {
  const messages: Record<string, string> = {
    'NOT_CONFIGURED': 'This security control has not been configured yet.',
    'NOT_SUPPORTED': 'This security control is not supported on this platform.',
    'COLLECTOR_UNAVAILABLE': 'Unable to collect security data. Service may be offline.',
    'STALE_EVIDENCE': 'Security data is outdated. Last check was too long ago.',
    'SIMULATED_DATA': 'Using simulated data. Real security status unknown.',
    'PERMISSION_DENIED': 'Insufficient permissions to verify security status.',
    'TIMEOUT': 'Security check timed out.',
    'NO_EVIDENCE': 'No security evidence available.',
  };
  
  return messages[reason] || 'Security status could not be determined.';
}
```

### Overall Security Posture

```tsx
export function SecurityPostureOverview({ posture }: Props) {
  const { overall, summary } = posture.deviceSecurity;
  
  // Calculate health percentage (only from known controls)
  const knownControls = summary.healthyControls + summary.unhealthyControls;
  const healthPercentage = knownControls > 0
    ? (summary.healthyControls / knownControls) * 100
    : 0;
  
  return (
    <div>
      <div className="flex items-center gap-4">
        <SecurityStateIcon state={overall.state} size="large" />
        <div>
          <h2>Security Posture: {overall.state}</h2>
          <p className="text-gray-600">
            Evidence coverage: {Math.round(overall.evidenceCoverage * 100)}%
          </p>
        </div>
      </div>
      
      {/* Show warning if low coverage */}
      {overall.evidenceCoverage < 0.5 && (
        <Alert variant="warning">
          <AlertTriangleIcon />
          <div>
            <strong>Limited Visibility</strong>
            <p>
              Only {Math.round(overall.evidenceCoverage * 100)}% of security controls
              have active monitoring. Configure additional collectors for better visibility.
            </p>
          </div>
        </Alert>
      )}
      
      {/* Don't show health score if mostly unknown */}
      {knownControls >= summary.totalControls / 2 ? (
        <div>
          <ProgressBar value={healthPercentage} color={getHealthColor(overall.state)} />
          <p>
            {summary.healthyControls} healthy, {summary.unhealthyControls} failed,
            {summary.unknownControls} unknown
          </p>
        </div>
      ) : (
        <div className="text-gray-600">
          <p>
            Security health unavailable: {summary.unknownControls} of {summary.totalControls} controls
            have unknown status.
          </p>
        </div>
      )}
    </div>
  );
}
```

## Evidence Coverage Display

Show evidence coverage separately from security health:

```tsx
export function EvidenceCoverageWidget({ coverage }: Props) {
  const coveragePercent = Math.round(coverage * 100);
  
  const status = coverage >= 0.8 ? 'good' : coverage >= 0.5 ? 'warning' : 'critical';
  
  return (
    <Widget>
      <h4>Evidence Coverage</h4>
      <div className="flex items-center gap-2">
        <ProgressRing value={coveragePercent} color={getCoverageColor(status)} />
        <div>
          <p className="text-2xl font-bold">{coveragePercent}%</p>
          <p className="text-sm text-gray-600">
            {getCoverageMessage(status)}
          </p>
        </div>
      </div>
      
      {status !== 'good' && (
        <button onClick={onConfigureCollectors}>
          Configure Collectors
        </button>
      )}
    </Widget>
  );
}

function getCoverageMessage(status: string): string {
  switch (status) {
    case 'good':
      return 'Most security controls monitored';
    case 'warning':
      return 'Some controls not monitored';
    case 'critical':
      return 'Many controls not monitored';
    default:
      return '';
  }
}
```

## Handling Stale Evidence

Display evidence age and freshness:

```tsx
export function EvidenceFreshness({ evidence }: Props) {
  if (!evidence.observedAt) {
    return <span className="text-gray-500">Never observed</span>;
  }
  
  const age = Date.now() - new Date(evidence.observedAt).getTime();
  const ageMinutes = Math.floor(age / 60000);
  const ageHours = Math.floor(age / 3600000);
  const ageDays = Math.floor(age / 86400000);
  
  let display: string;
  let freshness: 'fresh' | 'stale' | 'very_stale';
  
  if (ageMinutes < 5) {
    display = 'Just now';
    freshness = 'fresh';
  } else if (ageMinutes < 60) {
    display = `${ageMinutes}m ago`;
    freshness = 'fresh';
  } else if (ageHours < 24) {
    display = `${ageHours}h ago`;
    freshness = ageHours < 12 ? 'fresh' : 'stale';
  } else {
    display = `${ageDays}d ago`;
    freshness = 'very_stale';
  }
  
  const color = {
    fresh: 'text-green-600',
    stale: 'text-yellow-600',
    very_stale: 'text-red-600',
  }[freshness];
  
  return (
    <span className={color}>
      {display}
      {freshness !== 'fresh' && <ClockIcon className="inline ml-1" />}
    </span>
  );
}
```

## TypeScript Types (Frontend)

```typescript
// types/security-evidence.ts

export type SecurityState = 'HEALTHY' | 'UNHEALTHY' | 'UNKNOWN';
export type EvidenceSource = 'LIVE' | 'SIMULATED' | 'UNAVAILABLE';

export type SecurityReason =
  | 'VERIFIED'
  | 'CONTROL_FAILED'
  | 'COLLECTOR_UNAVAILABLE'
  | 'NOT_SUPPORTED'
  | 'NOT_CONFIGURED'
  | 'STALE_EVIDENCE'
  | 'SIMULATED_DATA'
  | 'PERMISSION_DENIED'
  | 'TIMEOUT'
  | 'INVALID_RESPONSE'
  | 'NO_EVIDENCE';

export interface SecurityEvidence<T = any> {
  state: SecurityState;
  available: boolean;
  source: EvidenceSource;
  confidence: number;
  observedAt: string | null;
  reason: SecurityReason;
  evidence?: T;
}

export interface SecurityPostureSummary {
  overallState: SecurityState;
  controlCount: number;
  healthyControls: number;
  unhealthyControls: number;
  unknownControls: number;
  evidenceCoverage: number;
  evaluatedAt: string;
}
```

## API Client Example

```typescript
// api/security.ts

export async function getSecurityPosture(): Promise<SecurityDashboardResponse> {
  const response = await fetch('/api/control/v1/security/posture');
  const data = await response.json();
  
  // Validate response structure
  if (!data.deviceSecurity) {
    throw new Error('Invalid security posture response');
  }
  
  return data;
}

export function isControlHealthy(evidence: SecurityEvidence): boolean {
  return evidence.state === 'HEALTHY';
}

export function isControlUnhealthy(evidence: SecurityEvidence): boolean {
  return evidence.state === 'UNHEALTHY';
}

export function isControlUnknown(evidence: SecurityEvidence): boolean {
  return evidence.state === 'UNKNOWN';
}

// Helper to calculate effective security score
export function calculateEffectiveSecurityScore(summary: SecurityPostureSummary): number | null {
  const knownControls = summary.healthyControls + summary.unhealthyControls;
  
  // Don't calculate score if most controls unknown
  if (knownControls < summary.controlCount / 2) {
    return null;
  }
  
  return (summary.healthyControls / knownControls) * 100;
}
```

## Testing Checklist

### Visual Regression Tests

- [ ] HEALTHY state shows green indicator
- [ ] UNHEALTHY state shows red indicator
- [ ] UNKNOWN state shows gray/neutral indicator
- [ ] Never shows green for UNKNOWN state
- [ ] Evidence coverage displayed separately from health
- [ ] Stale evidence warnings shown

### Behavioral Tests

- [ ] Clicking UNKNOWN control shows reason details
- [ ] Configure button appears when coverage < 80%
- [ ] Cannot interpret UNKNOWN as healthy in any calculation
- [ ] Overall posture shows UNKNOWN when majority unknown
- [ ] Security score null/hidden when insufficient evidence

### Accessibility

- [ ] Screen readers announce three distinct states
- [ ] Color is not the only indicator (use icons)
- [ ] Keyboard navigation between control cards
- [ ] ARIA labels describe evidence state accurately

## Common Pitfalls

### ❌ Don't: Collapse UNKNOWN into Boolean

```typescript
// Wrong - loses the UNKNOWN state
const isSecure = evidence.state === 'HEALTHY';
```

### ✅ Do: Preserve Three States

```typescript
// Correct - maintains all three states
switch (evidence.state) {
  case 'HEALTHY': return 'secure';
  case 'UNHEALTHY': return 'insecure';
  case 'UNKNOWN': return 'unknown';
}
```

### ❌ Don't: Show High Security Score with Low Coverage

```typescript
// Wrong - misleading
const score = (healthyControls / totalControls) * 100;
// Shows 100% when only 1 control configured out of 10
```

### ✅ Do: Show Coverage Alongside Score

```typescript
// Correct - transparent about visibility
const knownControls = healthyControls + unhealthyControls;
const score = knownControls > 0 
  ? (healthyControls / knownControls) * 100
  : null;

// Display both:
// Security Score: 98% (among monitored controls)
// Evidence Coverage: 30% (only 3 of 10 controls monitored)
```

## Migration from Old Format

If your UI previously consumed boolean fields:

```typescript
// Old format (dangerous)
interface OldFormat {
  collectors: {
    secureBoot: boolean;
    ransomware: boolean;
    tamper: boolean;
  };
}

// Migration adapter
function migrateToEvidenceFormat(old: OldFormat): Partial<SecurityDashboardResponse> {
  // Note: Old booleans were lies - they didn't represent actual evidence
  // Map them conservatively to UNKNOWN
  return {
    deviceSecurity: {
      controls: {
        secureBoot: old.collectors.secureBoot
          ? unknownEvidence('NOT_CONFIGURED')  // Was always placeholder
          : unknownEvidence('NOT_CONFIGURED'),
        // ... similar for others
      },
    },
  };
}
```

## Summary

The key principle is: **never treat UNKNOWN as HEALTHY in the UI**.

- Use three distinct visual states
- Show evidence coverage separately
- Display freshness/staleness indicators
- Provide clear messaging for UNKNOWN reasons
- Make it obvious when security visibility is limited

This preserves the security-correctness fix from the backend and ensures the dashboard can be trusted.
