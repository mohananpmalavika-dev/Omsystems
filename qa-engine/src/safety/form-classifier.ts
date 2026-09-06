/**
 * Form Safety Classifier
 *
 * Distinguishes between safe forms (search, filter, sort, pagination)
 * and mutating or destructive forms (create user, update settings, delete).
 */

import type { QASafetyClassification } from "../types/qa.types";
import { DESTRUCTIVE_KEYWORDS } from "./destructive-action-classifier";

export const SAFE_FORM_TERMS = [
  "search",
  "filter",
  "sort",
  "query",
  "find",
  "keyword",
  "lookup",
  "pagination",
  "page",
  "date range",
  "start date",
  "end date",
  "timeframe",
  "view mode",
  "grid",
  "list",
];

export const MUTATING_FORM_TERMS = [
  "create",
  "add",
  "new",
  "edit",
  "update",
  "modify",
  "configure",
  "save settings",
  "submit request",
  "enroll",
  "register",
  "invite",
  "change password",
  "assign",
];

export interface FormInspectionTarget {
  id?: string;
  name?: string;
  action?: string;
  method?: string;
  submitButtonText?: string;
  inputNames?: string[];
  formHeading?: string;
}

export class FormClassifier {
  /**
   * Classify a form for automated testing safety
   */
  classify(form: FormInspectionTarget): {
    classification: QASafetyClassification;
    canSubmit: boolean;
    reason: string;
  } {
    const combinedText = [
      form.id,
      form.name,
      form.action,
      form.submitButtonText,
      form.formHeading,
      ...(form.inputNames || []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    // 1. Check for destructive form indicators
    for (const keyword of DESTRUCTIVE_KEYWORDS) {
      const regex = new RegExp(`\\b${keyword.replace(/\s+/g, "\\s+")}\\b`, "i");
      if (regex.test(combinedText)) {
        return {
          classification: "DESTRUCTIVE",
          canSubmit: false,
          reason: `Form contains destructive keyword: "${keyword}"`,
        };
      }
    }

    // 2. Check for mutating form indicators
    for (const term of MUTATING_FORM_TERMS) {
      const regex = new RegExp(`\\b${term.replace(/\s+/g, "\\s+")}\\b`, "i");
      if (regex.test(combinedText)) {
        return {
          classification: "POTENTIALLY_MUTATING",
          canSubmit: false,
          reason: `Form appears to mutate data ("${term}"); inspect only`,
        };
      }
    }

    // 3. Check for safe form indicators (search, filter)
    for (const term of SAFE_FORM_TERMS) {
      if (combinedText.includes(term)) {
        return {
          classification: "SAFE",
          canSubmit: true,
          reason: `Safe read-only form identified ("${term}")`,
        };
      }
    }

    // If method is GET and has few inputs, usually safe search/filter
    if (form.method && form.method.toUpperCase() === "GET") {
      return {
        classification: "SAFE",
        canSubmit: true,
        reason: "HTTP GET form considered safe read-only query",
      };
    }

    // Default unknown
    return {
      classification: "UNKNOWN",
      canSubmit: false,
      reason: "Form intent unknown; inspected without submitting",
    };
  }
}
