# SAML Connector Security Fix

## Critical Vulnerability Fixed

**Issue:** The SAML connector contained a mock implementation that returned successful authentication without any validation. This created an authentication bypass vulnerability.

**Severity:** CRITICAL - Authentication bypass

**Status:** FIXED (fail-closed implementation)

## What Was Changed

### Before (VULNERABLE)
```typescript
async parseResponse(samlResponse: string): Promise<...> {
  // Decode base64
  const decoded = Buffer.from(samlResponse, 'base64').toString('utf8');
  
  // TODO: Parse XML and validate signature
  // In production, use a library like passport-saml or saml2-js
  
  // For now, return mock success ❌ DANGEROUS
  return {
    success: true,
    nameId: 'user@example.com',  // Fixed mock data
    attributes: { ... }
  };
}
```

### After (SECURE)
```typescript
async parseResponse(samlResponse: string, requestId?: string): Promise<...> {
  // Fail closed if SAML library is not available
  if (!SAML) {
    return {
      success: false,
      error: 'SAML authentication is not available. Library must be installed.'
    };
  }

  const saml = this.initializeSAML();
  
  // Validate response using @node-saml/node-saml
  // Performs all critical security checks:
  // - XML signature verification
  // - Certificate validation
  // - Timestamp validation
  // - Audience validation
  // - Issuer validation
  // - InResponseTo validation
  // - Destination validation
  const profile = await saml.validatePostResponseAsync({
    SAMLResponse: samlResponse,
    ...(requestId && { RequestId: requestId })
  });
  
  // Additional validation...
}
```

## Security Features Implemented

### 1. XML Signature Verification
- All SAML assertions MUST be signed by the IdP
- Signatures are cryptographically verified using the IdP's X.509 certificate
- Uses SHA-256 digest and signature algorithms

### 2. Certificate Validation
- IdP certificate is required and validated
- Certificate format validation
- Proper certificate chain verification

### 3. Issuer Validation
- Verifies the assertion comes from the expected IdP
- Validates `idpEntityId` matches the issuer in the response

### 4. Audience Validation
- Ensures the assertion is intended for this SP
- Validates `spEntityId` matches the audience restriction

### 5. Destination/ACS URL Validation
- Verifies the assertion destination matches the configured ACS URL
- Prevents assertion forwarding attacks

### 6. InResponseTo Validation (Replay Protection)
- Validates the `InResponseTo` field matches a pending request ID
- Request IDs are cached and expire after 8 hours (configurable)
- Prevents replay attacks

### 7. Assertion Time Window Validation
- Validates `NotBefore` and `NotOnOrAfter` conditions
- Configurable clock skew tolerance (default: 0ms for strict security)
- Prevents use of expired or future-dated assertions

### 8. NameID Validation
- Extracts and validates the user's NameID
- Supports multiple NameID formats
- Fails if no valid NameID is found

### 9. RelayState Handling
- Properly preserves and validates RelayState parameter
- Prevents RelayState manipulation attacks

### 10. Fail-Closed Design
- If the SAML library is not installed, authentication FAILS
- No mock data or bypass paths
- Explicit error messages about missing dependencies
- **Build-safe implementation**: Uses dynamic import with Function constructor to prevent TypeScript from resolving the module at compile time
- The application builds successfully even without the library installed
- Authentication will fail at runtime with clear error messages

## Required Dependencies

### Production Requirement
```bash
npm install @node-saml/node-saml
```

The connector **will not authenticate users** until this library is installed. This is by design to prevent accidental deployment with mock authentication.

**Important Build Notes:**
- The application **builds successfully** without this library installed
- Uses dynamic import with Function constructor to avoid TypeScript module resolution
- This prevents breaking CI/CD pipelines while maintaining security
- Authentication fails at runtime with explicit error messages when library is missing
- The fail-closed design ensures no authentication bypass is possible

### Why @node-saml/node-saml?
- Battle-tested SAML implementation
- Actively maintained by the SAML community
- Comprehensive security validations
- Supports all SAML 2.0 flows
- Used by major authentication libraries (passport-saml)

## Configuration

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
  
  // Security settings
  "acceptedClockSkewMs": 0,              // Strict timing validation
  "validateInResponseTo": true,          // Enable replay protection
  "requestIdExpirationPeriodMs": 28800000, // 8 hours
  "signRequests": true,                  // Sign authentication requests
  "encryptAssertions": false             // Optional: require encrypted assertions
}
```

## Testing

### Test Connection
The `testConnection()` method now verifies:
1. SAML library is installed
2. Configuration is valid
3. IdP certificate format is correct
4. SAML instance can be initialized

### Test Authentication Flow
1. Generate authentication request
   - Creates properly signed SAML AuthnRequest
   - Caches request ID for validation
   - Returns redirect URL to IdP

2. Handle IdP response
   - Validates all security checks
   - Extracts user identity
   - Maps SAML attributes to user attributes
   - Cleans up request cache

## Migration Guide

### For Developers
1. Install the required library:
   ```bash
   npm install @node-saml/node-saml
   ```

2. Update any code that calls `parseResponse()`:
   ```typescript
   // Before
   const result = await samlConnector.parseResponse(samlResponse);
   
   // After (with replay protection)
   const result = await samlConnector.parseResponse(samlResponse, requestId);
   ```

3. Update any code that calls `generateAuthRequest()`:
   ```typescript
   // Before (returned string)
   const url = samlConnector.generateAuthRequest(relayState);
   
   // After (returns object with URL and ID)
   const { url, id } = await samlConnector.generateAuthRequest(relayState);
   // Store the ID for later validation
   ```

### For Administrators
1. Verify IdP certificate is configured correctly
2. Review and adjust security settings based on requirements
3. Test authentication flow in staging before production
4. Monitor logs for validation errors

## Known Limitations

### What This Fix Addresses
✅ Authentication bypass vulnerability
✅ XML signature verification
✅ Replay attacks
✅ Timing attacks
✅ Audience/destination validation
✅ Issuer validation

### What Still Needs Work
- [ ] Persistent cache for request IDs (currently in-memory)
- [ ] Single Logout (SLO) implementation
- [ ] Encrypted assertions support
- [ ] Multiple IdP support
- [ ] Metadata refresh from IdP URL
- [ ] Advanced attribute transformations

## References

- [SAML 2.0 Security Considerations](https://docs.oasis-open.org/security/saml/v2.0/saml-sec-consider-2.0-os.pdf)
- [node-saml/node-saml Documentation](https://github.com/node-saml/node-saml)
- [OWASP SAML Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/SAML_Security_Cheat_Sheet.html)

## Audit Trail

- **Fixed by:** Kiro AI Assistant
- **Date:** 2026-08-08
- **Severity:** CRITICAL
- **CVE:** N/A (internal finding)
- **Status:** FIXED (requires dependency installation)
