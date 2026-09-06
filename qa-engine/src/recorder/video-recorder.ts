/**
 * Video Recorder Manager
 *
 * Coordinates Playwright video capture and organizes output files into qa-artifacts/run-{id}/video/
 */

import { readdirSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";

export class VideoRecorder {
  private videoDir: string;

  constructor(baseArtifactsDir: string) {
    this.videoDir = join(baseArtifactsDir, "video");
    mkdirSync(this.videoDir, { recursive: true });
  }

  get directory(): string {
    return this.videoDir;
  }

  /**
   * Finalize video recording after page close
   */
  async finalizeWithVideo(video: any): Promise<string | null> {
    try {
      if (video) {
        const targetPath = join(this.videoDir, "full-session.webm");
        await video.saveAs(targetPath).catch(() => {});
        if (existsSync(targetPath)) {
          return "video/full-session.webm";
        }
      }

      // Fallback: check if any webm files exist in videoDir
      if (existsSync(this.videoDir)) {
        const files = readdirSync(this.videoDir).filter((f) => f.endsWith(".webm"));
        if (files.length > 0) {
          const first = files[0];
          const targetPath = join(this.videoDir, "full-session.webm");
          if (first !== "full-session.webm") {
            copyFileSync(join(this.videoDir, first), targetPath);
          }
          return "video/full-session.webm";
        }
      }
    } catch (err) {
      console.warn("[VideoRecorder] Failed to finalize video:", err);
    }
    return null;
  }

  async finalize(page?: Page): Promise<string | null> {
    const video = page ? page.video() : null;
    return this.finalizeWithVideo(video);
  }
}
