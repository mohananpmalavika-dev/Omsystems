/**
 * Onboarding & First-Time Bootstrap Domain Contracts
 */

export interface OnboardingStatus {
  isFirstTimeSetup: boolean;
  requiresOrganizationSetup: boolean;
  organizationCount: number;
  branchCount: number;
  superadminConfigured: boolean;
  defaultSuperadminUsername: string;
  message: string;
}

export interface OnboardingSetupInput {
  organizationName: string;
  organizationCode?: string | undefined;
  tenantSlug?: string | undefined;
  regionName?: string | undefined;
  firstBranchName: string;
  firstBranchCode?: string | undefined;
  firstBranchAddress?: {
    street?: string | undefined;
    city?: string | undefined;
    state?: string | undefined;
    postalCode?: string | undefined;
    country?: string | undefined;
  } | undefined;
  adminUsername?: string | undefined;
  adminPassword?: string | undefined;
  adminEmail?: string | undefined;
  adminDisplayName?: string | undefined;
}

export interface OnboardingSetupResult {
  success: boolean;
  message: string;
  organization: {
    id: string;
    name: string;
    code?: string | undefined;
    tenantId: string;
  };
  region?: {
    id: string;
    name: string;
  } | undefined;
  firstBranch: {
    id: string;
    name: string;
    code?: string | undefined;
  };
  superadmin: {
    id: string;
    username: string;
    displayName: string;
    email: string;
    role: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
}
