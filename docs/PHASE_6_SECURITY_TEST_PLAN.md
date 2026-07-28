# Phase 6 security verification

## Automated gates

- Production startup rejects development authentication, placeholder values and ambiguous direct/file secrets.
- CI runs the time-bounded npm advisory policy and publishes Trivy SARIF.
- API tests verify authentication, tenant/branch/camera authorization and signed report downloads.
- Database audit rows are hash-linked and append-only.
- Kubernetes enforces restricted pods, non-root execution, dropped capabilities, network policy and TLS ingress.

## Independent assessment scope

The penetration test must cover OIDC/session lifecycle, RBAC privilege escalation, tenant isolation, IDOR, injection, request smuggling, SSRF, signed URL replay/expiry, WebSocket/SSE authorization, media token scope, upload/export paths, provider callbacks, rate limits, secret exposure, Kubernetes configuration and backup access. Test the control plane, dashboard, media gateway, recording engine, analytics adapter and edge-agent trust boundary.

No production promotion is allowed with an open critical or high finding. Retests must reference the original finding, fixed version and evidence. Complete `deploy/approvals/security-signoff.example.json`; do not set `approved` based solely on the repository’s automated scan.

Current dependency exceptions described in the Phase 5 guide expire automatically and are not equivalent to penetration-test approval.
