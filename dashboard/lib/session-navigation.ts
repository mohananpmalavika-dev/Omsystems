const publicPages = new Set([
  "/login", "/forgot-password", "/reset-password", "/support", "/privacy", "/terms",
]);

export function isPublicDashboardRoute(pathname: string | null | undefined): boolean {
  const path = (pathname || "/").replace(/\/+$/, "") || "/";
  return publicPages.has(path) || /^\/live-incident\/[^/]+$/.test(path);
}

/** Only return to a local workspace route after authentication. */
export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return "/";
  try {
    const url = new URL(value, "https://dashboard.invalid");
    if (url.origin !== "https://dashboard.invalid" ||
      isPublicDashboardRoute(url.pathname) || url.pathname.startsWith("/api/") ||
      url.pathname.startsWith("/_next/")) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

export function loginPath(reason: string, location: Pick<Location, "pathname" | "search" | "hash">): string {
  const destination = safeReturnPath(`${location.pathname}${location.search || ""}${location.hash || ""}`);
  const params = new URLSearchParams({ reason });
  if (destination !== "/") params.set("next", destination);
  return `/login?${params}`;
}
