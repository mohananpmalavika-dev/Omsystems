Rotate and scrub committed secrets

Files changed in this pass:
- dashboard/.env.local — remove plaintext shared key and replace with placeholder
- fix-edge-agent-auth.mjs — stop embedding the shared key in script; read from environment
- test-auth.mjs — read shared key from environment
- .gitignore — ignore .env* except .env.example
- .github/workflows/ci.yml — add CI workflow with secret scanning
- scripts/secret-scan.mjs — add a basic tracked secret scanner
- src/errors/feature-unavailable-error.ts — shared unavailable-feature error type
- src/services/ai-investigation-report.ts — make unimplemented investigation report actions fail closed
- src/services/ai-evidence-builder.ts — make unimplemented evidence actions fail closed
- src/routes/ai-intelligence.ts — map unavailable AI features to capability status responses

Recommended immediate follow-ups:
1. Rotate the EDGE_BRIDGE_SHARED_KEY and treat the current value as compromised.
2. Purge the secret from Git history using a safe history rewrite method and coordinate with contributors.
3. Add mandatory secret scanning to CI and monitor for new secret exposure.
4. Install a production SAML validation library and harden the SAML connector.
5. Implement production ONVIF/PTZ control or require explicit PTZ simulation configuration.
6. Convert analytics detectors to emit the canonical DetectionEvent schema and update incident forwarding.

Notes:
- This change does not rewrite Git history. It preserves the current tree while recording the rotation/scrub follow-up.
- The new secret scanner is intentionally conservative and ignores placeholder patterns and its own source file.
