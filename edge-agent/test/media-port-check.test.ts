import { createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { assertMediaPortAvailable } from "../src/runtime/media-port-check.js";

describe("media startup port check", () => {
  it("rejects an occupied port without disrupting its owner, and allows it after release", async () => {
    const owner = createServer();
    await new Promise<void>((resolve) => owner.listen(0, "127.0.0.1", resolve));
    const port = (owner.address() as { port: number }).port;
    try {
      await expect(assertMediaPortAvailable("127.0.0.1", port))
        .rejects.toThrow("Use the running installation");
      expect(owner.listening).toBe(true);
    } finally {
      await new Promise<void>((resolve) => owner.close(() => resolve()));
    }
    await expect(assertMediaPortAvailable("127.0.0.1", port)).resolves.toBeUndefined();
    // The successful probe must leave no listener behind.
    await expect(assertMediaPortAvailable("127.0.0.1", port)).resolves.toBeUndefined();
  });
});
