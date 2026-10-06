# Communications fixes — 6 October 2026

Messages sent to an operator or enrolled device now have a visible received-message inbox even when the recipient has another contact selected. Opening an inbox item selects the sender's thread for replies. Inbox and thread polling recover persisted messages after a lost socket or a return to the tab. Threads distinguish sent and received messages, display up to the API's 100-message limit, scroll within their own container when a new message arrives, and prevent duplicate submission while a send is pending.

Communication message subscribers survive device-token changes. Operator signaling no longer recreates its connection because an unrelated device enrollment token changed. Active-user recipient validation matches the communications directory's active-user condition. Direct-message events carry a sender name, and authenticated message history supplies `isOwn` so labels do not depend only on browser identity storage.

Incoming operator caller names are resolved from the tenant's user profile. Both operator and enrolled-device screens use the same incoming-call dialog with caller initials, name, source, destination where available, and distinct decline, voice, and video controls. The dialog supports keyboard focus, traps tab navigation, locks background scrolling, and respects reduced-motion preferences. The answered call retains its caller name independently of the session's original direction.

Both calling surfaces play a locally generated, repeating ringtone after browser audio is unlocked by interaction. Calling has its own saved sound preference, separate from workspace alert audio. The enable control is available if sound is muted or not yet unlocked. Ringtone nodes and timers are released when the incoming call is answered, cancelled, declined, ended, fails, or is answered elsewhere. Decline requests prevent duplicate clicks and keep the call available to retry if the server rejects the request.

## Validation

- Dashboard TypeScript check: passed.
- Communications backend build: passed, compiling 14 files.
- Focused Vitest run: **61 tests passed in 5 files**, run without file parallelism.
- Browser tests cover received messages with no selected contact, replying on both surfaces, focus recovery without a socket event, caller identity, actual browser ringtone nodes, cancellation cleanup, mute preference, and caller identity after answering.
- Signaling regression tests cover operator and device subscriptions through enrollment-token updates.
- Existing real browser WebRTC tests cover audio, camera video, screen sharing, and hardware release.
- Desktop and mobile incoming-call screenshots were visually inspected in `tmp/communications-qa/`.

The backend route tests use mocked database and signaling dependencies; the signaling subscription regression uses a socket fixture. Production PostgreSQL execution and a real two-account session on the live demo were not exercised. No live deployment or service restart was performed. Deploy the dashboard and control-plane backend together to apply the changes; no migration is required.
