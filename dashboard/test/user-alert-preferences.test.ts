import { describe, expect, it, beforeEach } from "vitest";
import { userAlertPreferences } from "../services/user-alert-preferences.js";
import { popupQueue, activeDashboardQueue, type CommandAlert } from "../lib/alert-command-center.js";

describe("User Alert Preferences & Opt-In / Opt-Out", () => {
  beforeEach(() => {
    // Reset to defaults
    userAlertPreferences.setAlertPopupEnabled(true);
    userAlertPreferences.setAlertToastEnabled(true);
  });

  it("provides default enabled preferences for alert popups and toasts", () => {
    const prefs = userAlertPreferences.getPreferences();
    expect(prefs.alertPopupEnabled).toBe(true);
    expect(prefs.alertToastEnabled).toBe(true);
    expect(userAlertPreferences.isAlertPopupEnabled()).toBe(true);
    expect(userAlertPreferences.isAlertToastEnabled()).toBe(true);
  });

  it("updates alertPopupEnabled and notifies subscribers on toggle", () => {
    const recorded: boolean[] = [];
    const unsubscribe = userAlertPreferences.subscribe((p) => {
      recorded.push(p.alertPopupEnabled);
    });

    userAlertPreferences.setAlertPopupEnabled(false);
    expect(userAlertPreferences.isAlertPopupEnabled()).toBe(false);

    userAlertPreferences.setAlertPopupEnabled(true);
    expect(userAlertPreferences.isAlertPopupEnabled()).toBe(true);

    unsubscribe();
    expect(recorded).toEqual([true, false, true]);
  });

  it("updates alertToastEnabled and notifies subscribers on toggle", () => {
    const recorded: boolean[] = [];
    const unsubscribe = userAlertPreferences.subscribe((p) => {
      recorded.push(p.alertToastEnabled);
    });

    userAlertPreferences.setAlertToastEnabled(false);
    expect(userAlertPreferences.isAlertToastEnabled()).toBe(false);

    userAlertPreferences.setAlertToastEnabled(true);
    expect(userAlertPreferences.isAlertToastEnabled()).toBe(true);

    unsubscribe();
    expect(recorded).toEqual([true, false, true]);
  });

  it("correctly models suppression of auto-popup modal when user opts out", () => {
    const alerts: CommandAlert[] = [
      { id: "p1-01", severity: "P1", status: "new", lastDetectedAt: "2026-09-16T12:00:00.000Z", branchName: "Vault", cameraName: "Cam 1" } as CommandAlert,
      { id: "p2-01", severity: "P2", status: "new", lastDetectedAt: "2026-09-16T11:59:00.000Z", branchName: "Lobby", cameraName: "Cam 2" } as CommandAlert,
    ];

    const dismissed = new Set<string>();
    const urgentQueue = popupQueue(alerts, dismissed);
    const dashboardQueue = activeDashboardQueue(alerts);

    // Scenario 1: User has alertPopupEnabled = true (Default)
    let alertPopupEnabled = true;
    let manualAlertId: string | undefined = undefined;
    let current = alertPopupEnabled
      ? (dashboardQueue.find((alert) => alert.id === manualAlertId) ?? urgentQueue[0])
      : dashboardQueue.find((alert) => alert.id === manualAlertId);

    expect(current?.id).toBe("p1-01"); // Auto-pops up highest priority urgent alert

    // Scenario 2: User opted out (alertPopupEnabled = false)
    alertPopupEnabled = false;
    current = alertPopupEnabled
      ? (dashboardQueue.find((alert) => alert.id === manualAlertId) ?? urgentQueue[0])
      : dashboardQueue.find((alert) => alert.id === manualAlertId);

    expect(current).toBeUndefined(); // Modal does NOT auto-pop up

    // Scenario 3: User manually clicks an alert in the queue while opted out of auto-popups
    manualAlertId = "p2-01";
    current = alertPopupEnabled
      ? (dashboardQueue.find((alert) => alert.id === manualAlertId) ?? urgentQueue[0])
      : dashboardQueue.find((alert) => alert.id === manualAlertId);

    expect(current?.id).toBe("p2-01"); // User can still view evidence on demand
  });
});
