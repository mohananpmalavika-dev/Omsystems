import { describe, expect, it } from "vitest";
import { LocalFaceMatcherService } from "../src/ai/services/local-face-matcher.service.js";

function createTestEmbedding(seed: number): number[] {
  const vector = Array.from({ length: 512 }, (_, index) => Math.sin(seed * (index + 1)));
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return vector.map((value) => value / magnitude);
}

describe("local face matcher production safeguards", () => {
  it("does not ship a demo biometric identity and rejects malformed vectors", async () => {
    const matcher = new LocalFaceMatcherService();
    const vector = createTestEmbedding(0.5);

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
