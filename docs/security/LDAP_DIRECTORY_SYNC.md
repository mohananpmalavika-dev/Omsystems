# LDAP & Active Directory Directory Synchronization (`security.ldap`)

## Overview
The KryptoVision platform provides production-ready directory synchronization with Active Directory and standard LDAP servers over secure LDAPS (TLS port 636) or StartTLS.

## Key Capabilities
1. **LDAPS Security Enforcement**: Strict TLS verification rejecting unencrypted LDAP queries in production environments. Validates enterprise CA chains and supports custom internal PKI root certificates.
2. **Organizational Unit (OU) Hierarchy Mapping**:
   - Parses multi-level Distinguished Names (DNs) into canonical hierarchical paths (e.g. `/Branches/RetailBanking/Cashiers`).
   - Evaluates exact, prefix, and regex mapping rules.
   - Automatically scopes users to specific bank branches and departments using named regex capture groups (e.g. `OU=Branch-(?<branchId>[0-9A-Za-z]+)`).
3. **Group & Transitive Membership Resolution**:
   - Resolves direct group memberships and nested/transitive groups.
   - Uses Active Directory `LDAP_MATCHING_RULE_IN_CHAIN` (`1.2.840.113556.1.4.1941`) and cycle-safe recursive traversal for OpenLDAP.
   - Maps directory groups to application roles (`BANK_SUPERADMIN`, `SECURITY_ADMIN`, `BANK_OPERATOR`, `AUDITOR`) with priority conflict resolution.
4. **Full & Incremental/Delta Sync**:
   - High-water mark tracking via Active Directory `whenChanged` or OpenLDAP `modifyTimestamp` in Generalized Time format.
   - Active Directory `userAccountControl` bitmask parsing (0x0002 ACCOUNTDISABLE, 0x0010 LOCKOUT).
   - Automatically marks disabled directory users as inactive and terminates all active sessions immediately via `SessionService.revokeAllForUser()`.
5. **Preview & Dry-Run Planning**:
   - Simulates directory reconciliation to generate diffs of users to create, update, or deactivate before executing database changes.
6. **Audit & Execution History**:
   - Durable persistence in PostgreSQL tables `ldap_sync_configurations`, `ldap_sync_history`, `ldap_ou_hierarchy`, and `ldap_group_mappings`.

## API Endpoints
- `POST /v1/security/ldap/:tenantId/sync`: Trigger on-demand sync (full, incremental, or dry-run).
- `GET /v1/security/ldap/:tenantId/sync/status`: Current running status and summary of last run.
- `GET /v1/security/ldap/:tenantId/sync/history`: Historical audit records.
- `POST /v1/security/ldap/:tenantId/test-connection`: Verify LDAPS connectivity and credentials.
- `GET /v1/security/ldap/:tenantId/preview`: Preview OU structure and candidate users.
- `GET /v1/security/ldap/:tenantId/config`: View configuration with masked secrets.
- `PUT /v1/security/ldap/:tenantId/config`: Update configuration and mapping rules.
- `DELETE /v1/security/ldap/:tenantId/config`: Remove configuration and cache.
