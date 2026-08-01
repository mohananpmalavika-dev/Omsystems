# Session Auto-Redirect - Quick Reference

## ✅ What's Implemented

Your dashboard now automatically redirects to the login page when:

1. **API is unreachable** (DNS errors, connection refused, network down)
2. **Token expires** (401 Unauthorized)
3. **Session invalid** (403 Forbidden with session errors)
4. **Periodic checks detect expired session** (every 60 seconds)

## 🚀 How It Works

### Automatic Redirects

```
API Error → Clear localStorage → Redirect to /login?reason=expired
Network Error → Clear localStorage → Redirect to /login?reason=network
Invalid Token → Clear localStorage → Redirect to /login?reason=invalid
```

### Session Monitoring

- **Every 60 seconds**: Lightweight check to `/api/control/v1/auth/me`
- **On tab focus**: Checks when you return to the tab
- **On page visibility**: Checks when browser window becomes visible

### Login Page Messages

| Scenario | Message Shown |
|----------|---------------|
| Session expired | 🔵 "Your session has expired. Please sign in again." |
| Network error | 🔴 "Cannot connect to server. Please check your connection." |
| No session | 🔵 "Please sign in to continue." |
| Logged out | 🔵 "You have been signed out successfully." |

## 📝 Testing

### Test Session Expiry
```javascript
// In browser console while logged in:
localStorage.clear();
// Wait 60 seconds or switch tabs → should redirect to login
```

### Test Network Error
```bash
# Stop control plane
npm stop

# Try accessing dashboard → should redirect to login
```

### Test API Connection
```bash
# Check if services are running
node check-deployment-status.mjs
```

## 🔧 Configuration Files

### Local Development
```bash
# dashboard/.env.local
NEXT_PUBLIC_API_BASE=/api/control
CONTROL_PLANE_URL=http://localhost:3000
```

### Production
```bash
# dashboard/.env.production
NEXT_PUBLIC_API_BASE=/api/control
CONTROL_PLANE_URL=https://your-production-url.com
```

## 🎯 Key Features

✅ **No infinite loops** - Auth pages excluded from checking  
✅ **Clear session data** - All tokens removed on redirect  
✅ **User-friendly messages** - Explains why redirect happened  
✅ **Graceful degradation** - Temporary errors don't cause redirects  
✅ **Automatic cleanup** - Session checks stop on page unload  

## 🏃 Quick Start

### Running Locally

```powershell
# Terminal 1: Start control plane
npm run dev

# Terminal 2: Start dashboard
cd dashboard
npm run dev
```

Access at: `http://localhost:3001`

### Fix Configuration Issues

```powershell
# Run the fix script
node fix-dashboard-config.mjs

# Check status
node check-deployment-status.mjs
```

## 📦 Files Created/Modified

### New Files
- `dashboard/lib/session-guard.ts` - Core session logic
- `dashboard/hooks/use-session-guard.ts` - React hooks
- `dashboard/components/session-provider.tsx` - App wrapper
- `SESSION_MANAGEMENT.md` - Full documentation
- `fix-dashboard-config.mjs` - Config fix script
- `check-deployment-status.mjs` - Diagnostic tool

### Modified Files
- `dashboard/lib/api-client.ts` - Auto-redirect on errors
- `dashboard/components/login-form.tsx` - Show messages
- `dashboard/app/layout.tsx` - Add SessionProvider
- `dashboard/app/globals.css` - Info message styles
- `dashboard/.env.local` - Local config
- `dashboard/.env.production` - Production config template

## 🐛 Troubleshooting

### "Cannot connect to server" on every page
**Fix**: Check control plane is running
```powershell
npm run dev
```

### "sentinel-grid-monitoring1.onrender.com" DNS error
**Fix**: Update environment variables to use relative paths
```powershell
node fix-dashboard-config.mjs
cd dashboard
npm run dev  # Restart dashboard
```

### Redirecting too often
**Fix**: Increase check interval in `session-provider.tsx`:
```typescript
setupSessionGuard(120000); // Check every 2 minutes
```

### Not redirecting when it should
**Fix**: Check browser console for errors, verify SessionProvider is loaded

## 💡 Usage in Components

```typescript
// Protect a page
import { useSessionGuard } from '@/hooks/use-session-guard';

export default function MyPage() {
  const { isAuthenticated } = useSessionGuard();
  return <div>Protected content</div>;
}

// Manual redirect
import { redirectToLogin } from '@/lib/session-guard';

function handleError() {
  redirectToLogin('expired');
}
```

## 🎨 Login Messages Styling

The login page shows color-coded messages:
- **Blue info box** 🔵: Session expired, please login
- **Red error box** 🔴: Network errors, connection issues

## ⚙️ Customization

### Change Check Frequency
Edit `dashboard/components/session-provider.tsx`:
```typescript
setupSessionGuard(30000); // 30 seconds
```

### Custom Redirect URL
Edit `dashboard/lib/session-guard.ts`:
```typescript
window.location.href = `/custom-login?reason=${reason}`;
```

### Add Pre-Redirect Hook
```typescript
// In session-guard.ts, before redirect:
export function redirectToLogin(reason) {
  // Your custom logic
  onBeforeRedirect?.(reason);
  
  // Then redirect
  window.location.href = `/login?reason=${reason}`;
}
```

## 📊 Monitoring

Session checks log to browser console:
- ✅ Success: Silent
- ⚠️ Warning: "Session expired or invalid"
- ❌ Error: "Session check network error"

Open browser DevTools (F12) → Console to see logs

## 🔒 Security

- Session tokens stored in localStorage
- All tokens cleared on redirect
- HTTP-only cookies handled by server
- No sensitive data in URL (except reason)

## 🚢 Production Checklist

- [ ] Update `.env.production` with production URLs
- [ ] Test session expiry in production
- [ ] Test network error handling
- [ ] Verify login redirect works
- [ ] Check messages display correctly
- [ ] Test on multiple browsers
- [ ] Monitor console for errors

## 📞 Support

If issues persist:
1. Run `node check-deployment-status.mjs`
2. Check browser console (F12)
3. Verify control plane is accessible
4. Review `SESSION_MANAGEMENT.md` for detailed docs

---

**Last Updated**: Session management implementation  
**Status**: ✅ Fully implemented and tested
