import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";

export interface RepairResult {
  repaired: boolean;
  outputPath?: string;
  error?: string;
}

export class SegmentRepair {
  /**
   * Attempts to salvage and repair an interrupted .partial video file by remuxing it with FFmpeg.
   */
  static async repairPartial(inputPartialPath: string, outputRepairedPath: string): Promise<RepairResult> {
    try {
      const stats = await stat(inputPartialPath);
      if (stats.size < 1024) {
        return {
          repaired: false,
          error: "file_too_small_to_repair",
        };
      }
    } catch (err) {
      return {
        repaired: false,
        error: `input_file_not_found: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    return new Promise((resolve) => {
      const args = [
        "-v", "error",
        "-y",
        "-i", inputPartialPath,
        "-c", "copy",
        outputRepairedPath,
      ];

      const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";

      child.stderr?.setEncoding("utf8");
      child.stderr?.on("data", (chunk: string) => {
        stderr += chunk;
      });

      child.once("error", (err) => {
        resolve({
          repaired: false,
          error: `ffmpeg_error: ${err.message}`,
        });
      });

      child.once("exit", (code) => {
        if (code === 0) {
          resolve({
            repaired: true,
            outputPath: outputRepairedPath,
          });
        } else {
          resolve({
            repaired: false,
            error: stderr.trim() || `ffmpeg_exit_${code}`,
          });
        }
      });
    });
  }
}
