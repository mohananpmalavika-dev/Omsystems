/**
 * Health Score Ring Component
 * Circular progress indicator for health scores
 */

import { getHealthStatusFromScore, getHealthStatusColor } from "@/lib/types/operational-health";

interface HealthScoreRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
}

export function HealthScoreRing({ 
  score, 
  size = 80, 
  strokeWidth = 8,
  showLabel = true 
}: HealthScoreRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;
  const status = getHealthStatusFromScore(score);
  const color = getHealthStatusColor(status);

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold" style={{ color }}>
            {Math.round(score)}
          </span>
          <span className="text-xs text-gray-500">score</span>
        </div>
      )}
    </div>
  );
}
