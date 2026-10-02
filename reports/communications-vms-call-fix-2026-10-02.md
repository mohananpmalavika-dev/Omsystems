# Krypton Communication VMS calling fix — 2 October 2026

## Cause and changes

The employee call permission check treated the first `user_organizational_assignments.scope_node_id` as a branch ID. Company, region, and other organizational assignments therefore caused `branch_not_found`; multiple assignments were ignored.

The check now loads all target scopes and authorizes against actual branches available to the caller for the required action. It handles scopes above or within a branch, validates scope tenant membership, and keeps the existing fallback for unassigned central VMS users. Missing scopes and users outside the caller's access remain denied. Employee permission handling is restricted to employee communication actions so branch calls and device administration keep their own resource checks.

Related fixes:

- Internal VMS directory/search returns one row per user and exposes only actual branch assignments as `branch_id`.
- Internal VMS users remain searchable when no branches are visible.
- Employee presence reports the logged-in VMS operator session and validates the target tenant, rather than aggregating enrolled device presence.
- VMS call target eligibility uses the same active-user condition as its directory.
- Branch queries use `node_type = 'branch'`. The schema defines `node_type` as a PostgreSQL enum, for which `lower(node_type)` is invalid. This fixes the affected lookups in directory search, device directory/calling, and direct branch messaging.

## Validation

- `npm.cmd test -- test/communications/vms-user-routes.test.ts`: **22 passed**.
- Coverage includes branch/company/region/group assignments, multiple assignments, central users, missing scopes, access denial, supplied-body overrides, tenant boundaries, the API alias, offline targets, employee messaging, operator presence, search, branch validation, and device unlink authorization.
- `node scripts/build-communications.mjs`: **passed**, compiling 14 files.
- Communications TypeScript diagnostics compared with the original HEAD version: **82 existing errors before, 81 after; no introduced diagnostics**. The communications-only type check still fails on existing issues across this subsystem.
- `git diff --check`: **passed**.

The route tests use mocked database, call, media, presence, and signaling dependencies. Production PostgreSQL execution and real two-user audio/video/screen-sharing were not exercised. No live deployment or service restart was performed. Deploy the updated control-plane backend to apply these changes to the live service; no database migration is required.
