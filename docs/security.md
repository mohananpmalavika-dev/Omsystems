# Security and configuration

## Security-relevant implementation

The control-plane app registers Fastify CORS and Helmet, a global CSRF
protection hook, authentication/session middleware, and route modules.
Authentication middleware accepts bearer/session credentials and cookies,
checks active users/session expiry, and updates session activity. A
development-header user identity path also exists. Authorization code
implements tenant/resource scope checks and default-deny behavior with
super-administrator exceptions.

The repository also contains security-related routes, schemas, and packages
covering audit, signed edge configuration, device identity, mTLS, OIDC/LDAP,
ABAC, HSM/evidence signing, privacy, and feature settings. These code artifacts
do not establish that those controls are enabled or correctly configured in a
deployment.

## Configuration and secrets

Configuration is distributed across the root/service `.env.example` files,
Compose definitions, and service config modules. Review the exact selected
deployment file to identify required values. Common secret categories include:

- PostgreSQL and Redis credentials;
- JWT/session/cookie secrets;
- API-to-service shared keys for media, edge, recording, and analytics;
- report download and device enrollment/signing secrets;
- cloud storage/KMS/model access credentials;
- SMTP/SMS, OIDC/SAML, LDAP, federation, TURN, and tunnel credentials.

Use a secret manager or a protected deployment environment. Generate
independent, high-entropy secrets for each environment and rotate them using
the service's supported process. Do not reuse sample values or expose secrets
in logs, Compose output, CI artifacts, screenshots, shell history, or support
tickets. The checked-in environment examples are templates and must be reviewed
before use.

## Network and transport

- Put public HTTP entry points behind an approved TLS-terminating ingress or
  reverse proxy; restrict direct service ports to trusted networks.
- Review CORS allowlists and do not enable broad origins for production.
- Follow the production Compose settings for database TLS and CA validation
  where applicable; verify the effective configuration and certificate chain.
- Restrict PostgreSQL, Redis, MediaMTX, service ports, and metrics endpoints to
  trusted network segments.
- Configure TURN/TLS and allowed media paths for communication features that
  require them.
- Do not trust `localhost` or container-internal names as public service
  addresses.

The root development Compose file publishes several ports broadly and does not
provide a complete public-ingress security boundary.

## Authentication and authorization operations

- Use session-backed production authentication and supported identity-provider
  configuration; do not use development-header identity in production.
- Enable CSRF defenses and configure trusted origins for browser workflows.
- Review tenant and branch/resource grants with a least-privilege test account.
- Revoke user/device credentials and sessions when access is no longer needed.
- Review audit records for privileged changes and investigate unexpected
  authentication/authorization events.
- Confirm sensitive camera/biometric/recording permissions with privacy and
  legal stakeholders.

Exact provider flows, password/MFA policies, credential rotation, and
organization-specific role assignments require deployment verification.

## Data protection and evidence

Database backups contain personal, operational, and possibly credential-related
data. Encrypt them at rest and in transit, strictly limit access, establish
retention and secure deletion, and test recovery. The backup script writes a
SHA-256 manifest and marks encryption as required in metadata; it does **not**
encrypt the dump itself.

Evidence hashes, manifests, signing/HSM integrations, audit trails, and
chain-of-custody entities appear in the repository. Their presence alone does
not certify evidence authenticity, legal admissibility, or regulatory
compliance.

## Security verification

Use `npm run test:security`, the TLS tests, release preflight, dependency
scanning, and secret scanning where configured. Review the repository workflow
definitions and their results for the deployed revision. A passing scan is not
a complete threat model or penetration test.

Preserve bundled third-party notices. In particular, review
`edge-agent/runtime/LICENSE` and the bundled FFmpeg `LICENSE.txt` when
redistributing the runtime.
