import { vi } from "vitest";

// Backwards compatibility layer for legacy test suites referencing Jest mock APIs
if (typeof (globalThis as any).jest === "undefined") {
  (globalThis as any).jest = vi;
}
