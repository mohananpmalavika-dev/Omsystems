# Security Architecture Consolidation Plan

## Current State Analysis

### Three Separate Security Route Files

1. **src/routes/security-dashboard.routes.ts** (Fastify)
   - Used by main control plane app (src/app.ts)
   - Uses SecurityServicesFactory
   - Most comprehensive implementation
   - Status: **KEEP AS PRIMARY**

2. **backend/src/routes/security.routes.ts** (Express)
   - Uses individual service imports (not factory pattern)
   - Duplicate endpoints
   - Status: **DEPRECATE & REMOVE**

3. **src/security/api/security-dashboard.routes.ts** (Express)
   - Uses SecurityServicesFactory
   - Duplicate of #1 but Express-based
   - Status: **DEPRECATE & REMOVE**

### Two Service Layer Patterns

1. **SecurityServicesFactory** (src/security/services/index.ts)
   - Singleton pattern
   - Centralized service management
   - Used by src/routes/security-dashboard.routes.ts
   - Status: **KEEP AS PRIMARY**

2. **Individual Service Exports** (backend/src/services/)
   - Direct service instantiation
   - No centralized management
   - Used by backend/src/routes/security.routes.ts
   - Status: **MIGRATE TO FACTORY PATTERN**

## Consolidation Strategy

### Phase 1: Service Layer Unification ✅

**Goal**: All services accessible via SecurityServicesFactory

**Actions**:
1. Audit services in backend/src/services/ for duplicates
2. Move unique services to src/security/services/
3. Update SecurityServicesFactory to include all services
4. Remove backend/src/services/ security services

### Phase 2: Route Consolidation ✅

**Goal**: Single security API route file (Fastify-based)

**Actions**:
1. Keep: src/routes/security-dashboard.routes.ts
2. Audit endpoints in Express routes for missing features
3. Migrate unique endpoints to Fastify routes
4. Delete: backend/src/routes/security.routes.ts
5. Delete: src/security/api/security-dashboard.routes.ts

### Phase 3: Type Consolidation ✅

**Goal**: Single source of truth for security types

**Actions**:
1. Keep: src/security/types.ts
2. Audit backend/src/types/ for security types
3. Merge unique types into src/security/types.ts
4. Update all imports

## Service Comparison Matrix

| Service | SecurityServicesFactory | backend/src/services | Action |
|---------|------------------------|---------------------|---------|
| CertificateManagement | ✅ | ✅ certificateManager | Unified |
| SecretVault | ✅ | ❌ | Keep Factory |
| PasswordRotation | ✅ | ✅ passwordRotationService | Unified |
| ZeroTrust | ✅ | ✅ zeroTrustService | Unified |
| TamperDetection | ✅ | ✅ tamperDetectionService | Unified |
| VideoEncryption | ✅ | ✅ videoEncryptionService | Unified |
| ImmutableStorage | ✅ | ✅ immutableStorageService | Unified |
| RansomwareDetection | ✅ | ✅ ransomwareDetectionService | Unified |
| SupplyChainVerification | ✅ | ✅ supplyChainVerificationService | Unified |
| SecureBootTPM | ✅ | ✅ secureBootTPMService | Unified |
| SecurityOperations | ❌ | ✅ securityOperationsService | Add to Factory |
| SecurityPosture | ✅ | ❌ | Keep Factory |
| HSM | ✅ | ❌ | Keep Factory |

## Endpoint Comparison

### Security Posture
- ✅ Fastify: GET /v1/security/posture
- ✅ Express (backend): GET /api/security/posture
- ✅ Express (api): GET /v1/security/posture
- **Action**: Keep Fastify, remove duplicates

### Certificates
- ✅ Fastify: GET/POST /v1/security/certificates
- ✅ Express (backend): GET/POST /api/security/certificates
- ✅ Express (api): GET/POST /v1/security/certificates
- **Action**: Keep Fastify, remove duplicates

### Secrets
- ✅ Fastify: Missing secret endpoints
- ❌ Express (backend): Missing secret endpoints  
- ✅ Express (api): GET/POST/PUT/DELETE /v1/security/secrets
- **Action**: Migrate api/secrets to Fastify, then remove

### Password Rotation
- ✅ Fastify: Missing rotation endpoints
- ✅ Express (backend): Full rotation endpoints
- ✅ Express (api): Full rotation endpoints
- **Action**: Keep best implementation in Fastify

## Implementation Steps

### Step 1: Verify Current Usage
- [x] Identify which route files are actively registered
- [x] Map service dependencies
- [x] Check for breaking changes

### Step 2: Create Migration Branch
- [ ] Create feature branch: `fix/consolidate-security-architecture`
- [ ] Document breaking changes
- [ ] Plan rollback strategy

### Step 3: Service Layer Migration
- [ ] Update SecurityServicesFactory with all services
- [ ] Add service factory initialization
- [ ] Test all services via factory

### Step 4: Route Migration
- [ ] Add missing endpoints to Fastify routes
- [ ] Update endpoint paths for consistency
- [ ] Test all endpoints

### Step 5: Cleanup
- [ ] Delete backend/src/routes/security.routes.ts
- [ ] Delete src/security/api/security-dashboard.routes.ts
- [ ] Remove unused service files
- [ ] Update imports across codebase

### Step 6: Verification
- [ ] Run all security tests
- [ ] Test API endpoints manually
- [ ] Verify no broken imports
- [ ] Update API documentation

## Risk Assessment

### High Risk
- ❌ Breaking API contracts for existing clients
- ❌ Service initialization order issues
- ❌ Missing dependency injection

### Medium Risk
- ⚠️ Test coverage gaps
- ⚠️ Documentation lag
- ⚠️ Incomplete migration

### Low Risk
- ✅ Type conflicts (easily fixed)
- ✅ Import path changes (compile-time errors)

## Rollback Plan

1. Keep old files in `.deprecated/` for 1 release
2. Feature flag: `USE_LEGACY_SECURITY_ROUTES`
3. Document migration guide for clients
4. Provide adapter layer if needed

## Success Criteria

- ✅ Single security route file (Fastify)
- ✅ All services in SecurityServicesFactory
- ✅ All tests passing
- ✅ Zero duplicate endpoints
- ✅ Documentation updated
- ✅ Performance maintained or improved

## Timeline

- **Day 1**: Service layer consolidation
- **Day 2**: Route migration and testing
- **Day 3**: Cleanup and documentation
- **Day 4**: Final testing and deployment

---

**Status**: 🟡 IN PROGRESS
**Owner**: Kiro AI
**Started**: 2026-08-10
**Target Completion**: 2026-08-13
