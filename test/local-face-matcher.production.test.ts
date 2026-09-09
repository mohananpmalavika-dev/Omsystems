import { describe, expect, it } from "vitest";
import { LocalFaceMatcherService } from "../src/ai/services/local-face-matcher.service.js";

describe("local face matcher production safeguards", () => {
  it("does not ship a demo biometric identity and rejects malformed vectors", async () => {
    const matcher = new LocalFaceMatcherService();
    const vector = matcher.createSyntheticVector(0.5);

    await expect(matcher.matchFace({
      cameraId: "camera-1", branchId: "branch-1", embeddingVector: vector,
    })).resolves.toMatchObject({ matched: false });

    await expect(matcher.matchFace({
      cameraId: "camera-1", branchId: "branch-1", embeddingVector: [0.1, 0.2],
    })).rejects.toThrow("exactly 512 finite values");

    expect(() => matcher.enrollFace({
      personId: "invalid", name: "Invalid", watchlistType: "SUSPECT",
      embeddingVector: Array(512).fill(1), enrolledAt: new Date(),
    })).toThrow("normalized");
  });
});
