# Cross-Branch Alerts Integration Examples

## Frontend Integration Guide

This guide shows how to integrate the new cross-branch alert visibility feature in your dashboard and mobile applications.

## 1. Dashboard Integration (React/TypeScript)

### Step 1: Update API Client

```typescript
// lib/api-client.ts

export const api = {
  // ... existing methods

  /**
   * Get alerts with optional multi-branch filtering
   */
  getAlerts: (filters?: {
    tenantId?: string;
    branchId?: string;        // Single branch (legacy)
    branchIds?: string[];     // Multiple branches (new)
    alertType?: string;
    severity?: string;
    status?: string;
  }) => {
    const params = new URLSearchParams();
    
    if (filters?.tenantId) params.append('tenantId', filters.tenantId);
    if (filters?.branchId) params.append('branchId', filters.branchId);
    
    // Multi-branch support
    if (filters?.branchIds && filters.branchIds.length > 0) {
      params.append('branchIds', filters.branchIds.join(','));
    }
    
    if (filters?.alertType) params.append('alertType', filters.alertType);
    if (filters?.severity) params.append('severity', filters.severity);
    if (filters?.status) params.append('status', filters.status);
    
    return fetchApi<{
      success: boolean;
      count: number;
      data: Alert[];
    }>(`/v1/ai/alerts?${params}`);
  },
};
```

### Step 2: Create Alert Hook with Branch Scope

```typescript
// hooks/useAlerts.ts

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';

export function useAlerts(filters?: {
  severity?: string;
  status?: string;
  alertType?: string;
}) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['alerts', user?.branchScope, filters],
    queryFn: async () => {
      // Determine which branches the user can access
      const branchIds = getUserAccessibleBranches(user);
      
      const response = await api.getAlerts({
        tenantId: user?.tenantId,
        branchIds, // Pass all accessible branches
        ...filters,
      });
      
      return response.data;
    },
    enabled: !!user,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

/**
 * Helper to determine which branches a user can access
 */
function getUserAccessibleBranches(user: User | null): string[] {
  if (!user) return [];
  
  // Super admin and tenant admin see all branches
  if (user.role === 'SUPER_ADMIN' || user.role === 'TENANT_ADMIN') {
    return []; // Empty array means "all branches" at API level
  }
  
  // Users with explicit branch scope
  if (user.branchScope && user.branchScope.length > 0) {
    // Filter out special markers like "ALL"
    return user.branchScope.filter(id => 
      id !== 'ALL' && id !== '*' && /^[a-f0-9-]+$/i.test(id)
    );
  }
  
  // Fallback to user's primary branch
  if (user.branchId) {
    return [user.branchId];
  }
  
  return [];
}
```

### Step 3: Use in Alert Dashboard Component

```typescript
// components/alerts/AlertsDashboard.tsx

import React from 'react';
import { useAlerts } from '@/hooks/useAlerts';
import { AlertCard } from './AlertCard';

export function AlertsDashboard() {
  const [selectedSeverity, setSelectedSeverity] = React.useState<string>();
  const [selectedStatus, setSelectedStatus] = React.useState('active');
  
  const { data: alerts, isLoading, error } = useAlerts({
    severity: selectedSeverity,
    status: selectedStatus,
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;

  // Group alerts by branch for better organization
  const alertsByBranch = React.useMemo(() => {
    const grouped = new Map<string, Alert[]>();
    
    alerts?.forEach(alert => {
      const branchId = alert.branchId;
      if (!grouped.has(branchId)) {
        grouped.set(branchId, []);
      }
      grouped.get(branchId)!.push(alert);
    });
    
    return grouped;
  }, [alerts]);

  return (
    <div className="alerts-dashboard">
      <div className="filters">
        <SeverityFilter value={selectedSeverity} onChange={setSelectedSeverity} />
        <StatusFilter value={selectedStatus} onChange={setSelectedStatus} />
      </div>

      {/* Display alerts grouped by branch */}
      {Array.from(alertsByBranch.entries()).map(([branchId, branchAlerts]) => (
        <div key={branchId} className="branch-section">
          <h3>{branchAlerts[0]?.branchName || branchId}</h3>
          <div className="alerts-grid">
            {branchAlerts.map(alert => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </div>
        </div>
      ))}

      {alerts?.length === 0 && (
        <div className="no-alerts">
          <p>No alerts found matching your filters</p>
        </div>
      )}
    </div>
  );
}
```

## 2. Role-Based Alert Views

### Regional Manager View

```typescript
// pages/regional-dashboard/alerts.tsx

export function RegionalAlertsPage() {
  const { user } = useAuth();
  const { data: regionBranches } = useQuery({
    queryKey: ['region-branches', user?.regionId],
    queryFn: () => api.getRegionBranches(user?.regionId),
  });

  const branchIds = regionBranches?.map(b => b.id) ?? [];

  const { data: alerts } = useQuery({
    queryKey: ['regional-alerts', branchIds],
    queryFn: () => api.getAlerts({ branchIds }),
    enabled: branchIds.length > 0,
  });

  return (
    <div>
      <h1>Regional Alerts Dashboard</h1>
      <p>Viewing alerts from {regionBranches?.length} branches</p>
      
      <AlertStatistics alerts={alerts} />
      <AlertsList alerts={alerts} groupBy="branch" />
    </div>
  );
}
```

### Zone Manager View

```typescript
// pages/zone-dashboard/alerts.tsx

export function ZoneAlertsPage() {
  const { user } = useAuth();
  const { data: zoneBranches } = useQuery({
    queryKey: ['zone-branches', user?.zoneId],
    queryFn: () => api.getZoneBranches(user?.zoneId),
  });

  const branchIds = zoneBranches?.map(b => b.id) ?? [];

  const { data: alerts } = useQuery({
    queryKey: ['zone-alerts', branchIds],
    queryFn: () => api.getAlerts({ branchIds }),
    enabled: branchIds.length > 0,
  });

  return (
    <div>
      <h1>Zone Alerts Dashboard</h1>
      <p>Viewing alerts from {zoneBranches?.length} branches in your zone</p>
      
      <AlertHeatMap alerts={alerts} branches={zoneBranches} />
      <CriticalAlertsList alerts={alerts?.filter(a => a.severity === 'P1')} />
    </div>
  );
}
```

## 3. Mobile App Integration (React Native)

```typescript
// services/alerts.service.ts

import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useAuth } from './auth';

export function useMobileAlerts() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['mobile-alerts', user?.id],
    queryFn: async () => {
      // Get user's accessible branches
      const branchIds = user?.branchScope?.filter(
        id => id !== 'ALL' && id !== '*'
      ) ?? [];
      
      const response = await api.get('/v1/ai/alerts', {
        params: {
          branchIds: branchIds.join(','),
          status: 'active',
          limit: 50,
        },
      });
      
      return response.data.data;
    },
    refetchInterval: 15000, // More frequent updates for mobile
  });
}
```

```typescript
// screens/AlertsScreen.tsx

import React from 'react';
import { FlatList, View, Text } from 'react-native';
import { useMobileAlerts } from '@/services/alerts.service';
import { AlertItem } from '@/components/AlertItem';

export function AlertsScreen() {
  const { data: alerts, isLoading, refetch } = useMobileAlerts();
  
  const criticalAlerts = alerts?.filter(a => 
    a.severity === 'P1' || a.severity === 'P2'
  );

  return (
    <View style={styles.container}>
      {criticalAlerts && criticalAlerts.length > 0 && (
        <View style={styles.criticalSection}>
          <Text style={styles.criticalTitle}>
            🚨 {criticalAlerts.length} Critical Alerts
          </Text>
        </View>
      )}
      
      <FlatList
        data={alerts}
        renderItem={({ item }) => <AlertItem alert={item} />}
        keyExtractor={item => item.id}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text>No active alerts</Text>
          </View>
        }
      />
    </View>
  );
}
```

## 4. Real-Time Updates with WebSocket

```typescript
// hooks/useRealtimeAlerts.ts

import React from 'react';
import { useAlerts } from './useAlerts';
import { useWebSocket } from './useWebSocket';
import { useAuth } from './useAuth';

export function useRealtimeAlerts() {
  const { user } = useAuth();
  const { data: alerts, refetch } = useAlerts({ status: 'active' });
  
  // Subscribe to alert updates via WebSocket
  useWebSocket({
    channel: 'alerts',
    filter: {
      tenantId: user?.tenantId,
      branchIds: user?.branchScope,
    },
    onMessage: (message) => {
      if (message.type === 'alert.created' || message.type === 'alert.updated') {
        // Refetch alerts when changes occur
        refetch();
        
        // Show notification for critical alerts
        if (message.data.severity === 'P1') {
          showNotification({
            title: 'Critical Alert',
            message: message.data.title,
            severity: 'critical',
          });
        }
      }
    },
  });

  return alerts;
}
```

## 5. Advanced Filtering & Search

```typescript
// components/alerts/AlertsFilterPanel.tsx

export function AlertsFilterPanel() {
  const { user } = useAuth();
  const [filters, setFilters] = React.useState({
    branchIds: [] as string[],
    severity: undefined as string | undefined,
    status: 'active' as string,
    alertType: undefined as string | undefined,
  });

  const { data: branches } = useQuery({
    queryKey: ['accessible-branches', user?.id],
    queryFn: () => api.getUserBranches(user?.id),
  });

  const { data: alerts } = useQuery({
    queryKey: ['filtered-alerts', filters],
    queryFn: () => api.getAlerts(filters),
  });

  return (
    <div className="filter-panel">
      {/* Multi-select for branches */}
      <MultiSelect
        label="Branches"
        options={branches?.map(b => ({
          value: b.id,
          label: b.name,
        })) ?? []}
        value={filters.branchIds}
        onChange={(branchIds) => setFilters({ ...filters, branchIds })}
        placeholder="All branches"
      />

      {/* Severity filter */}
      <Select
        label="Severity"
        options={[
          { value: 'P1', label: 'Critical (P1)' },
          { value: 'P2', label: 'High (P2)' },
          { value: 'P3', label: 'Medium (P3)' },
          { value: 'P4', label: 'Low (P4)' },
          { value: 'P5', label: 'Info (P5)' },
        ]}
        value={filters.severity}
        onChange={(severity) => setFilters({ ...filters, severity })}
        placeholder="All severities"
      />

      {/* Status filter */}
      <Select
        label="Status"
        options={[
          { value: 'active', label: 'Active' },
          { value: 'acknowledged', label: 'Acknowledged' },
          { value: 'investigating', label: 'Investigating' },
          { value: 'resolved', label: 'Resolved' },
          { value: 'false_alarm', label: 'False Alarm' },
        ]}
        value={filters.status}
        onChange={(status) => setFilters({ ...filters, status })}
      />

      {/* Alert type filter */}
      <Select
        label="Alert Type"
        options={[
          { value: 'INTRUSION', label: 'Intrusion' },
          { value: 'VIOLENCE', label: 'Violence' },
          { value: 'FIRE', label: 'Fire' },
          { value: 'WEAPON', label: 'Weapon Detection' },
          { value: 'PPE_VIOLATION', label: 'PPE Violation' },
          { value: 'TAILGATING', label: 'Tailgating' },
        ]}
        value={filters.alertType}
        onChange={(alertType) => setFilters({ ...filters, alertType })}
        placeholder="All types"
      />

      <Button onClick={() => setFilters({
        branchIds: [],
        severity: undefined,
        status: 'active',
        alertType: undefined,
      })}>
        Reset Filters
      </Button>
    </div>
  );
}
```

## 6. Performance Optimization

### Pagination Support

```typescript
// hooks/useInfiniteAlerts.ts

import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';

export function useInfiniteAlerts(filters?: {
  severity?: string;
  status?: string;
}) {
  const { user } = useAuth();
  const branchIds = user?.branchScope ?? [];

  return useInfiniteQuery({
    queryKey: ['alerts-infinite', branchIds, filters],
    queryFn: async ({ pageParam = 0 }) => {
      const response = await api.getAlerts({
        branchIds,
        ...filters,
        offset: pageParam,
        limit: 20,
      });
      return response.data;
    },
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === 20 ? allPages.length * 20 : undefined;
    },
  });
}
```

### Memoization & Caching

```typescript
// utils/alertCache.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AlertCache {
  alerts: Map<string, Alert>;
  lastFetch: number;
  addAlerts: (alerts: Alert[]) => void;
  getAlert: (id: string) => Alert | undefined;
  clear: () => void;
}

export const useAlertCache = create<AlertCache>()(
  persist(
    (set, get) => ({
      alerts: new Map(),
      lastFetch: 0,
      
      addAlerts: (alerts) => set((state) => {
        const newAlerts = new Map(state.alerts);
        alerts.forEach(alert => newAlerts.set(alert.id, alert));
        return { alerts: newAlerts, lastFetch: Date.now() };
      }),
      
      getAlert: (id) => get().alerts.get(id),
      
      clear: () => set({ alerts: new Map(), lastFetch: 0 }),
    }),
    {
      name: 'alert-cache',
      // Only cache for 5 minutes
      partialize: (state) => ({
        alerts: Array.from(state.alerts.entries()),
        lastFetch: state.lastFetch,
      }),
    }
  )
);
```

## 7. Testing

```typescript
// __tests__/useAlerts.test.ts

import { renderHook, waitFor } from '@testing-library/react';
import { useAlerts } from '../useAlerts';
import { api } from '@/lib/api-client';

jest.mock('@/lib/api-client');
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
      tenantId: 'tenant-1',
      branchScope: ['branch-1', 'branch-2', 'branch-3'],
      role: 'REGION_MANAGER',
    },
  }),
}));

describe('useAlerts', () => {
  it('should fetch alerts from multiple branches', async () => {
    const mockAlerts = [
      { id: 'alert-1', branchId: 'branch-1', severity: 'P1' },
      { id: 'alert-2', branchId: 'branch-2', severity: 'P2' },
      { id: 'alert-3', branchId: 'branch-3', severity: 'P1' },
    ];

    (api.getAlerts as jest.Mock).mockResolvedValue({
      data: mockAlerts,
    });

    const { result } = renderHook(() => useAlerts());

    await waitFor(() => {
      expect(result.current.data).toEqual(mockAlerts);
    });

    expect(api.getAlerts).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      branchIds: ['branch-1', 'branch-2', 'branch-3'],
    });
  });

  it('should filter by severity', async () => {
    const mockAlerts = [
      { id: 'alert-1', branchId: 'branch-1', severity: 'P1' },
    ];

    (api.getAlerts as jest.Mock).mockResolvedValue({
      data: mockAlerts,
    });

    const { result } = renderHook(() => useAlerts({ severity: 'P1' }));

    await waitFor(() => {
      expect(result.current.data).toEqual(mockAlerts);
    });

    expect(api.getAlerts).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      branchIds: ['branch-1', 'branch-2', 'branch-3'],
      severity: 'P1',
    });
  });
});
```

## Summary

The cross-branch alert visibility feature enables:

1. **Multi-branch queries**: Users can see alerts from all branches they have access to
2. **Role-based views**: Different roles see different alert scopes
3. **Efficient querying**: Database-level filtering using PostgreSQL arrays
4. **Backward compatibility**: Existing single-branch queries still work
5. **Performance**: Proper indexing and pagination support
6. **Security**: ABAC enforcement ensures users only see authorized alerts

For more details, see:
- [ALERT_VISIBILITY_CROSS_BRANCH.md](../../ALERT_VISIBILITY_CROSS_BRANCH.md)
- API documentation: `/docs/api/alerts.md`
- Security documentation: `/src/security/abac/README.md`
