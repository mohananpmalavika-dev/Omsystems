/**
 * User Group & Transitive Membership Resolver
 * 
 * Resolves both direct and nested/transitive group memberships in Active Directory
 * and OpenLDAP, preventing cyclic loops, and maps groups to local application roles
 * based on priority and enterprise policy.
 */

import { Client } from 'ldapts';
import { LdapConnectionManager } from './ldap-connection-manager.js';
import type { LdapGroupMappingRule, LdapDiscoveredGroup } from './ldap-types.js';

export interface ResolvedGroupRoles {
  primaryRole: string;
  allRoles: string[];
  clearanceTags: string[];
  matchedGroups: string[];
}

export class LdapGroupResolver {
  /**
   * Extract the Common Name (CN) from an LDAP DN.
   * E.g. "CN=Bank-Security-Admins,OU=Groups,DC=bank,DC=internal" -> "Bank-Security-Admins"
   */
  static extractCommonName(dnOrCn: string): string {
    if (!dnOrCn) return '';
    const match = dnOrCn.match(/^CN=([^,]+)/i);
    if (match && match[1]) {
      return match[1].trim().replace(/\\,/g, ',');
    }
    return dnOrCn.trim();
  }

  /**
   * Build Active Directory LDAP_MATCHING_RULE_IN_CHAIN query filter for nested group membership.
   */
  static buildAdNestedGroupFilter(userDn: string): string {
    const escapedUserDn = LdapConnectionManager.escapeFilterValue(userDn);
    return `(&(objectCategory=group)(member:1.2.840.113556.1.4.1941:=${escapedUserDn}))`;
  }

  /**
   * Resolve transitive group memberships with cycle detection (for OpenLDAP/standard directories).
   */
  static async resolveNestedGroups(
    client: Client,
    searchBase: string,
    initialGroupDns: string[],
    groupFilterTemplate: string = '(&(objectCategory=group)(member={groupDn}))'
  ): Promise<string[]> {
    const allGroupDns = new Set<string>(initialGroupDns);
    const visitedDns = new Set<string>();
    const queue: string[] = [...initialGroupDns];

    while (queue.length > 0) {
      const currentGroupDn = queue.shift()!;
      if (visitedDns.has(currentGroupDn)) {
        continue; // Cycle detection: skip already processed group
      }
      visitedDns.add(currentGroupDn);

      const escapedGroupDn = LdapConnectionManager.escapeFilterValue(currentGroupDn);
      const filter = groupFilterTemplate.replace('{groupDn}', escapedGroupDn);

      try {
        const results = await LdapConnectionManager.executePagedSearch(
          client,
          searchBase,
          filter,
          ['dn', 'cn', 'distinguishedName'],
          100
        );

        for (const entry of results) {
          if (entry.dn && !allGroupDns.has(entry.dn)) {
            allGroupDns.add(entry.dn);
            queue.push(entry.dn);
          }
        }
      } catch {
        // Group query failure for sub-branch is tolerated; continue processing queue
      }
    }

    return Array.from(allGroupDns);
  }

  /**
   * Map a user's directory groups to application roles and clearance tags using priority rules.
   */
  static mapGroupsToRoles(
    userGroups: string[],
    rules: LdapGroupMappingRule[] = [],
    fallbackRole: string = 'BANK_OPERATOR'
  ): ResolvedGroupRoles {
    const matchedRoles = new Set<string>();
    const clearanceTags = new Set<string>();
    const matchedGroups = new Set<string>();

    // Normalize group identifiers (both full DN and CN)
    const normalizedUserGroups = new Set<string>();
    for (const g of userGroups) {
      normalizedUserGroups.add(g.toLowerCase());
      normalizedUserGroups.add(this.extractCommonName(g).toLowerCase());
    }

    // Sort rules by priority descending
    const sortedRules = [...rules].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    let primaryRole: string | undefined = undefined;

    for (const rule of sortedRules) {
      const ruleTarget = rule.groupDnOrCn.trim().toLowerCase();
      const ruleCn = this.extractCommonName(rule.groupDnOrCn).toLowerCase();

      if (normalizedUserGroups.has(ruleTarget) || normalizedUserGroups.has(ruleCn)) {
        matchedRoles.add(rule.targetRole);
        matchedGroups.add(rule.groupDnOrCn);

        if (!primaryRole) {
          primaryRole = rule.targetRole;
        }

        if (rule.clearanceTags && Array.isArray(rule.clearanceTags)) {
          for (const tag of rule.clearanceTags) {
            clearanceTags.add(tag);
          }
        }
      }
    }

    const resolvedPrimary = primaryRole || fallbackRole;
    if (matchedRoles.size === 0) {
      matchedRoles.add(resolvedPrimary);
    }

    return {
      primaryRole: resolvedPrimary,
      allRoles: Array.from(matchedRoles),
      clearanceTags: Array.from(clearanceTags),
      matchedGroups: Array.from(matchedGroups),
    };
  }

  /**
   * Parse a raw group entry into LdapDiscoveredGroup.
   */
  static parseGroupEntry(dn: string, attributes: Record<string, any>): LdapDiscoveredGroup {
    const name = typeof attributes.cn === 'string'
      ? attributes.cn
      : (Array.isArray(attributes.cn) ? attributes.cn[0] : this.extractCommonName(dn));

    const rawMembers = attributes.member || attributes.uniqueMember || attributes.memberUid || [];
    const members = Array.isArray(rawMembers) ? rawMembers.map(String) : [String(rawMembers)];

    return {
      dn,
      name,
      members,
      rawAttributes: attributes,
    };
  }
}
