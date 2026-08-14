export type OrganizationAvailability = "ready" | "empty" | "restricted";

export function getOrganizationAvailability(
  response: {
    meta: {
      organizationExists: boolean;
      accessRestricted: boolean;
    };
  },
): OrganizationAvailability {
  if (response.meta.accessRestricted) return "restricted";
  if (!response.meta.organizationExists) return "empty";
  return "ready";
}
