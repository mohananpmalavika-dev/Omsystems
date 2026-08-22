# Security Routes Deprecation Notice

**Date**: 2026-08-10
**Reason**: Architecture consolidation - P0 security fix

## Deprecated Files

### 1. backend/src/routes/security.routes.ts (Express)
- **Status**: Never registered, safe to remove
- **Replacement**: src/routes/security-dashboard.routes.ts (Fastify)
- **Migration**: No migration needed (was not in use)

### 2. src/security/api/security-dashboard.routes.ts (Express)
- **Status**: Exported but never imported
- **Replacement**: src/routes/security-dashboard.routes.ts (Fastify)
- **Migration**: No migration needed (was not in use)

## Why These Were Removed

1. **Duplicate implementations**: Three separate route files for the same functionality
2. **Inconsistent patterns**: Mix of Express and Fastify, factory vs direct imports
3. **Maintenance burden**: Changes had to be made in multiple places
4. **Confusion**: Unclear which implementation was canonical

## Current Architecture (After Consolidation)

### Security Routes
- **Primary**: `src/routes/security-dashboard.routes.ts` (Fastify)
- **Pattern**: Uses SecurityServicesFactory singleton
- **Registration**: Registered in src/app.ts

### Security Services
- **Primary**: `src/security/services/index.ts` (SecurityServicesFactory)
- **Pattern**: Singleton factory with all security services
- **Initialization**: Via initializeSecurityPlatform()

## If You Need These Files

Files are preserved in `.deprecated/security-routes/` for 2 release cycles.

After that, retrieve from git history:
```bash
git show HEAD~1:backend/src/routes/security.routes.ts
git show HEAD~1:src/security/api/security-dashboard.routes.ts
```

## Questions?

Contact: DevOps Team
Reference: P0 Security Architecture Consolidation
Issue: #SECURITY-ARCH-001
