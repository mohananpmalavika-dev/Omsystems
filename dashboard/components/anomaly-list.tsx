"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  AlertCircle,
  TrendingUp,
} from "lucide-react";

interface BehaviorAnomaly {
  id: string;
  branch_id: string | null;
  camera_id: string | null;
  baseline_id: string | null;
  anomaly_type: string;
  severity: "low" | "medium" | "high" | "critical";
  confidence_score: number;
  detected_at: string;
  explanation: string;
  metadata: Record<string, any>;
  status: "pending" | "acknowledged" | "investigating" | "resolved" | "false_positive";
  resolved_at: string | null;
  resolution_notes: string | null;
}

interface AnomalyListProps {
  anomalies: BehaviorAnomaly[];
  onReview?: (anomalyId: string, status: string, notes?: string) => Promise<void>;
  onViewDetails?: (anomaly: BehaviorAnomaly) => void;
  compact?: boolean;
}

export function AnomalyList({ 
  anomalies, 
  onReview, 
  onViewDetails,
  compact = false 
}: AnomalyListProps) {
  const [selectedAnomaly, setSelectedAnomaly] = useState<BehaviorAnomaly | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-900/80 text-red-200 border-red-700";
      case "high":
        return "bg-orange-900/80 text-orange-200 border-orange-700";
      case "medium":
        return "bg-amber-900/80 text-amber-200 border-amber-700";
      default:
        return "bg-blue-900/80 text-blue-200 border-blue-700";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "resolved":
        return "bg-emerald-950 text-emerald-300 border-emerald-800";
      case "investigating":
        return "bg-blue-950 text-blue-300 border-blue-800";
      case "acknowledged":
        return "bg-purple-950 text-purple-300 border-purple-800";
      case "false_positive":
        return "bg-zinc-800 text-zinc-400 border-zinc-700";
      default:
        return "bg-amber-950 text-amber-300 border-amber-800";
    }
  };

  const handleReview = async (status: "acknowledged" | "investigating" | "resolved" | "false_positive") => {
    if (!selectedAnomaly || !onReview) return;
    setSubmitting(true);
    try {
      await onReview(selectedAnomaly.id, status, reviewNotes || undefined);
      setSelectedAnomaly(null);
      setReviewNotes("");
    } catch (err) {
      console.error("Failed to review anomaly:", err);
    } finally {
      setSubmitting(false);
    }
  };

  if (compact) {
    return (
      <div className="space-y-2">
        {anomalies.length > 0 ? (
          anomalies.map((anomaly) => (
            <div
              key={anomaly.id}
              className="bg-zinc-900/70 border border-zinc-800 rounded-lg p-3 hover:border-zinc-700 transition-colors cursor-pointer"
              onClick={() => onViewDetails?.(anomaly)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-white text-sm capitalize truncate">
                      {anomaly.anomaly_type.replace(/_/g, " ")}
                    </h4>
                    <span className={`px-2 py-0.5 text-[11px] font-bold rounded border ${getSeverityColor(anomaly.severity)}`}>
                      {anomaly.severity.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 line-clamp-2">
                    {anomaly.explanation}
                  </p>
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(anomaly.detected_at).toLocaleString()}
                    </span>
                    <span>
                      Confidence: <span className="text-white font-medium">{Math.round(anomaly.confidence_score * 100)}%</span>
                    </span>
                  </div>
                </div>
                <span className={`px-2 py-0.5 text-[11px] rounded border ${getStatusColor(anomaly.status)} shrink-0`}>
                  {anomaly.status.replace(/_/g, " ")}
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center text-zinc-500 text-sm py-8">
            No anomalies detected
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-800/60 text-zinc-400 uppercase tracking-wider font-semibold">
              <tr>
                <th className="p-3">Detected</th>
                <th className="p-3">Type</th>
                <th className="p-3">Severity</th>
                <th className="p-3">Confidence</th>
                <th className="p-3">Explanation</th>
                <th className="p-3">Status</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {anomalies.length > 0 ? (
                anomalies.map((anomaly) => (
                  <tr key={anomaly.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="p-3 text-zinc-300 font-mono text-[11px] whitespace-nowrap">
                      {new Date(anomaly.detected_at).toLocaleString()}
                    </td>
                    <td className="p-3 font-semibold text-white capitalize">
                      {anomaly.anomaly_type.replace(/_/g, " ")}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 text-[11px] font-bold rounded border ${getSeverityColor(anomaly.severity)}`}>
                        {anomaly.severity.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-3 text-zinc-300 font-medium">
                      {Math.round(anomaly.confidence_score * 100)}%
                    </td>
                    <td className="p-3 text-zinc-400 max-w-md">
                      <div className="line-clamp-2">{anomaly.explanation}</div>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 text-[11px] rounded border capitalize ${getStatusColor(anomaly.status)}`}>
                        {anomaly.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onViewDetails?.(anomaly)}
                          className="p-1.5 text-zinc-400 hover:text-white transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {onReview && anomaly.status === "pending" && (
                          <button
                            onClick={() => setSelectedAnomaly(anomaly)}
                            className="px-2 py-1 text-[11px] bg-purple-600 hover:bg-purple-500 text-white rounded font-medium transition-colors"
                          >
                            Review
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-zinc-500">
                    No anomalies to display
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review Modal */}
      {selectedAnomaly && onReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">
                  Anomaly Review
                </span>
                <h3 className="text-base font-bold text-white mt-1 capitalize">
                  {selectedAnomaly.anomaly_type.replace(/_/g, " ")}
                </h3>
              </div>
              <span className={`px-2 py-0.5 text-xs font-bold rounded border ${getSeverityColor(selectedAnomaly.severity)}`}>
                {selectedAnomaly.severity.toUpperCase()}
              </span>
            </div>

            <div className="space-y-3">
              <div className="bg-zinc-800/50 p-3 rounded-lg border border-zinc-700/50">
                <p className="text-xs text-zinc-300">{selectedAnomaly.explanation}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-zinc-500">Detected:</span>
                  <p className="text-white font-mono text-[11px] mt-0.5">
                    {new Date(selectedAnomaly.detected_at).toLocaleString()}
                  </p>
                </div>
                <div>
                  <span className="text-zinc-500">Confidence:</span>
                  <p className="text-white font-medium mt-0.5">
                    {Math.round(selectedAnomaly.confidence_score * 100)}%
                  </p>
                </div>
              </div>

              {selectedAnomaly.camera_id && (
                <div className="text-xs">
                  <span className="text-zinc-500">Camera ID:</span>
                  <p className="text-white font-mono text-[11px] mt-0.5">{selectedAnomaly.camera_id}</p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Resolution Notes (Optional):
              </label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Enter any notes about this anomaly..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-purple-500 h-20 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setSelectedAnomaly(null);
                  setReviewNotes("");
                }}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleReview("false_positive")}
                className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 transition-colors disabled:opacity-50"
              >
                False Positive
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleReview("acknowledged")}
                className="px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded font-medium transition-colors disabled:opacity-50"
              >
                Acknowledge
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleReview("investigating")}
                className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded font-medium transition-colors disabled:opacity-50"
              >
                Investigate
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleReview("resolved")}
                className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium transition-colors disabled:opacity-50"
              >
                Resolve
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
