import { spawn } from "node:child_process";
import type { KeyframeIndexEntry } from "../manifest/segment-manifest.js";

export interface KeyframeIndexResult {
  keyframes: KeyframeIndexEntry[];
  firstPts?: number;
  lastPts?: number;
  firstDts?: number;
  lastDts?: number;
  timeBase?: string;
  durationMs?: number;
}

export class KeyframeIndexer {
  /**
   * Extracts keyframe offsets, PTS, and wall-clock times from a media segment.
   * If ffprobe fails or is unavailable, generates a fallback baseline index.
   */
  static async extractKeyframeIndex(
    filePath: string,
    segmentStartTime: Date,
    durationSeconds: number,
  ): Promise<KeyframeIndexResult> {
    return new Promise((resolve) => {
      const args = [
        "-v", "error",
        "-select_streams", "v:0",
        "-show_packets",
        "-show_entries", "packet=pts,dts,pos,flags",
        "-of", "csv=p=0",
        filePath,
      ];

      const child = spawn("ffprobe", args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";

      child.stdout?.setEncoding("utf8");
      child.stdout?.on("data", (chunk: string) => {
        stdout += chunk;
      });

      const handleFallback = () => {
        // Fallback: create baseline start keyframe
        const fallbackKeyframes: KeyframeIndexEntry[] = [
          {
            pts: 0,
            wallClock: segmentStartTime.toISOString(),
            offset: 0,
          },
        ];
        resolve({
          keyframes: fallbackKeyframes,
          firstPts: 0,
          lastPts: Math.floor(durationSeconds * 1000),
          durationMs: Math.floor(durationSeconds * 1000),
        });
      };

      child.once("error", () => {
        handleFallback();
      });

      child.once("exit", (code) => {
        if (code !== 0 || !stdout.trim()) {
          handleFallback();
          return;
        }

        try {
          const lines = stdout.split(/\r?\n/).filter((l) => l.trim().length > 0);
          const keyframes: KeyframeIndexEntry[] = [];
          let firstPts: number | undefined;
          let lastPts: number | undefined;
          let firstDts: number | undefined;
          let lastDts: number | undefined;

          for (const line of lines) {
            // format: pts,dts,pos,flags (e.g. "13942213,13942213,3812401,K__")
            const parts = line.split(",");
            const pts = Number(parts[0]);
            const dts = Number(parts[1]);
            const pos = Number(parts[2]);
            const flags = parts[3] ?? "";

            if (!Number.isNaN(pts)) {
              if (firstPts === undefined) firstPts = pts;
              lastPts = pts;
            }
            if (!Number.isNaN(dts)) {
              if (firstDts === undefined) firstDts = dts;
              lastDts = dts;
            }

            const isKeyframe = flags.includes("K") || flags.includes("1");
            if (isKeyframe) {
              const relPts = firstPts !== undefined ? pts - firstPts : pts;
              const wallClock = new Date(segmentStartTime.getTime() + Math.max(0, relPts)).toISOString();
              keyframes.push({
                pts: Number.isNaN(pts) ? 0 : pts,
                wallClock,
                offset: Number.isNaN(pos) ? 0 : pos,
              });
            }
          }

          if (keyframes.length === 0) {
            keyframes.push({
              pts: firstPts ?? 0,
              wallClock: segmentStartTime.toISOString(),
              offset: 0,
            });
          }

          const durationMs = firstPts !== undefined && lastPts !== undefined && lastPts >= firstPts
            ? (lastPts - firstPts)
            : Math.floor(durationSeconds * 1000);

          resolve({
            keyframes,
            firstPts,
            lastPts,
            firstDts,
            lastDts,
            durationMs,
          });
        } catch {
          handleFallback();
        }
      });
    });
  }
}
