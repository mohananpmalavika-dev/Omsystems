import { describe, expect, it } from "vitest";
import { getLiveSessionToken } from "../lib/live-auth";

describe("live session header handling", () => {
  it("ignores dashboard Basic Auth", () => {
    expect(getLiveSessionToken({
      authorization: "Basic ZGFzaGJvYXJkOnBhc3M=",
    })).toBeUndefined();
  });

  it("forwards an explicit bearer employee session", () => {
    expect(getLiveSessionToken({
      authorization: "Bearer employee-session",
    })).toBe("employee-session");
  });
});
