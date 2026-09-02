/**
 * Authoritative Capability Badge Component
 * 
 * Renders visual indicators for:
 * 1. Platform Maturity: PRODUCTION | BETA | EXPERIMENTAL | NOT_IMPLEMENTED
 * 2. Runtime State: HEALTHY | DEGRADED | DOWN | NOT_CONFIGURED | DISABLED | UNKNOWN
 * 3. Device Support: SUPPORTED | UNSUPPORTED | DEGRADED | UNAVAILABLE
 */

import React from 'react';
import {
  CapabilityMaturity,
  CapabilityRuntimeState,
  DeviceCapabilityState,
} from '@/types/platform-capabilities';

export type BadgeType = 'maturity' | 'runtime' | 'device';

export interface CapabilityBadgeProps {
  /** Type of badge to render */
  type?: BadgeType;

  /** Platform maturity level (when type is 'maturity') */
  maturity?: CapabilityMaturity | string;

  /** Runtime state (when type is 'runtime') */
  runtimeState?: CapabilityRuntimeState | string;

  /** Device capability state (when type is 'device') */
  state?: DeviceCapabilityState | string;

  /** Custom label override */
  label?: string;

  /** Whether the capability is available (device mode) */
  available?: boolean;

  /** Verification level (device mode) */
  verificationLevel?: 'DISCOVERED' | 'DECLARED' | 'VERIFIED' | string;

  /** Confidence score (0-1) (device mode) */
  confidence?: number;

  /** Show verification badge (device mode) */
  showVerification?: boolean;

  /** Show confidence score (device mode) */
  showConfidence?: boolean;

  /** Size variant */
  size?: 'sm' | 'md' | 'lg';

  /** Show icon indicator */
  showIcon?: boolean;

  /** Additional CSS class names */
  className?: string;
}

export function CapabilityBadge({
  type = 'maturity',
  maturity,
  runtimeState,
  state,
  label,
  available = true,
  verificationLevel,
  confidence,
  showVerification,
  showConfidence,
  size = 'md',
  showIcon = true,
  className = '',
}: CapabilityBadgeProps) {
  // If maturity is passed directly without specifying type, treat as maturity badge
  const effectiveType: BadgeType = maturity ? 'maturity' : runtimeState ? 'runtime' : type;

  let badgeLabel = label || '';
  let colorClasses = '';
  let icon = '';

  if (effectiveType === 'maturity') {
    const mat = (maturity || 'NOT_IMPLEMENTED').toUpperCase();
    badgeLabel = label || formatMaturityLabel(mat);

    switch (mat) {
      case CapabilityMaturity.PRODUCTION:
      case 'PRODUCTION':
        colorClasses = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
        icon = '●';
        break;
      case CapabilityMaturity.BETA:
      case 'BETA':
        colorClasses = 'bg-blue-500/10 text-blue-400 border-blue-500/30';
        icon = 'β';
        break;
      case CapabilityMaturity.EXPERIMENTAL:
      case 'EXPERIMENTAL':
        colorClasses = 'bg-purple-500/10 text-purple-400 border-purple-500/30';
        icon = '⚗';
        break;
      case CapabilityMaturity.NOT_IMPLEMENTED:
      case 'NOT_IMPLEMENTED':
      default:
        colorClasses = 'bg-slate-500/10 text-slate-400 border-slate-500/30';
        icon = '—';
        break;
    }
  } else if (effectiveType === 'runtime') {
    const rt = (runtimeState || 'UNKNOWN').toUpperCase();
    badgeLabel = label || formatRuntimeLabel(rt);

    switch (rt) {
      case CapabilityRuntimeState.HEALTHY:
      case 'HEALTHY':
        colorClasses = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
        icon = '✓';
        break;
      case CapabilityRuntimeState.DEGRADED:
      case 'DEGRADED':
        colorClasses = 'bg-amber-500/10 text-amber-400 border-amber-500/30';
        icon = '⚠';
        break;
      case CapabilityRuntimeState.DOWN:
      case 'DOWN':
        colorClasses = 'bg-rose-500/10 text-rose-400 border-rose-500/30';
        icon = '✗';
        break;
      case CapabilityRuntimeState.NOT_CONFIGURED:
      case 'NOT_CONFIGURED':
        colorClasses = 'bg-slate-500/10 text-slate-400 border-slate-500/30';
        icon = '⚙';
        break;
      case CapabilityRuntimeState.DISABLED:
      case 'DISABLED':
        colorClasses = 'bg-slate-500/10 text-slate-500 border-slate-500/30';
        icon = '⊘';
        break;
      case CapabilityRuntimeState.UNKNOWN:
      case 'UNKNOWN':
      default:
        colorClasses = 'bg-slate-500/10 text-slate-400 border-slate-500/30';
        icon = '?';
        break;
    }
  } else {
    // Device support mode
    const devState = (state || 'UNKNOWN').toUpperCase();
    badgeLabel = label || devState;

    if (devState === 'SUPPORTED' && available) {
      colorClasses = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      icon = '✓';
    } else if (devState === 'SUPPORTED' && !available) {
      colorClasses = 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      icon = '⚠';
    } else if (devState === 'DEGRADED') {
      colorClasses = 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      icon = '⚡';
    } else if (devState === 'UNSUPPORTED') {
      colorClasses = 'bg-slate-500/10 text-slate-500 border-slate-500/30';
      icon = '✗';
    } else {
      colorClasses = 'bg-slate-500/10 text-slate-400 border-slate-500/30';
      icon = '?';
    }
  }

  const sizeClasses = getSizeClasses(size);

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium border rounded-full ${sizeClasses.padding} ${sizeClasses.text} ${colorClasses} ${className}`}
    >
      {showIcon && <span className={sizeClasses.icon}>{icon}</span>}
      <span>{badgeLabel}</span>
      {showVerification && verificationLevel && (
        <span className="text-[9px] px-1 py-0.2 bg-black/20 rounded font-mono uppercase opacity-75">
          {verificationLevel}
        </span>
      )}
      {showConfidence && confidence !== undefined && (
        <span className="text-[9px] px-1 py-0.2 bg-black/20 rounded font-mono opacity-75">
          {Math.round(confidence * 100)}%
        </span>
      )}
    </span>
  );
}

function formatMaturityLabel(maturity: string): string {
  switch (maturity) {
    case 'PRODUCTION':
      return 'Production';
    case 'BETA':
      return 'Beta';
    case 'EXPERIMENTAL':
      return 'Experimental';
    case 'NOT_IMPLEMENTED':
      return 'Not Implemented';
    default:
      return maturity;
  }
}

function formatRuntimeLabel(runtime: string): string {
  switch (runtime) {
    case 'HEALTHY':
      return 'Healthy';
    case 'DEGRADED':
      return 'Degraded';
    case 'DOWN':
      return 'Down';
    case 'NOT_CONFIGURED':
      return 'Not Configured';
    case 'DISABLED':
      return 'Disabled';
    case 'UNKNOWN':
      return 'Unknown';
    default:
      return runtime;
  }
}

function getSizeClasses(size: 'sm' | 'md' | 'lg') {
  switch (size) {
    case 'sm':
      return {
        padding: 'px-2 py-0.5',
        text: 'text-xs',
        icon: 'text-xs',
      };
    case 'lg':
      return {
        padding: 'px-3.5 py-1.5',
        text: 'text-sm font-semibold',
        icon: 'text-sm',
      };
    case 'md':
    default:
      return {
        padding: 'px-2.5 py-1',
        text: 'text-xs font-medium',
        icon: 'text-xs',
      };
  }
}
