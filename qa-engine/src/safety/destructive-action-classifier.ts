/**
 * Destructive Action Classifier
 *
 * Enforces strict safety rules to ensure the automated QA crawler
 * NEVER executes destructive actions (e.g. Delete, Wipe, Reset, Drop).
 */

import type { QASafetyClassification } from "../types/qa.types";

export const DESTRUCTIVE_KEYWORDS = [
  "delete",
  "remove",
  "destroy",
  "erase",
  "factory reset",
  "reset database",
  "drop",
  "format",
  "terminate",
  "deactivate",
  "disable user",
  "revoke",
  "wipe",
  "uninstall",
  "shutdown",
  "restart server",
  "reboot",
  "clear data",
  "delete recording",
  "delete evidence",
  "purge",
  "release legal hold",
  "remove camera",
  "remove device",
  "remove recorder",
  "restart recorder",
  "restart gateway",
  "format storage",
  "change retention",
  "change raid",
  "delete branch",
  "delete tenant",
  "rotate keys",
  "revoke certificate",
  "revoke session",
  "clear audit logs",
  "prune",
  "nuke",
  "kill",
  "hard reset",
];

export const DESTRUCTIVE_API_PATTERNS = [
  /\/api\/.*\/delete/i,
  /\/api\/.*\/remove/i,
  /\/api\/.*\/purge/i,
  /\/api\/.*\/reset/i,
  /\/api\/.*\/format/i,
  /\/api\/.*\/revoke/i,
  /\/api\/.*\/shutdown/i,
  /\/api\/.*\/reboot/i,
];

export interface ActionInspectionTarget {
  text?: string;
  ariaLabel?: string;
  role?: string;
  name?: string;
  id?: string;
  href?: string;
  actionUrl?: string;
  httpMethod?: string;
  nearbyText?: string;
  cssClasses?: string;
}

export class DestructiveActionClassifier {
  private allowedActions: Set<string>;

  constructor(allowedActions: string[] = []) {
    this.allowedActions = new Set(allowedActions.map((a) => a.toLowerCase().trim()));
  }

  /**
   * Classify an interactive element or action
   */
  classify(target: ActionInspectionTarget): {
    classification: QASafetyClassification;
    reason?: string;
    matchedPattern?: string;
  } {
    const combinedText = [
      target.text,
      target.ariaLabel,
      target.name,
      target.id,
      target.nearbyText,
      target.cssClasses,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    // Check allow-list first
    for (const allowed of this.allowedActions) {
      if (allowed && combinedText.includes(allowed)) {
        return {
          classification: "SAFE",
          reason: `Explicitly allowed by administrator configuration: "${allowed}"`,
        };
      }
    }

    // Check HTTP method
    if (target.httpMethod && target.httpMethod.toUpperCase() === "DELETE") {
      return {
        classification: "DESTRUCTIVE",
        reason: "HTTP DELETE method is blocked by safety engine",
        matchedPattern: "METHOD: DELETE",
      };
    }

    // Check API endpoint patterns
    const url = target.actionUrl || target.href || "";
    if (url) {
      for (const pattern of DESTRUCTIVE_API_PATTERNS) {
        if (pattern.test(url)) {
          return {
            classification: "DESTRUCTIVE",
            reason: `Target URL matches dangerous path pattern: ${pattern}`,
            matchedPattern: url,
          };
        }
      }
    }

    // Check destructive keywords against combined element labels
    for (const keyword of DESTRUCTIVE_KEYWORDS) {
      // Regex matching word boundary or exact phrase
      const regex = new RegExp(`\\b${keyword.replace(/\s+/g, "\\s+")}\\b`, "i");
      if (regex.test(combinedText)) {
        return {
          classification: "DESTRUCTIVE",
          reason: `Element text contains destructive keyword: "${keyword}"`,
          matchedPattern: keyword,
        };
      }
    }

    // If safe query or navigation, mark safe
    const isNavigation =
      target.role === "link" ||
      target.role === "tab" ||
      target.role === "menuitem" ||
      Boolean(target.href);

    if (isNavigation) {
      return { classification: "SAFE" };
    }

    return { classification: "SAFE" };
  }

  /**
   * Helper check returning boolean
   */
  isDestructive(target: ActionInspectionTarget): boolean {
    return this.classify(target).classification === "DESTRUCTIVE";
  }
}
