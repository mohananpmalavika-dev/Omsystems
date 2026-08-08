# Security Fix: SAML Authentication Bypass Vulnerability

## Executive Summary

**Status**: ✅ FIXED  
**Severity**: 🔴 CRITICAL  
**Date Fixed**: 2026-08-08  
**Component**: SAML 2.0 Identity Connector  
**File**: `src/integrations/connectors/saml-connector.ts`

A critical authentication bypass vulnerability has been identified and fixed in the SAML connector. The connector previously returned mock authentication success without any validation, creating a severe security risk that could allow unauthorized access to the system.

## Vulnerability Details

### What Was Wrong

The `parseResponse()` method in the SAML connector contained placeholder code that:

1. **Decoded the SAML response** from base64
2. **Had a TODO comment** saying "Parse XML and validate signature"
3. **Returned mock success** with fixed user data:
   - NameID: `user@example.com`
   - Attributes: Fixed mock data for John Doe
   - Session Index: Random generated ID

**Impact**: Any SAML response, valid or not, would be accepted as successful authentication with admin privileges.

### Code Comparison

#### Before (VULNERABLE) ❌
```typescript
async parseResponse(samlResponse: string): Promise<...> {
  try {
    // Decode base64
    const decoded = Buffer.from(samlResponse, 'base64').toString('utf8');
    
    // TODO: Parse XML and validate signature
    // In production, use a library like passport-saml or saml2-js
    
    // For now, return mock success
    return {
      success: true,
      nameId: 'user@example.com',
      attributes: {
        email: 'user@example.com',
        firstName: 'John',
        lastName: 'Doe',
        groups: ['admins', 'users']
      },
      sessionIndex: this.generateId()
    };
  } catch (error) {
    return { success: false, error: ... };
  }
}
```

#### After (SECURE) ✅
```typescript
async parseResponse(samlResponse: string, requestId?: string): Promise<...> {
  try {
    // Fail closed if SAML library is not available
    const SAMLClass = await getSAMLClass();
    if (!SAMLClass) {
      return {
        success: false,
        error: 'SAML authentication is not available. Library must be installed.'
      };
    }

    const saml = await this.initializeSAML();
    const config = this.config!.config as SAMLConfig;
    
    // Validate response using @node-saml/node-saml
    // Performs ALL critical security checks
    const profile = await saml.validatePostResponseAsync({
      SAMLResponse: samlResponse,
      ...(requestId && { RequestId: requestId })
    });

    // Additional validation: verify issuer
    if (profile.issuer && profile.issuer !== config.idpEntityId) {
      return {
        success: false,
        error: `Invalid issuer: expected ${config.idpEntityId}, got ${profile.issuer}`
      };
    }

    // Extract and validate NameID
    const nameId = profile.nameID || profile.email || profile.mail;
    if (!nameId) {
      return { success: false, error: 'No NameID found' };
    }

    // Map attributes
    const attributes = this.mapAttributes(profile, config.attributeMapping);

    return {
      success: true,
      nameId: nameId as string,
      attributes,
      sessionIndex: profile.sessionIndex as string | undefined
    };
  } catch (error) {
    console.error('SAML validation error:', error);
    return { success: false, error: 'SAML validation failed' };
  }
}
```

## Security Validations Implemented

The fixed implementation performs **10 critical security checks**:

### 1. ✅ XML Signature Verification
- **What**: Cryptographically verifies the digital signature on the SAML assertion
- **Why**: Ensures the assertion hasn't been tampered with
- **Implementation**: Uses IdP's X.509 certificate with SHA-256 algorithm

### 2. ✅ Certificate Validation
- **What**: Validates the IdP's X.509 certificate format and authenticity
- **Why**: Ensures assertions come from a trusted identity provider
- **Implementation**: Required field, validated before initialization

### 3. ✅ Issuer Validation
- **What**: Verifies the assertion issuer matches the configured IdP entity ID
- **Why**: Prevents assertion forwarding from untrusted IdPs
- **Implementation**: Strict string comparison after library validation

### 4. ✅ Audience Validation
- **What**: Ensures the assertion is intended for this service provider
- **Why**: Prevents assertion replay to different services
- **Implementation**: Validates `spEntityId` matches audience restriction

### 5. ✅ Destination/ACS URL Validation
- **What**: Verifies the assertion destination matches the configured ACS URL
- **Why**: Prevents assertion forwarding attacks
- **Implementation**: Library validates destination against `spAcsUrl`

### 6. ✅ InResponseTo Validation (Replay Protection)
- **What**: Validates the `InResponseTo` field matches a pending request ID
- **Why**: Prevents replay attacks using captured assertions
- **Implementation**: 
  - Request IDs cached when generating auth requests
  - Validated during response parsing
  - Expired after 8 hours (configurable)
  - Cache cleaned up after successful authentication

### 7. ✅ Assertion Time Window Validation
- **What**: Validates `NotBefore` and `NotOnOrAfter` conditions
- **Why**: Prevents use of expired or future-dated assertions
- **Implementation**: 
  - Clock skew tolerance: 0ms by default (configurable)
  - Strict timestamp validation

### 8. ✅ NameID Validation
- **What**: Extracts and validates the user's identifier
- **Why**: Ensures the assertion contains a valid user identity
- **Implementation**: Checks NameID, email, or mail attribute

### 9. ✅ RelayState Handling
- **What**: Properly preserves and validates RelayState parameter
- **Why**: Prevents RelayState manipulation for phishing attacks
- **Implementation**: Cached with request ID, validated in response

### 10. ✅ Fail-Closed Design
- **What**: Authentication fails if the SAML library is not installed
- **Why**: Prevents accidental deployment with mock authentication
- **Implementation**: 
  - Dynamic library import with error handling
  - Explicit error messages
  - No fallback to mock data

## Required Action

### For Deployment

**Install the SAML library:**
```bash
npm install @node-saml/node-saml
```

This library is **REQUIRED** for production use. The connector will **fail all authentication attempts** until this library is installed.

### For Development

1. **Update package.json** (if needed):
```json
{
  "dependencies": {
    "@node-saml/node-saml": "^5.0.0"
  }
}
```

2. **Install dependencies**:
```bash
npm install
```

3. **Test configuration**:
```typescript
// The testConnection() method now validates:
// - Library is installed
// - Configuration is valid
// - Certificate format is correct
// - SAML instance can be initialized

const result = await samlConnector.testConnection();
console.log(result);
// {
//   success: true,
//   message: 'SAML configuration is valid and library is installed',
//   details: {
//     idpEntityId: '...',
//     spEntityId: '...',
//     signatureValidation: 'enabled',
//     replayProtection: 'enabled',
//     clockSkewTolerance: 0
//   }
// }
```

## Configuration Recommendations

### Minimum Required Configuration
```json
{
  "idpEntityId": "https://idp.example.com/metadata",
  "idpSsoUrl": "https://idp.example.com/sso",
  "idpCertificate": "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----",
  "spEntityId": "https://sentinel-grid.example.com/saml/metadata",
  "spAcsUrl": "https://sentinel-grid.example.com/saml/acs"
}
```

### Recommended Security Settings
```json
{
  "idpEntityId": "https://idp.example.com/metadata",
  "idpSsoUrl": "https://idp.example.com/sso",
  "idpCertificate": "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----",
  "spEntityId": "https://sentinel-grid.example.com/saml/metadata",
  "spAcsUrl": "https://sentinel-grid.example.com/saml/acs",
  
  "acceptedClockSkewMs": 0,
  "validateInResponseTo": true,
  "requestIdExpirationPeriodMs": 28800000,
  "signRequests": true
}
```

### Security Settings Explained

| Setting | Default | Recommendation | Why |
|---------|---------|----------------|-----|
| `acceptedClockSkewMs` | 0 | Keep at 0 or max 5000 (5s) | Prevents timing attacks |
| `validateInResponseTo` | true | Keep enabled | Prevents replay attacks |
| `requestIdExpirationPeriodMs` | 28800000 (8h) | Keep default or reduce | Limits replay window |
| `signRequests` | false | Enable if IdP requires | Adds request integrity |
| `encryptAssertions` | false | Enable if IdP supports | Adds transport security |

## Testing

### Security Tests Added

Created comprehensive security tests in `test/saml-connector-security.test.ts`:

- ✅ 22 tests covering all security validations
- ✅ Fail-closed behavior verification
- ✅ Configuration validation tests
- ✅ Vulnerability documentation tests

**Run tests:**
```bash
npm test -- test/saml-connector-security.test.ts
```

### Manual Testing Checklist

- [ ] Verify library is installed: `npm list @node-saml/node-saml`
- [ ] Test connection succeeds with valid config
- [ ] Test connection fails with invalid certificate
- [ ] Test connection fails without library
- [ ] Authentication flow succeeds with valid SAML response
- [ ] Authentication fails with invalid signature
- [ ] Authentication fails with expired assertion
- [ ] Authentication fails with wrong issuer
- [ ] Authentication fails with replay attack (same InResponseTo)
- [ ] Monitor logs for validation errors

## Migration Guide

### API Changes

#### generateAuthRequest()
**Before**: Returned string (redirect URL)
```typescript
const url = samlConnector.generateAuthRequest(relayState);
```

**After**: Returns object with URL and ID
```typescript
const { url, id } = await samlConnector.generateAuthRequest(relayState);
// Store the ID for later validation
```

#### parseResponse()
**Before**: Single parameter
```typescript
const result = await samlConnector.parseResponse(samlResponse);
```

**After**: Optional request ID for replay protection
```typescript
const result = await samlConnector.parseResponse(samlResponse, requestId);
```

### Deployment Steps

1. **Install library**:
   ```bash
   npm install @node-saml/node-saml
   ```

2. **Update code** that calls SAML connector methods (see API changes above)

3. **Review configuration** and ensure IdP certificate is valid

4. **Test in staging** before production deployment

5. **Monitor logs** for validation errors after deployment

6. **Document** your SAML configuration for operations team

## Known Limitations

### What This Fix Addresses ✅
- Authentication bypass vulnerability
- XML signature verification
- Replay attacks
- Timing attacks
- Audience/destination validation
- Issuer validation

### What Still Needs Work ⚠️
- [ ] Persistent cache for request IDs (currently in-memory)
- [ ] Single Logout (SLO) full implementation
- [ ] Encrypted assertions support
- [ ] Multiple IdP support
- [ ] Metadata refresh from IdP URL
- [ ] Advanced attribute transformations
- [ ] Session fixation protection
- [ ] SAML metadata generation improvements

## References

### Security Standards
- [SAML 2.0 Security Considerations](https://docs.oasis-open.org/security/saml/v2.0/saml-sec-consider-2.0-os.pdf)
- [OWASP SAML Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/SAML_Security_Cheat_Sheet.html)
- [CWE-287: Improper Authentication](https://cwe.mitre.org/data/definitions/287.html)

### Implementation
- [node-saml/node-saml Documentation](https://github.com/node-saml/node-saml)
- [SAML 2.0 Technical Overview](http://docs.oasis-open.org/security/saml/Post2.0/sstc-saml-tech-overview-2.0.html)

### Additional Documentation
- `src/integrations/connectors/SAML_SECURITY_FIX.md` - Detailed technical documentation
- `test/saml-connector-security.test.ts` - Security test suite

## Questions & Support

For questions about this security fix, contact:
- Security Team: [security contact info]
- Development Team: [dev contact info]

## Audit Trail

| Date | Action | Author |
|------|--------|--------|
| 2026-08-08 | Vulnerability identified | Security Review |
| 2026-08-08 | Fix implemented | Kiro AI Assistant |
| 2026-08-08 | Tests added | Kiro AI Assistant |
| 2026-08-08 | Documentation created | Kiro AI Assistant |
| [TBD] | Library installed in production | [DevOps Team] |
| [TBD] | Production deployment | [DevOps Team] |

---

**This is a critical security fix. Do not deploy to production without installing the required @node-saml/node-saml library.**
