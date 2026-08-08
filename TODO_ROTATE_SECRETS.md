Rotate and scrub committed secrets

Files changed in this pass:
- dashboard/.env.local — remove plaintext shared key and replace with placeholder
- fix-edge-agent-auth.mjs — stop embedding the shared key in script; read from environment
- test-auth.mjs — read shared key from environment
- .gitignore — ignore .env* except .env.example

Recommended immediate follow-ups:
1. Rotate the EDGE_BRIDGE_SHARED_KEY (treat current value as compromised).
2. Purge the secret from the Git history (git filter-repo or BFG) and force-push to the protected branch only after coordinating with all collaborators.
3. Run a secret scanner (truffleHog, git-secrets, or detect-secrets) against the repository history and any backups.
4. Update deployment environments (Render, Kubernetes secrets, CI) with the rotated key.
5. Add mandatory secret scanning to CI and alerting for new secret exposures.

Notes:
- This change intentionally does not rewrite Git history to avoid destructive effects in the middle of the sprint. The audit and rotation steps must be scheduled and coordinated with ops.
- Ensure any PRs that reference the old key are updated to use environment variables instead of literals.
