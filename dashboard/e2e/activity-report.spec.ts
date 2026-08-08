import { expect, test } from "@playwright/test";

test("loads employee activity through the same-origin control proxy", async ({ page }) => {
  const requestedUrls: string[] = [];
  page.on("request", (request) => requestedUrls.push(request.url()));

  await page.route("**/api/control/v1/users?limit=100", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data: [{ id: "user-1", displayName: "Operations Manager", username: "ops.manager" }] }),
  }));
  await page.route("**/api/control/v1/activity/report/comprehensive?**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      user: { id: "user-1", display_name: "Operations Manager", username: "ops.manager" },
      period: { startDate: "2026-08-01", endDate: "2026-08-08" },
      sessionSummary: { total_sessions: "4", total_duration_seconds: "14400", avg_session_duration_seconds: "3600", first_login: "2026-08-01T08:00:00Z", last_logout: "2026-08-08T17:00:00Z" },
      moduleUsage: [{ page_module: "control_room", visit_count: "8", total_seconds: "7200", avg_seconds: "900" }],
      controlRoomSummary: { total_monitoring_sessions: "3", total_monitoring_seconds: "5400", unique_branches_monitored: "2", total_alerts_handled: "5", total_incidents_created: "1", total_camera_switches: "12" },
      branchMonitoring: [{ branch_name: "Central Branch", branch_node_id: "branch-1", monitoring_sessions: "3", total_seconds: "5400" }],
      actionSummary: [{ action_category: "incident_response", action_count: "5" }],
    }),
  }));

  await page.goto("/activity-report");

  await expect(page.getByRole("heading", { name: "Employee activity report" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Operations Manager" })).toBeVisible();
  await expect(page.getByText("Central Branch", { exact: true })).toBeVisible();
  expect(requestedUrls.some((url) => url.includes("/api/control/v1/activity/report/comprehensive"))).toBe(true);
  expect(requestedUrls.some((url) => url.includes("localhost:4000"))).toBe(false);
});
