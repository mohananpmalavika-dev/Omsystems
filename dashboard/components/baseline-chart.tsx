"use client";

import { useMemo } from "react";
import {
  BarChart3,
  TrendingUp,
  Target,
  Activity,
  Clock,
  Calendar,
} from "lucide-react";

interface BehaviorBaseline {
  id: string;
  branch_id: string | null;
  camera_id: string | null;
  pattern_type: string;
  time_window: string;
  learned_features: Record<string, any>;
  confidence_score: number;
  sample_size: number;
  created_at: string;
  updated_at: string;
}

interface BaselineChartProps {
  baselines: BehaviorBaseline[];
  groupBy?: "pattern_type" | "time_window" | "confidence";
  showDetails?: boolean;
}

export function BaselineChart({ 
  baselines, 
  groupBy = "pattern_type",
  showDetails = false 
}: BaselineChartProps) {
  const chartData = useMemo(() => {
    if (groupBy === "pattern_type") {
      const grouped = baselines.reduce((acc, baseline) => {
        const type = baseline.pattern_type;
        if (!acc[type]) {
          acc[type] = {
            count: 0,
            totalConfidence: 0,
            totalSamples: 0,
          };
        }
        acc[type].count++;
        acc[type].totalConfidence += baseline.confidence_score;
        acc[type].totalSamples += baseline.sample_size;
        return acc;
      }, {} as Record<string, { count: number; totalConfidence: number; totalSamples: number }>);

      return Object.entries(grouped).map(([type, data]) => ({
        label: type.replace(/_/g, " "),
        count: data.count,
        avgConfidence: data.totalConfidence / data.count,
        totalSamples: data.totalSamples,
      }));
    }

    if (groupBy === "time_window") {
      const grouped = baselines.reduce((acc, baseline) => {
        const window = baseline.time_window;
        if (!acc[window]) {
          acc[window] = {
            count: 0,
            totalConfidence: 0,
            totalSamples: 0,
          };
        }
        acc[window].count++;
        acc[window].totalConfidence += baseline.confidence_score;
        acc[window].totalSamples += baseline.sample_size;
        return acc;
      }, {} as Record<string, { count: number; totalConfidence: number; totalSamples: number }>);

      return Object.entries(grouped).map(([window, data]) => ({
        label: window,
        count: data.count,
        avgConfidence: data.totalConfidence / data.count,
        totalSamples: data.totalSamples,
      }));
    }

    // Group by confidence ranges
    const ranges = [
      { min: 0, max: 0.5, label: "Low (< 50%)" },
      { min: 0.5, max: 0.7, label: "Medium (50-70%)" },
      { min: 0.7, max: 0.85, label: "High (70-85%)" },
      { min: 0.85, max: 1, label: "Very High (> 85%)" },
    ];

    return ranges.map((range) => {
      const filtered = baselines.filter(
        (b) => b.confidence_score >= range.min && b.confidence_score < range.max
      );
      return {
        label: range.label,
        count: filtered.length,
        avgConfidence: filtered.length > 0
          ? filtered.reduce((sum, b) => sum + b.confidence_score, 0) / filtered.length
          : 0,
        totalSamples: filtered.reduce((sum, b) => sum + b.sample_size, 0),
      };
    });
  }, [baselines, groupBy]);

  const maxCount = Math.max(...chartData.map((d) => d.count), 1);

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.85) return "from-emerald-600 to-emerald-500";
    if (confidence >= 0.7) return "from-cyan-600 to-cyan-500";
    if (confidence >= 0.5) return "from-amber-600 to-amber-500";
    return "from-zinc-600 to-zinc-500";
  };

  if (baselines.length === 0) {
    return (
      <div className="bg-zinc-900/50 border border-dashed border-zinc-800 p-12 rounded-xl text-center text-zinc-500">
        <BarChart3 className="w-12 h-12 mx-auto mb-3 text-zinc-600" />
        <p>No behavioral baselines established yet.</p>
        <p className="text-xs mt-1">System is collecting data to learn normal patterns.</p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-5 shadow-sm space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-indigo-400" />
          <h3 className="text-base font-semibold text-white">Learned Behavioral Baselines</h3>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-zinc-500">Group by:</span>
          <span className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-zinc-300 capitalize">
            {groupBy.replace(/_/g, " ")}
          </span>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-zinc-800/40 border border-zinc-800 p-3 rounded-lg">
          <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
            <Target className="w-3.5 h-3.5" />
            <span>Total Patterns</span>
          </div>
          <div className="text-xl font-bold text-white">{baselines.length}</div>
        </div>

        <div className="bg-zinc-800/40 border border-zinc-800 p-3 rounded-lg">
          <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Avg Confidence</span>
          </div>
          <div className="text-xl font-bold text-white">
            {Math.round(
              (baselines.reduce((sum, b) => sum + b.confidence_score, 0) / baselines.length) * 100
            )}%
          </div>
        </div>

        <div className="bg-zinc-800/40 border border-zinc-800 p-3 rounded-lg">
          <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
            <Activity className="w-3.5 h-3.5" />
            <span>Total Samples</span>
          </div>
          <div className="text-xl font-bold text-white">
            {baselines.reduce((sum, b) => sum + b.sample_size, 0).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Bar Chart */}
      <div className="space-y-3">
        {chartData.map((item, index) => (
          <div key={index} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-300 font-medium capitalize">{item.label}</span>
              <div className="flex items-center gap-3 text-zinc-500">
                <span>{item.count} patterns</span>
                <span className="text-white font-semibold">
                  {Math.round(item.avgConfidence * 100)}%
                </span>
              </div>
            </div>

            <div className="relative">
              <div className="w-full bg-zinc-800 h-8 rounded-lg overflow-hidden">
                <div
                  className={`h-full bg-gradient-to-r ${getConfidenceColor(item.avgConfidence)} transition-all duration-500 flex items-center px-3`}
                  style={{ width: `${(item.count / maxCount) * 100}%` }}
                >
                  {item.count > 0 && (
                    <span className="text-xs font-semibold text-white">
                      {item.count}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {showDetails && item.totalSamples > 0 && (
              <div className="flex items-center gap-2 text-[11px] text-zinc-500 pl-1">
                <Clock className="w-3 h-3" />
                <span>{item.totalSamples.toLocaleString()} total samples</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="pt-4 border-t border-zinc-800">
        <div className="flex items-center justify-between text-[11px] text-zinc-500">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-gradient-to-r from-emerald-600 to-emerald-500" />
              <span>&gt; 85%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-gradient-to-r from-cyan-600 to-cyan-500" />
              <span>70-85%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-gradient-to-r from-amber-600 to-amber-500" />
              <span>50-70%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-gradient-to-r from-zinc-600 to-zinc-500" />
              <span>&lt; 50%</span>
            </div>
          </div>
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            Last updated: {new Date(baselines[0]?.updated_at || new Date()).toLocaleDateString()}
          </span>
        </div>
      </div>
    </div>
  );
}

interface BaselineGridProps {
  baselines: BehaviorBaseline[];
  maxItems?: number;
}

export function BaselineGrid({ baselines, maxItems }: BaselineGridProps) {
  const displayBaselines = maxItems ? baselines.slice(0, maxItems) : baselines;

  if (displayBaselines.length === 0) {
    return (
      <div className="bg-zinc-900/50 border border-dashed border-zinc-800 p-12 rounded-xl text-center text-zinc-500">
        <BarChart3 className="w-12 h-12 mx-auto mb-3 text-zinc-600" />
        <p>No behavioral baselines established yet.</p>
        <p className="text-xs mt-1">System is collecting data to learn normal patterns.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {displayBaselines.map((baseline) => (
        <div
          key={baseline.id}
          className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-4 shadow-sm hover:border-zinc-700 transition-all space-y-3"
        >
          <div>
            <h4 className="font-semibold text-white text-sm capitalize mb-1">
              {baseline.pattern_type.replace(/_/g, " ")}
            </h4>
            <p className="text-xs text-zinc-400">
              Window: {baseline.time_window}
            </p>
          </div>

          <div className="space-y-2">
            <div>
              <div className="flex justify-between text-xs text-zinc-400 mb-1">
                <span>Confidence</span>
                <span className="text-white font-medium">
                  {Math.round(baseline.confidence_score * 100)}%
                </span>
              </div>
              <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    baseline.confidence_score >= 0.85
                      ? "bg-emerald-500"
                      : baseline.confidence_score >= 0.7
                      ? "bg-cyan-500"
                      : baseline.confidence_score >= 0.5
                      ? "bg-amber-500"
                      : "bg-zinc-500"
                  }`}
                  style={{ width: `${baseline.confidence_score * 100}%` }}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-zinc-800 text-xs">
            <div>
              <span className="text-zinc-500 block">Samples</span>
              <span className="font-semibold text-white text-sm">
                {baseline.sample_size.toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block">Features</span>
              <span className="font-semibold text-white text-sm">
                {Object.keys(baseline.learned_features).length}
              </span>
            </div>
          </div>

          <div className="text-[11px] text-zinc-500 pt-2 border-t border-zinc-800 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Updated {new Date(baseline.updated_at).toLocaleDateString()}
          </div>
        </div>
      ))}
    </div>
  );
}
