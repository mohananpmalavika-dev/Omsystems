# Sentinel Grid: Enterprise Master Test Plan

**Document Version:** 1.0.0-PROD  
**Test Framework:** Vitest, TypeScript Compiler, Jest, Custom Static Scanners  
**Target Environments:** CI/CD Pipeline, Staging Environment, Production Canary  

---

## 1. Test Automation Architecture

The Sentinel Grid test suite is structured into multi-tiered test rings:

```
Ring 0: Static Analysis & Anti-Simulation Rules (Truth Verification)
   └── Ring 1: Strict TypeScript Compilation (Zero Emit Errors)
         └── Ring 2: Unit Testing (Crypto, RBAC, Fencing, Decoders)
               └── Ring 3: Subsystem Integration (Live Flow, Storage Failover, Media Gateway)
                     └── Ring 4: Scale & Chaos Resilience (WAN Outage, Camera Reboot)
```

---

## 2. Execution Commands & Test Directory Map

### 2.1 Ring 0: Static Analysis & Anti-Simulation Scanner
```bash
# Verifies zero Math.random() or fake confidence in production code
npm run verify:production-truth

# Verifies TLS security and prohibited localhost leaks in production configs
npm run verify:tls-security
npm run verify:no-production-localhost
```

### 2.2 Ring 1: Type Checking Across All Workspaces
```bash
npm run typecheck:all
```

### 2.3 Ring 2: Unit Test Suite
```bash
# Core authentication, RBAC, and distributed fencing tests
npx vitest run test/authorization.test.ts test/ha/distributed-fencing.test.ts

# Banking dual-control and security tests
npx vitest run test/branch-opening-dual-control.test.ts test/banking-security-subsystem.test.ts
```

### 2.4 Ring 3: Integration & Media Streaming Tests
```bash
# End-to-end live stream authorization and proxy flow
npx vitest run test/live-view-flow.test.ts

# Tiered storage, failover, and legal hold retention verification
npx vitest run test/storage/local-disk-storage.test.ts test/storage/storage-failover.test.ts test/storage/retention-legal-hold.test.ts

# Multi-camera synchronized playback test
npx vitest run test/vms-synchronized-playback.test.ts test/synchronized-playback-production.test.ts
```

### 2.5 Ring 4: Edge WAN Resilience & Outage Recovery
```bash
# Simulates WAN disconnect, local buffer accumulation, and reconnection backfill
npx vitest run test/offline-edge-survivability.test.ts
```
