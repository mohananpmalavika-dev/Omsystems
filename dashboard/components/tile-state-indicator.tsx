/**
 * Tile State Indicator
 * Visual indicator showing current stream state and quality
 */

import { 
  Loader2, 
  Wifi, 
  WifiOff, 
  Image, 
  Info,
  AlertTriangle,
  Pause,
  ArrowDown,
} from "lucide-react";
import type { TileStreamState, MediaDegradationLevel } from "@/lib/media-types";

export interface TileStateIndicatorProps {
  streamState: TileStreamState;
  degradationLevel?: MediaDegradationLevel;
  degraded?: boolean;
  error?: string;
  compact?: boolean;
}

export function TileStateIndicator({
  streamState,
  degradationLevel,
  degraded,
  error,
  compact = false,
}: TileStateIndicatorProps) {
  const getStateInfo = (): {
    icon: React.ReactNode;
    label: string;
    className: string;
    description?: string;
  } => {
    switch (streamState) {
      case "METADATA_ONLY":
        return {
          icon: <Info size={compact ? 12 : 14} />,
          label: "Metadata",
          className: "state-metadata",
          description: "Camera info only, no video",
        };

      case "QUEUED":
        return {
          icon: <Loader2 size={compact ? 12 : 14} className="animate-spin" />,
          label: "Queued",
          className: "state-queued",
          description: "Waiting for decoder capacity",
        };

      case "CONNECTING":
        return {
          icon: <Loader2 size={compact ? 12 : 14} className="animate-spin" />,
          label: "Connecting",
          className: "state-connecting",
          description: "Establishing video connection",
        };

      case "LIVE_SUBSTREAM":
        return {
          icon: degraded ? <ArrowDown size={compact ? 12 : 14} /> : <Wifi size={compact ? 12 : 14} />,
          label: degraded ? "Sub (Degraded)" : "Live Sub",
          className: degraded ? "state-degraded" : "state-live-sub",
          description: degraded 
            ? "Downgraded to substream due to resource constraints"
            : "Live substream active",
        };

      case "LIVE_MAINSTREAM":
        return {
          icon: <Wifi size={compact ? 12 : 14} />,
          label: "Live Main",
          className: "state-live-main",
          description: "High quality mainstream active",
        };

      case "PAUSED":
        return {
          icon: <Pause size={compact ? 12 : 14} />,
          label: "Paused",
          className: "state-paused",
          description: "Stream paused",
        };

      case "ERROR":
        return {
          icon: <AlertTriangle size={compact ? 12 : 14} />,
          label: "Error",
          className: "state-error",
          description: error || "Stream error",
        };

      default:
        return {
          icon: <WifiOff size={compact ? 12 : 14} />,
          label: "Unknown",
          className: "state-unknown",
          description: "Unknown state",
        };
    }
  };

  const getDegradationInfo = () => {
    if (degradationLevel === undefined) return null;

    switch (degradationLevel) {
      case 1: // REDUCED_FPS
        return "Reduced frame rate";
      case 2: // SUBSTREAM_ONLY
        return "Using lower quality stream";
      case 3: // SNAPSHOT_ONLY
        return "Snapshot mode only";
      case 4: // METADATA_ONLY
        return "Metadata only";
      default:
        return null;
    }
  };

  const stateInfo = getStateInfo();
  const degradationInfo = getDegradationInfo();

  if (compact) {
    return (
      <div 
        className={`tile-state-indicator compact ${stateInfo.className}`}
        title={`${stateInfo.label}${degradationInfo ? ` - ${degradationInfo}` : ""}${error ? ` - ${error}` : ""}`}
      >
        {stateInfo.icon}
      </div>
    );
  }

  return (
    <div className={`tile-state-indicator ${stateInfo.className}`}>
      <div className="state-content">
        {stateInfo.icon}
        <span className="state-label">{stateInfo.label}</span>
      </div>
      {(degradationInfo || error) && (
        <div className="state-details">
          {degradationInfo && <span className="degradation-info">{degradationInfo}</span>}
          {error && <span className="error-info">{error}</span>}
        </div>
      )}

      <style jsx>{`
        .tile-state-indicator {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .tile-state-indicator.compact {
          padding: 3px;
          border-radius: 3px;
        }

        .state-content {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .state-details {
          display: flex;
          flex-direction: column;
          gap: 2px;
          font-size: 10px;
          opacity: 0.9;
        }

        .state-metadata {
          background: rgba(100, 116, 139, 0.9);
          color: white;
        }

        .state-queued {
          background: rgba(251, 191, 36, 0.9);
          color: #78350f;
        }

        .state-connecting {
          background: rgba(59, 130, 246, 0.9);
          color: white;
        }

        .state-live-sub {
          background: rgba(34, 197, 94, 0.9);
          color: white;
        }

        .state-live-main {
          background: rgba(16, 185, 129, 0.9);
          color: white;
        }

        .state-degraded {
          background: rgba(251, 146, 60, 0.9);
          color: #7c2d12;
        }

        .state-paused {
          background: rgba(148, 163, 184, 0.9);
          color: white;
        }

        .state-error {
          background: rgba(239, 68, 68, 0.9);
          color: white;
        }

        .state-unknown {
          background: rgba(107, 114, 128, 0.9);
          color: white;
        }

        .degradation-info {
          color: rgba(255, 255, 255, 0.95);
        }

        .error-info {
          color: rgba(255, 255, 255, 0.95);
          font-weight: 700;
        }
      `}</style>
    </div>
  );
}
