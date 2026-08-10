# Remaining Gaps - Priority Action Plan
**Created:** August 10, 2026  
**Current Status:** 9.2/10 → Target: 9.5/10  
**Critical Issues:** 6 major gaps blocking production perfection

---

## 🔴 CRITICAL - Must Fix Before v1.0 (P0)

### 1. Architecture Consolidation (4 days) ⚠️ HIGHEST PRIORITY
**Status:** BLOCKING everything else  
**Impact:** Developer confusion, duplicate maintenance, unclear codebase

**Problem:**
```
src/           ← ACTIVE (50+ routes, main entry point)
backend/       ← ORPHANED (90% duplicate, no entry point)
```

**Evidence:**
- No imports from `backend/` in `src/`
- No server initialization in `backend/`
- 7+ duplicate route files confirmed
- `ARCHITECTURE_CONSOLIDATION.md` already documents the issue

**Solution:** Deprecate `backend/` directory
```bash
# Day 1: Audit
diff -r backend/src src/
# Identify unique files (10% of backend/)

# Day 2: Migrate unique code
mkdir src/security
cp backend/src/security/* src/security/

# Day 3: Move documentation
mkdir docs/security
mv backend/*.md docs/security/

# Day 4: Archive & verify
mkdir .deprecated/backend-2026-08-10
mv backend .deprecated/
npm run build && npm test
```

**Acceptance Criteria:**
- [ ] All unique security modules in `src/security/`
- [ ] All documentation in `docs/security/`
- [ ] `backend/` archived to `.deprecated/`
- [ ] All tests passing
- [ ] Zero references to `backend/` in active code
- [ ] Updated `README.md` and `CONTRIBUTING.md`

**Effort:** 32 hours (4 days × 8 hours)  
**Owner:** Senior Engineer  
**Deadline:** Week 1

---

### 2. Enterprise Authentication (30 hours) ⚠️ BLOCKING SALES
**Status:** Stubs only, enterprise customers cannot deploy  
**Impact:** Cannot sell to enterprises requiring SSO


**Current State:**
```typescript
// ❌ src/auth/saml-provider.ts - Stub only
export class SamlProvider {
  async authenticate() {
    throw new Error('SAML not implemented');
  }
}

// ❌ src/auth/oidc-provider.ts - Stub only
export class OidcProvider {
  async authenticate() {
    throw new Error('OIDC not implemented');
  }
}

// ❌ src/auth/ldap-connector.ts - Stub only
export class LdapConnector {
  async bind() {
    throw new Error('LDAP not implemented');
  }
}
```

**Implementation Plan:**

**A. SAML SSO (8 hours)**
```typescript
// ✅ Real implementation needed
import { SAML } from '@node-saml/passport-saml';

export class SamlProvider {
  private saml: SAML;
  
  constructor(config: SamlConfig) {
    this.saml = new SAML({
      entryPoint: config.idpUrl,
      issuer: config.spEntityId,
      cert: config.idpCertificate,
      audience: config.audience,
      signatureAlgorithm: 'sha256',
      digestAlgorithm: 'sha256'
    });
  }
  
  async authenticate(samlResponse: string) {
    const profile = await this.saml.validatePostResponse(samlResponse);
    return {
      userId: profile.nameID,
      email: profile.email,
      groups: profile.groups,
      attributes: profile.attributes
    };
  }
  
  getLoginUrl(relayState?: string) {
    return this.saml.getAuthorizeUrl(relayState);
  }
}
```

**B. OIDC Integration (10 hours)**
```typescript
// ✅ Azure AD, Okta, Auth0 support
import { Issuer, generators } from 'openid-client';

export class OidcProvider {
  private client: any;
  
  async initialize(config: OidcConfig) {
    const issuer = await Issuer.discover(config.issuerUrl);
    this.client = new issuer.Client({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uris: [config.redirectUri],
      response_types: ['code'],
    });
  }
  
  getAuthorizationUrl() {
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);
    
    return this.client.authorizationUrl({
      scope: 'openid email profile',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });
  }
  
  async handleCallback(code: string, codeVerifier: string) {
    const tokenSet = await this.client.callback(
      config.redirectUri,
      { code },
      { code_verifier: codeVerifier }
    );
    
    const userInfo = await this.client.userinfo(tokenSet.access_token);
    return { userId: userInfo.sub, email: userInfo.email };
  }
}
```


**C. LDAP/AD Integration (12 hours)**
```typescript
// ✅ Active Directory support
import ldap from 'ldapjs';

export class LdapConnector {
  private client: ldap.Client;
  
  async connect(config: LdapConfig) {
    this.client = ldap.createClient({
      url: config.url,
      timeout: 5000,
      connectTimeout: 10000,
      tlsOptions: { rejectUnauthorized: !config.allowSelfSigned }
    });
    
    await this.bind(config.bindDn, config.bindPassword);
  }
  
  async authenticate(username: string, password: string) {
    const userDn = await this.findUserDn(username);
    
    try {
      await this.bind(userDn, password);
      const user = await this.getUserInfo(userDn);
      return {
        userId: user.uid,
        email: user.mail,
        groups: user.memberOf,
        displayName: user.displayName
      };
    } catch (error) {
      throw new Error('Invalid credentials');
    }
  }
  
  private async findUserDn(username: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.client.search(
        this.config.searchBase,
        {
          filter: `(sAMAccountName=${username})`,
          scope: 'sub',
          attributes: ['dn']
        },
        (err, res) => {
          if (err) return reject(err);
          
          res.on('searchEntry', (entry) => {
            resolve(entry.objectName);
          });
          res.on('error', reject);
        }
      );
    });
  }
}
```

**Testing Requirements:**
- [ ] SAML: Test with Okta, Azure AD, OneLogin
- [ ] OIDC: Test with Azure AD, Auth0, Keycloak
- [ ] LDAP: Test with Active Directory, OpenLDAP

**Effort:** 30 hours  
**Owner:** Authentication Team  
**Deadline:** Week 2-3

---

## 🟡 HIGH PRIORITY - Needed for Enterprise (P1)

### 3. Hardware Compatibility Testing (48 hours)
**Status:** Zero vendors certified  
**Impact:** Cannot guarantee camera compatibility

**Required Testing Matrix:**

| Vendor | Models | Tests Required | Priority |
|--------|--------|----------------|----------|
| Axis Communications | M3046-V, P3245-LVE, Q6155-E | ONVIF, RTSP, PTZ, Events | P0 |
| Hikvision | DS-2CD2385G1, DS-2DE4225IW-DE | ONVIF, RTSP, PTZ, ANPR | P0 |
| Dahua | IPC-HDW5831R, SD6CE445XA-HNR | ONVIF, RTSP, PTZ, Analytics | P0 |
| Hanwha | PNM-9085RQZ, XNO-8080R | ONVIF, RTSP, Events | P1 |
| Bosch | FLEXIDOME IP 5000i, MIC IP 7100i | ONVIF, RTSP, PTZ | P1 |


**Test Protocol (per vendor):**

```typescript
// hardware-compatibility-test.ts
describe('Axis Communications Compatibility', () => {
  test('ONVIF Discovery', async () => {
    const cameras = await onvifDiscovery.scan('192.168.1.0/24');
    const axisCameras = cameras.filter(c => c.manufacturer === 'Axis');
    expect(axisCameras.length).toBeGreaterThan(0);
  });
  
  test('RTSP Streaming H.264', async () => {
    const stream = await rtspClient.connect(camera.profiles.main.uri);
    expect(stream.codec).toBe('H264');
    expect(stream.resolution).toMatchObject({ width: 1920, height: 1080 });
  });
  
  test('RTSP Streaming H.265', async () => {
    const stream = await rtspClient.connect(camera.profiles.sub.uri);
    expect(stream.codec).toBe('H265');
  });
  
  test('PTZ Control', async () => {
    await camera.ptz.absoluteMove({ pan: 45, tilt: -30, zoom: 2.5 });
    await wait(2000);
    const position = await camera.ptz.getPosition();
    expect(position.pan).toBeCloseTo(45, 1);
    expect(position.tilt).toBeCloseTo(-30, 1);
  });
  
  test('Motion Detection Events', async () => {
    const events = [];
    camera.on('motion', (event) => events.push(event));
    
    // Trigger motion (manual)
    await wait(5000);
    
    expect(events.length).toBeGreaterThan(0);
  });
  
  test('Two-Way Audio', async () => {
    const audioStream = await camera.audio.startBackchannel();
    await audioStream.write(testAudioBuffer);
    expect(audioStream.status).toBe('playing');
  });
  
  test('Recording Reliability (24 hours)', async () => {
    const recording = await recorder.start(camera.id);
    await wait(24 * 60 * 60 * 1000); // 24 hours
    
    expect(recording.segments.length).toBeGreaterThan(1400); // 60sec segments
    expect(recording.dataLoss).toBe(0);
    expect(recording.errors).toBe(0);
  });
});
```

**Deliverable:**
- Hardware compatibility matrix (Excel/CSV)
- Test results per vendor
- Known issues and workarounds
- Firmware version recommendations

**Effort:** 16 hours per vendor × 3 vendors = 48 hours  
**Owner:** QA Team  
**Deadline:** Week 2-4

---

### 4. Load Testing (40 hours)
**Status:** Not performed  
**Impact:** Unknown scalability limits

**Test Scenarios:**

**A. 100 Camera Scenario (8 hours)**
```yaml
scenario: moderate_load
cameras: 100
resolution: 1920x1080
fps: 30
bitrate: 4 Mbps
duration: 4 hours

expected:
  - Latency: <500ms (live view)
  - CPU: <70% (single server)
  - Memory: <16 GB
  - Network: 400 Mbps
  - Storage: 480 GB/hour
  - Alerts: <100ms processing
  - Zero dropped frames
```

**B. 1000 Camera Scenario (16 hours)**
```yaml
scenario: high_load
cameras: 1000
resolution: 1920x1080
fps: 15
bitrate: 2 Mbps
duration: 8 hours

expected:
  - Latency: <1000ms (live view)
  - CPU: <80% (cluster)
  - Memory: <64 GB (distributed)
  - Network: 2 Gbps
  - Storage: 1.8 TB/hour
  - Alerts: <500ms processing
  - Incident correlation: <2s
```


**C. Alert Storm Scenario (8 hours)**
```yaml
scenario: alert_storm
cameras: 500
alert_rate: 10000 alerts/minute
correlation_enabled: true
duration: 2 hours

expected:
  - Alert processing: <50ms/alert
  - Correlation: <2s (cluster formation)
  - Incident creation: <500ms
  - Database: No deadlocks
  - Memory: No leaks
  - Zero dropped alerts
```

**D. Failover Scenario (8 hours)**
```yaml
scenario: failover_resilience
cameras: 200
test_sequence:
  - minute_0: Normal operation
  - minute_5: Primary storage 100% full
  - minute_6: Verify failover to secondary
  - minute_10: S3 endpoint failure
  - minute_11: Verify local staging
  - minute_15: Database connection loss
  - minute_16: Verify Redis fallback
  - minute_20: Recovery

expected:
  - Failover time: <30s
  - Zero data loss
  - Automatic recovery
  - All recordings preserved
```

**Tools:**
- k6 for HTTP load testing
- Artillery for WebSocket testing
- Custom camera simulator (RTSP)
- Prometheus + Grafana for monitoring

**Effort:** 40 hours  
**Owner:** Performance Team  
**Deadline:** Week 5-6

---

### 5. Integration Testing (64 hours)
**Status:** Incomplete  
**Impact:** Unknown end-to-end behavior

**Required Test Suites:**

**A. Full Incident Lifecycle (16 hours)**
```typescript
describe('Incident Lifecycle Integration', () => {
  test('Alert → Correlation → Incident → Investigation → Resolution', async () => {
    // 1. Generate alerts across 3 cameras
    const alerts = await Promise.all([
      camera1.triggerMotion(),
      camera2.triggerMotion(),
      camera3.triggerMotion()
    ]);
    
    // 2. Wait for correlation (within 2 minutes)
    const cluster = await waitForCluster(alerts, { timeout: 120000 });
    expect(cluster.alertIds).toHaveLength(3);
    
    // 3. Verify incident created
    const incident = await waitForIncident(cluster.id);
    expect(incident.severity).toBe('HIGH');
    expect(incident.type).toBe('SECURITY_INTRUSION');
    
    // 4. Operator acknowledges
    await incident.acknowledge('operator-001');
    expect(incident.status).toBe('INVESTIGATING');
    
    // 5. Evidence captured
    const evidence = await incident.getEvidence();
    expect(evidence.snapshots).toHaveLength(3);
    expect(evidence.videos).toHaveLength(3);
    
    // 6. Resolve incident
    await incident.resolve({
      resolution: 'False alarm - cleaning crew',
      actions: ['Updated personnel schedule']
    });
    
    expect(incident.status).toBe('RESOLVED');
    expect(incident.resolvedAt).toBeTruthy();
  });
});
```

**B. Multi-Camera Person Tracking (16 hours)**
```typescript
describe('Cross-Camera Person Tracking', () => {
  test('Track person across 5 cameras for 2 minutes', async () => {
    const person = await simulatePerson({
      path: ['cam-1', 'cam-2', 'cam-3', 'cam-4', 'cam-5'],
      duration: 120000
    });
    
    // Wait for analytics
    await wait(130000);
    
    const tracks = await personTracker.getJourney(person.id);
    
    expect(tracks).toHaveLength(5);
    expect(tracks.map(t => t.cameraId)).toEqual([
      'cam-1', 'cam-2', 'cam-3', 'cam-4', 'cam-5'
    ]);
    
    // Verify timestamps are sequential
    for (let i = 1; i < tracks.length; i++) {
      expect(tracks[i].firstSeen).toBeGreaterThan(tracks[i-1].lastSeen);
    }
  });
});
```


**C. Federation Scenarios (16 hours)**
```typescript
describe('Federation Integration', () => {
  test('Cross-site search and playback', async () => {
    // Setup: 3 federated sites
    const sites = [
      { id: 'site-mumbai', cameras: 50 },
      { id: 'site-delhi', cameras: 40 },
      { id: 'site-bangalore', cameras: 60 }
    ];
    
    // Search across all sites
    const results = await federation.search({
      query: 'person wearing red shirt',
      timeRange: { start: '-2h', end: 'now' },
      sites: ['site-mumbai', 'site-delhi', 'site-bangalore']
    });
    
    expect(results.totalMatches).toBeGreaterThan(0);
    expect(results.sites).toHaveLength(3);
    
    // Play back from remote site
    const recording = results.matches[0];
    const stream = await federation.playback({
      siteId: recording.siteId,
      recordingId: recording.id
    });
    
    expect(stream.status).toBe('playing');
    expect(stream.latency).toBeLessThan(2000); // <2s for remote
  });
});
```

**D. Storage Tier Migration (16 hours)**
```typescript
describe('Storage Lifecycle Integration', () => {
  test('Hot → Warm → Cold → Archive flow', async () => {
    // Record on hot storage
    const recording = await recorder.start('cam-001', {
      tier: 'hot',
      duration: 300000 // 5 minutes
    });
    
    await recording.complete();
    expect(recording.tier).toBe('hot');
    
    // Age recording (simulate 30 days)
    await advanceTime(30, 'days');
    
    // Wait for lifecycle policy
    await wait(600000); // 10 minutes for policy execution
    
    const updated = await storage.getRecording(recording.id);
    expect(updated.tier).toBe('warm');
    
    // Age to 90 days
    await advanceTime(60, 'days');
    await wait(600000);
    
    const cold = await storage.getRecording(recording.id);
    expect(cold.tier).toBe('cold');
    
    // Verify retrieval still works
    const stream = await playback.start(recording.id);
    expect(stream.status).toBe('playing');
    expect(stream.retrievalTime).toBeLessThan(30000); // <30s from cold
  });
});
```

**Effort:** 64 hours  
**Owner:** QA + Integration Team  
**Deadline:** Week 7-8

---

## 🔵 MEDIUM PRIORITY - Enhancement (P2)

### 6. Mobile App Development (12 weeks) ⚠️ OPTIONAL
**Status:** Not started (no mobile/ directory)  
**Impact:** Desktop-only access

**Scope Decision Required:**

**Option A: Skip Mobile for v1.0 (RECOMMENDED)**
- Focus on desktop web application
- Mobile browser support sufficient for many clients
- Defer mobile to v2.0
- **Saves:** 12 weeks development time

**Option B: Build Mobile App**
- React Native (iOS + Android)
- 12 weeks development + 2 weeks testing

**Mobile App Requirements (if proceeding):**
```
Features:
- Live view (4-16 cameras grid)
- Push notifications for alerts
- Incident acknowledgment
- PTZ control
- Evidence review
- Playback (last 24 hours)
- Offline mode (cached data)

Technical:
- React Native 0.72+
- Socket.io for real-time
- Secure video player (ExoPlayer/AVPlayer)
- Biometric authentication
- Background notifications
- 4G/5G optimization

Effort:
- Week 1-2: Project setup + navigation
- Week 3-4: Live view implementation
- Week 5-6: Alerts + notifications
- Week 7-8: Playback + evidence
- Week 9-10: PTZ + advanced features
- Week 11-12: Testing + optimization
- Week 13-14: App store deployment

Total: 14 weeks × 2 developers = 28 person-weeks
```

**Recommendation:** SKIP for v1.0, plan for v2.0

---


## 📊 Effort Summary

| Priority | Task | Effort | Timeline | Blocker Status |
|----------|------|--------|----------|----------------|
| **P0** | Architecture Consolidation | 32h (4d) | Week 1 | 🔴 BLOCKS EVERYTHING |
| **P0** | Enterprise Auth (SAML/OIDC/LDAP) | 30h | Week 2-3 | 🔴 BLOCKS SALES |
| **P1** | Hardware Testing (3 vendors) | 48h | Week 2-4 | 🟡 BLOCKS DEPLOY |
| **P1** | Load Testing (1000 cameras) | 40h | Week 5-6 | 🟡 BLOCKS SCALE |
| **P1** | Integration Testing | 64h | Week 7-8 | 🟡 BLOCKS QUALITY |
| **P2** | Mobile App | 12 weeks | v2.0 | 🔵 OPTIONAL |

**Total Critical Path:** 214 hours (27 days)  
**With 3 engineers:** ~9 weeks  
**Target completion:** End of Week 9

---

## 🎯 Recommended Execution Plan

### Phase 1: Foundation (Week 1) - P0 CRITICAL
**Team:** 2 Senior Engineers

**Day 1-2:** Architecture Consolidation Prep
- Audit `backend/` vs `src/` differences
- Document unique security modules
- Create migration plan

**Day 3-4:** Execute Migration
- Move unique code to `src/security/`
- Move docs to `docs/security/`
- Archive `backend/` to `.deprecated/`
- Update all imports and references

**Day 5:** Verification
- Run full test suite
- Check TypeScript compilation
- Verify CI/CD pipeline
- Update documentation

**Deliverables:**
- ✅ Single source of truth (`src/` only)
- ✅ Zero architectural ambiguity
- ✅ All tests passing
- ✅ Updated documentation

---

### Phase 2: Enterprise Readiness (Week 2-3) - P0 CRITICAL
**Team:** 2 Backend Engineers + 1 Security Engineer

**Week 2:**
- Implement SAML SSO (8h)
- Implement OIDC integration (10h)
- Create authentication middleware (4h)
- Write unit tests (6h)

**Week 3:**
- Implement LDAP/AD integration (12h)
- Integration testing with real IdPs (8h)
- Documentation + deployment guides (6h)
- Security review (4h)

**Deliverables:**
- ✅ SAML working with Okta, Azure AD
- ✅ OIDC working with Auth0, Keycloak
- ✅ LDAP working with Active Directory
- ✅ Full test coverage
- ✅ Deployment documentation

---

### Phase 3: Hardware Validation (Week 2-4 parallel) - P1
**Team:** 2 QA Engineers

**Week 2-3:** Axis + Hikvision
- Setup test environment
- Run compatibility tests
- Document results

**Week 4:** Dahua
- Run compatibility tests
- Create compatibility matrix
- Write deployment recommendations

**Deliverables:**
- ✅ 3 vendors certified
- ✅ Compatibility matrix
- ✅ Known issues documented
- ✅ Firmware recommendations

---

### Phase 4: Performance Validation (Week 5-6) - P1
**Team:** 2 Performance Engineers

**Week 5:**
- Setup load testing infrastructure
- 100 camera scenario
- 1000 camera scenario
- Bottleneck analysis

**Week 6:**
- Alert storm testing
- Failover scenario testing
- Performance optimization
- Final report

**Deliverables:**
- ✅ Load test results documented
- ✅ Scalability limits known
- ✅ Performance optimizations applied
- ✅ SLA recommendations

---

### Phase 5: Integration Validation (Week 7-8) - P1
**Team:** 2 QA Engineers + 1 DevOps

**Week 7:**
- Incident lifecycle tests
- Multi-camera tracking tests
- Federation scenario tests

**Week 8:**
- Storage lifecycle tests
- End-to-end smoke tests
- Regression testing
- Final sign-off

**Deliverables:**
- ✅ Full integration test suite
- ✅ Zero critical bugs
- ✅ Regression tests automated
- ✅ QA sign-off

---

### Phase 6: Production Hardening (Week 9)
**Team:** All hands

- Final bug fixes
- Documentation review
- Deployment rehearsal
- Security audit
- Performance tuning
- Release preparation

**Deliverables:**
- ✅ Production deployment plan
- ✅ Rollback procedures
- ✅ Monitoring dashboards
- ✅ On-call runbooks
- ✅ v1.0 RELEASE

---

