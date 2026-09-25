# KryptoVision Connect - Requirements Specification

## Executive Summary

KryptoVision Connect is a production-grade communication subsystem enabling secure audio calling and messaging between branch locations and the VMS/SOC operations center. This is NOT a general chat application - it is purpose-built for operational branch-to-VMS communication with zero-login device enrollment, WebRTC audio calls, and durable messaging.

## Core Requirements

### 1. Product Model

#### 1.1 Communication Device Identity
- ONE DEVICE maps to EXACTLY ONE PRIMARY BRANCH
- ONE DEVICE may link ZERO, ONE, or MANY EMPLOYEES
- Device types:
  - `BRANCH_SHARED` - Shared PC/workstation (e.g., Reception-PC-01)
  - `BRANCH_MOBILE` - Branch phone/tablet
  - `EMPLOYEE_MOBILE` - Personal employee phone
  - `EMPLOYEE_DESKTOP` - Employee workstation
  - `EMERGENCY_DEVICE` - Emergency-only device

#### 1.2 Communication Identities
- **Branch Identity**: `branch:KLM001` - The branch itself is a callable entity
- **Employee Identity**: `employee:EMP1021` - Individual employee callable
- **Device Identity**: `device:DEV-UUID` - Physical/app installation

#### 1.3 Example Scenarios
```
Shared Branch PC:
  Device: Reception-PC-01
  Branch: Kollam Main
  Employees: Branch Manager, Security Guard, Operations Officer

Employee Mobile:
  Device: Rajesh-Mobile
  Branch: Kollam Main
  Employee: Rajesh (single)

Branch Emergency Phone:
  Device: Branch-Emergency-Phone
  Branch: Kollam Main
  Employees: none
```

### 2. Zero-Login Device Enrollment

#### 2.1 First-Time Installation Flow
```
1. Install KryptoVision Connect
2. Enter/Scan Enrollment Code (e.g., KLM01-X7P9-42MK)
3. System resolves Tenant + Branch from code
4. User selects device type
5. Optionally link employee(s)
6. Server validates enrollment
7. Device generates asymmetric keypair
8. Device receives certificate/token
9. Registration complete
```

#### 2.2 Subsequent Startup Flow
```
1. Application starts
2. Device certificate/secure refresh credential loaded
3. Silent authentication (no password prompt)
4. Communication service connected
```

#### 2.3 Enrollment Code Requirements
- Cryptographically random (minimum 128 bits entropy)
- Time-based expiration (default 30 minutes)
- Optional single-use enforcement
- Belongs to one tenant
- Belongs to one branch
- Optional device type restriction
- Optional employee pre-assignment
- Full audit trail

#### 2.4 Security Requirements
- NO plaintext password storage
- Device private key remains on device only
- Public key registered with server
- Platform-secure storage:
  - Windows: DPAPI/Credential Manager
  - Android: Android Keystore
  - iOS: Keychain/Secure Enclave
- Remote revocation support
- Certificate-based authentication

### 3. Branch Calling

#### 3.1 VMS → Branch Call
- Operator selects branch (not individual employee)
- System resolves all eligible communication endpoints for that branch
- Example: Kollam Main → [Reception PC, Security Desk, Branch Mobile]
- All eligible devices ring simultaneously
- First-answer-wins behavior (atomic, race-safe)
- Other ringing devices immediately cancelled

#### 3.2 Branch → VMS Call
- Branch device displays: "CALL VMS TEAM" button
- System routes to configured SOC queue
- Eligible operators ring
- First operator accepting wins
- Support routing rules:
  - Branch → Assigned SOC group
  - Branch → Region SOC
  - Branch → Central SOC
  - Branch → Supervisor escalation

#### 3.3 Employee Calling
- VMS can call specific employee
- Only active devices linked to that employee ring
- Example: Rajesh → [Rajesh Mobile, Reception PC (shared)]
- First-answer-wins unless multi-device join allowed

#### 3.4 Shared Device Identity
For shared branch PCs with multiple employees:
```
Configuration modes:
- NONE: Call as branch device
- NAME_SELECT: Quick employee selection
- EMPLOYEE_PIN: PIN-protected identity (optional)
```

Employee PIN requirements:
- Hashed storage (never plaintext)
- Rate limiting
- NOT a full VMS password
- Audit trail

### 4. Real-Time Audio (WebRTC)

#### 4.1 Media Requirements
- WebRTC for real-time audio
- Primary codec: Opus
- Encrypted media (DTLS-SRTP)
- TURN support mandatory (NAT traversal)
- Self-hosted WebRTC preferred
- Provider abstraction for flexibility

#### 4.2 Call Quality
- Monitor: RTT, jitter, packet loss, bitrate
- Display simple status: GOOD, DEGRADED, POOR
- Operational quality metrics for diagnostics
- Automatic reconnection on transient failures

#### 4.3 Connection States
```
IDLE → INITIATING → RINGING → CONNECTING → CONNECTED
                                        ↓
                                   RECONNECTING
                                        ↓
                                   CONNECTED
                                        ↓
                                      ENDED
```

### 5. Messaging

#### 5.1 Phase 1 Requirements
- Text messages
- Delivered state tracking
- Read state tracking
- Timestamps
- Branch conversations (Branch ↔ SOC)
- Employee conversations (Employee ↔ SOC)
- Offline delivery
- Operator identity tracking

#### 5.2 Message Persistence
- Survive service restarts
- NOT Redis-only (durable storage required)
- PostgreSQL for message history
- Offline queue for pending messages
- Sync on reconnect

#### 5.3 Optional Future (Not Phase 1)
- Image attachments
- Voice notes
- Incident references
- Camera references

#### 5.4 Explicitly NOT Supported
- Public channels
- Stickers
- Stories
- Social media features
- Unrelated consumer chat features

### 6. Presence System

#### 6.1 Presence States
- `ONLINE` - Connected and available
- `OFFLINE` - Disconnected
- `BUSY` - Engaged in activity
- `IN_CALL` - Currently on call
- `UNAVAILABLE` - Manually set unavailable

#### 6.2 Presence Entities
- Branch presence (online if ≥1 device online)
- Employee presence (across linked devices)
- Device presence (individual device)
- Operator presence (VMS operator)

#### 6.3 Heartbeat Requirements
- Device → Server heartbeat every 30-60 seconds
- Server determines online/offline from last seen
- Redis TTL for distributed presence
- Graceful offline detection

### 7. Windows Client Application

#### 7.1 Architecture
- Separate service and UI components where supported
- Background service responsibilities:
  - Auto-start on boot
  - Maintain server connectivity
  - Maintain device identity
  - Presence heartbeat
  - Receive communication events
  - Auto-reconnect
  - Start/notify UI for incoming calls
  - Report health

#### 7.2 UI Responsibilities
- Call VMS button
- Message VMS
- Incoming call screen
- Call controls (mute, speaker, end)
- Message view
- Connection state display

#### 7.3 Lifecycle
- Close window → minimize to tray (default)
- Exit → requires admin authorization (configurable)
- Legitimate Windows Service mechanisms only
- No malware-like persistence

### 8. Mobile Client Application

#### 8.1 Android Requirements
- Push notifications for calls/messages
- OS-compliant incoming-call notification
- Foreground service only when required
- WebRTC after call acceptance
- Cannot defeat force-stop (by design)

#### 8.2 iOS Requirements (if supported)
- Use Apple notification/calling mechanisms
- CallKit integration where appropriate
- Background VoIP socket for instant call delivery

#### 8.3 Enterprise Devices
- Optional Device Owner/kiosk mode for corporate devices
- Normal consumer devices with standard restrictions

### 9. Call UI Requirements

#### 9.1 Incoming Call Screen
```
KryptoVision VMS Calling

Central Monitoring Team

[ DECLINE ]   [ ACCEPT ]
```

With context (if available):
```
Central Monitoring Team
Incident: Vault Intrusion
Branch: Kollam Main

[DECLINE] [ACCEPT]
```

**Security**: Never reveal incident info to unauthorized devices

#### 9.2 Active Call Screen
```
Connected to VMS Team

00:01:24

[MUTE]
[SPEAKER]
[END CALL]
```

Display:
- Connection status
- Call duration
- Reconnecting state
- Microphone permission errors
- Network failures
- Simple language (no WebRTC internals)

### 10. Central VMS UI

#### 10.1 Navigation
- Dedicated "Communications" section
- Search: branch/employee

#### 10.2 Branch Communication View
```
Search branch / employee...

Kollam Main                  ● Online
[Call Branch] [Message]

  Rajesh - Manager           ● Online
  [Call] [Message]

  Suresh - Security          ○ Offline
  [Call] [Message]
```

#### 10.3 Branch Details Communication Section
```
Communication Devices

Reception PC     ● Online
Security Desk    ● Online
Manager Mobile   ○ Offline

[Manage Devices]
```

### 11. Device Administration

#### 11.1 Admin Capabilities
- Generate enrollment code
- Approve device (if workflow enabled)
- Rename device
- View linked branch
- Link employee to device
- Unlink employee from device
- Disable device
- Revoke device
- View last seen
- View app version
- View platform
- View communication history

#### 11.2 Device Management View
```
Reception-PC-01

Branch: Kollam Main

Employees:
  Rajesh
  Suresh

Status: Online
Last seen: now
Platform: Windows
App version: 1.0.0

[Link Employee]
[Unlink]
[Disable]
[Revoke Device]
```

### 12. Permissions

#### 12.1 Required Permissions
- `communication.branch.call` - Call any branch
- `communication.branch.message` - Message any branch
- `communication.employee.call` - Call employees
- `communication.employee.message` - Message employees
- `communication.receive.call` - Receive calls
- `communication.receive.message` - Receive messages
- `communication.device.create` - Create enrollment codes
- `communication.device.approve` - Approve devices
- `communication.device.link_employee` - Link employees
- `communication.device.revoke` - Revoke devices
- `communication.device.view` - View device details
- `communication.history.view` - View history
- `communication.audit.view` - View audit logs

#### 12.2 Device vs Operator Permissions
- Device permissions more limited than operator
- Devices cannot manage other devices
- Devices cannot view audit logs
- Devices can only communicate (call/message)

### 13. Tenant and Branch Security

#### 13.1 Isolation Requirements
- Every query enforces tenant isolation
- Device enrolled for Tenant A/Branch X cannot access Tenant B or Branch Y
- Cross-tenant links explicitly forbidden
- Extensive testing of isolation boundaries

#### 13.2 Security Testing
- Cross-tenant access attempts
- Cross-branch device linking
- Forged tenant/branch IDs
- Revoked device authentication
- Expired credentials

### 14. Audit Events

#### 14.1 Required Audit Events
```
COMM_DEVICE_ENROLLMENT_CREATED
COMM_DEVICE_ENROLLED
COMM_DEVICE_APPROVED
COMM_DEVICE_REVOKED
COMM_EMPLOYEE_DEVICE_LINKED
COMM_EMPLOYEE_DEVICE_UNLINKED
COMM_CALL_STARTED
COMM_CALL_RINGING
COMM_CALL_ACCEPTED
COMM_CALL_REJECTED
COMM_CALL_MISSED
COMM_CALL_CANCELLED
COMM_CALL_ENDED
COMM_CALL_FAILED
COMM_MESSAGE_SENT
COMM_MESSAGE_DELIVERED
COMM_MESSAGE_READ
```

#### 14.2 Audit Data
- Tenant ID
- Branch ID
- Employee ID
- Device ID
- Operator ID
- Call ID
- Conversation ID
- Timestamp
- Source IP
- Action
- Result
- NO message body in general logs

### 15. Reconnection and Reliability

#### 15.1 Client Reconnection
```
Backoff schedule:
  1s → 2s → 5s → 10s → 20s → 30s
Reset after stable connection
```

#### 15.2 Offline Behavior
- Messages queued in durable storage
- Calls cannot be queued (create missed call instead)
- Sync on reconnect:
  - Authenticate
  - Sync pending messages
  - Sync missed calls
  - Update read/delivery states

#### 15.3 System Must Survive
- Backend API node restart
- WebSocket node restart
- Redis failover
- Device network interruption
- Browser/desktop UI restart
- Duplicate signaling messages
- Duplicate button clicks
- Late accept messages
- Stale device sessions

### 16. Observability

#### 16.1 Metrics
```
communication_devices_online
communication_calls_started_total
communication_calls_connected_total
communication_calls_failed_total
communication_calls_missed_total
communication_call_setup_duration
communication_messages_sent_total
communication_messages_delivered_total
communication_websocket_connections
```

#### 16.2 Structured Logging
- All communication events
- Never log message content
- Never log media streams
- Connection state changes
- Authentication events
- Errors with context

### 17. Call Recording

#### 17.1 Default Policy
- Recording = OFF by default
- Never record silently
- Policy-controlled recording for compliance
- Explicit user notification when recording

### 18. Performance Requirements

#### 18.1 Scale Targets
- Support 400 branches
- Support 5,000 registered devices
- Support 100 concurrent calls
- Message delivery <3 seconds (online)
- Call setup <5 seconds
- WebSocket reconnect <30 seconds

#### 18.2 Reliability Targets
- 99.9% message delivery (online devices)
- 99.5% call success rate
- <1% call drop rate
- Zero cross-tenant leaks

### 19. NO Mock Implementation

#### 19.1 Forbidden in Production
- Fake WebRTC
- setTimeout simulations
- In-memory-only device registry
- Hard-coded branch lists
- Hard-coded employee lists
- Mock call status
- TODO implementations
- console.log signaling
- Fake online status

#### 19.2 Allowed Only In
- Unit tests
- Development fixtures
- Explicit test environments

### 20. Acceptance Criteria

#### 20.1 Scenario 1: Shared PC
```
1. Install KryptoVision Connect
2. Enter enrollment code
3. Resolve Kollam Main
4. Link 3 employees
5. Registration succeeds
6. Restart computer
7. No username/password prompt
8. App reconnects automatically
```

#### 20.2 Scenario 2: VMS Calls Branch
```
1. SOC opens Kollam Main
2. Press Call Branch
3. Reception PC rings
4. Branch Mobile rings
5. Reception PC accepts
6. Mobile stops ringing (first-answer-wins)
7. WebRTC audio established
```

#### 20.3 Scenario 3: Employee Call
```
1. SOC selects Rajesh
2. Press Call
3. Rajesh-linked endpoints ring
4. Unrelated branch devices do NOT ring
5. Rajesh answers on mobile
6. Audio established
```

#### 20.4 Scenario 4: Branch Calls SOC
```
1. Branch PC user presses "Call VMS Team"
2. Eligible SOC operators ring
3. Operator accepts
4. Secure audio established
```

#### 20.5 Scenario 5: Messaging
```
1. VMS messages Kollam Main
2. Online branch device receives immediately
3. If offline: message remains durable
4. Delivered after reconnect
```

#### 20.6 Scenario 6: Device Revocation
```
1. Admin revokes lost mobile
2. Device loses authorization
3. Reconnect rejected
4. Calls/messages inaccessible
```

#### 20.7 Scenario 7: Multi-Node
```
1. Run API Node A and API Node B
2. Call created on Node A
3. Accept event reaches Node B
4. Call state remains correct (distributed state)
```

### 21. Testing Requirements

#### 21.1 Unit Tests
- Device enrollment validation
- Employee linking validation
- Tenant isolation
- Call state machine transitions
- Message delivery
- Presence tracking

#### 21.2 Integration Tests
- End-to-end enrollment
- Call setup and teardown
- Message delivery
- WebSocket events
- Device revocation

#### 21.3 Security Tests
- Cross-tenant access attempts
- Cross-branch device linking
- Forged identities
- Revoked device authentication
- Expired credentials

#### 21.4 Concurrency Tests
- First-answer-wins race conditions
- Duplicate accept messages
- Simultaneous calls
- Message ordering

### 22. Non-Functional Requirements

#### 22.1 Existing Infrastructure Reuse
- MUST use existing PostgreSQL pool
- MUST use existing Redis client
- MUST use existing WebSocket service pattern
- MUST use existing audit system
- MUST use existing authentication system
- MUST NOT create duplicate services

#### 22.2 Code Quality
- Follow existing TypeScript conventions
- Follow existing routing patterns
- Follow existing service architecture
- Follow existing error handling
- Follow existing logging patterns
- Comprehensive inline documentation

#### 22.3 Deployment
- Docker Compose compatible
- Kubernetes compatible
- Environment variable configuration
- Health check endpoints
- Graceful shutdown support

### 23. Out of Scope (Explicitly)

#### 23.1 NOT Implemented
- General social chat features
- Public channels
- User-to-user direct messaging (non-operational)
- Video calling (audio only)
- Screen sharing
- File sharing (beyond phase 1 attachments)
- Group calls (beyond branch ring)
- Call transfer
- Call forwarding
- IVR/voice menus
- Voicemail
- SMS integration (use existing notification system)

#### 23.2 Deferred to Future
- Video calls
- Screen sharing during calls
- Image attachments in messages
- Voice notes in messages
- Incident reference links in messages
- Camera reference links in messages
- Call recording (policy framework only)
- Call analytics dashboard
- Advanced routing rules
- Hunt groups
- Shift-based routing

## Summary

KryptoVision Connect provides secure, zero-login, WebRTC-based audio communication between branch locations and VMS operations. It is purpose-built for operational communication with production-grade reliability, tenant isolation, and enterprise security requirements.
