"use client";

import { useEffect, useRef } from "react";
import { useNotifications } from "@/components/notifications/NotificationsProvider";

const DEDUPE_WINDOW_MS = 10_000;

type ApiErrorBody = {
  message?: unknown;
  error?: unknown;
};

function isDashboardApiRequest(input: RequestInfo | URL): boolean {
  try {
    const rawUrl = input instanceof Request ? input.url : input.toString();
    const url = new URL(rawUrl, window.location.origin);
    return url.origin === window.location.origin &&
      (url.pathname.startsWith("/api/") || url.pathname.startsWith("/v1/"));
  } catch {
    return false;
  }
}

async function messageFromResponse(response: Response): Promise<string> {
  try {
    const body = await response.clone().json() as ApiErrorBody;
    if (typeof body.message === "string" && body.message.trim()) return body.message.trim();
    if (typeof body.error === "string" && body.error.trim()) {
      return body.error.replaceAll("_", " ");
    }
  } catch {
    // Some API routes return an empty or non-JSON error response.
  }
  return `Request failed (HTTP ${response.status}). Please try again.`;
}

/**
 * Makes API failures visible even for pages that call `fetch` directly instead
 * of using the shared API client. It only observes dashboard API paths and
 * leaves normal navigation and third-party requests untouched.
 */
export function ApiErrorNotifier() {
  const { showToast } = useNotifications();
  const recentErrors = useRef(new Map<string, number>());

  useEffect(() => {
    const originalFetch = window.fetch;

    const notify = (message: string) => {
      const now = Date.now();
      const previous = recentErrors.current.get(message) ?? 0;
      if (now - previous < DEDUPE_WINDOW_MS) return;
      recentErrors.current.set(message, now);
      showToast(message, "error");
    };

    window.fetch = async function visibleApiFetch(input, init) {
      const isApiRequest = isDashboardApiRequest(input);
      try {
        const response = await originalFetch(input, init);
        if (isApiRequest && !response.ok) {
          void messageFromResponse(response).then(notify);
        }
        return response;
      } catch (error) {
        if (isApiRequest && !(error instanceof DOMException && error.name === "AbortError")) {
          notify("Unable to reach the service. Check your connection and try again.");
        }
        throw error;
      }
    };

    return () => {
      if (window.fetch !== originalFetch) window.fetch = originalFetch;
    };
  }, [showToast]);

  return null;
}
