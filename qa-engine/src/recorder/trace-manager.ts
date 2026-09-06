/**
 * Trace Manager
 *
 * Coordinates Playwright trace files (trace.zip) for inspection.
 */

import { join } from "node:path";
import { existsSync } from "node:fs";

export class TraceManager {
  private tracePath: string;

  constructor(baseArtifactsDir: string) {
    this.tracePath = join(baseArtifactsDir, "trace.zip");
  }

  get path(): string {
    return this.tracePath;
  }

  get relativePath(): string {
    return "trace.zip";
  }

  exists(): boolean {
    return existsSync(this.tracePath);
  }
}
