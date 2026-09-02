/**
 * Capability Gate Component
 * 
 * Renders children only if the device supports the specified capability.
 * Shows appropriate feedback for different capability states.
 */

import React, { useEffect, useState } from "react";
import type { CapabilityKey, CapabilityState } from "../../types/capabilities";

export interface CapabilityGateProps {
  /** Device ID to check capabilities for */
  deviceId: string;

  /** Tenant ID */
  tenantId: string;

  /** Capability to check (e.g., "ptz.ptz", "recording.playback") */
  capability: CapabilityKey;

  /** Content to render when capability is supported and available */
  children: React.ReactNode;

  /** Content to render when capability is loading (optional) */
  loadingContent?: React.ReactNode;

  /** Content to render when capability is unsupported (optional) */
  unsupportedContent?: React.ReactNode;

  /** Content to render when capability is unavailable (optional) */
  unavailableContent?: React.ReactNode;

  /** Content to render when capability state is unknown (optional) */
  unknownContent?: React.ReactNode;

  /** Content to render when capability is degraded (optional) */
  degradedContent?: React.ReactNode;

  /** Whether to show default messages for states without custom content */
  showDefaultMessages?: boolean;

  /** Custom class name */
  className?: string;

  /** Callback when capability state changes */
  onStateChange?: (state: CapabilityState, available: boolean) => void;
}

interface CapabilityResponse {
  state: CapabilityState;
  available: boolean;
  confidence: number;
  verificationLevel: string;
  limitations?: string[];
}

export function CapabilityGate({
  deviceId,
  tenantId,
  capability,
  children,
  loadingContent,
  unsupportedContent,
  unavailableContent,
  unknownContent,
  degradedContent,
  showDefaultMessages = true,
  className = "",
  onStateChange,
}: CapabilityGateProps) {
  const [loading, setLoading] = useState(true);
  const [capabilityData, setCapabilityData] = useState<CapabilityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchCapability() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          `/api/v1/devices/${deviceId}/capabilities/${capability}?tenantId=${tenantId}`
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch capability: ${response.statusText}`);
        }

        const data = await response.json();

        if (mounted) {
          setCapabilityData(data);
          onStateChange?.(data.state, data.available);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchCapability();

    return () => {
      mounted = false;
    };
  }, [deviceId, tenantId, capability, onStateChange]);

  // Loading state
  if (loading) {
    return (
      <div className={className}>
        {loadingContent || (showDefaultMessages && (
          <div className="flex items-center gap-2 text-gray-500">
            <span className="animate-spin">⟳</span>
            <span>Checking capability...</span>
          </div>
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return showDefaultMessages ? (
      <div className={`text-red-500 ${className}`}>
        <span>Failed to check capability: {error}</span>
      </div>
    ) : null;
  }

  // No capability data
  if (!capabilityData) {
    return unknownContent ? <div className={className}>{unknownContent}</div> : null;
  }

  // SUPPORTED and available - render children
  if (capabilityData.state === "SUPPORTED" && capabilityData.available) {
    return <div className={className}>{children}</div>;
  }

  // UNSUPPORTED
  if (capabilityData.state === "UNSUPPORTED") {
    return (
      <div className={className}>
        {unsupportedContent || (showDefaultMessages && (
          <div className="text-gray-400 text-sm">
            <span>This device does not support {getCapabilityDisplayName(capability)}</span>
          </div>
        ))}
      </div>
    );
  }

  // UNAVAILABLE
  if (capabilityData.state === "UNAVAILABLE" || !capabilityData.available) {
    return (
      <div className={className}>
        {unavailableContent || (showDefaultMessages && (
          <div className="text-yellow-600 text-sm">
            <div className="font-medium">{getCapabilityDisplayName(capability)}</div>
            <div>Currently unavailable</div>
            {capabilityData.limitations && capabilityData.limitations.length > 0 && (
              <div className="text-xs mt-1">{capabilityData.limitations[0]}</div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // DEGRADED
  if (capabilityData.state === "DEGRADED") {
    return (
      <div className={className}>
        {degradedContent || (showDefaultMessages ? (
          <div className="text-orange-500 text-sm">
            <div className="font-medium">{getCapabilityDisplayName(capability)}</div>
            <div>Limited functionality</div>
            {capabilityData.limitations && capabilityData.limitations.length > 0 && (
              <div className="text-xs mt-1">{capabilityData.limitations.join(", ")}</div>
            )}
          </div>
        ) : (
          children // Still render children for degraded state
        ))}
      </div>
    );
  }

  // UNKNOWN
  return (
    <div className={className}>
      {unknownContent || (showDefaultMessages && (
        <div className="text-gray-500 text-sm">
          <div>{getCapabilityDisplayName(capability)}</div>
          <div>Capability not yet determined</div>
          <button
            className="text-blue-500 underline text-xs mt-1"
            onClick={() => window.location.reload()}
          >
            Recheck
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * Get human-readable display name for capability.
 */
function getCapabilityDisplayName(capability: CapabilityKey): string {
  const names: Record<string, string> = {
    "video.liveVideo": "Live Video",
    "video.snapshots": "Snapshots",
    "video.rtsp": "RTSP Streaming",
    "recording.recording": "Recording",
    "recording.playback": "Playback",
    "recording.recordingSearch": "Recording Search",
    "recording.export": "Export",
    "ptz.ptz": "PTZ Controls",
    "ptz.presets": "PTZ Presets",
    "ptz.tours": "PTZ Tours",
    "audio.audioInput": "Audio Input",
    "audio.audioOutput": "Audio Output",
    "audio.twoWayAudio": "Two-Way Audio",
    "events.motionDetection": "Motion Detection",
    "analytics.personDetection": "Person Detection",
    "analytics.vehicleDetection": "Vehicle Detection",
    "storage.onboardStorage": "SD Card Storage",
    "management.firmwareUpgrade": "Firmware Upgrade",
  };

  return names[capability] || capability.split(".").pop() || capability;
}

export const DeviceCapabilityGate = CapabilityGate;
export { PlatformCapabilityGate } from './PlatformCapabilityGate';

