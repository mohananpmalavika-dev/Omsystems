# Architecture Consolidation - Backend Directory Deprecation

**Status:** PROPOSED  
**Decision Date:** TBD  
**Implementation Date:** TBD

---

## Problem Statement

The repository currently contains TWO parallel application structures:

```
src/                    ← Active control plane (HAS entry point)
  ├── index.ts          ✓ Main entry point
  ├── app.ts            ✓ Fastify application
  ├── routes/           ✓ 50+ route files
  └── services/         ✓ Business logic

backend/                ← Orphaned structure (NO entry point)
  ├── (no index.ts)     ✗ No entry point found
  ├── src/routes/       ✗ Duplicate routes
  └── src/services/     ✗ Not imported anywhere
```

**Verification Results:**

1. ✗ No imports from `backend/` found in `src/`
2. ✗ No server initialization in `backend/`
3. ✗ `backend/` not in workspace package.json
4. ✓ 7+ duplicate route files identified
5. ✓ `src/incidents.routes.ts` (753 lines) vs `backend/src/incidents.routes.ts` (260 lines) - DUPLICATE

---

## Impact Analysis

### Risks of Current State

1. **Developer Confusion**
   - Which file should be modified?
   - Which implementation is active?
   - Are both maintained?

2. **Maintenance Burden**
   - Changes must be applied twice
   - Tests must cover both implementations
   - Documentation must explain both

3. **Architectural Ambiguity**
   - Is this a layered architecture?
   - Are both entry points?
   - What's the canonical control plane?

4. **Production Risk**
   - Unused code in production deployment
   - Increased bundle size
   - Security surface area expanded unnecessarily


---

## Analysis: What's in backend/ ?

### Duplicate Files (Should NOT migrate)

```
backend/src/routes/
  ├── incidents.routes.ts        ← DUPLICATE of src/routes/incidents.routes.ts
  ├── capabilities.routes.ts     ← DUPLICATE of src/routes/capabilities.routes.ts
  ├── dashboard.routes.ts        ← DUPLICATE of src/routes/dashboard.routes.ts
  ├── digital-twin.routes.ts     ← DUPLICATE of src/routes/digital-twin.routes.ts
  ├── credentials.routes.ts      ← DUPLICATE of src/routes/credentials.routes.ts
  ├── federation.routes.ts       ← DUPLICATE of src/routes/federation.routes.ts
  └── reports.routes.ts          ← DUPLICATE of src/routes/reports.routes.ts
```

### Unique Files (Should migrate)

```
backend/src/security/
  ├── siem-exporter.ts           ← UNIQUE - Should migrate
  ├── adapters/                  ← UNIQUE - Should migrate
  └── providers/                 ← UNIQUE - Should migrate

backend/docs/
  ├── ENTERPRISE_SECURITY_README.md
  ├── SECURITY_AUDIT_2026-08-08.md
  ├── SECURITY_IMPLEMENTATION_SUMMARY.md
  ├── WEBSOCKET_AUTH_FIX_SUMMARY.md
  ├── WEBSOCKET_AUTH_VERIFICATION.md
  └── ZERO_TRUST_ARCHITECTURE.md
```

### Assessment

**Duplicate Routes:** 90% of backend/ content  
**Unique Security Code:** 10% of backend/ content  
**Unique Documentation:** Valuable, should keep

---

## Recommended Decision

### Option 1: Deprecate backend/ (RECOMMENDED)

**Actions:**

1. **Migrate unique security modules:**
   ```
   backend/src/security/* → src/security/
   ```

2. **Preserve documentation:**
   ```
   backend/docs/* → docs/security/
   ```

3. **Deprecate duplicate code:**
   ```
   backend/ → .deprecated/backend-[DATE]/
   ```

**Pros:**
- Eliminates duplicate maintenance
- Clear architectural direction
- Reduces confusion
- Smaller production bundle

**Cons:**
- Need to verify no hidden dependencies
- Need to migrate unique code

**Effort:** 2-3 days

---

### Option 2: Integrate backend/ as separate layer (NOT RECOMMENDED)

**Would require:**

1. Create `backend/index.ts` entry point
2. Add `backend/` to workspace package.json
3. Define explicit API contract between src/ and backend/
4. Document layered architecture explicitly
5. Remove duplicate routes

**Pros:**
- Preserves work done in backend/
- Could enable modular deployment

**Cons:**
- Adds architectural complexity
- Requires significant refactoring
- Unclear value proposition
- Still need to resolve duplicates

**Effort:** 2-3 weeks

---

## Migration Plan (Option 1)

### Phase 1: Audit (1 day)

```bash
# Compare all files in backend/ with src/
diff -r backend/src src/

# Identify unique files
find backend/src -name "*.ts" | while read file; do
  basename=$(basename "$file")
  if ! find src -name "$basename" | grep -q .; then
    echo "UNIQUE: $file"
  fi
done
```

### Phase 2: Migrate Unique Code (1 day)

```bash
# Create security directories
mkdir src\security\adapters
mkdir src\security\providers

# Migrate unique security files
copy backend\src\security\siem-exporter.ts src\security\
xcopy /E /I backend\src\security\adapters src\security\adapters
xcopy /E /I backend\src\security\providers src\security\providers

# Update imports in migrated files
# Change: from '../...' 
# To:     from '../../...'
```

### Phase 3: Migrate Documentation (1 day)

```bash
# Create security documentation folder
mkdir docs\security

# Move security docs
copy backend\ENTERPRISE_SECURITY_README.md docs\security\
copy backend\SECURITY_AUDIT_2026-08-08.md docs\security\
copy backend\SECURITY_IMPLEMENTATION_SUMMARY.md docs\security\
copy backend\WEBSOCKET_AUTH_FIX_SUMMARY.md docs\security\
copy backend\WEBSOCKET_AUTH_VERIFICATION.md docs\security\
copy backend\ZERO_TRUST_ARCHITECTURE.md docs\security\
```


### Phase 4: Create Deprecation Notice (30 minutes)

Create `backend/DEPRECATION_NOTICE.md`:

```markdown
# Backend Directory - DEPRECATED

**Deprecated:** [DATE]  
**Reason:** Architectural consolidation - duplicate code removed  
**Migrated To:** `src/` (main control plane)

## What Was Migrated

### Unique Security Modules
- `backend/src/security/siem-exporter.ts` → `src/security/siem-exporter.ts`
- `backend/src/security/adapters/*` → `src/security/adapters/*`
- `backend/src/security/providers/*` → `src/security/providers/*`

### Documentation
- All security documentation moved to `docs/security/`

## What Was Removed (Duplicates)

- `backend/src/routes/*` - All duplicates of `src/routes/*`
- `backend/src/services/*` - All duplicates of `src/services/*`

## Why This Happened

The `backend/` directory was an earlier architectural iteration that
became redundant when the main `src/` control plane was established.

Analysis showed:
- No active imports from backend/ to src/
- No server entry point in backend/
- 90% duplicate code

## Current Architecture

```
Control Plane (src/)
    ↓
Microservices (analytics-engine/, media-gateway/, etc.)
    ↓
Shared Packages (packages/*)
```

## Questions?

See `ARCHITECTURE_CONSOLIDATION.md` for full analysis.
```

### Phase 5: Move to .deprecated/ (30 minutes)

```bash
# Create archive directory
mkdir .deprecated\backend-archived-2026-08-10

# Copy entire backend/ directory
xcopy /E /I backend .deprecated\backend-archived-2026-08-10

# Add git tracking
git add .deprecated\backend-archived-2026-08-10\DEPRECATION_NOTICE.md
git commit -m "docs: Archive backend/ directory - duplicate architecture removed"
```

### Phase 6: Remove backend/ (After verification period)

```bash
# Wait 30 days to ensure no issues

# Then remove
rmdir /S /Q backend
git commit -m "refactor: Remove deprecated backend/ directory"
```

---

## Verification Checklist

Before deprecation:

- [ ] All unique security modules identified
- [ ] Security modules migrated to `src/security/`
- [ ] All imports updated in migrated files
- [ ] Documentation moved to `docs/security/`
- [ ] Tests pass with migrated code
- [ ] TypeScript compilation successful
- [ ] No references to `backend/` in active code

After deprecation:

- [ ] Application starts successfully
- [ ] All routes accessible
- [ ] Security features functional
- [ ] No import errors
- [ ] CI/CD pipeline passes

---

## Communication Plan

### Stakeholders to Notify

1. **Engineering Team**
   - Slack announcement
   - Team meeting presentation
   - Updated onboarding docs

2. **Documentation Team**
   - Update README.md
   - Update ARCHITECTURE.md
   - Update CONTRIBUTING.md

3. **DevOps Team**
   - No deployment changes needed
   - Update monitoring (if any backend/ specific)

### Message Template

```
📢 Architecture Update: backend/ Directory Deprecated

We've consolidated our architecture to eliminate duplicate code.

WHAT CHANGED:
- backend/ directory archived to .deprecated/
- Unique security modules migrated to src/security/
- Duplicate routes removed

WHAT TO DO:
- Use src/ for all new development
- Update any local scripts referencing backend/
- Review ARCHITECTURE_CONSOLIDATION.md for details

IMPACT:
- Clearer architecture
- Less maintenance burden
- Faster onboarding

Questions? See docs or ask in #engineering
```

---

## Rollback Plan

If issues discovered after deprecation:

### Immediate Rollback (< 30 days)

```bash
# Restore from .deprecated/
xcopy /E /I .deprecated\backend-archived-2026-08-10 backend

# Revert commits
git revert <commit-hash>
```

### Partial Rollback

```bash
# Restore specific file/directory
copy .deprecated\backend-archived-2026-08-10\src\security\specific-file.ts src\security\
```

---

## Success Criteria

### Objective Measures

- ✓ Zero references to `backend/` in active codebase
- ✓ All tests passing
- ✓ Application runs without errors
- ✓ CI/CD pipeline succeeds
- ✓ No developer confusion reports

### Subjective Measures

- ✓ Team understands new architecture
- ✓ Onboarding docs updated
- ✓ No questions about "which file to edit"

---

## Timeline

| Phase | Duration | Start | End |
|-------|----------|-------|-----|
| Audit | 1 day | Day 1 | Day 1 |
| Migrate Code | 1 day | Day 2 | Day 2 |
| Migrate Docs | 1 day | Day 3 | Day 3 |
| Deprecation Notice | 0.5 day | Day 4 AM | Day 4 AM |
| Archive | 0.5 day | Day 4 PM | Day 4 PM |
| Verification Period | 30 days | Day 5 | Day 35 |
| Final Removal | 1 day | Day 36 | Day 36 |

**Total Effort:** 4 days + 30-day soak period

---

## Approval Required

- [ ] Technical Lead
- [ ] Architecture Review Board
- [ ] Engineering Manager
- [ ] DevOps Lead

**Approved By:** _________________  
**Date:** _________________

---

*This is an Architectural Decision Record (ADR)*  
*Status: PROPOSED*  
*Version: 1.0*

