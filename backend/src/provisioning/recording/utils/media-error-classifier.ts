/**
 * Media Error Classifier
 * Convert FFmpeg/FFprobe stderr output to stable reason codes
 */

import { RecordingVerificationReason } from '../recording-verification.types';

/**
 * Error pattern matching for FFmpeg/FFprobe stderr
 */
interface ErrorPattern {
  pattern: RegExp;
  reason: RecordingVerificationReason;
  message: string;
}

/**
 * Error patterns in priority order (first match wins)
 */
const ERROR_PATTERNS: ErrorPattern[] = [
  // Authentication failures
  {
    pattern: /401\s+unauthorized/i,
    reason: RecordingVerificationReason.AUTHENTICATION_FAILED,
    message: 'Recorder rejected the configured credentials',
  },
  {
    pattern: /authentication\s+failed/i,
    reason: RecordingVerificationReason.AUTHENTICATION_FAILED,
    message: 'Authentication failed',
  },
  {
    pattern: /unauthorized/i,
    reason: RecordingVerificationReason.AUTHENTICATION_FAILED,
    message: 'Unauthorized access to stream',
  },
  {
    pattern: /403\s+forbidden/i,
    reason: RecordingVerificationReason.AUTHENTICATION_FAILED,
    message: 'Access forbidden',
  },

  // Connection failures
  {
    pattern: /connection\s+refused/i,
    reason: RecordingVerificationReason.CONNECTION_REFUSED,
    message: 'Connection refused by RTSP server',
  },
  {
    pattern: /connection\s+timed?\s?out/i,
    reason: RecordingVerificationReason.CONNECTION_TIMEOUT,
    message: 'Connection to RTSP server timed out',
  },
  {
    pattern: /network\s+is\s+unreachable/i,
    reason: RecordingVerificationReason.NETWORK_UNREACHABLE,
    message: 'Network unreachable',
  },
  {
    pattern: /no\s+route\s+to\s+host/i,
    reason: RecordingVerificationReason.HOST_UNREACHABLE,
    message: 'No route to host',
  },
  {
    pattern: /could\s+not\s+find\s+codec/i,
    reason: RecordingVerificationReason.UNSUPPORTED_CODEC,
    message: 'Video codec not supported',
  },

  // RTSP protocol errors
  {
    pattern: /404\s+not\s+found/i,
    reason: RecordingVerificationReason.RTSP_ENDPOINT_NOT_FOUND,
    message: 'RTSP endpoint not found',
  },
  {
    pattern: /rtsp\s+.*\s+not\s+found/i,
    reason: RecordingVerificationReason.RTSP_ENDPOINT_NOT_FOUND,
    message: 'RTSP stream not found',
  },
  {
    pattern: /405\s+method\s+not\s+allowed/i,
    reason: RecordingVerificationReason.RTSP_METHOD_NOT_ALLOWED,
    message: 'RTSP method not allowed',
  },
  {
    pattern: /500\s+internal\s+server\s+error/i,
    reason: RecordingVerificationReason.RTSP_SERVER_ERROR,
    message: 'RTSP server error',
  },
  {
    pattern: /503\s+service\s+unavailable/i,
    reason: RecordingVerificationReason.RTSP_SERVER_ERROR,
    message: 'RTSP service unavailable',
  },
  {
    pattern: /rtsp.*error/i,
    reason: RecordingVerificationReason.RTSP_NEGOTIATION_FAILED,
    message: 'RTSP negotiation failed',
  },

  // Stream content issues
  {
    pattern: /no\s+video/i,
    reason: RecordingVerificationReason.NO_VIDEO_STREAM,
    message: 'No video stream detected',
  },
  {
    pattern: /invalid\s+data\s+found/i,
    reason: RecordingVerificationReason.CORRUPTED_STREAM,
    message: 'Corrupted or invalid stream data',
  },
  {
    pattern: /end\s+of\s+file/i,
    reason: RecordingVerificationReason.NO_MEDIA_PACKETS,
    message: 'No media packets received',
  },

  // Timeout issues
  {
    pattern: /timeout/i,
    reason: RecordingVerificationReason.CONNECTION_TIMEOUT,
    message: 'Operation timed out',
  },

  // I/O errors
  {
    pattern: /i\/o\s+error/i,
    reason: RecordingVerificationReason.STORAGE_WRITE_FAILED,
    message: 'I/O error during recording',
  },
  {
    pattern: /no\s+space\s+left/i,
    reason: RecordingVerificationReason.STORAGE_WRITE_FAILED,
    message: 'No space left on device',
  },
  {
    pattern: /permission\s+denied/i,
    reason: RecordingVerificationReason.STORAGE_WRITE_FAILED,
    message: 'Permission denied writing to storage',
  },
];

/**
 * Classify FFmpeg/FFprobe error into a reason code
 */
export function classifyMediaError(stderr: string): {
  reason: RecordingVerificationReason;
  message: string;
  confidence: 'high' | 'medium' | 'low';
} {
  if (!stderr || stderr.trim().length === 0) {
    return {
      reason: RecordingVerificationReason.INTERNAL_ERROR,
      message: 'Unknown error (no error output)',
      confidence: 'low',
    };
  }

  // Try to match against known patterns
  for (const pattern of ERROR_PATTERNS) {
    if (pattern.pattern.test(stderr)) {
      return {
        reason: pattern.reason,
        message: pattern.message,
        confidence: 'high',
      };
    }
  }

  // Check for command not found (infrastructure issue)
  if (/command\s+not\s+found/i.test(stderr) || /not\s+recognized/i.test(stderr)) {
    return {
      reason: RecordingVerificationReason.VERIFICATION_INFRASTRUCTURE_UNAVAILABLE,
      message: 'Media tooling not installed',
      confidence: 'high',
    };
  }

  // Default to internal error with low confidence
  return {
    reason: RecordingVerificationReason.INTERNAL_ERROR,
    message: 'Unknown error during media processing',
    confidence: 'low',
  };
}

/**
 * Classify spawn error
 */
export function classifySpawnError(error: Error): {
  reason: RecordingVerificationReason;
  message: string;
} {
  const errorMessage = error.message.toLowerCase();

  if (errorMessage.includes('enoent') || errorMessage.includes('not found')) {
    return {
      reason: RecordingVerificationReason.VERIFICATION_INFRASTRUCTURE_UNAVAILABLE,
      message: 'FFmpeg/FFprobe not installed or not in PATH',
    };
  }

  if (errorMessage.includes('eacces')) {
    return {
      reason: RecordingVerificationReason.VERIFICATION_INFRASTRUCTURE_UNAVAILABLE,
      message: 'No permission to execute FFmpeg/FFprobe',
    };
  }

  if (errorMessage.includes('timeout')) {
    return {
      reason: RecordingVerificationReason.VERIFICATION_TIMEOUT_INTERNAL,
      message: 'Verification process timed out',
    };
  }

  return {
    reason: RecordingVerificationReason.PROCESS_SPAWN_FAILED,
    message: 'Failed to start verification process',
  };
}

/**
 * Determine if error is transient and worth retrying
 */
export function isTransientError(reason: RecordingVerificationReason): boolean {
  const transientReasons = [
    RecordingVerificationReason.CONNECTION_TIMEOUT,
    RecordingVerificationReason.RTSP_SERVER_ERROR,
    RecordingVerificationReason.RECORDING_TIMEOUT,
    RecordingVerificationReason.VERIFICATION_TIMEOUT_INTERNAL,
  ];

  return transientReasons.includes(reason);
}

/**
 * Determine if error is an infrastructure issue (UNKNOWN state)
 */
export function isInfrastructureError(reason: RecordingVerificationReason): boolean {
  const infrastructureReasons = [
    RecordingVerificationReason.FFMPEG_UNAVAILABLE,
    RecordingVerificationReason.FFPROBE_UNAVAILABLE,
    RecordingVerificationReason.VERIFICATION_INFRASTRUCTURE_UNAVAILABLE,
    RecordingVerificationReason.TEMP_STORAGE_UNAVAILABLE,
    RecordingVerificationReason.VERIFIER_DISABLED,
    RecordingVerificationReason.PROCESS_SPAWN_FAILED,
  ];

  return infrastructureReasons.includes(reason);
}

/**
 * Get user-friendly error message
 */
export function getUserFriendlyMessage(reason: RecordingVerificationReason): string {
  const messages: Record<RecordingVerificationReason, string> = {
    [RecordingVerificationReason.INVALID_STREAM_URI]: 'Stream URL is invalid',
    [RecordingVerificationReason.UNSUPPORTED_PROTOCOL]: 'Stream protocol not supported',
    [RecordingVerificationReason.MISSING_HOSTNAME]: 'Stream hostname is missing',
    
    [RecordingVerificationReason.CONNECTION_REFUSED]: 'Connection refused by recorder',
    [RecordingVerificationReason.CONNECTION_TIMEOUT]: 'Connection to recorder timed out',
    [RecordingVerificationReason.NETWORK_UNREACHABLE]: 'Network unreachable',
    [RecordingVerificationReason.HOST_UNREACHABLE]: 'Recorder host unreachable',
    
    [RecordingVerificationReason.AUTHENTICATION_FAILED]: 'Authentication failed - check credentials',
    [RecordingVerificationReason.AUTHENTICATION_REQUIRED]: 'Authentication required',
    [RecordingVerificationReason.INVALID_CREDENTIALS]: 'Invalid credentials',
    
    [RecordingVerificationReason.RTSP_ENDPOINT_NOT_FOUND]: 'RTSP stream not found',
    [RecordingVerificationReason.RTSP_METHOD_NOT_ALLOWED]: 'RTSP method not allowed',
    [RecordingVerificationReason.RTSP_SERVER_ERROR]: 'RTSP server error',
    [RecordingVerificationReason.RTSP_NEGOTIATION_FAILED]: 'RTSP negotiation failed',
    
    [RecordingVerificationReason.NO_VIDEO_STREAM]: 'No video stream detected',
    [RecordingVerificationReason.NO_MEDIA_PACKETS]: 'No media packets received',
    [RecordingVerificationReason.NO_DECODABLE_FRAMES]: 'No decodable video frames',
    [RecordingVerificationReason.UNSUPPORTED_CODEC]: 'Video codec not supported',
    [RecordingVerificationReason.CORRUPTED_STREAM]: 'Stream data corrupted',
    
    [RecordingVerificationReason.RECORDING_FAILED]: 'Recording failed',
    [RecordingVerificationReason.RECORDING_PROCESS_FAILED]: 'Recording process failed',
    [RecordingVerificationReason.RECORDING_TIMEOUT]: 'Recording timed out',
    [RecordingVerificationReason.RECORDED_FILE_EMPTY]: 'Recorded file is empty',
    [RecordingVerificationReason.RECORDED_FILE_INVALID]: 'Recorded file is invalid',
    [RecordingVerificationReason.RECORDED_FILE_TOO_SHORT]: 'Recording too short',
    [RecordingVerificationReason.RECORDED_FILE_CORRUPT]: 'Recorded file corrupt',
    [RecordingVerificationReason.STORAGE_WRITE_FAILED]: 'Failed to write to storage',
    
    [RecordingVerificationReason.FFMPEG_UNAVAILABLE]: 'FFmpeg not available',
    [RecordingVerificationReason.FFPROBE_UNAVAILABLE]: 'FFprobe not available',
    [RecordingVerificationReason.VERIFICATION_INFRASTRUCTURE_UNAVAILABLE]: 'Verification system unavailable',
    [RecordingVerificationReason.TEMP_STORAGE_UNAVAILABLE]: 'Temporary storage unavailable',
    [RecordingVerificationReason.VERIFIER_DISABLED]: 'Recording verification disabled',
    
    [RecordingVerificationReason.INTERNAL_ERROR]: 'Internal verification error',
    [RecordingVerificationReason.PROCESS_SPAWN_FAILED]: 'Failed to start verification',
    [RecordingVerificationReason.VERIFICATION_TIMEOUT_INTERNAL]: 'Verification timed out internally',
  };

  return messages[reason] || 'Unknown error';
}

/**
 * Extract excerpt from stderr for diagnostics (first and last parts)
 */
export function extractStderrExcerpt(stderr: string, maxLength: number = 500): string {
  if (!stderr || stderr.length === 0) {
    return '';
  }

  if (stderr.length <= maxLength) {
    return stderr;
  }

  const halfLength = Math.floor(maxLength / 2);
  const start = stderr.substring(0, halfLength);
  const end = stderr.substring(stderr.length - halfLength);

  return `${start}\n...[truncated]...\n${end}`;
}
