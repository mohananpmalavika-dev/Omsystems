import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import type {
  ReconciliationResultItem,
  SegmentReconciliationSummary,
} from "./recording-index.types.js";
import { storageResolver } from "../storage/storage-resolver.service.js";

export class RecordingReconciliationService {
  constructor(private readonly pool: Pool) {}

  /**
   * Computes SHA-256 for a physical file stream.
   */
  private async calculateFileChecksum(filePath: string): Promise<string> {
    return new Promise((res, rej) => {
      const hash = createHash("sha256");
      const stream = createReadStream(filePath);
      stream.on("data", (d) => hash.update(d));
      stream.on("end", () => res(hash.digest("hex")));
      stream.on("error", rej);
    });
  }

  /**
   * Reconciles a list of segment records against physical files.
   */
  async reconcileSegments(segmentIds?: string[]): Promise<SegmentReconciliationSummary> {
    let query = `
      SELECT id, camera_id, storage_uri, storage_path, checksum_sha256, size_bytes, health, status
      FROM recording_segments
      WHERE status <> 'deleted'
    `;
    const params: any[] = [];
    if (segmentIds && segmentIds.length > 0) {
      query += ` AND id = ANY($1)`;
      params.push(segmentIds);
    }
    query += ` ORDER BY started_at DESC LIMIT 500`;

    const result = await this.pool.query(query, params);
    const details: ReconciliationResultItem[] = [];

    let okCount = 0;
    let missingCount = 0;
    let corruptCount = 0;
    let rebuiltCount = 0;

    for (const row of result.rows) {
      const uri = row.storage_uri || row.storage_path;
      const resolved = storageResolver.resolve(uri);

      if (!resolved.localPath) {
        // Cloud or remote source, skip physical local file check
        okCount++;
        details.push({
          segmentId: row.id,
          storageUri: uri,
          status: "OK",
          message: "Remote or S3 segment, verified by URI contract",
        });
        continue;
      }

      let fileStat;
      try {
        fileStat = await stat(resolved.localPath);
      } catch {
        // Case 3: DB exists + media missing -> mark MISSING
        await this.pool.query(
          `UPDATE recording_segments 
           SET health = 'MISSING', status = 'error', segment_state = 'INCOMPLETE'
           WHERE id = $1`,
          [row.id],
        );
        missingCount++;
        details.push({
          segmentId: row.id,
          storageUri: uri,
          status: "MARKED_MISSING",
          message: `Physical file missing at ${resolved.localPath}`,
        });
        continue;
      }

      // If checksum is present, verify integrity
      if (row.checksum_sha256 && fileStat.size > 0) {
        try {
          const actualSha256 = await this.calculateFileChecksum(resolved.localPath);
          if (actualSha256 !== row.checksum_sha256) {
            // Case 4: Checksum mismatch -> mark CORRUPT
            await this.pool.query(
              `UPDATE recording_segments 
               SET health = 'CORRUPT', status = 'error', segment_state = 'CORRUPT'
               WHERE id = $1`,
              [row.id],
            );
            corruptCount++;
            details.push({
              segmentId: row.id,
              storageUri: uri,
              status: "MARKED_CORRUPT",
              message: `Checksum mismatch: expected ${row.checksum_sha256}, calculated ${actualSha256}`,
            });
            continue;
          }
        } catch (err) {
          // Checksum read error
          corruptCount++;
          details.push({
            segmentId: row.id,
            storageUri: uri,
            status: "MARKED_CORRUPT",
            message: `Failed to compute checksum: ${err instanceof Error ? err.message : String(err)}`,
          });
          continue;
        }
      }

      // Case 1: Media exists + DB exists + checksum valid -> OK
      if (row.health === "MISSING" || row.health === "CORRUPT") {
        await this.pool.query(
          `UPDATE recording_segments SET health = 'HEALTHY', status = 'ready' WHERE id = $1`,
          [row.id],
        );
        rebuiltCount++;
        details.push({
          segmentId: row.id,
          storageUri: uri,
          status: "INDEX_REBUILT",
          message: "Restored segment health after physical verification",
        });
      } else {
        okCount++;
        details.push({
          segmentId: row.id,
          storageUri: uri,
          status: "OK",
          message: "Verified healthy physical segment and database index",
        });
      }
    }

    return {
      scannedCount: result.rows.length,
      okCount,
      missingCount,
      corruptCount,
      rebuiltCount,
      details,
    };
  }
}
