# TypeScript Coverage Tracking

## Goal

**100% of production code must type-check with strict mode enabled.**

Previously, the root `tsconfig.json` had:
- `"strict": false` ❌
- `"noUncheckedIndexedAccess": false` ❌
- Multiple production routes explicitly excluded ❌

This meant `tsc --noEmit` could exit with code 0 while significant portions of production code weren't being checked.

## Current Status

### ✅ Fixed
- Enabled `"strict": true`
- Enabled `"noUncheckedIndexedAccess": true`
- Removed blanket exclusions of production routes

### 🔄 Previously Excluded Files (Now Included)

These files were previously excluded but are now part of type-checking:

1. **src/database/evidence-repository.ts**
   - Status: Now type-checked
   - Issues: TBD

2. **src/routes/evidence.routes.ts**
   - Status: Now type-checked
   - Issues: TBD

3. **src/routes/video-search.routes.ts**
   - Status: Now type-checked
   - Issues: TBD

4. **src/routes/analytics-phase2.routes.ts**
   - Status: Now type-checked
   - Issues: TBD

5. **src/routes/device-inventory.routes.ts**
   - Status: Now type-checked
   - Issues: TBD

6. **src/routes/live-operations.routes.ts**
   - Status: Now type-checked
   - Issues: TBD

7. **src/routes/compliance-enhanced.routes.ts**
   - Status: Now type-checked
   - Issues: TBD

8. **src/routes/maintenance-advanced.routes.ts**
   - Status: Now type-checked
   - Issues: TBD

9. **src/store-maintenance-extensions.ts**
   - Status: Now type-checked
   - Issues: TBD

## Next Steps

1. **Run type-check**: `npm run type-check`
2. **Fix all type errors** in the previously excluded files
3. **Verify CI passes** with strict mode
4. **Never exclude production files** from type-checking again

## CI Validation

The CI pipeline should include:

```yaml
- name: Type Check Production Code
  run: npm run type-check

- name: Type Check Tests
  run: npm run type-check:test
```

Both must pass for CI to succeed.

## Rules Going Forward

1. **All production code** must be included in `tsconfig.json`
2. **Strict mode** must be enabled
3. **`noUncheckedIndexedAccess`** must be enabled
4. If a file has type issues:
   - Fix the issues immediately, OR
   - Create a P0 issue with a fix deadline (max 1 sprint), OR
   - If the file is truly non-production, move it to a different directory

5. **Never commit** production code that doesn't type-check
6. **Never disable** strict checks to make CI pass

## Package-Specific Configs

Some packages may need their own `tsconfig.json`:

- `analytics-engine/tsconfig.json` ✅ (already exists)
- `recording-engine/tsconfig.json` ✅ (already exists)
- `edge-agent/tsconfig.json` ✅ (already exists)

Each package config should also have `"strict": true`.

## Known Technical Debt

Areas that commonly have type issues:

1. **Database query results** - Often typed as `any`
2. **External API responses** - Need proper type guards
3. **Configuration objects** - Use Zod schemas for validation
4. **Event handlers** - Ensure proper type narrowing
5. **Legacy code** - Incrementally add types

## Measurement

Track progress with:

```bash
# Count type errors
npx tsc --noEmit | grep "error TS" | wc -l

# Count 'any' usage
rg "\bas any\b" --type ts --stats

# Count missing return types
rg "function \w+\([^)]*\)\s*{" --type ts | grep -v ": " | wc -l
```

Target metrics:
- Type errors: 0
- `as any` usage: < 50 (down from ~492)
- Missing return types: < 100

## Timeline

- **Week 1**: Fix previously excluded files (P0)
- **Week 2**: Enable strict in analytics-engine (P0)
- **Week 3**: Enable strict in recording-engine (P0)
- **Week 4**: Enable strict in edge-agent (P1)
- **Ongoing**: Reduce `as any` usage by 10% per sprint
