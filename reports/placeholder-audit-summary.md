# Placeholder & Hygiene Audit — Summary

Generated: 2026-08-10

## Totals (quick scan)

- console.log occurrences: 1,001
- `as any` casts: 465
- `placeholder` matches: 704
- TODO / FIXME comments: 183

> These counts were gathered from a codebase-wide grep of common markers. They include legitimate test/dev cases.

## Top hotspots (representative)

- `analytics-engine/` — heavy use of `console.log` and TODOs (detectors, model manager, pipeline).
- `src/` — many `as any` casts across runtime routes, store, and recording modules.
- `dashboard/` — numerous UI placeholders and `as any` usages in components.
- `repopack-output.txt` — large generated file containing many placeholder references (useful for context but not actionable code).
- `backend/SECURITY_AUDIT_2026-08-08.md` and `src/services/incident-sla.service.ts` — contain explicit string placeholders like `'user-placeholder'`, `'on-call-user-placeholder'`, `'skilled-user-placeholder'`.

## Risk & priority

- High: hardcoded production placeholders (e.g., user-placeholder in security flows), many `as any` in core server code (type-safety gaps), and `console.log` used instead of structured logging in backend services.
- Medium: UI placeholder text and TODO comments that affect UX and operator workflows.
- Low: throwaway scripts and load-testing consoles where `console.log` is expected.

## Recommended next steps (short-term)

1. Add CI linting rules:
   - ESLint rule to forbid `console.log` in server code (`no-console` with allowlist for scripts/tests).
   - TypeScript `noImplicitAny` and lint rule to flag `as any` usages.
   - A placeholder/fake-value detector (grep-based or custom ESLint rule) to catch strings like `user-placeholder` and `on-call-user-placeholder`.

2. Replace `console.log` in production code with the project's logger (safe codemod): replace `console.log(...)` → `logger.info(...)` in `src/` and `backend/` only (dry-run first).

3. Triage top `as any` hotspots: open issues for modules with the highest counts and start converting to correct types (store, recording, routes).

4. Create issues for TODOs classified by priority (security, data integrity, external integrations).

5. Remove or archive large generated files (`repopack-output.txt`) from the primary review if not needed for CI to reduce noise.

## Offer

I can now:
- Generate a detailed CSV with per-file counts and sample lines (full audit), or
- Run a safe dry-run codemod to replace `console.log` with `logger.info` in server code and show a preview of edits.

Which should I do next? (CSV audit / codemod dry-run / create issues for high-priority items)
