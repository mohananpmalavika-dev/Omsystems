import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

export class SegmentChecksum {
  /**
   * Computes the SHA-256 hash of a file at the specified path using streaming.
   */
  static async computeSha256(filePath: string): Promise<string> {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);

    return new Promise((resolve, reject) => {
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("error", (err) => reject(err));
      stream.on("end", () => resolve(hash.digest("hex")));
    });
  }

  /**
   * Validates if a file matches the expected SHA-256 hash.
   */
  static async verifySha256(filePath: string, expectedHash: string): Promise<boolean> {
    try {
      const actualHash = await this.computeSha256(filePath);
      return actualHash.toLowerCase() === expectedHash.toLowerCase();
    } catch {
      return false;
    }
  }
}
