# Zero-Touch Provisioning Component - Cleanup & Memory Management Guide

## Overview

This document describes all cleanup mechanisms and memory leak prevention strategies implemented in the Zero-Touch Provisioning component.

## Cleanup Mechanisms

### 1. Component Unmount Cleanup

The main `useEffect` hook in `ZeroTouchOnboardingView` handles cleanup when the component unmounts:

```typescript
useEffect(() => {
  fetchFleet();
  
  // Cleanup function executes on unmount
  return () => {
    // Abort ongoing HTTP requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Close SSE connections
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    // Clear polling intervals
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    
    // Cleanup analytics
    cleanupAnalytics();
  };
}, [fetchFleet]);
```

### 2. HTTP Request Abortion

**Implementation:** `AbortController` is used for all fetch requests

**Purpose:** Prevents memory leaks and race conditions from unmounted components

**Code Location:** `fetchFleet`, `handleCreateBranch`, `handleStartProvisioning`

**Example:**
```typescript
const abortControllerRef = useRef<AbortController | null>(null);

// Before each request, abort previous
if (abortControllerRef.current) {
  abortControllerRef.current.abort();
}

// Create new controller
abortControllerRef.current = new AbortController();

// Use in fetch
fetch(url, { signal: abortControllerRef.current.signal });
```

### 3. Server-Sent Events (SSE) Cleanup

**Implementation:** EventSource connections are properly closed

**Purpose:** Prevents hanging connections and memory leaks

**Code Location:** `startSSEConnection`, component unmount

**Cleanup Points:**
- Component unmount
- Modal close
- Job completion
- Connection error
- Watchdog timeout

**Example:**
```typescript
// Close existing connection before creating new
if (eventSourceRef.current) {
  eventSourceRef.current.close();
  eventSourceRef.current = null;
  setSseConnected(false);
}

// Close on completion
eventSource.close();
eventSourceRef.current = null;
```

### 4. Polling Interval Cleanup

**Implementation:** `setInterval` cleared when no longer needed

**Purpose:** Prevents CPU usage and memory leaks from orphaned intervals

**Code Location:** `startPolling`, component unmount

**Cleanup Points:**
- Job completion
- Component unmount
- SSE connection established
- Job cancelled

**Example:**
```typescript
if (pollingIntervalRef.current) {
  clearInterval(pollingIntervalRef.current);
  pollingIntervalRef.current = null;
}
```

### 5. Analytics Service Cleanup

**Implementation:** Analytics flush and cleanup on unmount

**Purpose:** Ensures all pending analytics are sent before unmount

**Code Location:** Analytics service, component unmount

**Features:**
- Final flush of queued events
- Clears flush interval
- Resets singleton instance

**Example:**
```typescript
cleanupAnalytics(); // In component cleanup
```

### 6. Timeout Cleanup

**Implementation:** All `setTimeout` calls are properly cleared

**Purpose:** Prevents memory leaks from pending timeouts

**Code Locations:**
- Copy notification timeout (2 seconds)
- Debounced search (300ms)
- Toast auto-dismiss

**Example:**
```typescript
useEffect(() => {
  const timer = setTimeout(() => {
    setDebouncedSearchQuery(searchQuery);
  }, 300);
  
  return () => clearTimeout(timer);
}, [searchQuery]);
```

### 7. Modal Cleanup

**Implementation:** State reset when modals close

**Purpose:** Prevents stale state and memory bloat

**Features:**
- Form fields reset
- Error states cleared
- Optimistic updates reverted on failure

**Example:**
```typescript
const handleCloseModal = () => {
  setNewBranchModalOpen(false);
  setFormErrors({});
  setNewBranchId("");
  setNewBranchName("");
  setNewBranchRegion("South Zone");
};
```

### 8. URL Object Cleanup

**Implementation:** `URL.revokeObjectURL()` after file downloads

**Purpose:** Frees memory from blob URLs

**Code Location:** `handleDownloadBatch`

**Example:**
```typescript
const url = URL.createObjectURL(blob);
// ... use url
URL.revokeObjectURL(url); // Always revoke
```

## Memory Leak Prevention Strategies

### 1. Ref-Based State for Cleanup

**Strategy:** Use refs for cleanup-related state instead of component state

**Benefit:** Refs don't cause re-renders and are accessible in cleanup functions

**Implementation:**
```typescript
const abortControllerRef = useRef<AbortController | null>(null);
const eventSourceRef = useRef<EventSource | null>(null);
const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
```

### 2. Dependency Arrays

**Strategy:** Proper dependency arrays in useEffect and useCallback

**Benefit:** Prevents stale closures and unnecessary effect runs

**Example:**
```typescript
const fetchFleet = useCallback(async () => {
  // ...
}, []); // Empty array - never recreates

useEffect(() => {
  // ...
}, [fetchFleet]); // Stable dependency
```

### 3. Conditional Effect Execution

**Strategy:** Guard effect execution with conditions

**Benefit:** Prevents effects from running when component is unmounting

**Example:**
```typescript
useEffect(() => {
  let mounted = true;
  
  async function load() {
    const data = await fetchData();
    if (mounted) {
      setState(data);
    }
  }
  
  load();
  
  return () => {
    mounted = false;
  };
}, []);
```

### 4. Memoization

**Strategy:** Use useMemo and React.memo to prevent unnecessary computations

**Benefit:** Reduces memory pressure and improves performance

**Implementation:**
- `filteredBranches` - useMemo
- `KPICard` - React.memo
- `BranchRow` - React.memo

### 5. Optimistic Update Rollback

**Strategy:** Store original state before optimistic updates

**Benefit:** Can restore state on error without memory leaks

**Example:**
```typescript
const originalDevices = [...discoveredDevices]; // Shallow copy
// ... perform update
// On error:
setDiscoveredDevices(originalDevices);
```

## Testing Cleanup

### Manual Testing Checklist

- [ ] Navigate to ZTP page and immediately navigate away - no console errors
- [ ] Start provisioning job and close modal - SSE connection closes
- [ ] Open/close modals multiple times - no memory increase
- [ ] Search with high frequency - no performance degradation
- [ ] Leave page open for extended time - no memory leaks

### Automated Tests

Run tests with:
```bash
npm test -- zero-touch-onboarding-view.test.tsx
```

### Memory Profiling

Use Chrome DevTools Memory Profiler:

1. Open DevTools → Memory tab
2. Take heap snapshot
3. Interact with component
4. Take another snapshot
5. Compare snapshots
6. Look for detached DOM nodes and orphaned event listeners

## Common Issues and Solutions

### Issue: SSE Connection Not Closing

**Symptom:** EventSource connections remain open after navigation

**Solution:** Ensure `eventSource.close()` is called in:
- Component unmount cleanup
- Modal close handlers
- Job completion callbacks

### Issue: Polling Continues After Unmount

**Symptom:** Console errors about setState on unmounted component

**Solution:** Clear intervals in cleanup:
```typescript
clearInterval(pollingIntervalRef.current);
pollingIntervalRef.current = null;
```

### Issue: Memory Growth Over Time

**Symptom:** Browser memory usage increases continuously

**Solution:** Check for:
- Unreleased blob URLs
- Event listeners not removed
- Unclosed SSE connections
- Intervals not cleared

## Best Practices

1. **Always pair creation with cleanup** - Every resource allocation should have corresponding cleanup
2. **Use refs for cleanup-critical state** - Don't rely on component state in cleanup functions
3. **Test unmounting scenarios** - Write tests that verify cleanup on unmount
4. **Monitor production** - Use analytics to track memory issues in production
5. **Profile regularly** - Regular memory profiling during development
6. **Document cleanup** - Comment why cleanup is needed for future developers

## Monitoring

### Analytics Events

The following analytics events help monitor cleanup effectiveness:

- `page_view` - Track component mounts
- `api_call_duration` - Monitor for hanging requests
- `error` with context `cleanup` - Track cleanup failures

### Error Tracking

Errors during cleanup are logged but don't disrupt user experience:

```typescript
try {
  // cleanup operation
} catch (err) {
  console.warn("Cleanup failed:", err);
  // Don't throw - silent fail for cleanup
}
```

## Conclusion

This component implements comprehensive cleanup mechanisms to prevent memory leaks and ensure optimal performance. All resources are properly released, and state is cleaned up when the component unmounts or when operations complete.

For questions or issues, refer to the inline comments in the source code or consult the development team.
