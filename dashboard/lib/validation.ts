/**
 * Input validation and sanitization utilities for Zero-Touch Provisioning
 */

// Branch ID validation: alphanumeric, dashes, underscores, 2-20 chars
export function validateBranchId(branchId: string): { valid: boolean; error?: string } {
  if (!branchId || branchId.trim().length === 0) {
    return { valid: false, error: "Branch ID is required" };
  }

  const trimmed = branchId.trim();

  if (trimmed.length < 2) {
    return { valid: false, error: "Branch ID must be at least 2 characters" };
  }

  if (trimmed.length > 20) {
    return { valid: false, error: "Branch ID must not exceed 20 characters" };
  }

  // Only alphanumeric, dashes, and underscores allowed
  const validPattern = /^[A-Za-z0-9_-]+$/;
  if (!validPattern.test(trimmed)) {
    return { valid: false, error: "Branch ID can only contain letters, numbers, dashes, and underscores" };
  }

  return { valid: true };
}

// Branch name validation: 2-100 chars, basic sanitization
export function validateBranchName(branchName: string): { valid: boolean; error?: string } {
  if (!branchName || branchName.trim().length === 0) {
    return { valid: false, error: "Branch name is required" };
  }

  const trimmed = branchName.trim();

  if (trimmed.length < 2) {
    return { valid: false, error: "Branch name must be at least 2 characters" };
  }

  if (trimmed.length > 100) {
    return { valid: false, error: "Branch name must not exceed 100 characters" };
  }

  // Disallow control characters and some special chars
  const invalidPattern = /[\x00-\x1F\x7F<>{}[\]\\]/;
  if (invalidPattern.test(trimmed)) {
    return { valid: false, error: "Branch name contains invalid characters" };
  }

  return { valid: true };
}

// Search query sanitization: remove control characters, limit length
export function sanitizeSearchQuery(query: string): string {
  if (!query) return "";
  
  // Remove control characters and limit length
  return query
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim()
    .slice(0, 100);
}

// Sanitize general text input
export function sanitizeTextInput(input: string): string {
  if (!input) return "";
  
  return input
    .replace(/[\x00-\x1F\x7F]/g, "") // Remove control characters
    .replace(/[<>]/g, "") // Remove angle brackets to prevent injection
    .trim();
}

// Validate region/zone selection
export function validateRegion(region: string): { valid: boolean; error?: string } {
  const validRegions = ["South Zone", "West Zone", "North Zone", "East Zone", "Central Zone"];
  
  if (!region) {
    return { valid: false, error: "Region is required" };
  }

  if (!validRegions.includes(region)) {
    return { valid: false, error: "Invalid region selected" };
  }

  return { valid: true };
}

// Validate and sanitize branch form data
export interface BranchFormData {
  branchId: string;
  branchName: string;
  region: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
  sanitized?: BranchFormData;
}

export function validateBranchForm(data: BranchFormData): ValidationResult {
  const errors: Record<string, string> = {};

  // Validate branch ID
  const branchIdValidation = validateBranchId(data.branchId);
  if (!branchIdValidation.valid) {
    errors.branchId = branchIdValidation.error!;
  }

  // Validate branch name
  const branchNameValidation = validateBranchName(data.branchName);
  if (!branchNameValidation.valid) {
    errors.branchName = branchNameValidation.error!;
  }

  // Validate region
  const regionValidation = validateRegion(data.region);
  if (!regionValidation.valid) {
    errors.region = regionValidation.error!;
  }

  const valid = Object.keys(errors).length === 0;

  if (valid) {
    return {
      valid: true,
      errors: {},
      sanitized: {
        branchId: sanitizeTextInput(data.branchId.trim()),
        branchName: sanitizeTextInput(data.branchName.trim()),
        region: data.region,
      },
    };
  }

  return { valid: false, errors };
}

// Validate filter selection
export function validateStatusFilter(filter: string): boolean {
  const validFilters = ["ALL", "ACTIVE", "PROVISIONING", "PARTIAL", "UNENROLLED", "OFFLINE"];
  return validFilters.includes(filter);
}

// Sanitize for display (prevent XSS)
export function sanitizeForDisplay(text: string): string {
  if (!text) return "";
  
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Validate job ID format (for URL parameters)
export function validateJobId(jobId: string): { valid: boolean; error?: string } {
  if (!jobId || jobId.trim().length === 0) {
    return { valid: false, error: "Job ID is required" };
  }

  // Job IDs should be alphanumeric with dashes
  const validPattern = /^job-[a-z0-9-]+$/;
  if (!validPattern.test(jobId)) {
    return { valid: false, error: "Invalid job ID format" };
  }

  if (jobId.length > 50) {
    return { valid: false, error: "Job ID too long" };
  }

  return { valid: true };
}
