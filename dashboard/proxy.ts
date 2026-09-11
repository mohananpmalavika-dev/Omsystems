import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isPublicDashboardRoute } from "./lib/session-navigation";

export function proxy(request: NextRequest) {
  // 1. Basic auth check (if configured)
  const expectedUsername = runtimeEnv("DASHBOARD_ACCESS_USERNAME");
  const expectedPassword = runtimeEnv("DASHBOARD_ACCESS_PASSWORD");
  if (expectedUsername && expectedPassword) {
    const credentials = parseBasicCredentials(
      request.headers.get("authorization"),
    );
    if (
      !credentials ||
      !safeEqual(credentials.username, expectedUsername) ||
      !safeEqual(credentials.password, expectedPassword)
    ) {
      return new NextResponse("Authentication required", {
        status: 401,
        headers: {
          "cache-control": "no-store",
          "www-authenticate": 'Basic realm="KryptonVision", charset="UTF-8"',
        },
      });
    }
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

export const middleware = proxy;

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

function parseBasicCredentials(value: string | null) {
  if (!value?.startsWith("Basic ")) return null;
  try {
    const decoded = atob(value.slice(6));
    const separator = decoded.indexOf(":");
    if (separator < 0) return null;
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

function runtimeEnv(name: string) {
  return Reflect.get(process.env, name) as string | undefined;
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
