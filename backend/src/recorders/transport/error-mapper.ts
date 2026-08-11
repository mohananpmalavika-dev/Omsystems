/**
 * Error Mapper
 * 
 * Maps transport errors to evidence states and error codes.
 * Ensures consistent error semantics across all adapters.
 */

import type {
  EvidenceState,
  RecorderErrorCode
} from '../contracts/evidence-value.js';
import { RecorderTransportError } from './recorder-http-transport.js';

/**
 * Map error to evidence state
 */
export function errorToEvidenceState(
  error: Error | RecorderTransportError
): EvidenceState {
  if (error instanceof RecorderTransportError) {
    return errorCodeToState(error.code);
  }

  // Fallback for non-transport errors
  return 'UNKNOWN';
}

/**
 * Map error code to evidence state
 */
export function errorCodeToState(
  code: RecorderErrorCode
): EvidenceState {
  const mapping: Partial<Record<RecorderErrorCode, EvidenceState>> = {
    // Authentication
    'AUTH_REQUIRED': 'AUTH_FAILED',
    'AUTH_FAILED': 'AUTH_FAILED',
    'FORBIDDEN': 'AUTH_FAILED',
    'SESSION_EXPIRED': 'AUTH_FAILED',

    // Timeouts
    'TIMEOUT': 'TIMEOUT',

    // Network
    'NETWORK_UNREACHABLE': 'UNREACHABLE',
    'CONNECTION_REFUSED': 'UNREACHABLE',
    'DNS_FAILURE': 'UNREACHABLE',
    'TLS_ERROR': 'UNREACHABLE',
    'CERTIFICATE_ERROR': 'UNREACHABLE',

    // Protocol
    'UNSUPPORTED_FEATURE': 'UNSUPPORTED',
    'NOT_FOUND': 'UNSUPPORTED', // Resource not found often means unsupported
    'MALFORMED_RESPONSE': 'MALFORMED_RESPONSE',
    'PROTOCOL_ERROR': 'MALFORMED_RESPONSE',
    'INVALID_REQUEST': 'MALFORMED_RESPONSE',

    // Rate limiting
    'RATE_LIMITED': 'RATE_LIMITED',
    'TOO_MANY_REQUESTS': 'RATE_LIMITED',

    // Device
    'DEVICE_ERROR': 'DEVICE_ERROR',
    'DEVICE_BUSY': 'DEVICE_ERROR',
    'RESOURCE_UNAVAILABLE': 'DEVICE_ERROR',
    'VENDOR_ERROR': 'DEVICE_ERROR',

    // Generic
    'UNKNOWN_ERROR': 'UNKNOWN'
  };

  return mapping[code] ?? 'UNKNOWN';
}

/**
 * Check if error indicates device is unreachable
 */
export function isUnreachableError(error: Error): boolean {
  if (error instanceof RecorderTransportError) {
    const unreachableCodes: RecorderErrorCode[] = [
      'NETWORK_UNREACHABLE',
      'CONNECTION_REFUSED',
      'DNS_FAILURE',
      'TIMEOUT'
    ];
    return unreachableCodes.includes(error.code);
  }

  return false;
}

/**
 * Check if error indicates authentication failure
 */
export function isAuthError(error: Error): boolean {
  if (error instanceof RecorderTransportError) {
    const authCodes: RecorderErrorCode[] = [
      'AUTH_REQUIRED',
      'AUTH_FAILED',
      'FORBIDDEN',
      'SESSION_EXPIRED'
    ];
    return authCodes.includes(error.code);
  }

  return false;
}

/**
 * Check if error is retriable
 */
export function isRetriableError(error: Error): boolean {
  if (error instanceof RecorderTransportError) {
    const retriableCodes: RecorderErrorCode[] = [
      'TIMEOUT',
      'NETWORK_UNREACHABLE',
      'CONNECTION_REFUSED',
      'DEVICE_BUSY',
      'RATE_LIMITED',
      'TOO_MANY_REQUESTS',
      'SESSION_EXPIRED'
    ];
    return retriableCodes.includes(error.code);
  }

  return false;
}

/**
 * Extract user-friendly error message
 */
export function getUserMessage(error: Error): string {
  if (error instanceof RecorderTransportError) {
    const messages: Partial<Record<RecorderErrorCode, string>> = {
      'AUTH_FAILED': 'Authentication failed - check credentials',
      'AUTH_REQUIRED': 'Authentication required',
      'FORBIDDEN': 'Access denied - insufficient permissions',
      'TIMEOUT': 'Request timed out - recorder may be slow or unresponsive',
      'NETWORK_UNREACHABLE': 'Network unreachable - check connectivity',
      'CONNECTION_REFUSED': 'Connection refused - recorder may be offline',
      'DNS_FAILURE': 'DNS lookup failed - check hostname/IP',
      'CERTIFICATE_ERROR': 'TLS certificate validation failed',
      'UNSUPPORTED_FEATURE': 'Feature not supported by this recorder',
      'MALFORMED_RESPONSE': 'Recorder returned invalid response',
      'RATE_LIMITED': 'Too many requests - temporarily throttled',
      'DEVICE_ERROR': 'Recorder reported internal error',
      'DEVICE_BUSY': 'Recorder busy - try again later'
    };

    return messages[error.code] ?? error.message;
  }

  return error.message || 'Unknown error occurred';
}

/**
 * Extract technical error details
 */
export function getTechnicalDetails(error: Error): Record<string, any> {
  if (error instanceof RecorderTransportError) {
    return {
      code: error.code,
      message: error.message,
      httpStatus: error.httpStatus,
      vendorCode: error.vendorCode,
      latencyMs: error.latencyMs,
      context: error.context
    };
  }

  return {
    name: error.name,
    message: error.message,
    stack: error.stack
  };
}
