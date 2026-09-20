import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dashboardRoot = existsSync(resolve(process.cwd(), "app", "analytics"))
  ? process.cwd()
  : resolve(process.cwd(), "dashboard");
const repositoryRoot = resolve(dashboardRoot, "..");

const analyticsRoutes = [
  "/analytics",
  "/analytics/dashboard",
  "/analytics/alerts",
  "/analytics/predictions",
  "/analytics/investigation",
  "/analytics/rules",
  "/analytics/banking",
  "/analytics/banking/authorized-persons",
  "/analytics/nbfc-watchlist",
  "/analytics/anpr-logistics",
  "/analytics/branch-comparison",
  "/analytics/face-recognition",
  "/analytics/reid",
  "/analytics/anpr",
  "/analytics/people",
  "/analytics/vehicles",
  "/analytics/crowd",
  "/analytics/tailgating",
  "/analytics/behavioral",
  "/analytics/fall",
  "/analytics/abandoned-objects",
  "/analytics/camera-obstruction",
  "/analytics/camera-tamper",
  "/analytics/industrial",
  "/analytics/retail",
];

describe("analytics module flow continuity", () => {
  it.each(analyticsRoutes)("links only to an existing page: %s", (route) => {
    const page = route === "/analytics"
      ? resolve(dashboardRoot, "app", "analytics", "page.tsx")
      : resolve(dashboardRoot, "app", ...route.slice(1).split("/"), "page.tsx");
    expect(existsSync(page)).toBe(true);
  });

  it("does not claim external dispatches that only changed local UI state", () => {
    const sources = [
      resolve(dashboardRoot, "app", "analytics", "anpr-logistics", "page.tsx"),
      resolve(dashboardRoot, "components", "banking-analytics-dashboard.tsx"),
    ].map((file) => readFileSync(file, "utf8")).join("\n");

    expect(sources).not.toContain("Police 112 Notified");
    expect(sources).not.toContain("Guard Dispatched");
    expect(sources).not.toContain("Alert Dispatched");
  });

  it("keeps the persistent banking engine on /v1 and isolates the development fallback", () => {
    const controlPlaneRoutes = readFileSync(
      resolve(repositoryRoot, "src", "routes", "banking-analytics.routes.ts"),
      "utf8",
    );
    const analyticsEngineRoutes = readFileSync(
      resolve(repositoryRoot, "analytics-engine", "src", "routes", "banking-analytics-api.ts"),
      "utf8",
    );
    const apiClient = readFileSync(resolve(dashboardRoot, "lib", "api-client.ts"), "utf8");

    expect(controlPlaneRoutes).not.toContain('app.get("/v1/banking/sessions"');
    expect(controlPlaneRoutes).toContain('app.get("/api/v1/banking/sessions"');
    expect(analyticsEngineRoutes).toContain("app.get('/v1/banking/sessions'");
    expect(apiClient).toContain("function fetchBankingApi");
  });
});
