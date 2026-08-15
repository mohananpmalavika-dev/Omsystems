/**
 * Capacity Dashboard
 * Displays platform and workstation capacity metrics
 */

import { 
  Activity, 
  Monitor, 
  Wifi, 
  TrendingUp,
  Server,
  Users,
  Video,
  Gauge,
} from "lucide-react";
import type {
  PlatformCapacityMetrics,
  WorkstationCapacityMetrics,
} from "@/lib/media-types";

export interface CapacityDashboardProps {
  platformMetrics: PlatformCapacityMetrics | null;
  workstationMetrics: WorkstationCapacityMetrics | null;
  compact?: boolean;
}

export function CapacityDashboard({
  platformMetrics,
  workstationMetrics,
  compact = false,
}: CapacityDashboardProps) {
  if (compact) {
    return (
      <div className="capacity-dashboard compact">
        {workstationMetrics && (
          <div className="metric-compact">
            <Gauge size={14} />
            <span>{workstationMetrics.decoderLoadPercent.toFixed(0)}% load</span>
          </div>
        )}
        {platformMetrics && (
          <div className="metric-compact">
            <Video size={14} />
            <span>
              {platformMetrics.activeHoMediaSessions} sessions ·{" "}
              {platformMetrics.currentHoBandwidthMbps.toFixed(0)} Mbps
            </span>
          </div>
        )}

        <style jsx>{`
          .capacity-dashboard.compact {
            display: flex;
            gap: 16px;
            align-items: center;
          }

          .metric-compact {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            font-weight: 600;
            color: #475569;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="capacity-dashboard">
      {/* Platform Metrics */}
      {platformMetrics && (
        <div className="metrics-section">
          <div className="section-header">
            <Server size={18} />
            <h3>Platform Capacity</h3>
          </div>

          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-icon">
                <Users size={20} />
              </div>
              <div className="metric-content">
                <div className="metric-label">Branches Enrolled</div>
                <div className="metric-value">
                  {platformMetrics.branchesEnrolled.toLocaleString()}
                </div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon">
                <Video size={20} />
              </div>
              <div className="metric-content">
                <div className="metric-label">Cameras</div>
                <div className="metric-value">
                  {platformMetrics.camerasCurrentlyOnline.toLocaleString()}
                  <span className="metric-secondary">
                    {" "}
                    / {platformMetrics.camerasEnrolled.toLocaleString()} enrolled
                  </span>
                </div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon">
                <Wifi size={20} />
              </div>
              <div className="metric-content">
                <div className="metric-label">Active HO Sessions</div>
                <div className="metric-value">
                  {platformMetrics.activeHoMediaSessions.toLocaleString()}
                  <span className="metric-secondary">
                    {" "}
                    ({platformMetrics.activeMainStreams} main,{" "}
                    {platformMetrics.activeSubstreams} sub)
                  </span>
                </div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon">
                <TrendingUp size={20} />
              </div>
              <div className="metric-content">
                <div className="metric-label">HO Bandwidth</div>
                <div className="metric-value">
                  {platformMetrics.currentHoBandwidthMbps.toFixed(1)} Mbps
                  <span className="metric-secondary">
                    {" "}
                    / {platformMetrics.configuredMediaBudgetMbps} Mbps budget
                  </span>
                </div>
                <div className="metric-progress">
                  <div
                    className="progress-bar"
                    style={{
                      width: `${
                        (platformMetrics.currentHoBandwidthMbps /
                          platformMetrics.configuredMediaBudgetMbps) *
                        100
                      }%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Workstation Metrics */}
      {workstationMetrics && (
        <div className="metrics-section">
          <div className="section-header">
            <Monitor size={18} />
            <h3>Workstation Capacity</h3>
          </div>

          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-icon">
                <Activity size={20} />
              </div>
              <div className="metric-content">
                <div className="metric-label">Decoder Class</div>
                <div className="metric-value">
                  {workstationMetrics.estimatedCapacityClass}
                </div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon">
                <Gauge size={20} />
              </div>
              <div className="metric-content">
                <div className="metric-label">Decoder Load</div>
                <div className="metric-value">
                  {workstationMetrics.decoderLoadPercent.toFixed(0)}%
                  <span className="metric-secondary">
                    {" "}
                    ({workstationMetrics.activeDecoders} active)
                  </span>
                </div>
                <div className="metric-progress">
                  <div
                    className={`progress-bar ${
                      workstationMetrics.decoderLoadPercent > 80
                        ? "critical"
                        : workstationMetrics.decoderLoadPercent > 60
                        ? "warning"
                        : "normal"
                    }`}
                    style={{
                      width: `${workstationMetrics.decoderLoadPercent}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon">
                <Video size={20} />
              </div>
              <div className="metric-content">
                <div className="metric-label">Active Cameras</div>
                <div className="metric-value">
                  {workstationMetrics.liveCameras.toLocaleString()}
                  <span className="metric-secondary"> live</span>
                </div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon">
                <Monitor size={20} />
              </div>
              <div className="metric-content">
                <div className="metric-label">Grid Layout</div>
                <div className="metric-value">
                  {workstationMetrics.gridPositions} positions
                  <span className="metric-secondary">
                    {" "}
                    ({workstationMetrics.snapshotCameras} snapshots)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .capacity-dashboard {
          display: flex;
          flex-direction: column;
          gap: 24px;
          padding: 20px;
          background: #f9fafb;
          border-radius: 8px;
        }

        .metrics-section {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .section-header {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #1f2937;
        }

        .section-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 700;
        }

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 16px;
        }

        .metric-card {
          display: flex;
          gap: 12px;
          padding: 16px;
          background: white;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
          transition: all 0.2s;
        }

        .metric-card:hover {
          border-color: #3b82f6;
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.1);
        }

        .metric-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          background: #eff6ff;
          color: #3b82f6;
          border-radius: 8px;
          flex-shrink: 0;
        }

        .metric-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .metric-label {
          font-size: 12px;
          font-weight: 600;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .metric-value {
          font-size: 20px;
          font-weight: 700;
          color: #1f2937;
        }

        .metric-secondary {
          font-size: 13px;
          font-weight: 500;
          color: #9ca3af;
        }

        .metric-progress {
          height: 4px;
          background: #e5e7eb;
          border-radius: 2px;
          overflow: hidden;
          margin-top: 4px;
        }

        .progress-bar {
          height: 100%;
          background: #3b82f6;
          transition: width 0.3s ease;
        }

        .progress-bar.warning {
          background: #f59e0b;
        }

        .progress-bar.critical {
          background: #ef4444;
        }

        .progress-bar.normal {
          background: #10b981;
        }

        @media (max-width: 768px) {
          .metrics-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
