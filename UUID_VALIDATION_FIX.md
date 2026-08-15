# UUID Validation Fix - "invalid input syntax for type uuid: ''"

## Problem
The ANPR watchlist page was displaying an error: **"invalid input syntax for type uuid: ''"**

This error occurred when PostgreSQL received an empty string (`""`) for UUID query parameters instead of either a valid UUID or no value at all.

## Root Cause
The issue occurred in multiple locations:

1. **Backend API Routes** (`src/routes/analytics-phase2.routes.ts`):
   - UUID query parameter validation was checking `if (query.watchlistId)` 
   - This condition evaluates to `true` for empty strings, causing the empty string to be passed to PostgreSQL
   - PostgreSQL cannot cast an empty string to UUID type, resulting in the error

2. **Frontend API Client** (`dashboard/lib/api-client.ts`):
   - Similar issue where empty string values weren't being filtered before building query parameters

## Solution Applied

### Backend Changes (`src/routes/analytics-phase2.routes.ts`)

Added `.trim() !== ""` validation to all UUID query parameters:

**Face Recognition Events:**
```typescript
if (query.watchlistId && query.watchlistId.trim() !== "") {
  conditions.push(`fe.watchlist_id = $${paramIndex++}`);
  params.push(query.watchlistId);
}
if (query.personId && query.personId.trim() !== "") {
  conditions.push(`fe.person_id = $${paramIndex++}`);
  params.push(query.personId);
}
```

**ANPR Events:**
```typescript
if (query.cameraId && query.cameraId.trim() !== "") {
  conditions.push(`ae.camera_id = $${paramIndex++}`);
  params.push(query.cameraId);
}
if (query.watchlistId && query.watchlistId.trim() !== "") {
  conditions.push(`ae.watchlist_id = $${paramIndex++}`);
  params.push(query.watchlistId);
}
```

**Behavior Events:**
```typescript
if (query.cameraId && query.cameraId.trim() !== "") {
  conditions.push(`be.camera_id = $${paramIndex++}`);
  params.push(query.cameraId);
}
```

### Frontend Changes (`dashboard/lib/api-client.ts`)

Added `.trim() !== ""` validation before setting query parameters:

**Face Events:**
```typescript
listFaceEvents: (filters?: { watchlistId?: string; minSimilarity?: number; limit?: number }) => {
  const params = new URLSearchParams();
  if (filters?.watchlistId && filters.watchlistId.trim() !== "") params.set('watchlistId', filters.watchlistId);
  // ...
}
```

**ANPR Events:**
```typescript
listAnprEvents: (filters?: { watchlistId?: string; plateNumber?: string; limit?: number }) => {
  const params = new URLSearchParams();
  if (filters?.watchlistId && filters.watchlistId.trim() !== "") params.set('watchlistId', filters.watchlistId);
  if (filters?.plateNumber && filters.plateNumber.trim() !== "") params.set('plateNumber', filters.plateNumber);
  // ...
}
```

## Impact

### Fixed Issues:
✅ ANPR watchlist page no longer displays UUID validation errors
✅ Empty watchlist selections properly filter to show all results
✅ Face recognition events with empty watchlist IDs handled correctly
✅ Behavior events with empty camera IDs handled correctly

### Prevention:
- All UUID query parameters now validate for non-empty strings before being added to SQL queries
- Both frontend and backend validation ensures empty strings are never sent to PostgreSQL
- Consistent validation pattern applied across all analytics endpoints

## Testing Recommendations

1. **ANPR Watchlist Page:**
   - Navigate to `/analytics/anpr`
   - Select "All watchlists" from the dropdown (which sends empty string)
   - Verify no UUID validation error appears
   - Verify all ANPR events are displayed

2. **Face Recognition Page:**
   - Navigate to `/analytics/face-recognition`
   - Select "All watchlists" from the dropdown
   - Verify face events load without errors

3. **Empty Filters:**
   - Test plate search with empty query
   - Test camera filters with no selection
   - Verify all cases handle empty strings gracefully

## Files Changed

1. `src/routes/analytics-phase2.routes.ts` - Backend UUID validation
2. `dashboard/lib/api-client.ts` - Frontend query parameter validation

## Related Code Patterns

This fix follows the defensive programming pattern of:
1. Always validate UUID parameters for non-empty strings before database queries
2. Filter empty query parameters at the API client level
3. Treat empty strings as "no filter" rather than invalid values

## Future Considerations

Consider implementing a reusable validation utility for UUID query parameters:

```typescript
function isValidUuidParam(value?: string): boolean {
  return value !== undefined && value !== null && value.trim() !== "";
}
```

This could be used consistently across all route handlers to prevent similar issues.
