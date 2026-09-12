/**
 * Production LDAP & Active Directory Synchronization Types
 */

export interface LdapAttributeMapping {
  username: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  telephone?: string;
  title?: string;
  department?: string;
  memberOf?: string;
  userAccountControl?: string;
  whenChanged?: string;
  modifyTimestamp?: string;
}

export const DEFAULT_LDAP_ATTRIBUTE_MAPPING: LdapAttributeMapping = {
  username: 'sAMAccountName',
  email: 'mail',
  displayName: 'displayName',
  firstName: 'givenName',
  lastName: 'sn',
  telephone: 'telephoneNumber',
  title: 'title',
  department: 'department',
  memberOf: 'memberOf',
  userAccountControl: 'userAccountControl',
  whenChanged: 'whenChanged',
  modifyTimestamp: 'modifyTimestamp',
};

export interface LdapOuMappingRule {
  id?: string;
  pattern: string; // e.g. "/Branches/Branch-(?<branchId>[0-9A-Za-z]+)" or exact "/Headquarters/Security"
  matchType: 'EXACT' | 'PREFIX' | 'REGEX';
  department?: string;
  branchId?: string; // literal branch ID or token like "${branchId}"
  defaultRole?: string;
  clearanceTags?: string[];
}

export interface LdapGroupMappingRule {
  id?: string;
  groupDnOrCn: string; // e.g. "CN=Bank-Security-Admins,OU=Groups,DC=bank,DC=internal" or "Bank-Security-Admins"
  targetRole: string; // e.g. "BANK_SUPERADMIN", "SECURITY_ADMIN", "BANK_OPERATOR", "AUDITOR"
  priority: number; // Higher number = higher precedence
  clearanceTags?: string[];
}

export interface LdapSyncConfig {
  id?: string;
  tenantId: string;
  providerId: string;
  name?: string;
  serverUrl: string; // ldaps://dc.bank.internal:636 or ldap://... with TLS
  bindDn: string;
  bindPassword?: string;
  bindSecretRef?: string;
  baseDn: string;
  userSearchBase?: string;
  userSearchFilter: string;
  groupSearchBase?: string;
  groupSearchFilter: string;
  ouSearchBase?: string;
  ouSearchFilter: string;
  attributeMapping: LdapAttributeMapping;
  ouMappingRules: LdapOuMappingRule[];
  groupMappingRules: LdapGroupMappingRule[];
  syncIntervalCron: string;
  syncMode: 'FULL' | 'INCREMENTAL';
  deactivateMissingUsers: boolean;
  revokeSessionsOnDeactivate: boolean;
  tlsRequireTrustedCa: boolean;
  tlsCaCerts: string[];
  pageSize: number;
  isEnabled: boolean;
  lastSyncTimestamp?: Date | null;
  highestUsn?: number | null;
  metadata?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface LdapDiscoveredOu {
  dn: string;
  name: string;
  parentDn: string | null;
  canonicalPath: string; // e.g. "/Retail/Branches/West"
  depth: number;
  mappedDepartment?: string;
  mappedBranchId?: string;
  mappedRole?: string;
  rawAttributes: Record<string, any>;
}

export interface LdapDiscoveredGroup {
  dn: string;
  name: string;
  members: string[]; // User DNs or member identifiers
  rawAttributes: Record<string, any>;
}

export interface LdapDiscoveredUser {
  dn: string;
  username: string;
  email: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  telephone?: string;
  title?: string;
  department?: string;
  groups: string[];
  ouHierarchy: string[]; // e.g. ["Cashiers", "RetailBanking", "Branches"]
  canonicalOuPath: string; // e.g. "/Branches/RetailBanking/Cashiers"
  isActive: boolean;
  isLocked: boolean;
  userAccountControl?: number;
  whenChanged?: Date;
  rawAttributes: Record<string, any>;
}

export interface LdapSyncErrorDetail {
  code: string;
  message: string;
  dn?: string;
  timestamp: string;
}

export interface LdapDryRunPlan {
  usersToCreate: Array<{
    username: string;
    email: string;
    displayName: string;
    mappedRole: string;
    ouPath: string;
    branchId?: string;
    department?: string;
  }>;
  usersToUpdate: Array<{
    userId: string;
    username: string;
    email: string;
    changes: Record<string, { old: any; new: any }>;
  }>;
  usersToDeactivate: Array<{
    userId: string;
    username: string;
    email: string;
    reason: string;
  }>;
  groupsResolved: Array<{
    groupName: string;
    mappedRole: string;
    memberCount: number;
  }>;
  ousDiscovered: Array<{
    canonicalPath: string;
    mappedBranchId?: string;
    mappedDepartment?: string;
  }>;
}

export interface LdapSyncResult {
  jobId: string;
  tenantId: string;
  providerId: string;
  syncMode: 'FULL' | 'INCREMENTAL' | 'DRY_RUN';
  status: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED';
  usersDiscovered: number;
  usersCreated: number;
  usersUpdated: number;
  usersDeactivated: number;
  groupsDiscovered: number;
  groupsMapped: number;
  ousDiscovered: number;
  durationMs: number;
  highWaterMark?: Date;
  errorSummary?: string;
  errors: LdapSyncErrorDetail[];
  dryRunPlan?: LdapDryRunPlan;
  startedAt: Date;
  completedAt: Date;
}

export interface LdapConnectionTestResult {
  success: boolean;
  serverUrl: string;
  tlsSecure: boolean;
  boundAs: string;
  responseTimeMs: number;
  rootDseInfo?: {
    namingContexts?: string[];
    supportedLDAPVersion?: string[];
    vendorName?: string;
  };
  error?: string;
}
