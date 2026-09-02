/**
 * Platform Capability Gate Component
 * 
 * Truthfully gates UI components and user actions based on authoritative platform maturity:
 * - PRODUCTION + HEALTHY: Render children normally
 * - PRODUCTION + DEGRADED: Render with degraded warning banner
 * - BETA: Render with BETA badge indicator
 * - EXPERIMENTAL: Render with EXPERIMENTAL badge if permitted
 * - NOT_IMPLEMENTED: Do NOT render actionable control; render non-actionable placeholder if requested
 */

import React from 'react';
import { useCapabilities } from '@/hooks/useCapabilities';
import { CapabilityMaturity, CapabilityRuntimeState } from '@/types/platform-capabilities';
import { CapabilityBadge } from './CapabilityBadge';

export interface PlatformCapabilityGateProps {
  /** Capability ID to check (e.g., "evidence.signed_export", "analytics.face_recognition") */
  capability: string;

  /** Actionable content to render when capability is permitted and operational */
  children: React.ReactNode;

  /** Optional custom fallback content when capability is not usable or not implemented */
  fallback?: React.ReactNode;

  /** Whether to render a disabled "Not Available in This Release" placeholder for admin/demo views */
  showPlaceholder?: boolean;

  /** Whether to automatically show a BETA or EXPERIMENTAL badge indicator beside children */
  showBadge?: boolean;

  /** Additional CSS class names */
  className?: string;
}

export function PlatformCapabilityGate({
  capability: capabilityId,
  children,
  fallback,
  showPlaceholder = false,
  showBadge = true,
  className = '',
}: PlatformCapabilityGateProps) {
  const { getCapability, canUse, loading } = useCapabilities();

  if (loading) {
    return <div className={`animate-pulse opacity-50 ${className}`}>{children}</div>;
  }

  const cap = getCapability(capabilityId);

  // 1. Unregistered or NOT_IMPLEMENTED capability -> Fail Closed
  if (!cap || cap.maturity === CapabilityMaturity.NOT_IMPLEMENTED) {
    if (fallback) return <>{fallback}</>;

    if (showPlaceholder) {
      return (
        <div
          className={`inline-flex items-center gap-2 p-2 rounded-lg border border-slate-700/50 bg-slate-900/40 text-slate-400 text-xs ${className}`}
        >
          <CapabilityBadge maturity={CapabilityMaturity.NOT_IMPLEMENTED} size="sm" />
          <span>{cap?.name || capabilityId} is not available in this release.</span>
        </div>
      );
    }

    return null;
  }

  // 2. Check operational usability
  const usable = canUse(capabilityId);

  // 3. Render EXPERIMENTAL capability
  if (cap.maturity === CapabilityMaturity.EXPERIMENTAL) {
    if (!usable) {
      return fallback ? <>{fallback}</> : null;
    }

    return (
      <div className={`relative inline-block ${className}`}>
        {showBadge && (
          <div className="mb-1 flex items-center gap-1.5">
            <CapabilityBadge maturity={CapabilityMaturity.EXPERIMENTAL} size="sm" />
            <span className="text-[10px] text-purple-400/80">Experimental Feature</span>
          </div>
        )}
        {children}
      </div>
    );
  }

  // 4. Render BETA capability
  if (cap.maturity === CapabilityMaturity.BETA) {
    if (!usable) {
      return fallback ? <>{fallback}</> : null;
    }

    return (
      <div className={`relative inline-block ${className}`}>
        {showBadge && (
          <div className="mb-1 flex items-center gap-1.5">
            <CapabilityBadge maturity={CapabilityMaturity.BETA} size="sm" />
            <span className="text-[10px] text-blue-400/80">Beta Feature</span>
          </div>
        )}
        {children}
      </div>
    );
  }

  // 5. Render PRODUCTION capability
  if (cap.maturity === CapabilityMaturity.PRODUCTION) {
    if (!usable) {
      if (cap.runtime.state === CapabilityRuntimeState.DEGRADED) {
        return (
          <div className={`relative ${className}`}>
            <div className="mb-1 text-[11px] text-amber-400 flex items-center gap-1">
              <CapabilityBadge runtimeState={CapabilityRuntimeState.DEGRADED} size="sm" />
              <span>{cap.runtime.reason || 'Operating with limited performance'}</span>
            </div>
            {children}
          </div>
        );
      }

      if (fallback) return <>{fallback}</>;
      return null;
    }

    // Fully operational
    return <div className={className}>{children}</div>;
  }

  return fallback ? <>{fallback}</> : null;
}
