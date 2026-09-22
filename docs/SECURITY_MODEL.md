# Sentinel Grid: Enterprise Security Architecture & RBAC Model

**Document Version:** 1.0.0-PROD  
**Classification:** High-Assurance Enterprise Defense  
**Compliance Standard:** ISO 27001, RBI Cyber Security Framework, OWASP Top 10  

---

## 1. Enterprise RBAC & Scope Hierarchy

Sentinel Grid enforces strict **Default-Deny** authorization across 13 enterprise roles. Permissions are explicitly evaluated across both functional actions and geographic hierarchy scopes:

```
[Tenant] 
   └── [Company] 
         └── [Division] 
               └── [Region] 
                     └── [Area] 
                           └── [Branch] 
                                 └── [Floor] 
                                       └── [Zone] 
                                             └── [Camera Group] 
                                                   └── [Camera]
```

### The 13 Enterprise Roles:
1. **Super Admin:** System-wide platform maintenance, cross-tenant disaster recovery.
2. **Tenant Admin:** Tenant organization management, license allocation, master configuration.
3. **Security Admin:** Security policies, AI rule configuration, user access provisioning.
4. **SOC Operator:** Real-time alarm monitoring, video wall dispatch, alert triage.
5. **Regional Security Manager:** Regional oversight, multi-branch incident escalation.
6. **Branch Manager:** Local branch oversight, opening policy management, employee tracking.
7. **Compliance Officer:** Audit log inspection, regulatory reporting, retention policy review.
8. **Fraud Investigation Officer:** Cross-branch forensic search, transaction video correlation.
9. **Auditor:** Read-only access to immutable compliance logs and evidence certificates.
10. **Maintenance Manager:** Camera uptime monitoring, work order assignment, firmware patching.
11. **IT Admin:** Edge agent gateway provisioning, network bandwidth throttling, tunnel health.
12. **Viewer:** Live feed observation strictly constrained to authorized branch cameras.
13. **Evidence Officer:** Cryptographic export authorization, legal hold lifecycle management.

---

## 2. Authentication, MFA & Session Defense

- **Primary Authentication:** Salted Argon2id / bcrypt credential verification.
- **Multi-Factor Authentication (MFA):** Mandatory TOTP (RFC 6238) for all SOC operators and administrative personnel.
- **Enterprise SSO:** OpenID Connect (OIDC) & SAML 2.0 integration with Azure AD, Okta, and Google Workspace.
- **Session Tokens & Refresh Rotation:** Short-lived JWT access tokens (15-minute expiry) paired with single-use refresh tokens stored in HTTP-only, secure, same-site cookies.
- **Brute Force Defense:** 5 consecutive failed attempts trigger an automated 15-minute account lockout with administrative alert.

---

## 3. Media Stream & Credential Security

- **Zero Camera Credential Exposure:** Camera RTSP credentials and ONVIF passwords reside exclusively inside the encrypted vault of the local Edge Agent and Control Plane database. Under no circumstances are camera credentials transmitted to the client browser.
- **Time-Limited Media Tokens:** Browser playback connects via temporary Media Gateway access tokens (`MediaSessionToken`, 300s TTL).
- **Outbound-Only Communication:** Branch Edge Agents establish outbound TLS tunnels to the Control Plane. No public router port forwarding is required at branch locations.

---

## 4. Evidence Integrity & Legal Defensibility

- **SHA-256 Hashing:** Video clips, snapshots, and metadata are hashed at ingestion.
- **HSM Digital Signing:** Evidence packages are signed using hardware security modules or PKCS#11 keys.
- **Section 65B Indian Evidence Act Certification:** Generates tamper-evident digital certificates documenting source camera serial, branch identity, timestamp range, hash integrity, and chain of custody.
