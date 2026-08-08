# SAML Library Installation Guide

## Quick Start

To enable SAML authentication, install the required library:

```bash
npm install @node-saml/node-saml
```

Then restart your application.

---

## Why This Library Is Required

The SAML connector implements proper security validation using the `@node-saml/node-saml` library. This is a mature, battle-tested implementation that provides:

- ✅ XML signature verification
- ✅ Certificate validation
- ✅ Replay attack protection
- ✅ Timing attack protection
- ✅ All SAML 2.0 security requirements

Without this library, the SAML connector will **refuse all authentication attempts** to prevent security vulnerabilities.

---

## Installation Options

### Option 1: Add to package.json (Recommended)

Add the library to your `package.json` dependencies:

```json
{
  "dependencies": {
    "@node-saml/node-saml": "^5.0.0"
  }
}
```

Then run:
```bash
npm install
```

### Option 2: Direct Installation

Install directly:
```bash
npm install @node-saml/node-saml
```

### Option 3: Docker/Container Deployment

**Add to package.json** (preferred):
```json
{
  "dependencies": {
    "@node-saml/node-saml": "^5.0.0"
  }
}
```

**Or install in Dockerfile** before the build step:
```dockerfile
# Install SAML library
RUN npm install @node-saml/node-saml

# Then continue with your build
RUN npm run build
```

---

## Verification

### 1. Check Library Installation

```bash
npm list @node-saml/node-saml
```

Expected output:
```
sentinel-grid@0.1.0 C:\Omsystems
└── @node-saml/node-saml@5.x.x
```

### 2. Test SAML Connector

The SAML connector's `testConnection()` method will verify:
- ✅ Library is installed
- ✅ Configuration is valid
- ✅ Certificate format is correct
- ✅ SAML instance can be initialized

Example:
```typescript
import { SAMLConnector } from './src/integrations/connectors/saml-connector.js';

const connector = new SAMLConnector();
await connector.initialize(config);

const result = await connector.testConnection();
console.log(result);
```

Expected output when library is installed:
```json
{
  "success": true,
  "message": "SAML configuration is valid and library is installed",
  "details": {
    "idpEntityId": "https://idp.example.com/metadata",
    "spEntityId": "https://sentinel-grid.example.com/saml/metadata",
    "ssoUrl": "https://idp.example.com/sso",
    "signatureValidation": "enabled",
    "replayProtection": "enabled",
    "clockSkewTolerance": 0
  }
}
```

Expected output when library is NOT installed:
```json
{
  "success": false,
  "message": "SAML library not installed. Install @node-saml/node-saml to enable SAML authentication."
}
```

### 3. Check Application Logs

When the SAML connector initializes, it will log:
- If library is successfully loaded
- If library is missing (with installation instructions)

---

## Build Behavior

### ✅ Builds Without Library

The application **builds successfully** even without `@node-saml/node-saml` installed. This is intentional to:

1. **Avoid breaking CI/CD pipelines** during the transition period
2. **Allow Docker builds** to complete even if library isn't installed yet
3. **Maintain developer experience** - other features work while SAML is being configured

### 🔒 Fails Closed at Runtime

Without the library:
- ❌ All SAML authentication attempts will fail
- ❌ Clear error messages indicate the missing library
- ❌ No fallback to mock authentication
- ❌ No security bypass possible

This "fail closed" design ensures security is maintained even if the library isn't installed.

---

## Common Issues

### Issue: "Cannot find module '@node-saml/node-saml'"

**Cause**: Library not installed or not in node_modules

**Solution**:
```bash
npm install @node-saml/node-saml
```

### Issue: SAML authentication fails with "library not installed" error

**Cause**: Library installation didn't complete or application cache

**Solution**:
1. Verify installation: `npm list @node-saml/node-saml`
2. Reinstall if needed: `npm install @node-saml/node-saml --force`
3. Clear node_modules and reinstall: `rm -rf node_modules && npm install`
4. Restart your application

### Issue: Docker build fails

**Cause**: Library not installed before the build step

**Solution**: Add library to package.json or install in Dockerfile before building:
```dockerfile
# Install dependencies including SAML library
COPY package*.json ./
RUN npm install

# Then build
RUN npm run build
```

### Issue: TypeScript compilation errors

**Cause**: Using direct import statement instead of dynamic import

**Solution**: The implementation uses `new Function()` with dynamic import to avoid TypeScript module resolution. If you modified the code, ensure you're using the same pattern:

```typescript
// ✅ Correct - bypasses TypeScript module resolution
const dynamicImport = new Function('moduleName', 'return import(moduleName)');
const module = await dynamicImport('@node-saml/node-saml');

// ❌ Wrong - TypeScript tries to resolve at compile time
import { SAML } from '@node-saml/node-saml';
```

---

## Production Deployment Checklist

Before deploying to production with SAML authentication:

- [ ] Library installed: `npm list @node-saml/node-saml`
- [ ] Application builds: `npm run build`
- [ ] Tests pass: `npm test -- test/saml-connector-security.test.ts`
- [ ] Test connection succeeds: `testConnection()` returns success
- [ ] SAML configuration is valid (IdP certificate, URLs, entity IDs)
- [ ] IdP metadata is correct and up to date
- [ ] Test authentication flow in staging environment
- [ ] Monitor logs for validation errors
- [ ] Document SAML configuration for operations team

---

## Support

### Documentation
- `SECURITY_FIX_SAML_AUTHENTICATION_BYPASS.md` - Security fix overview
- `src/integrations/connectors/SAML_SECURITY_FIX.md` - Technical details
- `test/saml-connector-security.test.ts` - Test suite

### Library Resources
- [node-saml/node-saml GitHub](https://github.com/node-saml/node-saml)
- [node-saml Documentation](https://github.com/node-saml/node-saml#readme)
- [SAML 2.0 Specification](http://docs.oasis-open.org/security/saml/v2.0/)

### Security References
- [OWASP SAML Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/SAML_Security_Cheat_Sheet.html)
- [SAML 2.0 Security Considerations](https://docs.oasis-open.org/security/saml/v2.0/saml-sec-consider-2.0-os.pdf)

---

**Last Updated**: 2026-08-08  
**Version**: 1.0.0
