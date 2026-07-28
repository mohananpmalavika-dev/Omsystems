import { describe, expect, it } from "vitest";
import type { CommandAlert } from "../lib/alert-command-center.js";
import {
  activeDashboardQueue,
  alertTonePattern,
  popupQueue,
} from "../lib/alert-command-center.js";

describe("global real-time alert queue", () => {
  it("orders multiple alerts by priority and excludes log-only P4 alerts", () => {
    const alerts = [alert("p3", "P3"), alert("p1-old", "P1", "2026-07-28T00:00:00.000Z"), alert("p4", "P4"), alert("p1-new", "P1", "2026-07-28T01:00:00.000Z")];
    expect(activeDashboardQueue(alerts).map((item) => item.id)).toEqual(["p1-new", "p1-old", "p3"]);
  });

  it("queues every undismissed new P1/P2 popup while retaining P3 for the dashboard", () => {
    const alerts = [alert("one", "P1"), alert("two", "P2"), alert("three", "P3")];
    expect(popupQueue(alerts, new Set()).map((item) => item.id)).toEqual(["one", "two"]);
    expect(popupQueue(alerts, new Set(["one"])).map((item) => item.id)).toEqual(["two"]);
    expect(alertTonePattern("P1")).toHaveLength(3);
  });
});

function alert(id: string, severity: CommandAlert["severity"], lastDetectedAt = "2026-07-28T00:30:00.000Z") {
  return {
    id,
    severity,
    status: "new",
    lastDetectedAt,
    branchName: "Bengaluru",
    cameraName: "Lobby",
  } as CommandAlert;
}
