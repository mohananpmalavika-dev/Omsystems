# KryptoVision Connect — Frontend Integration Guide

Complete guide for integrating the KryptoVision Connect calling page into your VMS application.

---

## 📁 Files Created

### **Core Services**
1. `dashboard/services/communication-api.ts` — REST API client
2. `dashboard/hooks/use-communication-signaling.ts` — WebSocket/Socket.IO hook
3. `dashboard/hooks/use-webrtc-audio.ts` — WebRTC peer connection hook
4. `dashboard/types/communication.ts` — Shared TypeScript types

### **UI Pages**
5. `dashboard/app/communications/calls/page.tsx` — VMS calling page (operators)
6. `dashboard/app/communications/connect/page.tsx` — Branch device calling page

---

## 🚀 Integration Steps

### **Step 1: Verify Dependencies**

Check that these packages are installed in `dashboard/package.json`:

```json
{
  "dependencies": {
    "socket.io-client": "^4.8.3",
    "lucide-react": "^0.468.0",
    "next": "^16.3.3",
    "react": "^19.2.0"
  }
}
```

All dependencies are already present! ✅

---

### **Step 2: Configure Environment Variables**

Add these to your `.env.local` or environment configuration:

```bash
# Backend API URL (if different from same-origin)
NEXT_PUBLIC_API_URL=http://localhost:8080

# WebSocket URL (if different from default)
NEXT_PUBLIC_WS_URL=http://localhost:8080
```

**Note:** If your backend runs on the same domain, these are optional.

---

### **Step 3: Add Navigation Link**

Add a link to the calling page in your main navigation.

**Option A: Update `dashboard/components/application-shell.tsx`** (if exists):

```tsx
import { Phone } from 'lucide-react';

// In navigation items array
{
  href: '/communications/calls',
  label: 'Communications',
  icon: <Phone size={20} />,
}
```

**Option B: Add to sidebar navigation:**

```tsx
<Link href="/communications/calls">
  <Phone size={20} />
  <span>Communications</span>
</Link>
```

---

### **Step 4: Configure Permissions**

Ensure operators have the correct permissions in your role system:

```sql
-- Add communication permissions to operator roles
INSERT INTO role_permissions (role_id, permission_key, granted) VALUES
  ('operator-role-id', 'communication.branch.call', true),
  ('operator-role-id', 'communication.branch.message', true),
  ('operator-role-id', 'communication.employee.call', true),
  ('operator-role-id', 'communication.employee.message', true),
  ('operator-role-id', 'communication.call.accept', true),
  ('operator-role-id', 'communication.call.reject', true);
```

---

### **Step 5: Backend Integration**

Ensure your backend has these routes registered:

```typescript
// In src/app.ts
import { registerCommunicationsRoutes } from './communications/routes/communications.routes.js';

// After other route registrations
await registerCommunicationsRoutes(app, store);
```

Verify routes are accessible:

```bash
# Test directory endpoint
curl http://localhost:8080/v1/communications/directory/branches \
  -H "x-sentinel-session: YOUR_TOKEN"

# Test health
curl http://localhost:8080/health
```

---

### **Step 6: WebSocket Integration**

Ensure Socket.IO is properly attached to your app instance:

```typescript
// In src/app.ts
import { Server as SocketIOServer } from 'socket.io';

const io = new SocketIOServer(server, {
  path: '/socket.io',
  cors: { origin: process.env.CORS_ORIGIN },
  transports: ['websocket', 'polling'],
});

// Attach to app for communications
(app as any).io = io;
```

---

### **Step 7: TURN Server Configuration**

Configure TURN server in your backend `.env`:

```bash
COMM_TURN_SERVER_URL=turn:turn.yourdomain.com:3478
COMM_TURN_USERNAME=kryptovision-turn-user
COMM_TURN_CREDENTIAL=secure-turn-password
```

**For development/testing**, you can use a public TURN server:

```bash
COMM_TURN_SERVER_URL=turn:numb.viagenie.ca:3478
COMM_TURN_USERNAME=webrtc@live.com
COMM_TURN_CREDENTIAL=muazkh
```

⚠️ **Do not use public TURN servers in production!**

---

### **Step 8: Test the Integration**

1. **Start your backend:**
   ```bash
   cd /path/to/backend
   npm start
   ```

2. **Start the dashboard:**
   ```bash
   cd dashboard
   npm run dev
   ```

3. **Navigate to calling page:**
   ```
   http://localhost:3000/communications/calls
   ```

4. **Verify functionality:**
   - ✅ Directory loads with branches
   - ✅ Service status shows "Service Online"
   - ✅ Search filters branches/employees
   - ✅ Click "Call Branch" initiates call
   - ✅ Microphone permission requested
   - ✅ Call overlay appears with status
   - ✅ WebSocket events received

---

## 🎯 Feature Testing Checklist

### **Directory & Presence**
- [ ] Branch directory loads successfully
- [ ] Employee list shows under each branch
- [ ] Online/offline presence indicators work
- [ ] Device counts display correctly (X of Y)
- [ ] Search filters by branch name, code, employee
- [ ] Real-time presence updates via WebSocket

### **Outgoing Calls**
- [ ] "Call Branch" button works
- [ ] "Call Employee" button works
- [ ] Microphone permission dialog appears
- [ ] Call overlay shows with contact info
- [ ] Call state progresses: INITIATING → RINGING → CONNECTED
- [ ] Duration timer starts when connected
- [ ] Mute/unmute toggle works
- [ ] Audio playback works (remote voice heard)
- [ ] Quality indicator displays (GOOD/DEGRADED/POOR)
- [ ] "End Call" disconnects and cleans up
- [ ] "Cancel" works before call is answered

### **Incoming Calls**
- [ ] Incoming call modal appears when branch calls VMS
- [ ] Caller info displays (branch name, employee name)
- [ ] "Accept" button connects call
- [ ] "Decline" button rejects call
- [ ] First-answer-wins: Modal closes if accepted elsewhere
- [ ] Modal auto-dismisses if call is cancelled

### **Call History**
- [ ] Switch to "Call History" tab works
- [ ] Table displays past calls
- [ ] Columns show: Time, Branch/Employee, Direction, Status, Duration, Quality
- [ ] Direction badges (Incoming/Outgoing) color-coded
- [ ] Status icons display correctly
- [ ] Refresh button reloads history
- [ ] Pagination works (if > 50 calls)

### **WebRTC Audio**
- [ ] Local microphone stream captured
- [ ] Remote audio stream plays
- [ ] Mute/unmute affects audio track
- [ ] Connection quality metrics calculated
- [ ] RTT displays in milliseconds
- [ ] Device enumeration works (microphones/speakers)
- [ ] Cleanup on disconnect (no hanging streams)

### **Error Handling**
- [ ] Microphone permission denied: Shows error banner
- [ ] Branch offline: Call button disabled
- [ ] Network error: User-friendly message displayed
- [ ] WebSocket disconnected: Visual indicator in header
- [ ] Call failed: Shows reason from server
- [ ] WebRTC connection failure: Automatic cleanup

### **Mobile Responsive**
- [ ] Layout adapts to mobile (< 768px)
- [ ] Directory sidebar scrollable on small screens
- [ ] Touch-friendly buttons (min 44x44px)
- [ ] Incoming call buttons large enough
- [ ] Call controls accessible with thumb
- [ ] No horizontal scrolling
- [ ] Safe area margins on notched devices

---

## 🐛 Common Issues & Solutions

### **Issue: Directory doesn't load**

**Symptoms:**
- Loading state persists
- Error: "Failed to load branch directory"

**Solutions:**
1. Check backend is running: `curl http://localhost:8080/health`
2. Verify authentication token in localStorage: `localStorage.getItem('accessToken')`
3. Check network tab for failed requests
4. Verify `/v1/communications/directory/branches` endpoint exists
5. Check CORS settings if backend is on different domain

---

### **Issue: WebSocket not connecting**

**Symptoms:**
- Service status shows "Connecting..." forever
- Console error: "WebSocket connection failed"

**Solutions:**
1. Verify Socket.IO is attached to app: `(app as any).io`
2. Check Socket.IO path: Default is `/socket.io`
3. Verify auth token is passed in connection
4. Check firewall allows WebSocket connections
5. Try switching transport to polling: `transports: ['polling', 'websocket']`

---

### **Issue: Microphone permission denied**

**Symptoms:**
- Error banner: "Microphone permission required"
- No audio captured

**Solutions:**
1. Grant microphone permission in browser settings
2. Check if page is served over HTTPS (required for getUserMedia)
3. Verify microphone is not in use by another app
4. Try a different browser
5. Check browser console for getUserMedia errors

---

### **Issue: No audio during call**

**Symptoms:**
- Call connects successfully
- Duration timer runs
- No audio heard from remote party

**Solutions:**
1. Check if remote stream is received: `webrtc.remoteStream`
2. Verify `<audio>` element is playing: `audioRef.current.play()`
3. Check speaker volume (system + browser)
4. Verify WebRTC peer connection established
5. Check ICE candidates are exchanged
6. Inspect RTCPeerConnection state in browser DevTools

---

### **Issue: Calls fail immediately**

**Symptoms:**
- Call state goes from INITIATING → FAILED
- Error: "Call failed"

**Solutions:**
1. Check backend logs for errors
2. Verify TURN server is reachable
3. Test TURN credentials: `turnutils_uclient -u USER -w PASSWORD TURN_URL`
4. Check if branch has online devices
5. Verify call service is running on backend
6. Check Redis is available for first-answer-wins lock

---

### **Issue: First-answer-wins not working**

**Symptoms:**
- Multiple operators can answer same call
- No "Call accepted elsewhere" event

**Solutions:**
1. Verify Redis is running and accessible
2. Check `CallStateMachineService.attemptFirstAnswerWins()` uses Redis SET NX
3. Verify WebSocket broadcasts `CALL_ACCEPTED_ELSEWHERE` event
4. Check all API nodes share same Redis instance
5. Inspect Redis keys: `KEYS comm:call:*:answer-lock`

---

### **Issue: Presence not updating**

**Symptoms:**
- Devices show offline when they're online
- Presence never changes

**Solutions:**
1. Check device heartbeat is being sent: `/v1/communications/devices/me/heartbeat`
2. Verify Redis presence keys: `KEYS comm:presence:*`
3. Check presence TTL is set correctly
4. Verify WebSocket `PRESENCE_CHANGED` events are emitted
5. Check if PresenceService is updating Redis

---

## 📊 Performance Optimization

### **Virtual Scrolling for Large Directories**

If you have > 100 branches, enable virtual scrolling:

```tsx
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={600}
  itemCount={filteredBranches.length}
  itemSize={80}
  width="100%"
>
  {({ index, style }) => (
    <div style={style}>
      {/* Branch item */}
    </div>
  )}
</FixedSizeList>
```

### **Debounced Search**

Add debouncing to search input:

```tsx
import { useDebounce } from '@/hooks/use-debounce';

const debouncedQuery = useDebounce(searchQuery, 300);
const filteredBranches = branches.filter(/* use debouncedQuery */);
```

### **Memoize Filtered Results**

Use `useMemo` for expensive filtering:

```tsx
const filteredBranches = useMemo(() => {
  return branches.filter(branch => {
    // Filtering logic
  });
}, [branches, searchQuery]);
```

---

## 🔐 Security Best Practices

1. **Never log sensitive data:**
   - ❌ Don't log: Access tokens, refresh tokens, participant tokens, TURN credentials
   - ✅ Do log: Call IDs, branch IDs, employee IDs (UUIDs), connection states

2. **Validate all user input:**
   - Search queries should be sanitized
   - Message bodies should be validated (length, content)
   - Enrollment codes should be validated format

3. **Use HTTPS in production:**
   - WebRTC requires HTTPS for getUserMedia
   - TURN server should use secure transport (TURNS)
   - WebSocket should use WSS (not WS)

4. **Implement rate limiting:**
   - Limit call attempts per minute
   - Limit message sending rate
   - Throttle API requests

5. **Validate permissions on backend:**
   - Never trust frontend permission checks
   - Always verify on server before executing actions
   - Check user has permission to call specific branch/employee

---

## 🧪 Testing Strategy

### **Unit Tests** (Vitest/Jest)

Test individual hooks and utilities:

```typescript
// Example: test-communication-api.test.ts
import { describe, it, expect, vi } from 'vitest';
import { communicationAPI } from '@/services/communication-api';

describe('CommunicationAPI', () => {
  it('should fetch branch directory', async () => {
    const branches = await communicationAPI.getBranchDirectory();
    expect(Array.isArray(branches)).toBe(true);
  });
  
  it('should handle network errors gracefully', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));
    await expect(communicationAPI.getBranchDirectory()).rejects.toThrow();
  });
});
```

### **Integration Tests** (Playwright)

Test full user flows:

```typescript
// Example: communications.spec.ts
import { test, expect } from '@playwright/test';

test('operator can call branch', async ({ page }) => {
  await page.goto('/communications/calls');
  
  // Wait for directory to load
  await page.waitForSelector('[data-testid="branch-item"]');
  
  // Select first branch
  await page.click('[data-testid="branch-item"]');
  
  // Click "Call Branch"
  await page.click('button:has-text("Call Branch")');
  
  // Verify call overlay appears
  await expect(page.locator('[data-testid="call-overlay"]')).toBeVisible();
});
```

### **E2E Tests**

Test complete flows with real backend:

1. Operator calls branch → Branch device receives call → Accept → Connected → End call
2. Branch calls VMS → Operator accepts → Connected → End call
3. Multiple operators receive call → First accepts → Others see "accepted elsewhere"

---

## 📱 Progressive Web App (PWA) Support

To enable PWA for offline support:

1. **Create manifest.json:**

```json
{
  "name": "KryptoVision Communications",
  "short_name": "KV Connect",
  "description": "Branch-VMS communication system",
  "start_url": "/communications/calls",
  "display": "standalone",
  "background_color": "#667eea",
  "theme_color": "#667eea",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

2. **Register service worker:**

Add to `dashboard/public/sw.js` for offline caching.

---

## 🌐 Browser Compatibility

### **Supported Browsers**

| Browser | Version | WebRTC | WebSocket | MediaDevices |
|---------|---------|--------|-----------|--------------|
| Chrome  | 90+     | ✅     | ✅        | ✅           |
| Firefox | 88+     | ✅     | ✅        | ✅           |
| Safari  | 14+     | ✅     | ✅        | ✅           |
| Edge    | 90+     | ✅     | ✅        | ✅           |
| Opera   | 76+     | ✅     | ✅        | ✅           |

### **Mobile Browsers**

| Browser         | Version | Support |
|-----------------|---------|---------|
| Chrome Mobile   | 90+     | ✅      |
| Safari iOS      | 14+     | ✅      |
| Samsung Internet| 14+     | ✅      |
| Firefox Mobile  | 88+     | ✅      |

**Note:** Safari iOS may require user gesture for `getUserMedia()`.

---

## 📚 Additional Resources

- **WebRTC Documentation:** https://webrtc.org/getting-started/overview
- **Socket.IO Documentation:** https://socket.io/docs/v4/
- **Next.js App Router:** https://nextjs.org/docs/app
- **React Hooks Guide:** https://react.dev/reference/react
- **TURN Server Setup:** https://github.com/coturn/coturn

---

## 🆘 Support

For issues or questions:

1. Check this integration guide
2. Review backend deployment guide: `KRYPTOVISION_CONNECT_DEPLOYMENT.md`
3. Check backend requirements: `KRYPTOVISION_CONNECT_REQUIREMENTS.md`
4. Inspect browser console for errors
5. Check backend logs for server-side errors

---

## ✅ Deployment Checklist

### **Pre-Deployment**

- [ ] All dependencies installed
- [ ] Environment variables configured
- [ ] Backend routes registered
- [ ] WebSocket attached to app
- [ ] TURN server configured and tested
- [ ] Permissions added to roles
- [ ] Navigation link added

### **Testing**

- [ ] Directory loads successfully
- [ ] Outgoing calls work end-to-end
- [ ] Incoming calls work end-to-end
- [ ] First-answer-wins tested with multiple operators
- [ ] WebRTC audio verified (both directions)
- [ ] Call history displays correctly
- [ ] Mobile layout tested
- [ ] Error handling verified

### **Production**

- [ ] Use production TURN server (not public)
- [ ] Enable HTTPS for frontend
- [ ] Enable WSS for WebSocket
- [ ] Configure CORS properly
- [ ] Set up monitoring/alerts
- [ ] Enable audit logging
- [ ] Test on real devices
- [ ] Load test with expected user count

---

**End of Integration Guide**
