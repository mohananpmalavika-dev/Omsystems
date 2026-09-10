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
    return [...authorizedHrefs].some((href) => {
      if (href.includes("?") || href.includes("#")) return false;
      const parentPath = pathOf(href);
      return actionPath.startsWith(`${parentPath}/`);
    });
  });
}

function pathOf(href: string) {
  return href.split(/[?#]/, 1)[0] || "/";
}
