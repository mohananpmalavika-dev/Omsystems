/**
 * Health Status Badge Component
 * Displays health status with icon and color
 */

import { HealthStatus, getHealthStatusIcon, getHealthStatusColor } from "@/lib/types/operational-health";

interface HealthStatusBadgeProps {
  status: HealthStatus;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function HealthStatusBadge({ status, size = 'md', showLabel = false }: HealthStatusBadgeProps) {
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5'
  };

  const bgColors = {
    healthy: 'bg-green-100 text-green-700 border-green-200',
    warning: 'bg-amber-100 text-amber-700 border-amber-200',
    critical: 'bg-red-100 text-red-700 border-red-200',
    unknown: 'bg-gray-100 text-gray-700 border-gray-200'
  };

  return (
    <span 
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${sizeClasses[size]} ${bgColors[status]}`}
    >
      <span>{getHealthStatusIcon(status)}</span>
      {showLabel && <span className="capitalize">{status}</span>}
    </span>
  );
}
