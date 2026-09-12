# SAML 2.0 Enterprise Federation Architecture

**Authoritative Production Security Architecture for KryptoVision Enterprise SAML 2.0 Federation**  
*Capability Identifier:* `security.saml`  
*Maturity Level:* `PRODUCTION`

---

## 1. Executive Summary

KryptoVision integrates enterprise identity providers (IdPs) via the **SAML 2.0 Web Browser SSO Profile (OASIS standard)** with **Assertion Consumer Service (ACS)** and cryptographic XML Digital Signature (`xmldsig`) verification. This architecture supports:
- **Microsoft Entra ID (Azure AD)**
- **Okta** (Enterprise SAML 2.0)
- **PingFederate / PingOne**
- **OneLogin**
- **Active Directory Federation Services (ADFS)**
- **Generic SAML 2.0 Compliant IdPs** (Shibboleth, Keycloak SAML)

The implementation enforces fail-closed cryptographic signature verification with enveloped XML canonicalization (C14N), XML Signature Wrapping (XSW) attack mitigation, distributed replay attack prevention, and strict `InResponseTo` correlation.

---

## 2. Core Security Invariants & Defenses

1. **Mandatory Signed Assertions & Responses (`XMLDSIG`)**
   - Assertions and authentication responses must be cryptographically signed by the IdP's X.509 certificate.
   - Algorithms enforced: RSA-SHA256 (`http://www.w3.org/2001/04/xmldsig-more#rsa-sha256`) or RSA-SHA512. Insecure algorithms like SHA-1 are strictly rejected in production.
   - The verified certificate public key must match the registered tenant certificate.

2. **XML Signature Wrapping (XSW) Countermeasures**
   - The engine relies on `@node-saml/node-saml` with strict DOM parsing and node scoping.
   - Only the exact signed XML subtree referenced by the signature element is evaluated for claims, defeating clone, shadow, and wrapper injection exploits.

3. **Replay Attack Prevention (Distributed & In-Memory)**
   - Every SAML assertion contains a unique identifier (`ID` attribute).
   - Once an assertion ID is processed, it is atomically registered in the replay store (Redis via `SET NX EX` or persistent PostgreSQL `saml_assertions` table).
   - Subsequent attempts to replay the same assertion within or across cluster nodes fail immediately with `SAML assertion replay attack detected`.

4. **InResponseTo Correlation (SP-Initiated Flow)**
   - When an SP-initiated AuthnRequest is generated, its unique ID is stored with a 15-minute TTL.
   - Upon ACS callback, `InResponseTo` is checked to confirm it corresponds to a legitimate pending request, blocking unsolicited or forged assertions.

5. **Audience & Issuer Restrictions**
   - The assertion `<AudienceRestriction>` must contain the SP's configured `spEntityId`.
   - The `<Issuer>` element must match the tenant's registered `idpEntityId` or SSO URL.

6. **Timestamp Validity & Clock Skew Guard**
   - Enforces conditions bounds: `NotBefore <= CurrentTime + Skew` and `NotOnOrAfter > CurrentTime - Skew`.
   - Clock skew tolerance defaults to `60000 ms` (1 minute) to accommodate minor NTP server drifts.

---

## 3. Endpoints & Protocol Flows

### 3.1 HTTP Endpoints

| Method | Path | Access | Description |
|---|---|---|---|
| `GET` | `/v1/auth/saml/login/:tenantId` | Public | Initiates SP-initiated SAML login, generates `AuthnRequest`, redirects to IdP SSO URL (or returns JSON). |
| `POST` | `/v1/auth/saml/callback` | Public | Assertion Consumer Service (ACS) endpoint (HTTP-POST Binding). Validates assertion, provisions user, issues JWT session. |
| `GET` | `/v1/auth/saml/callback` | Public | Assertion Consumer Service (ACS) endpoint (HTTP-Redirect Binding). |
| `GET` | `/v1/auth/saml/metadata` | Public | Generates default Service Provider metadata XML. |
| `GET` | `/v1/auth/saml/metadata/:tenantId` | Public | Generates tenant-specific Service Provider metadata XML. |
| `POST` | `/v1/identity/providers/saml` | Admin (`SUPER_ADMIN`) | Registers or updates a tenant's SAML IdP (direct config or IdP metadata XML upload). |
| `GET` | `/v1/identity/providers/saml/:tenantId` | Admin (`SUPER_ADMIN`) | Returns tenant SAML configuration status (sanitized). |

### 3.2 SP-Initiated SSO Flow Diagram

```
User Browser                  KryptoVision (SP)                  Enterprise IdP (Okta/Azure AD)
     |                                |                                       |
     | 1. GET /v1/auth/saml/login/:tenantId                                   |
     |------------------------------->|                                       |
     |                                | 2. Generate AuthnRequest (ID: _req123)|
     |                                |    Save ID in ReplayStore             |
     | 3. 302 Redirect to IdP SSO URL |                                       |
     |<-------------------------------|                                       |
     |                                                                        |
     | 4. GET /saml2/sso?SAMLRequest=deflated_xml                             |
     |----------------------------------------------------------------------->|
     |                                                                        | 5. Authenticate user & MFA
     |                                                                        | 6. Sign Assertion with IdP cert
     | 7. HTTP 200 + Auto-submitting HTML form (HTTP-POST Binding)            |
     |<-----------------------------------------------------------------------|
     |                                                                        |
     | 8. POST /v1/auth/saml/callback (SAMLResponse=base64_xml)               |
     |------------------------------->|                                       |
     |                                | 9. Verify XMLDSIG Signature           |
     |                                | 10. Check Replay on Assertion ID      |
     |                                | 11. Validate Audience, Issuer, Times  |
     |                                | 12. Map Claims & JIT Provision User   |
     |                                | 13. Issue JWT Access & Refresh Tokens |
     | 14. 302 Redirect /dashboard?token=jwt (or 200 JSON)                    |
     |<-------------------------------|                                       |
```

---

## 4. Metadata Onboarding & Configuration

### 4.1 Automated IdP Metadata XML Ingestion

Administrators can configure SAML federation in a single API call by passing the IdP's metadata XML export (from Okta, Entra ID, or PingFederate):

```http
POST /v1/identity/providers/saml
Authorization: Bearer <SUPER_ADMIN_JWT>
Content-Type: application/json

{
  "tenantId": "bank-corp-01",
  "tenantSlug": "bank-corp",
  "metadataXml": "<?xml version=\"1.0\"?><md:EntityDescriptor entityID=\"https://sts.windows.net/tenant-guid/\" ...>...</md:EntityDescriptor>",
  "attributeMapping": {
    "userId": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
    "email": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
    "displayName": "http://schemas.microsoft.com/identity/claims/displayname",
    "groups": "http://schemas.microsoft.com/ws/2008/06/identity/claims/groups"
  }
}
```

The system automatically extracts:
- `entityID`
- Single Sign-On HTTP-POST / HTTP-Redirect endpoint URLs
- Single Logout endpoint URL
- X.509 signing certificate from `<KeyDescriptor use="signing">`

### 4.2 SP Metadata Generation

To configure KryptoVision in the enterprise IdP, administrators download the SP metadata XML:
```http
GET /v1/auth/saml/metadata/bank-corp-01
Content-Type: application/xml
```

The generated metadata XML complies with the OASIS SAML 2.0 metadata profile:
```xml
<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
                     xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
                     entityID="https://vms.bank.internal/saml/metadata/bank-corp-01">
  <md:SPSSODescriptor AuthnRequestsSigned="false"
                      WantAssertionsSigned="true"
                      protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
                            Location="https://vms.bank.internal/v1/auth/saml/callback" />
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified</md:NameIDFormat>
    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
                                 Location="https://vms.bank.internal/v1/auth/saml/callback"
                                 index="1"
                                 isDefault="true" />
  </md:SPSSODescriptor>
</md:EntityDescriptor>
```

---

## 5. Enterprise Claims & Banking Role Mapping

Extracted SAML attribute values are mapped to canonical KryptoVision banking permissions:

| SAML External Group / Attribute | Canonical KryptoVision Role | Granted Banking Permissions |
|---|---|---|
| `Domain Admins`, `SAML_SUPERADMIN`, `Bank-Executive` | `SUPER_ADMIN` | All capabilities, provider management, audit export |
| `Security-Officers`, `Forensics-Team` | `SECURITY_OFFICER` | Video export, evidence signing, camera control |
| `Branch-Managers`, `Branch-Admins` | `BRANCH_ADMIN` | Branch camera feeds, local device inventory |
| `Operators`, `Surveillance-Staff` | `BANK_OPERATOR` | Live stream viewing, alert acknowledging |
| `Internal-Audit`, `Compliance-Officers` | `COMPLIANCE_AUDITOR` | Immutable audit log inspection, retention review |

All successful and rejected authentications generate immutable records in the `audit_events` log with tenant identifier, IP address, user agent, and failure reason.
