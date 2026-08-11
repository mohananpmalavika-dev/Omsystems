/**
 * RTSP URL Utilities
 * URI validation and credential redaction for security
 */

import { UriValidationResult } from '../recording-verification.types';

/**
 * Validate RTSP stream URI
 */
export function validateStreamUri(streamUrl: string): UriValidationResult {
  try {
    const url = new URL(streamUrl);

    // Check protocol
    if (url.protocol !== 'rtsp:' && url.protocol !== 'rtsps:') {
      return {
        valid: false,
        reason: 'Unsupported stream protocol (expected rtsp: or rtsps:)',
      };
    }

    // Check hostname
    if (!url.hostname) {
      return {
        valid: false,
        reason: 'RTSP hostname is missing',
      };
    }

    return {
      valid: true,
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port ? parseInt(url.port, 10) : url.protocol === 'rtsps:' ? 322 : 554,
    };
  } catch (error) {
    return {
      valid: false,
      reason: 'Invalid RTSP URI format',
    };
  }
}

/**
 * Redact credentials from stream URL for safe logging
 * 
 * SECURITY: RTSP URLs commonly contain credentials like:
 * rtsp://admin:secret123@10.0.0.5:554/stream
 * 
 * Never store raw credentials in:
 * - logs
 * - errors
 * - database evidence
 * - telemetry
 * - audit records
 */
export function redactStreamUrl(value: string): string {
  if (!value) {
    return '<empty-stream-url>';
  }

  try {
    const url = new URL(value);

    // Redact username and password
    if (url.username) {
      url.username = '***';
    }

    if (url.password) {
      url.password = '***';
    }

    return url.toString();
  } catch {
    // If URL parsing fails, don't expose the raw string
    return '<invalid-stream-url>';
  }
}

/**
 * Sanitize FFmpeg/FFprobe stderr output to remove credentials
 * 
 * FFmpeg/FFprobe often echo the input URL in error messages
 */
export function sanitizeMediaToolOutput(output: string, streamUrl: string): string {
  if (!output || !streamUrl) {
    return output;
  }

  try {
    const url = new URL(streamUrl);
    
    // If there are credentials, replace the entire URL with redacted version
    if (url.username || url.password) {
      const redacted = redactStreamUrl(streamUrl);
      
      // Replace all occurrences of the original URL
      // Use regex to handle URL-encoded variants
      let sanitized = output;
      
      // Replace exact URL
      sanitized = sanitized.replace(new RegExp(escapeRegExp(streamUrl), 'g'), redacted);
      
      // Replace username if present
      if (url.username) {
        sanitized = sanitized.replace(new RegExp(escapeRegExp(url.username), 'g'), '***');
      }
      
      // Replace password if present
      if (url.password) {
        sanitized = sanitized.replace(new RegExp(escapeRegExp(url.password), 'g'), '***');
      }
      
      return sanitized;
    }
    
    return output;
  } catch {
    // If URL parsing fails, return output as-is
    return output;
  }
}

/**
 * Extract hostname and port for display purposes
 */
export function getStreamEndpoint(streamUrl: string): string {
  try {
    const url = new URL(streamUrl);
    const port = url.port || (url.protocol === 'rtsps:' ? '322' : '554');
    return `${url.hostname}:${port}`;
  } catch {
    return '<unknown>';
  }
}

/**
 * Check if URL contains embedded credentials
 */
export function hasEmbeddedCredentials(streamUrl: string): boolean {
  try {
    const url = new URL(streamUrl);
    return !!(url.username || url.password);
  } catch {
    return false;
  }
}

/**
 * Escape special regex characters
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract RTSP path component
 */
export function getStreamPath(streamUrl: string): string {
  try {
    const url = new URL(streamUrl);
    return url.pathname + url.search;
  } catch {
    return '';
  }
}

/**
 * Validate that stream URL is not using reserved/private IP ranges
 * (Optional: for additional security in cloud deployments)
 */
export function isPublicEndpoint(streamUrl: string): boolean {
  try {
    const url = new URL(streamUrl);
    const hostname = url.hostname;
    
    // Check for localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return false;
    }
    
    // Check for private IPv4 ranges
    const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4Match) {
      const [, a, b, c, d] = ipv4Match.map(Number);
      
      // 10.0.0.0/8
      if (a === 10) return false;
      
      // 172.16.0.0/12
      if (a === 172 && b >= 16 && b <= 31) return false;
      
      // 192.168.0.0/16
      if (a === 192 && b === 168) return false;
      
      // 169.254.0.0/16 (link-local)
      if (a === 169 && b === 254) return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse frame rate from FFmpeg/FFprobe output
 * Handles formats like "30/1", "25", "29.97"
 */
export function parseFrameRate(value?: string): number | undefined {
  if (!value) return undefined;

  // Handle simple numeric values
  if (!value.includes('/')) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  // Handle fractional notation (e.g., "30/1", "30000/1001")
  const [numerator, denominator] = value.split('/').map(Number);

  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator === 0
  ) {
    return undefined;
  }

  return numerator / denominator;
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Format duration in seconds to human-readable string
 */
export function formatDuration(seconds: number): string {
  if (seconds < 1) {
    return `${Math.round(seconds * 1000)}ms`;
  }
  
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}
