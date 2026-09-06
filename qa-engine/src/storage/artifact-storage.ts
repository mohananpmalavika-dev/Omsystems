/**
 * Artifact Storage Abstraction
 *
 * Persists videos, screenshots, Playwright traces, and HTML/JSON reports
 * to the filesystem under qa-artifacts/run-{id}/.
 */

import { mkdirSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { QAArtifact } from "../types/qa.types";

export class ArtifactStorage {
  private baseDir: string;
  private runArtifactsDir: string;
  private runId: string;

  constructor(runId: string, customRoot?: string) {
    this.runId = runId;
    this.baseDir = customRoot ? resolve(customRoot) : resolve(process.cwd(), "qa-artifacts");
    this.runArtifactsDir = join(this.baseDir, `run-${runId}`);
    mkdirSync(this.runArtifactsDir, { recursive: true });
  }

  get directory(): string {
    return this.runArtifactsDir;
  }

  /**
   * Save HTML report
   */
  saveHtmlReport(htmlContent: string): QAArtifact {
    const filePath = join(this.runArtifactsDir, "report.html");
    writeFileSync(filePath, htmlContent, "utf8");
    const stat = statSync(filePath);

    return {
      id: `art-html-${Date.now()}`,
      runId: this.runId,
      artifactType: "report_html",
      fileName: "report.html",
      filePath: "report.html",
      fileSizeBytes: stat.size,
      mimeType: "text/html",
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Save JSON report
   */
  saveJsonReport(jsonContent: string): QAArtifact {
    const filePath = join(this.runArtifactsDir, "report.json");
    writeFileSync(filePath, jsonContent, "utf8");
    const stat = statSync(filePath);

    return {
      id: `art-json-${Date.now()}`,
      runId: this.runId,
      artifactType: "report_json",
      fileName: "report.json",
      filePath: "report.json",
      fileSizeBytes: stat.size,
      mimeType: "application/json",
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Scan artifacts folder to produce metadata list
   */
  collectAllArtifacts(): QAArtifact[] {
    const artifacts: QAArtifact[] = [];

    if (!existsSync(this.runArtifactsDir)) return artifacts;

    function scanDir(dir: string, relPrefix = "") {
      const items = readdirSync(dir);
      for (const item of items) {
        const full = join(dir, item);
        const rel = relPrefix ? `${relPrefix}/${item}` : item;
        const stat = statSync(full);

        if (stat.isDirectory()) {
          scanDir(full, rel);
        } else {
          let artifactType: QAArtifact["artifactType"] = "log";
          let mimeType = "application/octet-stream";

          if (item.endsWith(".webm") || item.endsWith(".mp4")) {
            artifactType = "video";
            mimeType = "video/webm";
          } else if (item.endsWith(".png") || item.endsWith(".jpg")) {
            artifactType = "screenshot";
            mimeType = "image/png";
          } else if (item.endsWith(".zip")) {
            artifactType = "trace";
            mimeType = "application/zip";
          } else if (item.endsWith(".html")) {
            artifactType = "report_html";
            mimeType = "text/html";
          } else if (item.endsWith(".json")) {
            artifactType = "report_json";
            mimeType = "application/json";
          }

          artifacts.push({
            id: `art-${Math.random().toString(36).slice(2, 9)}`,
            runId: "",
            artifactType,
            fileName: item,
            filePath: rel,
            fileSizeBytes: stat.size,
            mimeType,
            createdAt: new Date(stat.mtimeMs).toISOString(),
          });
        }
      }
    }

    scanDir(this.runArtifactsDir);
    return artifacts.map((a) => ({ ...a, runId: this.runId }));
  }
}
