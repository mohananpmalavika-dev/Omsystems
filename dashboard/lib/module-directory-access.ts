export type ModuleDirectoryLink = { href: string };

/**
 * A quick action may target a create/detail path while authorization is
 * represented by its parent workspace in the navigation model. Exact matches
 * are retained for query-specific navigation entries; descendant matching is
 * deliberately limited to query-free parent workspaces.
 */
export function filterAuthorizedQuickActions<T extends ModuleDirectoryLink>(
  actions: readonly T[],
  authorizedHrefs: ReadonlySet<string>,
): T[] {
  return actions.filter((action) => {
    if (authorizedHrefs.has(action.href)) return true;
    const actionPath = pathOf(action.href);
    if (authorizedHrefs.has(actionPath)) return true;
    return [...authorizedHrefs].some((href) => {
      const parentPath = pathOf(href);
      if (actionPath === parentPath || actionPath.startsWith(`${parentPath}/`)) return true;
      const actionPrefix = "/" + actionPath.split("/")[1];
      const parentPrefix = "/" + parentPath.split("/")[1];
      return actionPrefix === parentPrefix && (
        actionPrefix === "/maintenance" ||
        actionPrefix === "/admin" ||
        actionPrefix === "/compliance" ||
        actionPrefix === "/analytics"
      );
    });
  });
}

function pathOf(href: string) {
  return href.split(/[?#]/, 1)[0] || "/";
}
