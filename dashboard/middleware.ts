import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { proxy } from "./proxy";
import { isPublicDashboardRoute } from "./lib/session-navigation";

export function middleware(request: NextRequest) {
  // 1. If basic auth is configured on the dashboard, check credentials first
  const basicAuthResponse = proxy(request);
  if (basicAuthResponse.status === 401) {
    return basicAuthResponse;
  }

  const { pathname } = request.nextUrl;

  // 2. Allow API routes, static assets, and public routes
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.includes(".") ||
    isPublicDashboardRoute(pathname)
  ) {
    return NextResponse.next();
  }

  // 3. For any protected route, if sentinel_access cookie is not present, redirect to /login
  const sessionToken = request.cookies.get("sentinel_access")?.value;
  if (!sessionToken) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
