# Security Posture Dashboard Components

Enhanced React components for displaying security telemetry with availability states, quality metrics, evidence for investigation, and collector health monitoring.

## Components

### SecurityPostureDashboard

Main dashboard component that displays comprehensive security telemetry across all domains.

**Features:**
- Overall security score with confidence level
- Tabbed interface (Overview / Collector Health)
- Category sections: Encryption, TLS, Certificates, Platform Integrity, Threats, Secrets
- Toggle to show/hide evidence
- Auto-refresh every 60 seconds
- Error handling and loading states

**Usage:**
```tsx
import { SecurityPostureDashboard } from '@/components/security-posture';

function App() {
  return <SecurityPostureDashboard />;
}
```

### TelemetryMetricCard

Individual metric card that displays a security telemetry metric with availability state and quality indicators.

**Features:**
- Availability badges (Current/Stale/Unavailable/Not Configured/Unsupported)
- Color-coded values based on metric health
- Confidence percentage display
- Source information
- Timestamp
- Expandable evidence section
- Error messages for unavailable metrics

**Props:**
```typescript
interface TelemetryMetricCardProps {
  metric: SecurityTelemetryMetric;
  showEvidence?: boolean;
}
```

**Availability States:**
- **Current** (green) - Data is fresh and available
- **Stale** (yellow) - Data is available but not current
- **Unavailable** (gray) - Collection failed (network/timeout/auth)
- **Not Configured** (gray) - Collector not yet configured
- **Unsupported** (gray) - Feature not supported by device

**Usage:**
```tsx
import { TelemetryMetricCard } from '@/components/security-posture';

<TelemetryMetricCard 
  metric={telemetry.tls.tlsVersion} 
  showEvidence={true} 
/>
```

### CollectorHealthPanel

Displays the health status of all security posture collectors with circuit breaker states.

**Features:**
- Overall health status (Healthy/Degraded/Failed)
- Summary statistics (total/healthy/degraded/failed counts)
- Individual collector cards showing:
  - Status with icon
  - Last run and last success timestamps
  - Failures in last 24 hours
  - Average collection duration
  - Error messages (if any)
  - Reset button for failed/degraded collectors
- Auto-refresh every 30 seconds
- Circuit breaker state indicators

**Usage:**
```tsx
import { CollectorHealthPanel } from '@/components/security-posture';

<CollectorHealthPanel />
```

## Type Definitions

### SecurityTelemetryMetric

```typescript
interface SecurityTelemetryMetric {
  name: string;
  value: number;
  unit: string;
  source: string;
  timestamp: Date;
  freshness: 'current' | 'stale' | 'unknown';
  available: boolean;
  confidence: number; // 0-1
  metadata?: Record<string, any>;
  errorMessage?: string;
}
```

### CollectorHealth

```typescript
interface CollectorHealth {
  collectorId: string;
  status: 'healthy' | 'degraded' | 'failed';
  lastRunAt?: string;
  lastSuccessAt?: string;
  failures24h: number;
  averageDurationMs?: number;
  error?: string;
}
```

## Styling

Components use Tailwind CSS classes and follow a consistent design system:

**Colors:**
- Green: Healthy/Passing (90-100)
- Yellow: Warning (70-89)
- Orange: Degraded (50-69)
- Red: Critical (<50)
- Gray: Unavailable/Not Configured

**Status Badges:**
- Rounded pills with colored backgrounds
- Clear status text
- Icons for quick visual identification

## API Integration

Components fetch data from these endpoints:

**Telemetry:**
- `POST /api/security-posture/telemetry` - Get security telemetry

**Health:**
- `GET /api/security-posture/health` - Get all collector health
- `GET /api/security-posture/health/:collectorId` - Get specific collector
- `POST /api/security-posture/health/:collectorId/reset` - Reset collector health

## Evidence Display

When `showEvidence` is enabled, metric cards display an expandable evidence section showing the raw metadata from the collector. This is useful for:

- Debugging collection issues
- Investigating security findings
- Understanding data sources
- Audit trails

Example evidence:
```json
{
  "endpoint": "10.20.30.41:443",
  "observedProtocol": "TLSv1.2",
  "certificateFingerprint": "32:44:...",
  "scanId": "tls-scan-6ca2"
}
```

## Error Handling

Components handle various error states:

1. **Network Errors** - Display error message with retry button
2. **Loading States** - Show skeleton loaders
3. **Empty States** - Clear messaging when no data available
4. **Partial Failures** - Show available data, mark unavailable sections

## Accessibility

- Semantic HTML structure
- ARIA labels for status indicators
- Keyboard navigation support
- Color is not the only indicator (icons + text)
- Screen reader friendly

## Performance

- Auto-refresh intervals configurable
- Debounced API calls
- Lazy loading for evidence sections
- Efficient re-rendering with React keys
- Cleanup on component unmount

## Customization

### Changing Refresh Intervals

```tsx
// In SecurityPostureDashboard.tsx
const interval = setInterval(fetchTelemetry, 30000); // 30 seconds

// In CollectorHealthPanel.tsx
const interval = setInterval(fetchHealth, 15000); // 15 seconds
```

### Custom Color Thresholds

```tsx
const getValueColor = () => {
  if (metric.value >= 95) return 'text-green-600';  // Excellent
  if (metric.value >= 85) return 'text-yellow-600'; // Good
  if (metric.value >= 70) return 'text-orange-600'; // Fair
  return 'text-red-600';                            // Poor
};
```

### Additional Metric Categories

To add a new category section:

```tsx
<section>
  <h2 className="text-xl font-semibold text-gray-900 mb-4">
    New Category
  </h2>
  <div className="grid grid-cols-3 gap-4">
    <TelemetryMetricCard 
      metric={telemetry.newCategory.metric1} 
      showEvidence={showEvidence} 
    />
  </div>
</section>
```

## Testing

### Component Testing

```tsx
import { render, screen } from '@testing-library/react';
import { TelemetryMetricCard } from './TelemetryMetricCard';

test('displays available metric', () => {
  const metric = {
    name: 'TLS Version',
    value: 95,
    unit: 'percentage',
    source: 'tls-scanner',
    timestamp: new Date(),
    freshness: 'current',
    available: true,
    confidence: 1.0,
  };
  
  render(<TelemetryMetricCard metric={metric} />);
  expect(screen.getByText('TLS Version')).toBeInTheDocument();
  expect(screen.getByText('95')).toBeInTheDocument();
  expect(screen.getByText('Current')).toBeInTheDocument();
});
```

## Troubleshooting

### Metrics showing as "Unavailable"

Check:
1. Backend adapters are properly configured
2. Network connectivity to collection endpoints
3. Collector health status in the Health tab
4. Circuit breaker not in OPEN state

### Evidence not displaying

Verify:
1. `showEvidence` prop is true
2. Metric has `metadata` field populated
3. No console errors from JSON parsing

### Slow performance

Consider:
1. Increasing refresh intervals
2. Reducing number of visible metrics
3. Implementing pagination for large datasets
4. Using React.memo for optimization
