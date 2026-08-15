# UI Capability Exposure Pattern

## Problem

UI components were showing features with "coming soon" alerts even when backend functionality didn't exist. This creates a poor user experience:

```tsx
// ❌ BAD: Shows button, then alerts "coming soon"
<button onClick={() => alert("Export functionality coming soon")}>
  Export
</button>
```

## Solution

Query backend capability registry before showing features. Hide unavailable features entirely.

```tsx
// ✓ GOOD: Only shows button if feature is available
const { isAvailable } = useCapabilities();

{isAvailable('analytics.export.csv') && (
  <button onClick={exportCSV}>Export CSV</button>
)}
```

## Architecture

```
Backend Capability Registry
         ↓
    REST API /api/capabilities
         ↓
React Hook (useCapabilities)
         ↓
   UI Components
   (conditionally render features)
```

## Usage

### 1. Check Single Capability

```tsx
import { useCapability } from '@/hooks/useCapabilities';

function ExportButton() {
  const { available, partial, info } = useCapability('analytics.export.pdf');
  
  // Hide if completely unavailable
  if (!available && !partial) {
    return null;
  }
  
  // Show with warning if partial
  return (
    <div>
      <button onClick={exportPDF}>Export PDF</button>
      {partial && (
        <span className="warning">
          {info?.reason || 'Some features limited'}
        </span>
      )}
    </div>
  );
}
```

### 2. Check Multiple Capabilities

```tsx
import { useCapabilities } from '@/hooks/useCapabilities';

function FeaturePanel() {
  const { isAvailable, isPartial, getCapability } = useCapabilities();
  
  return (
    <div>
      {/* CSV export - fully available */}
      {isAvailable('analytics.export.csv') && (
        <button onClick={exportCSV}>Export CSV</button>
      )}
      
      {/* PDF export - partially available */}
      {isPartial('analytics.export.pdf') && (
        <button onClick={exportPDF}>
          Export PDF (Beta)
        </button>
      )}
      
      {/* Timeline - unavailable, don't show */}
      {isAvailable('video.timeline') && (
        <TimelineVisualization />
      )}
    </div>
  );
}
```

### 3. Show Capability Status

```tsx
function FeatureStatus() {
  const { capabilities } = useCapabilities();
  
  return (
    <div>
      {Object.entries(capabilities).map(([id, info]) => (
        <div key={id}>
          <strong>{info.name}</strong>
          <span className={`status-${info.state.toLowerCase()}`}>
            {info.state}
          </span>
          {info.reason && <p>{info.reason}</p>}
        </div>
      ))}
    </div>
  );
}
```

## Backend Capability Registry

### Adding New Capabilities

Edit `src/routes/capabilities.routes.ts`:

```typescript
this.register({
  id: 'feature.category.name',
  name: 'Display Name',
  state: 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE' | 'DISABLED',
  reason: 'Optional explanation',
  dependencies: ['other.capability'] // Optional
});
```

### Capability States

- **AVAILABLE**: Feature fully implemented and working
- **PARTIAL**: Feature partially working (some sub-features unavailable)
- **UNAVAILABLE**: Feature not implemented or service down
- **DISABLED**: Feature disabled by configuration/feature flag

### Dynamic Capability Updates

```typescript
import { capabilityRegistry } from '@/routes/capabilities.routes';

// Update state at runtime
capabilityRegistry.updateState(
  'recording.cloud',
  'AVAILABLE',
  'Cloud archive now connected'
);
```

## API Endpoints

### GET /api/capabilities

Get all capabilities:

```bash
curl http://localhost:3000/api/capabilities
```

Response:
```json
{
  "success": true,
  "capabilities": [
    {
      "id": "analytics.export.csv",
      "name": "CSV Export",
      "state": "AVAILABLE",
      "reason": "Fully implemented",
      "since": "2024-01-15T10:30:00Z"
    }
  ],
  "timestamp": "2024-01-15T12:00:00Z"
}
```

### GET /api/capabilities/:id

Get specific capability:

```bash
curl http://localhost:3000/api/capabilities/analytics.export.pdf
```

### GET /api/capabilities/state/:state

Get capabilities by state:

```bash
curl http://localhost:3000/api/capabilities/state/UNAVAILABLE
```

### POST /api/capabilities/check

Check multiple capabilities:

```bash
curl -X POST http://localhost:3000/api/capabilities/check \
  -H "Content-Type: application/json" \
  -d '{"capabilities": ["analytics.export.csv", "video.timeline"]}'
```

Response:
```json
{
  "success": true,
  "results": {
    "analytics.export.csv": true,
    "video.timeline": false
  },
  "details": {
    "analytics.export.csv": { "id": "...", "state": "AVAILABLE", ... },
    "video.timeline": { "id": "...", "state": "UNAVAILABLE", ... }
  }
}
```

## Migration Guide

### Before (Bad Pattern)

```tsx
function OldComponent() {
  const handleExport = () => {
    alert("Export functionality coming soon");
  };
  
  return <button onClick={handleExport}>Export</button>;
}
```

### After (Good Pattern)

```tsx
import { useCapability } from '@/hooks/useCapabilities';

function NewComponent() {
  const { available } = useCapability('analytics.export.csv');
  
  const handleExport = async () => {
    const response = await fetch('/api/export/csv');
    // ... actual implementation
  };
  
  // Hide button if feature unavailable
  if (!available) {
    return null;
  }
  
  return <button onClick={handleExport}>Export</button>;
}
```

## Common Patterns

### Progressive Enhancement

Show basic features, hide advanced ones:

```tsx
const { isAvailable } = useCapabilities();

<div>
  {/* Basic features always shown */}
  <BasicChart data={data} />
  
  {/* Advanced features conditionally shown */}
  {isAvailable('analytics.heatmap') && (
    <HeatmapOverlay data={data} />
  )}
  
  {isAvailable('analytics.predictions') && (
    <PredictiveChart data={data} />
  )}
</div>
```

### Feature Degradation

Show fallback when feature unavailable:

```tsx
const { isAvailable } = useCapabilities();

<div>
  {isAvailable('maps.live') ? (
    <LiveMapView />
  ) : (
    <StaticMapImage />
  )}
</div>
```

### Beta Badges

Mark partial features:

```tsx
const { isPartial } = useCapabilities();

<div>
  <h2>
    Advanced Analytics
    {isPartial('analytics.predictions') && (
      <span className="badge-beta">Beta</span>
    )}
  </h2>
</div>
```

## Testing

### Mock Capabilities in Tests

```tsx
import { render, screen } from '@testing-library/react';
import { useCapabilities } from '@/hooks/useCapabilities';

jest.mock('@/hooks/useCapabilities');

test('hides unavailable features', () => {
  (useCapabilities as jest.Mock).mockReturnValue({
    isAvailable: (id: string) => id !== 'video.timeline',
    isPartial: () => false,
    getCapability: () => undefined,
    capabilities: {},
    loading: false,
    error: null,
    refresh: jest.fn()
  });
  
  render(<VideoSearch />);
  
  // Timeline should not be in document
  expect(screen.queryByText('Timeline')).not.toBeInTheDocument();
});
```

## Best Practices

### ✓ DO

1. **Hide unavailable features completely**
   ```tsx
   {isAvailable('feature') && <Feature />}
   ```

2. **Check capabilities before API calls**
   ```tsx
   if (!isAvailable('export.pdf')) {
     alert('PDF export unavailable');
     return;
   }
   ```

3. **Show helpful messages for partial features**
   ```tsx
   {isPartial('feature') && (
     <Warning>{getCapability('feature')?.reason}</Warning>
   )}
   ```

4. **Use specific capability IDs**
   ```tsx
   isAvailable('analytics.export.csv') // Good
   ```

### ✗ DON'T

1. **Don't show features then alert "coming soon"**
   ```tsx
   // ❌ Bad
   <button onClick={() => alert('Coming soon')}>Export</button>
   ```

2. **Don't hardcode feature availability**
   ```tsx
   // ❌ Bad
   const EXPORT_AVAILABLE = true;
   ```

3. **Don't use generic capability IDs**
   ```tsx
   // ❌ Bad
   isAvailable('export') // Too generic
   ```

4. **Don't forget to handle loading state**
   ```tsx
   // ❌ Bad
   const { isAvailable } = useCapabilities();
   // Missing loading check, may show/hide incorrectly
   ```

## Troubleshooting

### Features not appearing

**Check:**
1. Is capability registered in backend registry?
2. Is API endpoint accessible?
3. Is hook loading state handled?
4. Are there console errors?

### Features appearing when they shouldn't

**Check:**
1. Is correct capability ID used?
2. Is state set correctly in registry?
3. Is useCapabilities hook called?

### Stale capability state

**Solution:** Call `refresh()` to update:
```tsx
const { refresh } = useCapabilities();

useEffect(() => {
  const interval = setInterval(refresh, 60000); // Refresh every minute
  return () => clearInterval(interval);
}, [refresh]);
```

## Future Enhancements

Planned improvements:
- WebSocket live capability updates
- Feature flag integration
- A/B testing support
- User-specific capability override
- Capability-based routing
- Automatic feature documentation generation
