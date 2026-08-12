/**
 * Evidence Service
 * 
 * Handles evidence collection including video clip extraction and integrity verification.
 */

import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { Pool } from 'pg';
import { InvestigationRepository } from '../repositories/investigation.repository.js';
import type { Evidence } from '../types/index.js';

const execAsync = promisify(exec);

export interface ClipExtractionOptions {
  /** Camera ID */
  cameraId: string;

  /** Start timestamp */
  from: Date;

  /** End timestamp */
  to: Date;

  /** Output directory */
  outputDir: string;

  /** Archive source (recorder path or URL) */
  archiveSource?: string;

  /** Quality (0-100) */
  quality?: number;

  /** Generate hash for integrity */
  generateHash?: boolean;
}

export interface ClipExtractionResult {
  success: boolean;
  clipPath?: string;
  clipUrl?: string;
  durationSeconds?: number;
  sizeBytes?: number;
  hash?: string;
  hashAlgorithm?: string;
  error?: string;
}

export class EvidenceService {
  private readonly investigationRepo: InvestigationRepository;

  constructor(
    pool: Pool,
    private readonly options: {
      evidenceStoragePath: string;
      evidenceBaseUrl?: string;
    }
  ) {
    this.investigationRepo = new InvestigationRepository(pool);
  }

  /**
   * Extract video clip for evidence
   */
  async extractClip(options: ClipExtractionOptions): Promise<ClipExtractionResult> {
    try {
      // Ensure output directory exists
      await fs.mkdir(options.outputDir, { recursive: true });

      const clipId = randomUUID();
      const outputPath = join(
        options.outputDir,
        `clip_${clipId}_${options.cameraId}_${Date.now()}.mp4`
      );

      // Calculate duration
      const durationMs = options.to.getTime() - options.from.getTime();
      const durationSeconds = Math.floor(durationMs / 1000);

      // Build FFmpeg command
      const ffmpegCmd = this.buildFFmpegCommand(
        options.archiveSource || this.getArchivePath(options.cameraId, options.from),
        outputPath,
        options.from,
        durationSeconds,
        options.quality
      );

      // Execute FFmpeg
      await execAsync(ffmpegCmd, {
        timeout: 120000, // 2 minute timeout
      });

      // Verify file was created
      const stats = await fs.stat(outputPath);

      // Generate hash if requested
      let hash: string | undefined;
      let hashAlgorithm: string | undefined;

      if (options.generateHash ?? true) {
        const result = await this.generateFileHash(outputPath);
        hash = result.hash;
        hashAlgorithm = result.algorithm;
      }

      // Generate URL if base URL is configured
      const clipUrl = this.options.evidenceBaseUrl
        ? `${this.options.evidenceBaseUrl}/${clipId}.mp4`
        : undefined;

      return {
        success: true,
        clipPath: outputPath,
        clipUrl,
        durationSeconds,
        sizeBytes: stats.size,
        hash,
        hashAlgorithm,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during clip extraction',
      };
    }
  }

  /**
   * Extract clip and add to investigation
   */
  async extractAndAddEvidence(
    investigationId: string,
    cameraId: string,
    cameraName: string,
    from: Date,
    to: Date,
    description?: string
  ): Promise<Evidence | null> {
    const outputDir = join(
      this.options.evidenceStoragePath,
      'investigations',
      investigationId,
      'clips'
    );

    const result = await this.extractClip({
      cameraId,
      from,
      to,
      outputDir,
      generateHash: true,
    });

    if (!result.success || !result.clipPath) {
      console.error('Failed to extract clip:', result.error);
      return null;
    }

    // Add to investigation
    const evidence = await this.investigationRepo.addEvidence(investigationId, {
      type: 'camera_clip',
      sourceId: cameraId,
      sourceName: cameraName,
      timestamp: from,
      uri: result.clipUrl,
      filePath: result.clipPath,
      hash: result.hash,
      hashAlgorithm: result.hashAlgorithm,
      sizeBytes: result.sizeBytes,
      mimeType: 'video/mp4',
      durationSeconds: result.durationSeconds,
      description: description || `Video clip from ${cameraName}`,
      metadata: {
        extractedAt: new Date().toISOString(),
        from: from.toISOString(),
        to: to.toISOString(),
      },
    });

    return evidence;
  }

  /**
   * Capture snapshot from camera
   */
  async captureSnapshot(
    cameraId: string,
    timestamp: Date,
    outputDir: string
  ): Promise<ClipExtractionResult> {
    try {
      await fs.mkdir(outputDir, { recursive: true });

      const snapshotId = randomUUID();
      const outputPath = join(
        outputDir,
        `snapshot_${snapshotId}_${cameraId}_${Date.now()}.jpg`
      );

      // Get frame from archive using FFmpeg
      const archivePath = this.getArchivePath(cameraId, timestamp);
      
      const ffmpegCmd = `ffmpeg -ss ${this.formatTimestamp(timestamp)} -i "${archivePath}" -frames:v 1 -q:v 2 "${outputPath}"`;

      await execAsync(ffmpegCmd, {
        timeout: 30000, // 30 second timeout
      });

      const stats = await fs.stat(outputPath);

      // Generate hash
      const { hash, algorithm } = await this.generateFileHash(outputPath);

      const snapshotUrl = this.options.evidenceBaseUrl
        ? `${this.options.evidenceBaseUrl}/${snapshotId}.jpg`
        : undefined;

      return {
        success: true,
        clipPath: outputPath,
        clipUrl: snapshotUrl,
        sizeBytes: stats.size,
        hash,
        hashAlgorithm: algorithm,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during snapshot capture',
      };
    }
  }

  /**
   * Verify evidence integrity
   */
  async verifyEvidence(evidencePath: string, expectedHash: string): Promise<boolean> {
    try {
      const { hash } = await this.generateFileHash(evidencePath);
      return hash === expectedHash;
    } catch (error) {
      console.error('Failed to verify evidence:', error);
      return false;
    }
  }

  /**
   * Export evidence package for investigation
   */
  async exportEvidencePackage(
    investigationId: string,
    outputPath: string
  ): Promise<{
    success: boolean;
    packagePath?: string;
    manifestPath?: string;
    error?: string;
  }> {
    try {
      const investigation = await this.investigationRepo.getInvestigation(investigationId);
      
      if (!investigation) {
        return {
          success: false,
          error: 'Investigation not found',
        };
      }

      // Create package directory
      const packageDir = join(outputPath, `investigation_${investigationId}_${Date.now()}`);
      await fs.mkdir(packageDir, { recursive: true });

      // Create manifest
      const manifest = {
        investigationId: investigation.id,
        title: investigation.title,
        exportedAt: new Date().toISOString(),
        timeRange: investigation.timeRange,
        evidence: [] as any[],
      };

      // Copy all evidence files
      for (const evidence of investigation.evidence) {
        if (evidence.filePath) {
          try {
            const fileName = `${evidence.id}_${evidence.type}.${this.getFileExtension(evidence.mimeType)}`;
            const destPath = join(packageDir, fileName);
            
            await fs.copyFile(evidence.filePath, destPath);

            manifest.evidence.push({
              id: evidence.id,
              type: evidence.type,
              fileName,
              hash: evidence.hash,
              hashAlgorithm: evidence.hashAlgorithm,
              timestamp: evidence.timestamp,
              description: evidence.description,
            });
          } catch (error) {
            console.error(`Failed to copy evidence ${evidence.id}:`, error);
          }
        }
      }

      // Write manifest
      const manifestPath = join(packageDir, 'manifest.json');
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

      return {
        success: true,
        packagePath: packageDir,
        manifestPath,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during export',
      };
    }
  }

  /**
   * Build FFmpeg command for clip extraction
   */
  private buildFFmpegCommand(
    inputPath: string,
    outputPath: string,
    startTime: Date,
    durationSeconds: number,
    quality?: number
  ): string {
    const startOffset = this.formatTimestamp(startTime);
    const crf = quality !== undefined ? Math.floor((100 - quality) * 51 / 100) : 23;

    return `ffmpeg -ss ${startOffset} -i "${inputPath}" -t ${durationSeconds} -c:v libx264 -crf ${crf} -c:a aac -b:a 128k -movflags +faststart "${outputPath}"`;
  }

  /**
   * Format timestamp for FFmpeg
   */
  private formatTimestamp(date: Date): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  /**
   * Get archive path for camera at timestamp
   * This would integrate with your actual recording storage system
   */
  private getArchivePath(cameraId: string, timestamp: Date): string {
    // This is a placeholder - implement based on your storage structure
    const dateStr = timestamp.toISOString().split('T')[0];
    return join(
      this.options.evidenceStoragePath || '/var/lib/sentinel/evidence',
      'archives',
      cameraId,
      dateStr,
      'recording.mp4'
    );
  }

  /**
   * Generate file hash for integrity verification
   */
  private async generateFileHash(filePath: string): Promise<{
    hash: string;
    algorithm: string;
  }> {
    const fileBuffer = await fs.readFile(filePath);
    const hash = createHash('sha256');
    hash.update(fileBuffer);

    return {
      hash: hash.digest('hex'),
      algorithm: 'sha256',
    };
  }

  /**
   * Get file extension from MIME type
   */
  private getFileExtension(mimeType?: string): string {
    if (!mimeType) return 'bin';

    const mimeMap: Record<string, string> = {
      'video/mp4': 'mp4',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'application/json': 'json',
      'text/plain': 'txt',
    };

    return mimeMap[mimeType] || 'bin';
  }

  /**
   * Batch extract clips for multiple events
   */
  async batchExtractClips(
    investigationId: string,
    clips: Array<{
      cameraId: string;
      cameraName: string;
      from: Date;
      to: Date;
      description?: string;
    }>
  ): Promise<Evidence[]> {
    const evidence: Evidence[] = [];

    for (const clip of clips) {
      const result = await this.extractAndAddEvidence(
        investigationId,
        clip.cameraId,
        clip.cameraName,
        clip.from,
        clip.to,
        clip.description
      );

      if (result) {
        evidence.push(result);
      }
    }

    return evidence;
  }

  /**
   * Auto-extract clips around security events
   */
  async autoExtractEventClips(
    investigationId: string,
    events: Array<{
      eventId: string;
      cameraId: string;
      cameraName: string;
      timestamp: Date;
    }>,
    beforeSeconds: number = 30,
    afterSeconds: number = 60
  ): Promise<Evidence[]> {
    const clips = events.map(event => ({
      cameraId: event.cameraId,
      cameraName: event.cameraName,
      from: new Date(event.timestamp.getTime() - beforeSeconds * 1000),
      to: new Date(event.timestamp.getTime() + afterSeconds * 1000),
      description: `Auto-extracted clip for event ${event.eventId}`,
    }));

    return this.batchExtractClips(investigationId, clips);
  }
}
