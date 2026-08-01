# Session Management & Auto-Redirect Implementation

## Overview

Implemented automatic session management that redirects users to the login page when:
- API connection fails (network errors, DNS issues)
- Authentication token expires (401 errors)
- Session becomes invalid (403 errors with session_expired)

## Features Implemented

### 1. **API Client Error Handling** (`dashboard/lib/api-client.ts`)
- Catches network errors (DNS resolution, connection refused, timeouts)
- Detects 401 (Unauthorized) responses
- Detects 403 (Forbidden) with session-specific errors
- Automatically redirects to login page
- Preserves error reason in URL query parameters

### 2. **Session Guard** (`dashboard/lib/session-guard.ts`)
- Periodic session validity checks (every 60 seconds)
- Check on page visibility change (when user returns to tab)
- Check on page focus
- Lightweight API call to `/api/control/v1/auth/me`
- Automatic cleanup on page unload

### 3. **Session Provider** (`dashboard/components/session-provider.tsx`)
- React component wrapper for session management
- Automatically sets up session monitoring
- Excludes auth pages from monitoring

### 4. **Login Form Updates** (`dashboard/components/login-form.tsx`)
- Shows session expiry messages
- Displays network error messages
- Color-coded info and error banners
- Reads reason from URL query parameters

### 5. **React Hook** (`dashboard/hooks/use-session-guard.ts`)
- `useSessionGuard()` - For protected pages
- `usePublicPage()` - For public pages
- Easy integration in any component

## URL Query Parameters

The login page recognizes these parameters:

| Parameter | Value | Message |
|-----------|-------|---------|
| `reason=expired` | Session expired | "Your session has expired. Please sign in again." |
| `reason=invalid` | Invalid/missing session | "Please sign in to continue." |
| `reason=network` | Network error | "Cannot connect to server. Please check your connection." |
| `logout=true` | User logged out | "You have been signed out successfully." |

## Usage Examples

### Protect a Page Component

```typescript
'use client';

import { useSessionGuard } from '@/hooks/use-session-guard';

export default function ProtectedPage() {
  const { isAuthenticated } = useSessionGuard();
  
  if (!isAuthenticated) {
    return <div>Loading...</div>;
  }
  
  return <div>Protected Content</div>;
}
```

### Public Page (No Auth Required)

```typescript
'use client';

import { usePublicPage } from '@/hooks/use-session-guard';

export default function PublicPage() {
  usePublicPage();
  
  return <div>Public Content</div>;
}
```

### Manual Session Check

```typescript
import { redirectToLogin } from '@/lib/session-guard';

// In your component or function
if (someErrorCondition) {
  redirectToLogin('expired');
}
```

## Session Check Intervals

- **Default check interval**: 60 seconds (60000ms)
- **On page visibility**: Immediate check when tab becomes visible
- **On page focus**: Immediate check when window gains focus

## Error Handling Flow

```
User Request
    ↓
API Call (fetch)
    ↓
Network Error? ──→ Redirect to /login?reason=network
    ↓
401 Unauthorized? ──→ Redirect to /login?reason=expired
    ↓
403 Forbidden (session_expired)? ──→ Redirect to /login?reason=expired
    ↓
Success → Continue
```

## Configuration

### Change Session Check Interval

Edit `dashboard/components/session-provider.tsx`:

```typescript
setupSessionGuard(30000); // Check every 30 seconds
```

### Customize Redirect Behavior

Edit `dashboard/lib/session-guard.ts`:

```typescript
export function redirectToLogin(reason: 'expired' | 'invalid' | 'network' = 'expired') {
  // Custom logic here
  window.location.href = `/custom-login?reason=${reason}`;
}
```

## Testing

### Test Session Expiry

1. Login to dashboard
2. In browser console, clear local storage:
   ```javascript
   localStorage.clear();
   ```
3. Wait 60 seconds or switch tabs
4. Should redirect to login with "Session expired" message

### Test Network Error

1. Disconnect from network
2. Try to interact with dashboard
3. Should redirect to login with network error message

### Test API Errors

1. Stop control plane server
2. Try to load dashboard pages
3. Should redirect to login

## Files Modified/Created

### Created
- `dashboard/lib/session-guard.ts` - Core session management
- `dashboard/hooks/use-session-guard.ts` - React hooks
- `dashboard/components/session-provider.tsx` - Provider component
- `fix-dashboard-config.mjs` - Configuration fix script
- `check-deployment-status.mjs` - Diagnostic tool
- `SESSION_MANAGEMENT.md` - This documentation

### Modified
- `dashboard/lib/api-client.ts` - Added error handling and auto-redirect
- `dashboard/components/login-form.tsx` - Added info/error messages
- `dashboard/app/layout.tsx` - Added SessionProvider
- `dashboard/app/globals.css` - Added login-info styles
- `dashboard/.env.local` - Local API configuration
- `dashboard/.env.production` - Production API configuration

## Security Considerations

1. **Session tokens cleared**: All localStorage items removed on redirect
2. **No infinite loops**: Auth pages excluded from session checking
3. **Graceful degradation**: Network errors don't cause infinite redirects
4. **User awareness**: Clear messages explain why redirect happened

## Troubleshooting

### Issue: Infinite redirect loop
**Solution**: Check that `/login` page is excluded from session guard

### Issue: Not redirecting when session expires
**Solution**: Check browser console for errors, verify session guard is initialized

### Issue: Redirecting too frequently
**Solution**: Increase check interval or add exponential backoff

### Issue: Network errors causing constant redirects
**Solution**: Session guard ignores temporary network errors (500, 502, 503)

## Production Deployment

1. Update `dashboard/.env.production`:
   ```env
   NEXT_PUBLIC_API_BASE=/api/control
   CONTROL_PLANE_URL=https://your-control-plane-url.com
   ```

2. Rebuild dashboard:
   ```bash
   cd dashboard
   npm run build
   ```

3. Deploy to hosting platform

4. Test session expiry in production

## Future Enhancements

- [ ] Add token refresh before expiry
- [ ] Show countdown timer before session expires
- [ ] Store last visited page for post-login redirect
- [ ] Add session extension prompt (e.g., "Continue session?")
- [ ] Implement multiple session management
- [ ] Add activity tracking to extend sessions
- [ ] Implement remember-me functionality
- [ ] Add logout confirmation dialog

## Support

For issues or questions:
1. Check browser console for errors
2. Run `node check-deployment-status.mjs` for diagnostics
3. Verify `.env.local` configuration
4. Check control plane is running and accessible
