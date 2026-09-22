# WORKSPACE MIGRATION PLAN

## Current Situation

You have two copies of the Sentinel Grid project:
- **Parent:** `C:\Omsystems\` (root level with 50+ directories)
- **Subdirectory:** `C:\Omsystems\Omsystems\` (complete project with 193 items)

## Proposed Migration

**Goal:** Consolidate to use `C:\Omsystems\Omsystems\` as the primary workspace

### Why This Matters
- Git repository location
- Node modules and dependencies
- Absolute paths in config files
- IDE workspace settings
- Environment files
- Build outputs and caches
- Docker volume mounts
- Database connections

---

## MIGRATION STRATEGY (SAFEST APPROACH)

### Phase 1: Backup & Verify (DO THIS FIRST)

```powershell
# 1. Verify subdirectory is complete
cd C:\Omsystems\Omsystems
git status
npm run typecheck  # Verify it's functional

# 2. Check for any unique files in parent
# (files that exist in parent but not in subdirectory)
```

### Phase 2: Update Git Configuration

```powershell
cd C:\Omsystems\Omsystems

# Verify git remote
git remote -v

# Update git config if needed
git config --local core.worktree .
```

### Phase 3: Update All References

#### A. Package.json Scripts
Check for any hardcoded paths in:
- `C:\Omsystems\Omsystems\package.json`
- All workspace package.json files

#### B. Environment Files
Update paths in:
- `.env`
- `.env.production`
- Edge agent configs
- Docker compose files

#### C. Configuration Files
- `tsconfig.json` (baseUrl, paths)
- `vitest.config.ts`
- `.eslintrc.production.json`
- `docker-compose.production.yml` (volume mounts)

### Phase 4: Update IDE Workspace

```powershell
# Update VS Code workspace
# The .kiro and .vscode folders will need to reference new path
```

### Phase 5: Test Everything

```powershell
cd C:\Omsystems\Omsystems

# Install dependencies
npm install

# Run type checks
npm run typecheck:all

# Run tests
npm run test:smoke

# Build
npm run build:all
```

---

## AUTOMATED MIGRATION SCRIPT

I can create a PowerShell script to:
1. Verify subdirectory integrity
2. Compare parent vs subdirectory for unique files
3. Update all path references
4. Clean up parent duplicates (optional, only after verification)

---

## RECOMMENDATION

**BEFORE any automated migration:**

1. **Commit all current work** to git
2. **Verify `C:\Omsystems\Omsystems\` works** independently
3. **Check for unique files** in parent that don't exist in subdirectory
4. **Update path references** in config files
5. **Test thoroughly** before removing parent duplicates

---

## QUESTIONS FOR YOU

1. **Is `C:\Omsystems\Omsystems\` the complete, working version?**
   - Can you run `npm run dev` successfully from there?

2. **Do you want to KEEP parent-level items** like:
   - `C:\Omsystems\.git` (if different from subdirectory)
   - `C:\Omsystems\docs` (the audit reports I just created)
   - Any other unique files?

3. **What's your Git setup?**
   - Is the .git folder in parent or subdirectory?
   - Do you have uncommitted changes?

---

## NEXT STEPS

Please confirm:
- [ ] Subdirectory is the complete, working version
- [ ] You want to use `C:\Omsystems\Omsystems\` as workspace
- [ ] You've committed all work to git
- [ ] You're ready for me to create migration script

Then I'll create an automated migration script that safely handles this.
