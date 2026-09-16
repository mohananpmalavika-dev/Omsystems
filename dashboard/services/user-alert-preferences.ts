"use client";

import { useEffect, useState } from "react";

export interface UserAlertPreferences {
  alertPopupEnabled: boolean; // Auto-open modal popup on urgent/new P1-P2 alerts
  alertToastEnabled: boolean; // Show bottom floating toast notifications
}

const POPUP_PREF_KEY = "sentinel-control-room-alert-popup-enabled";
const TOAST_PREF_KEY = "sentinel-control-room-alert-toast-enabled";

class UserAlertPreferencesService {
  private preferences: UserAlertPreferences = {
    alertPopupEnabled: true,
    alertToastEnabled: true,
  };

  private listeners: Set<(prefs: UserAlertPreferences) => void> = new Set();
  private initialized = false;
  private syncTimer?: number;

  constructor() {
    if (typeof window !== "undefined") {
      try {
        const storedPopup = window.localStorage.getItem(POPUP_PREF_KEY);
        if (storedPopup !== null) {
          this.preferences.alertPopupEnabled = storedPopup === "true";
        }
        const storedToast = window.localStorage.getItem(TOAST_PREF_KEY);
        if (storedToast !== null) {
          this.preferences.alertToastEnabled = storedToast === "true";
        }
      } catch {
        // LocalStorage access might fail in restricted sandboxes
      }
    }
  }

  getPreferences(): UserAlertPreferences {
    return { ...this.preferences };
  }

  isAlertPopupEnabled(): boolean {
    return this.preferences.alertPopupEnabled;
  }

  isAlertToastEnabled(): boolean {
    return this.preferences.alertToastEnabled;
  }

  subscribe(listener: (prefs: UserAlertPreferences) => void): () => void {
    this.listeners.add(listener);
    listener(this.getPreferences());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const current = this.getPreferences();
    for (const listener of this.listeners) {
      try {
        listener(current);
      } catch {
        // Suppress listener errors
      }
    }
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    if (typeof window === "undefined" || typeof fetch === "undefined") return;

    try {
      let res = await fetch("/v1/auth/preferences", {
        credentials: "include",
        headers: { "x-silent": "true" },
      }).catch(() => null);

      if (!res || !res.ok) {
        res = await fetch("/api/control/v1/auth/preferences", {
          credentials: "include",
          headers: { "x-silent": "true" },
        }).catch(() => null);
      }

      if (!res || !res.ok) {
        res = await fetch("/api/ai/preferences", {
          credentials: "include",
          headers: { "x-silent": "true" },
        }).catch(() => null);
      }

      if (res && res.ok) {
        const data = await res.json().catch(() => null);
        const serverPrefs = data?.preferences;
        if (serverPrefs && typeof serverPrefs === "object") {
          let updated = false;

          if (typeof serverPrefs.alertPopupEnabled === "boolean") {
            this.preferences.alertPopupEnabled = serverPrefs.alertPopupEnabled;
            try {
              window.localStorage.setItem(POPUP_PREF_KEY, String(serverPrefs.alertPopupEnabled));
            } catch {}
            updated = true;
          }

          if (typeof serverPrefs.alertToastEnabled === "boolean") {
            this.preferences.alertToastEnabled = serverPrefs.alertToastEnabled;
            try {
              window.localStorage.setItem(TOAST_PREF_KEY, String(serverPrefs.alertToastEnabled));
            } catch {}
            updated = true;
          }

          if (updated) {
            this.notify();
          }
        }
      }
    } catch {
      // Fallback gracefully to localStorage
    }
  }

  setAlertPopupEnabled(enabled: boolean): void {
    if (this.preferences.alertPopupEnabled === enabled) return;
    this.preferences.alertPopupEnabled = enabled;

    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(POPUP_PREF_KEY, String(enabled));
      } catch {}
    }

    this.notify();
    this.scheduleServerSync({ alertPopupEnabled: enabled });
  }

  setAlertToastEnabled(enabled: boolean): void {
    if (this.preferences.alertToastEnabled === enabled) return;
    this.preferences.alertToastEnabled = enabled;

    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(TOAST_PREF_KEY, String(enabled));
      } catch {}
    }

    this.notify();
    this.scheduleServerSync({ alertToastEnabled: enabled });
  }

  private scheduleServerSync(updates: Partial<UserAlertPreferences>) {
    if (typeof window === "undefined" || typeof fetch === "undefined") return;

    if (this.syncTimer) {
      window.clearTimeout(this.syncTimer);
    }

    this.syncTimer = window.setTimeout(async () => {
      try {
        const payload = { preferences: updates };
        const init: RequestInit = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        };

        const primary = await fetch("/v1/auth/preferences", init).catch(() => null);
        if (!primary || !primary.ok) {
          await fetch("/api/control/v1/auth/preferences", init).catch(() => null);
        }
      } catch {
        // Sync failure should not block client
      }
    }, 300);
  }
}

export const userAlertPreferences = new UserAlertPreferencesService();

export function useUserAlertPreferences() {
  const [preferences, setPreferences] = useState<UserAlertPreferences>(
    userAlertPreferences.getPreferences(),
  );

  useEffect(() => {
    void userAlertPreferences.init();
    return userAlertPreferences.subscribe(setPreferences);
  }, []);

  return {
    ...preferences,
    setAlertPopupEnabled: (enabled: boolean) => userAlertPreferences.setAlertPopupEnabled(enabled),
    setAlertToastEnabled: (enabled: boolean) => userAlertPreferences.setAlertToastEnabled(enabled),
  };
}
