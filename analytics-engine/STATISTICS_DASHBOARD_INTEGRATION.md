# Dashboard Integration Guide - Analytics Statistics

Quick reference for frontend developers integrating the analytics statistics API.

## Quick Start

```typescript
// Fetch last 24 hours of statistics
const response = await fetch(
  `/v1/analytics/statistics?tenantId=${tenantId}`
);
const stats = await response.json();

console.log(`Total detections: ${stats.totalDetections}`);
console.log(`Average confidence: ${stats.averageConfidence}`);
console.log(`Alerts: ${stats.alerts}`);
```

## Common Use Cases

### 1. Real-Time Dashboard Overview

Display current 24-hour statistics with automatic refresh:

```typescript
async function fetchDashboardStats(tenantId: string) {
  const response = await fetch(
    `/v1/analytics/statistics?` +
    `tenantId=${tenantId}`
  );
  
  if (!response.ok) {
    throw new Error('Failed to fetch statistics');
  }
  
  return await response.json();
}

// Refresh every 30 seconds
const intervalId = setInterval(async () => {
  const stats = await fetchDashboardStats(tenantId);
  updateDashboard(stats);
}, 30000);
```

### 2. Custom Time Range Chart

Let users select a date range and view hourly statistics:

```typescript
async function fetchTimeRangeStats(
  tenantId: string,
  fromDate: Date,
  toDate: Date
) {
  const params = new URLSearchParams({
    tenantId,
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    bucket: 'hour',
    includeTimeline: 'true',
  });
  
  const response = await fetch(
    `/v1/analytics/statistics?${params}`
  );
  
  return await response.json();
}

// Usage
const stats = await fetchTimeRangeStats(
  tenantId,
  new Date('2026-08-10T00:00:00Z'),
  new Date('2026-08-11T00:00:00Z')
);

// Plot timeline
const chartData = stats.timeline.map(bucket => ({
  time: new Date(bucket.timestamp),
  detections: bucket.total,
  alerts: bucket.alerts,
}));
```

### 3. Detection Type Breakdown Pie Chart

```typescript
async function fetchTypeBreakdown(tenantId: string) {
  const response = await fetch(
    `/v1/analytics/statistics?tenantId=${tenantId}`
  );
  const stats = await response.json();
  
  // Convert byType to chart data
  const pieData = Object.entries(stats.byType).map(([type, data]) => ({
    name: type,
    value: data.count,
    confidence: data.averageConfidence,
  }));
  
  return pieData;
}

// Usage with Chart.js or similar
const typeData = await fetchTypeBreakdown(tenantId);
// [
//   { name: 'person', value: 9120, confidence: 0.91 },
//   { name: 'vehicle', value: 5944, confidence: 0.88 },
// ]
```

### 4. Camera Performance Comparison

```typescript
async function fetchCameraComparison(
  tenantId: string,
  fromDate: Date,
  toDate: Date
) {
  const params = new URLSearchParams({
    tenantId,
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    includeCameraBreakdown: 'true',
  });
  
  const response = await fetch(
    `/v1/analytics/statistics?${params}`
  );
  const stats = await response.json();
  
  // stats.topCameras is sorted by detection count
  return stats.topCameras;
}

// Usage
const topCameras = await fetchCameraComparison(
  tenantId,
  weekAgo,
  now
);
// [
//   { cameraId: 'cam-1', detections: 15420, alerts: 92 },
//   { cameraId: 'cam-2', detections: 12300, alerts: 45 },
//   ...
// ]
```

### 5. Alert Severity Heatmap

```typescript
async function fetchSeverityDistribution(tenantId: string) {
  const response = await fetch(
    `/v1/analytics/statistics?tenantId=${tenantId}`
  );
  const stats = await response.json();
  
  return {
    critical: stats.bySeverity.P1 || 0,
    high: stats.bySeverity.P2 || 0,
    medium: stats.bySeverity.P3 || 0,
    low: stats.bySeverity.P4 || 0,
    info: stats.bySeverity.P5 || 0,
  };
}
```

### 6. Multi-Type Filter

```typescript
async function fetchPersonAndVehicleStats(
  tenantId: string,
  cameraId?: string
) {
  const params = new URLSearchParams({
    tenantId,
    detectorType: 'person',
  });
  
  // Add multiple detector types
  params.append('detectorType', 'vehicle');
  
  if (cameraId) {
    params.append('cameraId', cameraId);
  }
  
  const response = await fetch(
    `/v1/analytics/statistics?${params}`
  );
  
  return await response.json();
}
```

## TypeScript Interfaces

```typescript
interface AnalyticsStatistics {
  range: {
    from: string;
    to: string;
    bucket: 'minute' | 'hour' | 'day' | 'week';
  };
  
  totalDetections: number;
  averageConfidence: number | null;
  alerts: number;
  
  byType: Record<string, {
    count: number;
    averageConfidence: number | null;
    alerts: number;
  }>;
  
  bySeverity: Record<string, number>;
  
  timeline: Array<{
    timestamp: string;
    total: number;
    alerts: number;
    averageConfidence: number | null;
    byType: Record<string, number>;
  }>;
  
  topCameras?: Array<{
    cameraId: string;
    detections: number;
    alerts: number;
  }>;
  
  topBranches?: Array<{
    branchId: string;
    detections: number;
    alerts: number;
  }>;
  
  meta: {
    generatedAt: string;
    source: 'raw' | 'rollup';
    cached: boolean;
  };
}
```

## React Hook Example

```typescript
import { useEffect, useState } from 'react';

interface UseStatisticsOptions {
  tenantId: string;
  from?: Date;
  to?: Date;
  bucket?: 'minute' | 'hour' | 'day' | 'week';
  detectorTypes?: string[];
  cameraId?: string;
  refreshInterval?: number; // milliseconds
}

function useAnalyticsStatistics(options: UseStatisticsOptions) {
  const [data, setData] = useState<AnalyticsStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    let isMounted = true;
    
    async function fetchStats() {
      try {
        setLoading(true);
        
        const params = new URLSearchParams({
          tenantId: options.tenantId,
        });
        
        if (options.from) {
          params.append('from', options.from.toISOString());
        }
        if (options.to) {
          params.append('to', options.to.toISOString());
        }
        if (options.bucket) {
          params.append('bucket', options.bucket);
        }
        if (options.cameraId) {
          params.append('cameraId', options.cameraId);
        }
        if (options.detectorTypes) {
          options.detectorTypes.forEach(type => {
            params.append('detectorType', type);
          });
        }
        
        const response = await fetch(
          `/v1/analytics/statistics?${params}`
        );
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const stats = await response.json();
        
        if (isMounted) {
          setData(stats);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    
    fetchStats();
    
    // Set up refresh interval if specified
    const intervalId = options.refreshInterval
      ? setInterval(fetchStats, options.refreshInterval)
      : null;
    
    return () => {
      isMounted = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [
    options.tenantId,
    options.from,
    options.to,
    options.bucket,
    options.cameraId,
    options.detectorTypes?.join(','),
    options.refreshInterval,
  ]);
  
  return { data, loading, error };
}

// Usage in component
function DashboardOverview({ tenantId }: { tenantId: string }) {
  const { data, loading, error } = useAnalyticsStatistics({
    tenantId,
    refreshInterval: 30000, // Refresh every 30 seconds
  });
  
  if (loading) return <Spinner />;
  if (error) return <ErrorAlert error={error} />;
  if (!data) return null;
  
  return (
    <div>
      <StatCard
        title="Total Detections"
        value={data.totalDetections}
      />
      <StatCard
        title="Alerts"
        value={data.alerts}
      />
      <StatCard
        title="Avg Confidence"
        value={
          data.averageConfidence
            ? `${(data.averageConfidence * 100).toFixed(1)}%`
            : 'N/A'
        }
      />
      <TimelineChart data={data.timeline} />
      <TypeBreakdownPie data={data.byType} />
    </div>
  );
}
```

## Error Handling

```typescript
async function fetchStatisticsWithErrorHandling(tenantId: string) {
  try {
    const response = await fetch(
      `/v1/analytics/statistics?tenantId=${tenantId}`
    );
    
    if (!response.ok) {
      const errorData = await response.json();
      
      if (response.status === 400) {
        // Validation error
        console.error('Invalid request:', errorData.message);
        return null;
      }
      
      if (response.status === 503) {
        // Service unavailable
        console.error('Statistics service unavailable:', errorData.message);
        return null;
      }
      
      throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch statistics:', error);
    return null;
  }
}
```

## Chart Library Examples

### Chart.js Line Chart

```typescript
import { Line } from 'react-chartjs-2';

function TimelineChart({ stats }: { stats: AnalyticsStatistics }) {
  const chartData = {
    labels: stats.timeline.map(b => 
      new Date(b.timestamp).toLocaleTimeString()
    ),
    datasets: [
      {
        label: 'Total Detections',
        data: stats.timeline.map(b => b.total),
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1,
      },
      {
        label: 'Alerts',
        data: stats.timeline.map(b => b.alerts),
        borderColor: 'rgb(255, 99, 132)',
        tension: 0.1,
      },
    ],
  };
  
  return <Line data={chartData} />;
}
```

### Recharts Area Chart

```typescript
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

function DetectionTimeline({ stats }: { stats: AnalyticsStatistics }) {
  const data = stats.timeline.map(bucket => ({
    time: new Date(bucket.timestamp).toLocaleTimeString(),
    detections: bucket.total,
    alerts: bucket.alerts,
  }));
  
  return (
    <AreaChart width={800} height={400} data={data}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="time" />
      <YAxis />
      <Tooltip />
      <Area
        type="monotone"
        dataKey="detections"
        stackId="1"
        stroke="#8884d8"
        fill="#8884d8"
      />
      <Area
        type="monotone"
        dataKey="alerts"
        stackId="1"
        stroke="#82ca9d"
        fill="#82ca9d"
      />
    </AreaChart>
  );
}
```

## Performance Tips

1. **Use appropriate time ranges**: Don't query years of data for a live dashboard
2. **Cache results**: Store recent queries in component state or global store
3. **Debounce user input**: When users change date pickers, debounce API calls
4. **Show loading states**: Always display loading indicators during fetch
5. **Handle empty states**: Design for zero-detection scenarios
6. **Respect rate limits**: Don't poll more frequently than every 15-30 seconds

## Example Dashboard Layout

```typescript
function AnalyticsDashboard({ tenantId }: { tenantId: string }) {
  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 24 * 60 * 60 * 1000),
    to: new Date(),
  });
  
  const { data, loading } = useAnalyticsStatistics({
    tenantId,
    from: dateRange.from,
    to: dateRange.to,
    refreshInterval: 30000,
  });
  
  if (loading) return <DashboardSkeleton />;
  if (!data) return <EmptyState />;
  
  return (
    <div className="dashboard">
      <DateRangePicker
        from={dateRange.from}
        to={dateRange.to}
        onChange={setDateRange}
      />
      
      <div className="stats-grid">
        <StatCard
          title="Total Detections"
          value={data.totalDetections}
          icon={<EyeIcon />}
        />
        <StatCard
          title="Active Alerts"
          value={data.alerts}
          icon={<AlertIcon />}
          variant="warning"
        />
        <StatCard
          title="Avg Confidence"
          value={formatConfidence(data.averageConfidence)}
          icon={<ChartIcon />}
        />
      </div>
      
      <div className="charts-grid">
        <Card title="Detection Timeline">
          <TimelineChart data={data.timeline} />
        </Card>
        
        <Card title="Detection Types">
          <TypeBreakdownPie data={data.byType} />
        </Card>
        
        <Card title="Severity Distribution">
          <SeverityBarChart data={data.bySeverity} />
        </Card>
      </div>
    </div>
  );
}
```

## Testing

```typescript
// Mock for testing
const mockStatistics: AnalyticsStatistics = {
  range: {
    from: '2026-08-10T00:00:00.000Z',
    to: '2026-08-11T00:00:00.000Z',
    bucket: 'hour',
  },
  totalDetections: 18342,
  averageConfidence: 0.873,
  alerts: 173,
  byType: {
    person: { count: 9120, averageConfidence: 0.91, alerts: 51 },
    vehicle: { count: 5944, averageConfidence: 0.88, alerts: 20 },
  },
  bySeverity: {
    P1: 47,
    P2: 326,
    P3: 907,
  },
  timeline: [
    {
      timestamp: '2026-08-10T00:00:00.000Z',
      total: 742,
      alerts: 8,
      averageConfidence: 0.86,
      byType: { person: 420, vehicle: 280 },
    },
  ],
  meta: {
    generatedAt: '2026-08-11T10:18:00.000Z',
    source: 'raw',
    cached: false,
  },
};

// Use in Storybook or tests
export const DashboardStory = {
  render: () => (
    <DashboardOverview
      tenantId="test-tenant"
      mockData={mockStatistics}
    />
  ),
};
```

## Questions?

See `STATISTICS_API.md` for complete API reference and `STATISTICS_IMPLEMENTATION_COMPLETE.md` for architecture details.
