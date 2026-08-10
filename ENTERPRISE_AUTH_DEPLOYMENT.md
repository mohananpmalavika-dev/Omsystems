# Enterprise Authentication Deployment Checklist

## 🚀 Quick Start (30 minutes)

### Prerequisites
- ✅ Node.js 22+ installed
- ✅ PostgreSQL database running
- ✅ Access to identity provider (Azure AD/Okta/LDAP)
- ✅ Admin access to Sentinel Grid

---

## Step 1: Verify Installation (5 min)

### Check Dependencies
```bash
# All dependencies already in package.json
npm list @node-saml/passport-saml  # Should show v5.1.0
npm list openid-client              # Should show v6.8.4
npm list ldapjs                     # Should show v3.0.7
```

### Verify Files
```bash
# Check implementation files exist
ls src/security/saml-provider.ts          # ✅ SAML implementation
ls src/security/oidc-provider.ts          # ✅ OIDC implementation
ls src/security/ldap-connector.ts         # ✅ LDAP implementation
ls src/routes/auth-enterprise.routes.ts   # ✅ API routes

# Check integration
grep "registerEnterpriseAuthRoutes" src/app.ts  # Should show import and registration
```

---

## Step 2: Choose Your Provider (5 min)

### Option A: SAML 2.0 (Azure AD, Okta)
**Best for**: Enterprise customers with existing SAML IdP

**Required Information:**
- IdP Entry Point URL (SSO URL)
- IdP Issuer
- IdP Certificate (X.509)
- SP Callback URL (your application)

**Obtain from:**
- Azure AD: Azure Portal → Enterprise Applications → Your App → Single Sign-On
- Okta: Okta Admin → Applications → Your App → Sign On → View Setup Instructions

### Option B: OpenID Connect (Modern Cloud)
**Best for**: Modern cloud providers, OAuth 2.0 environments

**Required Information:**
- Issuer URL (auto-discovery endpoint)
- Client ID
- Client Secret
- Redirect URI (your callback)

**Obtain from:**
- Azure AD: App Registrations → Your App → Overview
- Okta: Applications → Your App → General
- Auth0: Applications → Your App → Settings

### Option C: LDAP/Active Directory
**Best for**: On-premise Active Directory, traditional enterprises

**Required Information:**
- LDAP server URL (ldap:// or ldaps://)
- Base DN (e.g., dc=example,dc=com)
- Service account DN and password
- User search base and filter

**Obtain from:** Your IT/Network Administrator

---

## Step 3: Configure Identity Provider (10 min)

### For SAML (Azure AD Example)

1. **Azure Portal → Azure Active Directory → Enterprise Applications**
2. Click **New Application** → **Create your own application**
3. Name: "Sentinel Grid" → **Integrate any other application you don't find in the gallery**
4. Click **Set up single sign on** → Choose **SAML**
5. Edit **Basic SAML Configuration**:
   - Entity ID: `https://sentinel.example.com/saml/metadata`
   - Reply URL: `https://sentinel.example.com/api/v1/auth/saml/callback`
   - Sign on URL: `https://sentinel.example.com/login`
6. **User Attributes & Claims**: Add custom claims
   - firstName → given_name
   - lastName → surname
   - email → emailaddress
   - groups → groups (optional)
7. Download **Certificate (Base64)** from **SAML Signing Certificate**
8. Copy **Login URL** from **Set up Sentinel Grid** section
9. Assign users: **Users and groups** → **Add user/group**

### For OIDC (Okta Example)

1. **Okta Admin Console → Applications → Create App Integration**
2. **Sign-in method**: OIDC - OpenID Connect
3. **Application type**: Web Application
4. **App integration name**: Sentinel Grid
5. **Sign-in redirect URIs**: `https://sentinel.example.com/api/v1/auth/oidc/callback`
6. **Sign-out redirect URIs**: `https://sentinel.example.com/login`
7. **Assignments**: Choose who can access (Everyone, or specific groups)
8. Click **Save**
9. Copy **Client ID** and **Client Secret**
10. Note the **Okta domain** (e.g., acme-corp.okta.com)

### For LDAP (Active Directory)

1. **Create Service Account:**
   ```powershell
   # On Windows Server with AD
   New-ADUser -Name "Sentinel Service" `
     -SamAccountName "sentinel-svc" `
     -UserPrincipalName "sentinel-svc@example.com" `
     -Path "OU=Service Accounts,DC=example,DC=com" `
     -AccountPassword (ConvertTo-SecureString "ComplexPassword123!" -AsPlainText -Force) `
     -Enabled $true `
     -PasswordNeverExpires $true
   ```

2. **Grant Read Permissions:**
   ```powershell
   # Grant service account read access to Users and Groups
   dsacls "OU=Users,DC=example,DC=com" /G "example\sentinel-svc:GR"
   dsacls "OU=Groups,DC=example,DC=com" /G "example\sentinel-svc:GR"
   ```

3. **Test LDAP Connection:**
   ```bash
   ldapsearch -x -H ldap://dc.example.com:389 \
     -D "cn=sentinel-svc,ou=service-accounts,dc=example,dc=com" \
     -w "ComplexPassword123!" \
     -b "ou=users,dc=example,dc=com" \
     "(sAMAccountName=testuser)"
   ```

4. **Open Firewall (if needed):**
   ```powershell
   New-NetFirewallRule -DisplayName "LDAP" -Direction Inbound -LocalPort 389 -Protocol TCP -Action Allow
   New-NetFirewallRule -DisplayName "LDAPS" -Direction Inbound -LocalPort 636 -Protocol TCP -Action Allow
   ```

---

## Step 4: Configure Sentinel Grid (5 min)

### Start the Application
```bash
npm run dev
# Or for production:
npm run build && npm start
```

### Configure SAML Tenant
```bash
curl -X POST 'http://localhost:3000/v1/auth/enterprise/saml/configure' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN' \
  -d '{
    "tenantId": "acme-corp",
    "entryPoint": "https://login.microsoftonline.com/{TENANT_ID}/saml2",
    "issuer": "https://sentinel.example.com/saml/metadata",
    "callbackUrl": "https://sentinel.example.com/api/v1/auth/saml/callback",
    "cert": "-----BEGIN CERTIFICATE-----\nYOUR_CERTIFICATE_HERE\n-----END CERTIFICATE-----",
    "identifierFormat": "urn:oasis:names:tc:SAML:2.0:nameid-format:persistent",
    "wantAssertionsSigned": true,
    "wantAuthnResponseSigned": true,
    "clockTolerance": 60
  }'
```

### Configure OIDC Tenant
```bash
curl -X POST 'http://localhost:3000/v1/auth/enterprise/oidc/configure' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN' \
  -d '{
    "tenantId": "acme-corp",
    "provider": "azure-ad",
    "issuerUrl": "https://login.microsoftonline.com/{TENANT_ID}/v2.0",
    "clientId": "YOUR_CLIENT_ID",
    "clientSecret": "YOUR_CLIENT_SECRET",
    "redirectUri": "https://sentinel.example.com/api/v1/auth/oidc/callback",
    "scopes": ["openid", "profile", "email", "offline_access"]
  }'
```

### Configure LDAP Tenant
```bash
curl -X POST 'http://localhost:3000/v1/auth/enterprise/ldap/configure' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN' \
  -d '{
    "tenantId": "acme-corp",
    "url": "ldap://dc.example.com:389",
    "baseDN": "dc=example,dc=com",
    "bindDN": "cn=sentinel-svc,ou=service-accounts,dc=example,dc=com",
    "bindPassword": "YOUR_SERVICE_ACCOUNT_PASSWORD",
    "userSearchBase": "ou=users,dc=example,dc=com",
    "userSearchFilter": "(sAMAccountName={{username}})",
    "groupSearchBase": "ou=groups,dc=example,dc=com",
    "groupSearchFilter": "(member={{dn}})",
    "attributeMapping": {
      "userId": "sAMAccountName",
      "email": "mail",
      "firstName": "givenName",
      "lastName": "sn",
      "displayName": "displayName",
      "memberOf": "memberOf"
    }
  }'
```

---

## Step 5: Test Configuration (5 min)

### Test SAML
```bash
# 1. Check configuration
curl 'http://localhost:3000/v1/auth/enterprise/test/saml/acme-corp' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN'

# Expected: { "success": true, "configured": true }

# 2. Get SP metadata (provide to IdP admin)
curl 'http://localhost:3000/v1/auth/saml/metadata/acme-corp'

# 3. Test SSO flow (in browser)
# Visit: http://localhost:3000/v1/auth/saml/login/acme-corp?redirect=/dashboard
```

### Test OIDC
```bash
# 1. Check configuration
curl 'http://localhost:3000/v1/auth/enterprise/test/oidc/acme-corp' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN'

# 2. Test SSO flow (in browser)
# Visit: http://localhost:3000/v1/auth/oidc/login/acme-corp?redirect=/dashboard
```

### Test LDAP
```bash
# 1. Check connection
curl 'http://localhost:3000/v1/auth/enterprise/test/ldap/acme-corp' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN'

# Expected: { "success": true, "configured": true, "connected": true }

# 2. Test authentication
curl -X POST 'http://localhost:3000/v1/auth/ldap/login' \
  -H 'Content-Type: application/json' \
  -d '{
    "tenantId": "acme-corp",
    "username": "john.doe",
    "password": "UserPassword123!"
  }'

# Expected: { "success": true, "token": "...", "user": {...} }
```

---

## Step 6: Production Deployment (Production Only)

### Environment Variables
```bash
# .env file
NODE_ENV=production

# JWT Configuration
JWT_SECRET=REPLACE_WITH_256_BIT_RANDOM_SECRET
JWT_EXPIRATION=8h

# SSO Configuration
SSO_SESSION_TIMEOUT=28800
SAML_CLOCK_TOLERANCE=60
OIDC_CLOCK_TOLERANCE=60

# LDAP Configuration
LDAP_CONNECTION_TIMEOUT=10000
LDAP_POOL_SIZE=10

# Audit & Monitoring
ENABLE_SSO_AUDIT_LOGS=true
SSO_FAILURE_ALERT_THRESHOLD=10

# Public URLs (MUST be HTTPS in production)
PUBLIC_URL=https://sentinel.example.com
SAML_CALLBACK_URL=https://sentinel.example.com/api/v1/auth/saml/callback
OIDC_CALLBACK_URL=https://sentinel.example.com/api/v1/auth/oidc/callback
```

### SSL/TLS Certificate
```bash
# SAML and OIDC REQUIRE HTTPS in production
# Obtain SSL certificate from:
# - Let's Encrypt (free, automated)
# - DigiCert, Sectigo (paid, enterprise)
# - Your organization's PKI

# Install certificate
sudo certbot --nginx -d sentinel.example.com
```

### Firewall Rules
```bash
# Allow HTTPS traffic
sudo ufw allow 443/tcp

# For LDAP connectivity (if on-premise AD)
# Allow outbound to DC on port 389 or 636
sudo ufw allow out to <DC_IP_ADDRESS> port 389
sudo ufw allow out to <DC_IP_ADDRESS> port 636
```

### Database Migration (if needed)
```bash
# Run migration to add SSO session tables
npm run migrate

# Or manually:
psql -U postgres -d sentinel_grid -f migrations/add-sso-sessions.sql
```

---

## Common Issues & Troubleshooting

### Issue 1: "Invalid signature" (SAML)
**Symptom**: SAML login fails with signature error

**Solution:**
1. Download latest certificate from IdP
2. Remove line breaks: `cat cert.pem | tr -d '\n'`
3. Update configuration with new certificate
4. Check clock synchronization: `timedatectl status`
5. Increase clock tolerance to 300 seconds temporarily

### Issue 2: "State mismatch" (OIDC)
**Symptom**: OIDC callback fails with state parameter error

**Solution:**
1. Ensure callback URL matches exactly (including trailing slash)
2. Check if using load balancer with sticky sessions
3. Verify cookies are enabled in browser
4. Implement Redis-backed session storage for multi-instance deployments

### Issue 3: "Connection timeout" (LDAP)
**Symptom**: LDAP authentication hangs then fails

**Solution:**
1. Test connectivity: `telnet dc.example.com 389`
2. Check firewall rules on application server
3. Verify LDAP server is listening: `netstat -an | grep 389`
4. Try LDAPS (port 636) instead of LDAP (port 389)
5. Check service account isn't locked: `net user sentinel-svc /domain`

### Issue 4: "Tenant not configured"
**Symptom**: SSO login returns 404 or "tenant not configured"

**Solution:**
1. Verify configuration was saved: `/v1/auth/enterprise/test/{type}/{tenantId}`
2. Check tenantId matches exactly (case-sensitive)
3. Restart application to reload configuration
4. Check application logs for configuration errors

### Issue 5: HTTPS Required Error
**Symptom**: IdP rejects callback URL or SAML response fails

**Solution:**
1. SAML/OIDC require HTTPS in production (security requirement)
2. Install SSL certificate: `certbot --nginx -d sentinel.example.com`
3. Update all callback URLs to use https://
4. Reconfigure IdP with https:// URLs

---

## Success Criteria

### ✅ SAML Working
- [ ] `/v1/auth/enterprise/test/saml/{tenant}` returns `configured: true`
- [ ] SP metadata accessible at `/v1/auth/saml/metadata/{tenant}`
- [ ] SSO login redirects to IdP successfully
- [ ] After IdP authentication, redirects back with token
- [ ] User profile extracted correctly (email, name, groups)

### ✅ OIDC Working
- [ ] `/v1/auth/enterprise/test/oidc/{tenant}` returns `configured: true`
- [ ] Authorization URL redirects to provider successfully
- [ ] After provider authentication, callback receives code
- [ ] Token exchange completes successfully
- [ ] User profile fetched from userinfo endpoint

### ✅ LDAP Working
- [ ] `/v1/auth/enterprise/test/ldap/{tenant}` returns `connected: true`
- [ ] Test authentication with known user succeeds
- [ ] User attributes mapped correctly
- [ ] Group membership retrieved
- [ ] Connection pooling maintains connections

---

## Next Steps After Deployment

1. **User Provisioning**: Implement JIT (Just-In-Time) user creation
2. **Token Integration**: Wire up JWT token generation with existing auth system
3. **Admin UI**: Build configuration management interface
4. **Monitoring**: Set up alerts for SSO failures
5. **Documentation**: Create user guides for SSO login

---

## Support

**Documentation**: See `ENTERPRISE_AUTH_IMPLEMENTATION.md` for complete implementation details

**Configuration Examples**: See `config/enterprise-auth-examples.json`

**Logs**: Check application logs for detailed error messages
```bash
tail -f logs/sentinel-grid.log | grep -i "saml\|oidc\|ldap"
```

**Contact**: Your implementation team or Sentinel Grid support

---

## Estimated Time: 30-60 minutes total
- Prerequisites: 0 min (already done)
- Verification: 5 min
- Provider setup: 10 min
- Configuration: 5 min
- Testing: 5-10 min
- Troubleshooting: 0-30 min (if needed)

**Status after deployment: Enterprise authentication LIVE** 🎉
