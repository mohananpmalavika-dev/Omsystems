/**
 * Subprocess Runner Utility
 * Safe FFmpeg/FFprobe process execution with timeouts and error handling
 */

import { spawn, ChildProcess } from 'child_process';
import { sanitizeMediaToolOutput } from './rtsp-url-redactor';

export interface SubprocessOptions {
  /** Command to execute */
  command: string;

  /** Command arguments */
  args: string[];

  /** Timeout in milliseconds */
  timeoutMs: number;

  /** Stream URL for credential sanitization */
  streamUrl?: string;

  /** Working directory */
  cwd?: string;

  /** Environment variables */
  env?: NodeJS.ProcessEnv;
}

export interface SubprocessResult {
  /** Exit code (null if killed/timeout) */
  exitCode: number | null;

  /** Standard output */
  stdout: string;

  /** Standard error (sanitized) */
  stderr: string;

  /** Execution duration in milliseconds */
  durationMs: number;

  /** Whether process was killed due to timeout */
  timedOut: boolean;

  /** Error that occurred during spawn (if any) */
  error?: Error;
}

/**
 * Execute a subprocess with timeout and automatic cleanup
 */
export async function executeSubprocess(
  options: SubprocessOptions
): Promise<SubprocessResult> {
  const startTime = Date.now();
  
  return new Promise<SubprocessResult>((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let process: ChildProcess | null = null;

    try {
      // Spawn process
      process = spawn(options.command, options.args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: options.cwd,
        env: options.env || process.env,
        // Prevent shell injection
        shell: false,
      });

      // Capture stdout
      if (process.stdout) {
        process.stdout.on('data', (chunk) => {
          stdout += chunk.toString();
        });
      }

      // Capture stderr
      if (process.stderr) {
        process.stderr.on('data', (chunk) => {
          stderr += chunk.toString();
        });
      }

      // Set up timeout
      const killTimer = setTimeout(() => {
        timedOut = true;
        if (process && !process.killed) {
          // Try graceful termination first
          process.kill('SIGTERM');
          
          // Force kill after 1 second if still alive
          setTimeout(() => {
            if (process && !process.killed) {
              process.kill('SIGKILL');
            }
          }, 1000);
        }
      }, options.timeoutMs);

      // Handle process exit
      process.on('close', (code, signal) => {
        clearTimeout(killTimer);

        const durationMs = Date.now() - startTime;

        // Sanitize stderr to remove credentials
        const sanitizedStderr = options.streamUrl
          ? sanitizeMediaToolOutput(stderr, options.streamUrl)
          : stderr;

        resolve({
          exitCode: code,
          stdout,
          stderr: sanitizedStderr,
          durationMs,
          timedOut,
        });
      });

      // Handle spawn errors
      process.on('error', (error) => {
        clearTimeout(killTimer);

        const durationMs = Date.now() - startTime;

        resolve({
          exitCode: null,
          stdout,
          stderr: '',
          durationMs,
          timedOut: false,
          error,
        });
      });
    } catch (error) {
      // Handle synchronous errors
      const durationMs = Date.now() - startTime;

      resolve({
        exitCode: null,
        stdout: '',
        stderr: '',
        durationMs,
        timedOut: false,
        error: error as Error,
      });
    }
  });
}

/**
 * Check if a command is available on the system
 */
export async function isCommandAvailable(command: string): Promise<boolean> {
  try {
    const result = await executeSubprocess({
      command,
      args: ['-version'],
      timeoutMs: 5000,
    });

    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Get command version
 */
export async function getCommandVersion(command: string): Promise<string | null> {
  try {
    const result = await executeSubprocess({
      command,
      args: ['-version'],
      timeoutMs: 5000,
    });

    if (result.exitCode === 0) {
      // Extract version from output
      // FFmpeg/FFprobe typically output: "ffmpeg version X.Y.Z ..."
      const versionMatch = result.stdout.match(/version\s+([^\s]+)/i);
      return versionMatch ? versionMatch[1] : 'unknown';
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Parse FFmpeg progress output
 * 
 * FFmpeg progress format:
 * frame=75
 * fps=15.2
 * total_size=N/A
 * out_time_ms=4980000
 * progress=continue|end
 */
export function parseFFmpegProgress(progressOutput: string): {
  frame?: number;
  fps?: number;
  outTimeMs?: number;
  progress?: 'continue' | 'end';
} {
  const result: Record<string, any> = {};

  const lines = progressOutput.split('\n');
  for (const line of lines) {
    const [key, value] = line.split('=').map(s => s.trim());
    
    if (key && value) {
      switch (key) {
        case 'frame':
          result.frame = parseInt(value, 10);
          break;
        case 'fps':
          result.fps = parseFloat(value);
          break;
        case 'out_time_ms':
          result.outTimeMs = parseInt(value, 10);
          break;
        case 'progress':
          result.progress = value as 'continue' | 'end';
          break;
      }
    }
  }

  return result;
}

/**
 * Kill process tree (parent and all children)
 * Important for cleaning up FFmpeg processes that may spawn children
 */
export function killProcessTree(process: ChildProcess): void {
  if (!process || process.killed) {
    return;
  }

  try {
    // On Windows, use taskkill to kill process tree
    if (process.platform === 'win32') {
      if (process.pid) {
        spawn('taskkill', ['/pid', process.pid.toString(), '/t', '/f'], {
          stdio: 'ignore',
        });
      }
    } else {
      // On Unix, kill process group
      if (process.pid) {
        try {
          process.kill('SIGKILL');
        } catch {
          // Ignore errors
        }
      }
    }
  } catch (error) {
    // Ignore cleanup errors
    console.error('Error killing process tree:', error);
  }
}

/**
 * Truncate output to prevent memory issues with large outputs
 */
export function truncateOutput(output: string, maxLength: number = 10000): string {
  if (output.length <= maxLength) {
    return output;
  }

  const halfLength = Math.floor(maxLength / 2);
  const start = output.substring(0, halfLength);
  const end = output.substring(output.length - halfLength);

  return `${start}\n\n... [truncated ${output.length - maxLength} characters] ...\n\n${end}`;
}
