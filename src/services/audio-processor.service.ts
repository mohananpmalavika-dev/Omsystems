// @ts-nocheck
/**
 * Audio Processor Service
 * 
 * Production-grade audio processing pipeline with format conversion,
 * resampling, noise reduction, normalization, and quality enhancement.
 */

import { spawn } from "child_process";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomBytes } from "crypto";

export interface AudioProcessingOptions {
  targetSampleRate?: number;
  targetChannels?: number;
  normalizeAudio?: boolean;
  noiseReduction?: boolean;
  highpassFilter?: number;
  lowpassFilter?: number;
  trimSilence?: boolean;
  silenceThresholdDb?: number;
}

export interface AudioMetadata {
  format: string;
  sampleRate: number;
  channels: number;
  duration: number;
  bitrate?: number;
  codec?: string;
}

export interface ProcessedAudio {
  audioBuffer: Buffer;
  audioArray: Float32Array;
  metadata: AudioMetadata;
  processing: {
    originalFormat: string;
    originalSampleRate: number;
    originalDuration: number;
    processedDuration: number;
    appliedFilters: string[];
  };
}

export class AudioProcessorService {
  private ffmpegPath: string;
  private ffprobePath: string;
  private tempDir: string;

  constructor() {
    this.ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";
    this.ffprobePath = process.env.FFPROBE_PATH || "ffprobe";
    this.tempDir = join(tmpdir(), "voice-processing");
  }

  /**
   * Initialize audio processor
   */
  async initialize(): Promise<void> {
    // Create temp directory
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error("Failed to create temp directory:", error);
    }

    // Check if ffmpeg is available
    const ffmpegAvailable = await this.checkFfmpegAvailability();
    if (!ffmpegAvailable) {
      console.warn("FFmpeg not available. Audio processing will use basic conversion only.");
    }
  }

  /**
   * Check if ffmpeg is available
   */
  private async checkFfmpegAvailability(): Promise<boolean> {
    return new Promise((resolve) => {
      const process = spawn(this.ffmpegPath, ["-version"]);
      
      process.on("error", () => {
        resolve(false);
      });

      process.on("close", (code) => {
        resolve(code === 0);
      });

      // Timeout after 2 seconds
      setTimeout(() => {
        process.kill();
        resolve(false);
      }, 2000);
    });
  }

  /**
   * Process audio buffer with production-grade pipeline
   */
  async processAudio(
    inputBuffer: Buffer,
    inputFormat: string,
    options: AudioProcessingOptions = {}
  ): Promise<ProcessedAudio> {
    const {
      targetSampleRate = 16000,
      targetChannels = 1,
      normalizeAudio = true,
      noiseReduction = true,
      highpassFilter = 80,
      lowpassFilter = 8000,
      trimSilence = true,
      silenceThresholdDb = -40,
    } = options;

    const tempId = randomBytes(8).toString("hex");
    const inputPath = join(this.tempDir, `input-${tempId}.${inputFormat}`);
    const outputPath = join(this.tempDir, `output-${tempId}.wav`);

    let originalMetadata: AudioMetadata | null = null;
    const appliedFilters: string[] = [];

    try {
      // Write input buffer to temp file
      await fs.writeFile(inputPath, inputBuffer);

      // Get original audio metadata
      originalMetadata = await this.getAudioMetadata(inputPath);

      // Check if ffmpeg is available
      const ffmpegAvailable = await this.checkFfmpegAvailability();

      if (!ffmpegAvailable) {
        // Fallback: basic conversion without ffmpeg
        console.warn("Using fallback audio processing (no ffmpeg)");
        return this.basicAudioConversion(inputBuffer, inputFormat, originalMetadata, targetSampleRate);
      }

      // Build ffmpeg filter chain
      const filters: string[] = [];

      // Resample to target sample rate
      filters.push(`aresample=${targetSampleRate}`);
      appliedFilters.push(`resample:${targetSampleRate}Hz`);

      // Convert to mono if needed
      if (targetChannels === 1 && originalMetadata.channels > 1) {
        filters.push("pan=mono|c0=0.5*c0+0.5*c1");
        appliedFilters.push("mono");
      }

      // Highpass filter (remove low-frequency noise)
      if (highpassFilter > 0) {
        filters.push(`highpass=f=${highpassFilter}`);
        appliedFilters.push(`highpass:${highpassFilter}Hz`);
      }

      // Lowpass filter (remove high-frequency noise)
      if (lowpassFilter > 0 && lowpassFilter < targetSampleRate / 2) {
        filters.push(`lowpass=f=${lowpassFilter}`);
        appliedFilters.push(`lowpass:${lowpassFilter}Hz`);
      }

      // Noise reduction using afftdn (FFT denoiser)
      if (noiseReduction) {
        filters.push("afftdn=nf=-20");
        appliedFilters.push("noise-reduction");
      }

      // Trim silence from beginning and end
      if (trimSilence) {
        filters.push(`silenceremove=start_periods=1:start_silence=0.1:start_threshold=${silenceThresholdDb}dB`);
        filters.push(`areverse,silenceremove=start_periods=1:start_silence=0.1:start_threshold=${silenceThresholdDb}dB,areverse`);
        appliedFilters.push("trim-silence");
      }

      // Normalize audio level
      if (normalizeAudio) {
        filters.push("loudnorm=I=-16:TP=-1.5:LRA=11");
        appliedFilters.push("normalize");
      }

      // Run ffmpeg with filter chain
      await this.runFfmpeg(inputPath, outputPath, filters.join(","), targetSampleRate);

      // Read processed audio
      const processedBuffer = await fs.readFile(outputPath);

      // Convert to Float32Array
      const audioArray = await this.bufferToFloat32Array(processedBuffer);

      // Get processed metadata
      const processedMetadata = await this.getAudioMetadata(outputPath);

      return {
        audioBuffer: processedBuffer,
        audioArray,
        metadata: processedMetadata,
        processing: {
          originalFormat: inputFormat,
          originalSampleRate: originalMetadata.sampleRate,
          originalDuration: originalMetadata.duration,
          processedDuration: processedMetadata.duration,
          appliedFilters,
        },
      };
    } finally {
      // Cleanup temp files
      await this.cleanupTempFile(inputPath);
      await this.cleanupTempFile(outputPath);
    }
  }

  /**
   * Run ffmpeg with specified filters
   */
  private runFfmpeg(
    inputPath: string,
    outputPath: string,
    filterChain: string,
    sampleRate: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        "-i", inputPath,
        "-af", filterChain,
        "-ar", sampleRate.toString(),
        "-ac", "1", // Mono
        "-f", "wav",
        "-acodec", "pcm_f32le", // 32-bit float PCM
        "-y", // Overwrite output
        outputPath,
      ];

      const process = spawn(this.ffmpegPath, args);

      let stderr = "";

      process.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      process.on("error", (error) => {
        reject(new Error(`FFmpeg process error: ${error.message}`));
      });

      process.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg failed with code ${code}: ${stderr}`));
        }
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        process.kill();
        reject(new Error("FFmpeg processing timeout"));
      }, 30000);
    });
  }

  /**
   * Get audio metadata using ffprobe
   */
  private async getAudioMetadata(audioPath: string): Promise<AudioMetadata> {
    return new Promise((resolve, reject) => {
      const args = [
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        audioPath,
      ];

      const process = spawn(this.ffprobePath, args);

      let stdout = "";
      let stderr = "";

      process.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      process.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      process.on("error", (error) => {
        reject(new Error(`FFprobe process error: ${error.message}`));
      });

      process.on("close", (code) => {
        if (code === 0) {
          try {
            const probe = JSON.parse(stdout);
            const audioStream = probe.streams.find((s: any) => s.codec_type === "audio");

            if (!audioStream) {
              reject(new Error("No audio stream found"));
              return;
            }

            resolve({
              format: probe.format.format_name,
              sampleRate: parseInt(audioStream.sample_rate, 10),
              channels: audioStream.channels,
              duration: parseFloat(probe.format.duration),
              bitrate: parseInt(probe.format.bit_rate, 10),
              codec: audioStream.codec_name,
            });
          } catch (error: any) {
            reject(new Error(`Failed to parse ffprobe output: ${error.message}`));
          }
        } else {
          reject(new Error(`FFprobe failed with code ${code}: ${stderr}`));
        }
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        process.kill();
        reject(new Error("FFprobe timeout"));
      }, 10000);
    });
  }

  /**
   * Convert WAV buffer to Float32Array
   */
  private async bufferToFloat32Array(wavBuffer: Buffer): Promise<Float32Array> {
    // WAV header is typically 44 bytes, but we should parse it properly
    let offset = 44;

    // Look for "data" chunk
    const dataIndex = wavBuffer.indexOf("data");
    if (dataIndex !== -1 && dataIndex + 8 <= wavBuffer.length) {
      offset = dataIndex + 8;
    }

    // Extract PCM data (assuming 32-bit float LE from our ffmpeg output)
    const pcmData = wavBuffer.subarray(offset);
    return new Float32Array(pcmData.buffer, pcmData.byteOffset, pcmData.length / 4);
  }

  /**
   * Fallback audio conversion without ffmpeg (basic)
   */
  private async basicAudioConversion(
    inputBuffer: Buffer,
    inputFormat: string,
    originalMetadata: AudioMetadata | null,
    targetSampleRate: number
  ): Promise<ProcessedAudio> {
    // Basic conversion for WAV files only
    if (inputFormat === "wav") {
      const audioArray = await this.bufferToFloat32Array(inputBuffer);

      // Simple resampling if needed (linear interpolation)
      let resampledArray = audioArray;
      if (originalMetadata && originalMetadata.sampleRate !== targetSampleRate) {
        resampledArray = this.simpleResample(
          audioArray,
          originalMetadata.sampleRate,
          targetSampleRate
        );
      }

      return {
        audioBuffer: inputBuffer,
        audioArray: resampledArray,
        metadata: {
          format: "wav",
          sampleRate: targetSampleRate,
          channels: 1,
          duration: resampledArray.length / targetSampleRate,
        },
        processing: {
          originalFormat: inputFormat,
          originalSampleRate: originalMetadata?.sampleRate || targetSampleRate,
          originalDuration: originalMetadata?.duration || 0,
          processedDuration: resampledArray.length / targetSampleRate,
          appliedFilters: ["basic-conversion"],
        },
      };
    }

    throw new Error(
      `Audio format ${inputFormat} requires ffmpeg for conversion. Please install ffmpeg.`
    );
  }

  /**
   * Simple linear interpolation resampling
   */
  private simpleResample(
    audioArray: Float32Array,
    sourceSampleRate: number,
    targetSampleRate: number
  ): Float32Array {
    const ratio = sourceSampleRate / targetSampleRate;
    const outputLength = Math.floor(audioArray.length / ratio);
    const resampled = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i * ratio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, audioArray.length - 1);
      const fraction = srcIndex - srcIndexFloor;

      // Linear interpolation
      resampled[i] =
        audioArray[srcIndexFloor] * (1 - fraction) +
        audioArray[srcIndexCeil] * fraction;
    }

    return resampled;
  }

  /**
   * Apply noise gate to reduce background noise
   */
  applyNoiseGate(
    audioArray: Float32Array,
    thresholdDb: number = -40,
    sampleRate: number = 16000
  ): Float32Array {
    const threshold = Math.pow(10, thresholdDb / 20);
    const windowSize = Math.floor(sampleRate * 0.01); // 10ms window
    const result = new Float32Array(audioArray.length);

    for (let i = 0; i < audioArray.length; i++) {
      // Calculate RMS over window
      let rms = 0;
      const start = Math.max(0, i - windowSize / 2);
      const end = Math.min(audioArray.length, i + windowSize / 2);
      const count = end - start;

      for (let j = start; j < end; j++) {
        rms += audioArray[j] * audioArray[j];
      }
      rms = Math.sqrt(rms / count);

      // Apply gate
      if (rms > threshold) {
        result[i] = audioArray[i];
      } else {
        result[i] = 0;
      }
    }

    return result;
  }

  /**
   * Normalize audio to target RMS level
   */
  normalizeRMS(
    audioArray: Float32Array,
    targetRMS: number = 0.1
  ): Float32Array {
    // Calculate current RMS
    let sumSquares = 0;
    for (let i = 0; i < audioArray.length; i++) {
      sumSquares += audioArray[i] * audioArray[i];
    }
    const currentRMS = Math.sqrt(sumSquares / audioArray.length);

    if (currentRMS === 0) {
      return audioArray;
    }

    // Calculate gain
    const gain = targetRMS / currentRMS;

    // Limit gain to prevent clipping
    const maxGain = 0.99 / Math.max(...Array.from(audioArray).map(Math.abs));
    const finalGain = Math.min(gain, maxGain);

    // Apply gain
    const normalized = new Float32Array(audioArray.length);
    for (let i = 0; i < audioArray.length; i++) {
      normalized[i] = audioArray[i] * finalGain;
    }

    return normalized;
  }

  /**
   * Pre-emphasize audio (boost high frequencies)
   */
  preEmphasis(
    audioArray: Float32Array,
    coefficient: number = 0.97
  ): Float32Array {
    const emphasized = new Float32Array(audioArray.length);
    emphasized[0] = audioArray[0];

    for (let i = 1; i < audioArray.length; i++) {
      emphasized[i] = audioArray[i] - coefficient * audioArray[i - 1];
    }

    return emphasized;
  }

  /**
   * Cleanup temporary file
   */
  private async cleanupTempFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  /**
   * Cleanup all temp files
   */
  async cleanup(): Promise<void> {
    try {
      const files = await fs.readdir(this.tempDir);
      const deletePromises = files.map((file) =>
        this.cleanupTempFile(join(this.tempDir, file))
      );
      await Promise.all(deletePromises);
    } catch (error) {
      console.error("Failed to cleanup temp directory:", error);
    }
  }

  /**
   * Convert audio format without processing
   */
  async convertFormat(
    inputBuffer: Buffer,
    inputFormat: string,
    outputFormat: string,
    targetSampleRate?: number
  ): Promise<Buffer> {
    const tempId = randomBytes(8).toString("hex");
    const inputPath = join(this.tempDir, `input-${tempId}.${inputFormat}`);
    const outputPath = join(this.tempDir, `output-${tempId}.${outputFormat}`);

    try {
      await fs.writeFile(inputPath, inputBuffer);

      const args = ["-i", inputPath];

      if (targetSampleRate) {
        args.push("-ar", targetSampleRate.toString());
      }

      args.push("-y", outputPath);

      await new Promise<void>((resolve, reject) => {
        const process = spawn(this.ffmpegPath, args);

        process.on("error", (error) => {
          reject(new Error(`FFmpeg error: ${error.message}`));
        });

        process.on("close", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`FFmpeg failed with code ${code}`));
          }
        });

        setTimeout(() => {
          process.kill();
          reject(new Error("FFmpeg timeout"));
        }, 30000);
      });

      return await fs.readFile(outputPath);
    } finally {
      await this.cleanupTempFile(inputPath);
      await this.cleanupTempFile(outputPath);
    }
  }
}

// Singleton instance
let audioProcessorInstance: AudioProcessorService | null = null;

export async function getAudioProcessor(): Promise<AudioProcessorService> {
  if (!audioProcessorInstance) {
    audioProcessorInstance = new AudioProcessorService();
    await audioProcessorInstance.initialize();
  }
  return audioProcessorInstance;
}
