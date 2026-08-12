/**
 * Formatting utilities for Security Commander UI
 */

import type { SeverityLevel, ConfidenceLevel } from '../types/ui-types.js';

// Format timestamp
export function formatTimestamp(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// Format duration
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ${seconds % 60}s`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

// Format relative time
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return `${diffSeconds}s ago`;
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  return formatTimestamp(d);
}

// Get severity color
export function getSeverityColor(severity: number): string {
  if (severity >= 90) return '#dc2626'; // red-600
  if (severity >= 70) return '#ea580c'; // orange-600
  if (severity >= 50) return '#f59e0b'; // amber-500
  return '#3b82f6'; // blue-500
}

// Get severity label
export function getSeverityLabel(severity: number): SeverityLevel {
  if (severity >= 90) return 'critical';
  if (severity >= 70) return 'high';
  if (severity >= 50) return 'medium';
  return 'low';
}

// Get confidence color
export function getConfidenceColor(confidence: number): string {
  if (confidence >= 90) return '#16a34a'; // green-600
  if (confidence >= 70) return '#65a30d'; // lime-600
  if (confidence >= 50) return '#f59e0b'; // amber-500
  return '#ef4444'; // red-500
}

// Get confidence label
export function getConfidenceLabel(confidence: number): ConfidenceLevel {
  if (confidence >= 90) return 'very_high';
  if (confidence >= 70) return 'high';
  if (confidence >= 50) return 'medium';
  return 'low';
}

// Format event type for display
export function formatEventType(type: string): string {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Format confidence as percentage
export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence)}%`;
}

// Format severity badge text
export function formatSeverityBadge(severity: number): string {
  const label = getSeverityLabel(severity);
  return `${label.toUpperCase()} (${severity})`;
}

// Truncate text
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

// Format asset ID for display
export function formatAssetId(assetId: string): string {
  // Extract readable part from asset ID (e.g., "camera_123" -> "Camera 123")
  const match = assetId.match(/^([a-z]+)_(.+)$/);
  if (match && match[1] && match[2]) {
    const type = match[1];
    const id = match[2];
    return `${formatEventType(type)} ${id}`;
  }
  return assetId;
}

// Format file size
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// Format location
export function formatLocation(location: { latitude?: number; longitude?: number; zone?: string }): string {
  if (location.zone) return location.zone;
  if (location.latitude && location.longitude) {
    return `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
  }
  return 'Unknown location';
}
