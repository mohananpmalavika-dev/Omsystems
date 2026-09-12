/**
 * Organizational Unit (OU) Hierarchy Parser & Automatic Mapping Engine
 * 
 * Extracts multi-tier OU hierarchies from LDAP Distinguished Names (DNs),
 * builds canonical OU path trees, and applies pattern/regex mapping rules
 * to associate users with bank branches, departments, and default roles.
 */

import type {
  LdapDiscoveredOu,
  LdapOuMappingRule,
} from './ldap-types.js';

export interface EvaluatedOuMapping {
  canonicalPath: string;
  matchedRule?: LdapOuMappingRule;
  department?: string;
  branchId?: string;
  defaultRole?: string;
  clearanceTags: string[];
}

export class LdapOuMapper {
  /**
   * Split an LDAP DN into unescaped Relative Distinguished Names (RDNs).
   * Handles escaped commas ('\,') accurately.
   */
  static splitDnToRdns(dn: string): string[] {
    if (!dn) return [];
    const rdns: string[] = [];
    let current = '';
    let isEscaped = false;

    for (let i = 0; i < dn.length; i++) {
      const char = dn[i];
      if (isEscaped) {
        current += char;
        isEscaped = false;
      } else if (char === '\\') {
        current += char;
        isEscaped = true;
      } else if (char === ',') {
        rdns.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    if (current.trim()) {
      rdns.push(current.trim());
    }
    return rdns;
  }

  /**
   * Extract all OU component values from a DN in root-to-leaf order.
   * E.g. "CN=User,OU=Cashiers,OU=RetailBanking,OU=Branches,DC=bank,DC=internal"
   * -> ["Branches", "RetailBanking", "Cashiers"]
   */
  static extractOuComponents(dn: string): string[] {
    const rdns = this.splitDnToRdns(dn);
    const ous: string[] = [];

    for (const rdn of rdns) {
      const eqIdx = rdn.indexOf('=');
      if (eqIdx !== -1) {
        const type = rdn.substring(0, eqIdx).trim().toUpperCase();
        const val = rdn.substring(eqIdx + 1).trim().replace(/\\,/g, ',');
        if (type === 'OU') {
          ous.push(val);
        }
      }
    }

    // In an LDAP DN, leftmost is the most specific (leaf) and rightmost is closer to root.
    // We reverse to get root-to-leaf order: ["Branches", "RetailBanking", "Cashiers"]
    return ous.reverse();
  }

  /**
   * Build a canonical path string from a DN.
   * E.g. "/Branches/RetailBanking/Cashiers"
   */
  static buildCanonicalPath(dn: string): string {
    const components = this.extractOuComponents(dn);
    if (components.length === 0) {
      return '/';
    }
    return '/' + components.join('/');
  }

  /**
   * Parse a raw OU directory entry into a structured LdapDiscoveredOu entity.
   */
  static parseOuEntry(dn: string, attributes: Record<string, any>): LdapDiscoveredOu {
    const rdns = this.splitDnToRdns(dn);
    const leafRdn = rdns[0] || '';
    const eqIdx = leafRdn.indexOf('=');
    const name = eqIdx !== -1 ? leafRdn.substring(eqIdx + 1).replace(/\\,/g, ',') : dn;

    const parentRdns = rdns.slice(1);
    const parentDn = parentRdns.length > 0 ? parentRdns.join(',') : null;
    const canonicalPath = this.buildCanonicalPath(dn);
    const depth = this.extractOuComponents(dn).length;

    return {
      dn,
      name,
      parentDn,
      canonicalPath,
      depth,
      rawAttributes: attributes,
    };
  }

  /**
   * Evaluate automatic OU mapping rules against a user's DN or canonical OU path.
   */
  static evaluateMapping(
    dn: string,
    rules: LdapOuMappingRule[] = []
  ): EvaluatedOuMapping {
    const canonicalPath = this.buildCanonicalPath(dn);
    const clearanceTagsSet = new Set<string>();

    let matchedRule: LdapOuMappingRule | undefined = undefined;
    let department: string | undefined = undefined;
    let branchId: string | undefined = undefined;
    let defaultRole: string | undefined = undefined;

    for (const rule of rules) {
      let isMatch = false;
      let namedCaptures: Record<string, string> = {};

      if (rule.matchType === 'EXACT') {
        isMatch = canonicalPath.toLowerCase() === rule.pattern.toLowerCase();
      } else if (rule.matchType === 'PREFIX') {
        isMatch = canonicalPath.toLowerCase().startsWith(rule.pattern.toLowerCase());
      } else if (rule.matchType === 'REGEX') {
        try {
          const regex = new RegExp(rule.pattern, 'i');
          const execRes = regex.exec(canonicalPath);
          if (execRes) {
            isMatch = true;
            if (execRes.groups) {
              namedCaptures = execRes.groups;
            }
          }
        } catch {
          // Ignore invalid regex in user config
        }
      }

      if (isMatch) {
        matchedRule = rule;
        
        // Resolve department
        if (rule.department) {
          department = this.interpolateTokens(rule.department, namedCaptures);
        }

        // Resolve branchId
        if (rule.branchId) {
          branchId = this.interpolateTokens(rule.branchId, namedCaptures);
        } else if (namedCaptures.branchId) {
          branchId = namedCaptures.branchId;
        }

        // Resolve default role
        if (rule.defaultRole) {
          defaultRole = rule.defaultRole;
        }

        // Collect clearance tags
        if (rule.clearanceTags && Array.isArray(rule.clearanceTags)) {
          for (const tag of rule.clearanceTags) {
            clearanceTagsSet.add(this.interpolateTokens(tag, namedCaptures));
          }
        }

        // First matching rule takes precedence for primary department/role, but we collect all clearance tags
        break;
      }
    }

    return {
      canonicalPath,
      matchedRule,
      department,
      branchId,
      defaultRole,
      clearanceTags: Array.from(clearanceTagsSet),
    };
  }

  /**
   * Replace named capture tokens like "${branchId}" with extracted regex capture values.
   */
  private static interpolateTokens(template: string, captures: Record<string, string>): string {
    let result = template;
    for (const [k, v] of Object.entries(captures)) {
      result = result.replace(new RegExp(`\\$\\{${k}\\}`, 'g'), v);
    }
    return result;
  }
}
