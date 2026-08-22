/**
 * Capability Badge Component
 * 
 * Displays a visual indicator of a device capability's state.
 */

import React from "react";
import type { CapabilityState } from "../../types/capabilities";

export interface CapabilityBadgeProps {
  /** Capability state */
  state: CapabilityState;

  /** Whether capability is available */
  available: boolean;

  /** Capability label */
  label: string;

  /** Verification level (optional) */
  verificationLevel?: "DECLARED" | "DISCOVERED" | "VERIFIED";

  /** Confidence score (0-1, optional) */
  confidence?: number;

  /** Show verification indicator */
  showVerification?: boolean;

  /** Show confidence indicator */
  showConfidence?: boolean;

  /** Size variant */
  size?: "sm" | "md" | "lg";

  /** Additional CSS classes */
  className?: string;
}

export function CapabilityBadge({
  state,
  available,
  label,
  verificationLevel,
  confidence,
  showVerification = false,
  showConfidence = false,
  size = "md",
  className = "",
}: CapabilityBadgeProps) {
  const colors = getStateColors(state, available);
  const sizeClasses = getSizeClasses(size);
  const icon = getStateIcon(state, available);

  return (
    <div
      className={`inline-flex items-center gap-2 ${colors.bg} ${colors.text} ${colors.border} border rounded-full ${sizeClasses.padding} ${className}`}
      title={getStateDescription(state, available)}
    >
      <span className={sizeClasses.icon}>{icon}</span>
      <span className={`font-medium ${sizeClasses.text}`}>{label}</span>

      {showVerification && verificationLevel && (
        <span className={`${sizeClasses.badge} opacity-75`}>
          {getVerificationBadge(verificationLevel)}
        </span>
      )}

      {showConfidence && confidence !== undefined && (
        <span className={`${sizeClasses.badge} opacity-75`}>
          {Math.round(confidence * 100)}%
        </span>
      )}
    </div>
  );
}

function getStateColors(state: CapabilityState, available: boolean): {
  bg: string;
  text: string;
  border: string;
} {
  if (state === "SUPPORTED" && available) {
    return {
      bg: "bg-green-50",
      text: "text-green-700",
      border: "border-green-200",
    };
  }

  if (state === "SUPPORTED" && !available) {
    return {
      bg: "bg-yellow-50",
      text: "text-yellow-700",
      border: "border-yellow-200",
    };
  }

  if (state === "UNSUPPORTED") {
    return {
      bg: "bg-gray-50",
      text: "text-gray-500",
      border: "border-gray-200",
    };
  }

  if (state === "UNAVAILABLE") {
    return {
      bg: "bg-yellow-50",
      text: "text-yellow-700",
      border: "border-yellow-200",
    };
  }

  if (state === "DEGRADED") {
    return {
      bg: "bg-orange-50",
      text: "text-orange-700",
      border: "border-orange-200",
    };
  }

  if (state === "MISCONFIGURED") {
    return {
      bg: "bg-red-50",
      text: "text-red-700",
      border: "border-red-200",
    };
  }

  // UNKNOWN
  return {
    bg: "bg-gray-50",
    text: "text-gray-600",
    border: "border-gray-300",
  };
}

function getStateIcon(state: CapabilityState, available: boolean): string {
  if (state === "SUPPORTED" && available) return "✓";
  if (state === "SUPPORTED" && !available) return "⚠";
  if (state === "UNSUPPORTED") return "✗";
  if (state === "UNAVAILABLE") return "⊗";
  if (state === "DEGRADED") return "⚡";
  if (state === "MISCONFIGURED") return "⚙";
  return "?";
}

function getStateDescription(state: CapabilityState, available: boolean): string {
  if (state === "SUPPORTED" && available) return "Supported and available";
  if (state === "SUPPORTED" && !available) return "Supported but currently unavailable";
  if (state === "UNSUPPORTED") return "Not supported by this device";
  if (state === "UNAVAILABLE") return "Currently unavailable";
  if (state === "DEGRADED") return "Available with limited functionality";
  if (state === "MISCONFIGURED") return "Misconfigured";
  return "State unknown - verification required";
}

function getVerificationBadge(level: "DECLARED" | "DISCOVERED" | "VERIFIED"): string {
  if (level === "VERIFIED") return "✓";
  if (level === "DISCOVERED") return "◐";
  return "◯";
}

function getSizeClasses(size: "sm" | "md" | "lg"): {
  padding: string;
  text: string;
  icon: string;
  badge: string;
} {
  if (size === "sm") {
    return {
      padding: "px-2 py-0.5",
      text: "text-xs",
      icon: "text-xs",
      badge: "text-[10px]",
    };
  }

  if (size === "lg") {
    return {
      padding: "px-4 py-2",
      text: "text-base",
      icon: "text-lg",
      badge: "text-sm",
    };
  }

  // md
  return {
    padding: "px-3 py-1",
    text: "text-sm",
    icon: "text-sm",
    badge: "text-xs",
  };
}
