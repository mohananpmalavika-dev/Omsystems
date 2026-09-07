export type NavigationAccessUser = {
  role?: string;
  username?: string;
};

const unrestrictedRoles = new Set(["super_admin", "company_admin", "hq_admin", "admin", "superadmin"]);
const unrestrictedUsernames = new Set([
  "mgdhanyamohan",
]);

/** Platform administrators always receive the complete navigation workspace. */
export function hasUnrestrictedMenuAccess(user: NavigationAccessUser | null | undefined): boolean {
  if (!user) return false;
  return unrestrictedRoles.has(user.role ?? "")
    || unrestrictedUsernames.has(String(user.username ?? "").toLowerCase());
}
