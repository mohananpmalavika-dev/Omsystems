/**
 * Presentation Mode Selector
 * Switch between Operations Overview, Live Monitoring, and Investigation modes
 */

import { Monitor, Eye, Search, Info } from "lucide-react";
import type { PresentationMode } from "@/lib/media-types";

export interface PresentationModeSelectorProps {
  currentMode: PresentationMode;
  onModeChange: (mode: PresentationMode) => void;
  disabled?: boolean;
}

interface ModeInfo {
  mode: PresentationMode;
  icon: React.ReactNode;
  label: string;
  description: string;
  characteristics: string[];
}

const MODES: ModeInfo[] = [
  {
    mode: "OPERATIONS_OVERVIEW",
    icon: <Monitor size={18} />,
    label: "Operations Overview",
    description: "Monitor branch and camera health across the entire platform",
    characteristics: [
      "Metadata only, no video by default",
      "Branch status cards",
      "Camera online/offline counts",
      "Critical alert badges",
      "Latest snapshots",
      "Scales to 10,000+ cameras",
    ],
  },
  {
    mode: "LIVE_MONITORING",
    icon: <Eye size={18} />,
    label: "Live Monitoring",
    description: "Multi-camera surveillance with optimized resources",
    characteristics: [
      "Primarily substreams (640×360@8fps)",
      "16-144 grid positions",
      "32-64 active decoders",
      "Visible viewport priority",
      "Automatic sequencing",
      "Alert-driven promotion",
    ],
  },
  {
    mode: "INVESTIGATION",
    icon: <Search size={18} />,
    label: "Investigation",
    description: "High-quality single/multi-camera analysis",
    characteristics: [
      "Mainstream quality (1920×1080@20fps+)",
      "1-16 cameras",
      "PTZ control enabled",
      "Audio enabled",
      "Playback timeline",
      "Evidence capture",
    ],
  },
];

export function PresentationModeSelector({
  currentMode,
  onModeChange,
  disabled = false,
}: PresentationModeSelectorProps) {
  return (
    <div className="presentation-mode-selector">
      <div className="mode-buttons">
        {MODES.map((modeInfo) => (
          <button
            key={modeInfo.mode}
            className={`mode-button ${
              currentMode === modeInfo.mode ? "active" : ""
            }`}
            onClick={() => onModeChange(modeInfo.mode)}
            disabled={disabled}
            title={modeInfo.description}
          >
            {modeInfo.icon}
            <span className="mode-label">{modeInfo.label}</span>
          </button>
        ))}
      </div>

      <div className="mode-info">
        {MODES.filter((m) => m.mode === currentMode).map((modeInfo) => (
          <div key={modeInfo.mode} className="mode-details">
            <div className="mode-header">
              <Info size={14} />
              <span className="mode-description">{modeInfo.description}</span>
            </div>
            <ul className="mode-characteristics">
              {modeInfo.characteristics.map((char, idx) => (
                <li key={idx}>{char}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <style jsx>{`
        .presentation-mode-selector {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 16px;
          background: white;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .mode-buttons {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .mode-button {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          background: white;
          color: #374151;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .mode-button:hover:not(:disabled) {
          border-color: #3b82f6;
          background: #eff6ff;
          color: #1d4ed8;
        }

        .mode-button.active {
          border-color: #3b82f6;
          background: #3b82f6;
          color: white;
        }

        .mode-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .mode-label {
          white-space: nowrap;
        }

        .mode-info {
          padding: 12px;
          background: #f9fafb;
          border-radius: 6px;
          border: 1px solid #e5e7eb;
        }

        .mode-details {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .mode-header {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #374151;
          font-size: 13px;
          font-weight: 600;
        }

        .mode-description {
          flex: 1;
        }

        .mode-characteristics {
          margin: 0;
          padding-left: 24px;
          color: #6b7280;
          font-size: 12px;
          line-height: 1.6;
        }

        .mode-characteristics li {
          margin-bottom: 4px;
        }

        @media (max-width: 768px) {
          .mode-buttons {
            flex-direction: column;
          }

          .mode-button {
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}
