"use client";

import { useState } from "react";
import {
  Sparkles,
  Clock,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Bell,
  Target,
  Zap,
} from "lucide-react";

interface PredictiveAlert {
  id: string;
  branch_id: string | null;
  alert_type: string;
  predicted_event: string;
  probability: number;
  predicted_time_window: string;
  recommendation: string;
  created_at: string;
  acknowledged: boolean;
}

interface PredictionCardProps {
  prediction: PredictiveAlert;
  onAcknowledge?: (predictionId: string) => Promise<void>;
  compact?: boolean;
}

export function PredictionCard({ 
  prediction, 
  onAcknowledge,
  compact = false 
}: PredictionCardProps) {
  const [acknowledging, setAcknowledging] = useState(false);

  const getProbabilityLevel = (prob: number) => {
    if (prob >= 0.8) return { label: "Very High", color: "red" };
    if (prob >= 0.7) return { label: "High", color: "orange" };
    if (prob >= 0.5) return { label: "Medium", color: "amber" };
    return { label: "Low", color: "blue" };
  };

  const handleAcknowledge = async () => {
    if (!onAcknowledge) return;
    setAcknowledging(true);
    try {
      await onAcknowledge(prediction.id);
    } catch (err) {
      console.error("Failed to acknowledge prediction:", err);
    } finally {
      setAcknowledging(false);
    }
  };

  const probLevel = getProbabilityLevel(prediction.probability);
  const probColors: Record<string, string> = {
    red: "bg-red-950/60 border-red-800 text-red-300",
    orange: "bg-orange-950/60 border-orange-800 text-orange-300",
    amber: "bg-amber-950/60 border-amber-800 text-amber-300",
    blue: "bg-blue-950/60 border-blue-800 text-blue-300",
  };

  if (compact) {
    return (
      <div className="bg-zinc-900/70 border border-zinc-800 rounded-lg p-3 hover:border-zinc-700 transition-all">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Sparkles className={`w-4 h-4 ${prediction.probability >= 0.7 ? "text-orange-400" : "text-purple-400"}`} />
            <h4 className="font-semibold text-white text-sm capitalize line-clamp-1">
              {prediction.predicted_event.replace(/_/g, " ")}
            </h4>
          </div>
          {!prediction.acknowledged && (
            <Bell className="w-4 h-4 text-amber-400 animate-pulse shrink-0" />
          )}
        </div>

        <div className="flex items-center gap-2 mb-2">
          <span className={`px-2 py-0.5 text-[11px] font-bold rounded border ${probColors[probLevel.color]}`}>
            {Math.round(prediction.probability * 100)}% {probLevel.label}
          </span>
          <span className="text-[11px] text-zinc-500">
            {prediction.predicted_time_window}
          </span>
        </div>

        <p className="text-xs text-zinc-400 line-clamp-2">
          💡 {prediction.recommendation}
        </p>

        {!prediction.acknowledged && onAcknowledge && (
          <button
            onClick={handleAcknowledge}
            disabled={acknowledging}
            className="mt-2 w-full px-2 py-1.5 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Acknowledge
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-5 shadow-sm hover:border-zinc-700 transition-all space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className={`w-5 h-5 ${prediction.probability >= 0.7 ? "text-orange-400 animate-pulse" : "text-purple-400"}`} />
            <h3 className="font-semibold text-white text-base capitalize">
              {prediction.predicted_event.replace(/_/g, " ")}
            </h3>
          </div>
          <p className="text-xs text-zinc-400">
            {prediction.alert_type.replace(/_/g, " ")} • Created {new Date(prediction.created_at).toLocaleString()}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className={`px-3 py-1.5 rounded-lg border text-sm font-bold ${probColors[probLevel.color]}`}>
            {Math.round(prediction.probability * 100)}%
          </div>
          {!prediction.acknowledged && (
            <Bell className="w-5 h-5 text-amber-400 animate-pulse" />
          )}
        </div>
      </div>

      {/* Probability Gauge */}
      <div>
        <div className="flex justify-between text-xs text-zinc-400 mb-1.5">
          <span>Threat Probability</span>
          <span className="font-medium text-white">{probLevel.label} Risk</span>
        </div>
        <div className="w-full bg-zinc-800 h-3 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              prediction.probability >= 0.8
                ? "bg-gradient-to-r from-red-600 to-red-500"
                : prediction.probability >= 0.7
                ? "bg-gradient-to-r from-orange-600 to-orange-500"
                : prediction.probability >= 0.5
                ? "bg-gradient-to-r from-amber-600 to-amber-500"
                : "bg-gradient-to-r from-blue-600 to-blue-500"
            }`}
            style={{ width: `${prediction.probability * 100}%` }}
          />
        </div>
      </div>

      {/* Details */}
      <div className="space-y-3 pt-3 border-t border-zinc-800">
        <div className="flex items-start gap-2">
          <Clock className="w-4 h-4 text-zinc-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <span className="text-xs text-zinc-500 block">Predicted Time Window</span>
            <span className="text-sm text-white font-medium">{prediction.predicted_time_window}</span>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <Target className="w-4 h-4 text-zinc-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <span className="text-xs text-zinc-500 block mb-1">AI Recommendation</span>
            <p className="text-xs text-zinc-300 bg-zinc-800/50 p-3 rounded border border-zinc-700/50">
              💡 {prediction.recommendation}
            </p>
          </div>
        </div>
      </div>

      {/* Action Button */}
      {!prediction.acknowledged && onAcknowledge && (
        <div className="pt-3 border-t border-zinc-800">
          <button
            onClick={handleAcknowledge}
            disabled={acknowledging}
            className="w-full px-4 py-2.5 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
          >
            <CheckCircle2 className="w-4 h-4" />
            {acknowledging ? "Acknowledging..." : "Acknowledge Prediction"}
          </button>
        </div>
      )}

      {prediction.acknowledged && (
        <div className="pt-3 border-t border-zinc-800">
          <div className="flex items-center justify-center gap-2 text-xs text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            <span className="font-medium">Acknowledged by Security Team</span>
          </div>
        </div>
      )}
    </div>
  );
}

interface PredictionGridProps {
  predictions: PredictiveAlert[];
  onAcknowledge?: (predictionId: string) => Promise<void>;
  maxItems?: number;
}

export function PredictionGrid({ 
  predictions, 
  onAcknowledge,
  maxItems 
}: PredictionGridProps) {
  const displayPredictions = maxItems ? predictions.slice(0, maxItems) : predictions;

  if (displayPredictions.length === 0) {
    return (
      <div className="bg-zinc-900/50 border border-dashed border-zinc-800 p-12 rounded-xl text-center text-zinc-500">
        <Sparkles className="w-12 h-12 mx-auto mb-3 text-zinc-600" />
        <p>No predictive alerts generated yet.</p>
        <p className="text-xs mt-1">System requires sufficient baseline data to generate forecasts.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {displayPredictions.map((prediction) => (
        <PredictionCard
          key={prediction.id}
          prediction={prediction}
          onAcknowledge={onAcknowledge}
        />
      ))}
    </div>
  );
}
