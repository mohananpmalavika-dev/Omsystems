/**
 * Certificate Security Card
 * Summary card for security dashboard showing certificate posture
 * Displays VALID/INVALID/UNKNOWN states with confidence indication
 */

import React from 'react';
import { Shield, AlertCircle, CheckCircle, HelpCircle, TrendingDown } from 'lucide-react';

export interface CertificateSecurityMetrics {
  available: boolean;
  state: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'UNKNOWN';
  confidence: number;
  score: number;
  reason: string;
  evidence: {
    totalCertificates: number;
    parsed: number;
    valid: number;
    invalid: number;
    unknown: number;
    expired: number;
    expiringSoon: number;
    revocationUnknown: number;
    chainUntrusted: number;
  };
  unavailableControls?: string[];
}

interface CertificateSecurityCardProps {
  metrics: CertificateSecurityMetrics;
  onClick?: () => void;
}

export const CertificateSecurityCard: React.FC<CertificateSecurityCardProps> = ({
  metrics,
  onClick
}) => {
  const getStateStyle = (state: string) => {
    switch (state) {
      case 'HEALTHY':
        return 'bg-green-50 border-green-200 text-green-900';
      case 'DEGRADED':
        return 'bg-yellow-50 border-yellow-200 text-yellow-900';
      case 'CRITICAL':
        return 'bg-red-50 border-red-200 text-red-900';
      case 'UNKNOWN':
        return 'bg-gray-50 border-gray-200 text-gray-900';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-900';
    }
  };

  const getStateIcon = (state: string) => {
    switch (state) {
      case 'HEALTHY':
        return <CheckCircle className="w-8 h-8 text-green-600" />;
      case 'DEGRADED':
        return <AlertCircle className="w-8 h-8 text-yellow-600" />;
      case 'CRITICAL':
        return <AlertCircle className="w-8 h-8 text-red-600" />;
      case 'UNKNOWN':
        return <HelpCircle className="w-8 h-8 text-gray-600" />;
      default:
        return <Shield className="w-8 h-8 text-gray-600" />;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'text-green-600';
    if (confidence >= 0.7) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (!metrics.available) {
    return (
      <div className="bg-white rounded-lg border-2 border-gray-200 p-6">
        <div className="flex items-center gap-4 mb-4">
          <Shield className="w-8 h-8 text-gray-400" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Certificate Security</h3>
            <p className="text-sm text-gray-600">Status Unavailable</p>
          </div>
        </div>
        <p className="text-sm text-gray-600">{metrics.reason}</p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border-2 p-6 cursor-pointer hover:shadow-lg transition-shadow ${getStateStyle(metrics.state)}`}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          {getStateIcon(metrics.state)}
          <div>
            <h3 className="text-lg font-semibold">Certificate Security</h3>
            <p className="text-sm opacity-80">{metrics.state}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold">{metrics.score}</div>
          <div className="text-xs opacity-70">Security Score</div>
        </div>
      </div>

      {/* Confidence Indicator */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-sm mb-1">
          <span>Assessment Confidence</span>
          <span className={`font-semibold ${getConfidenceColor(metrics.confidence)}`}>
            {(metrics.confidence * 100).toFixed(0)}%
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${
              metrics.confidence >= 0.9
                ? 'bg-green-500'
                : metrics.confidence >= 0.7
                ? 'bg-yellow-500'
                : 'bg-red-500'
            }`}
            style={{ width: `${metrics.confidence * 100}%` }}
          />
        </div>
      </div>

      {/* Reason */}
      <p className="text-sm mb-4 opacity-90">{metrics.reason}</p>

      {/* Certificate Breakdown */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white bg-opacity-60 rounded p-3">
          <div className="text-2xl font-bold text-green-700">
            {metrics.evidence.valid}
          </div>
          <div className="text-xs opacity-70">Valid</div>
        </div>
        <div className="bg-white bg-opacity-60 rounded p-3">
          <div className="text-2xl font-bold text-red-700">
            {metrics.evidence.invalid}
          </div>
          <div className="text-xs opacity-70">Invalid</div>
        </div>
        <div className="bg-white bg-opacity-60 rounded p-3">
          <div className="text-2xl font-bold text-yellow-700">
            {metrics.evidence.expiringSoon}
          </div>
          <div className="text-xs opacity-70">Expiring Soon</div>
        </div>
        <div className="bg-white bg-opacity-60 rounded p-3">
          <div className="text-2xl font-bold text-gray-700">
            {metrics.evidence.unknown}
          </div>
          <div className="text-xs opacity-70">Unknown</div>
        </div>
      </div>

      {/* Critical Issues */}
      {(metrics.evidence.expired > 0 || metrics.evidence.chainUntrusted > 0) && (
        <div className="bg-red-100 bg-opacity-50 rounded p-3 mb-4">
          <div className="flex items-center gap-2 text-sm font-medium text-red-900 mb-2">
            <AlertCircle className="w-4 h-4" />
            Critical Issues
          </div>
          <div className="space-y-1 text-xs text-red-800">
            {metrics.evidence.expired > 0 && (
              <div>• {metrics.evidence.expired} expired certificate(s)</div>
            )}
            {metrics.evidence.chainUntrusted > 0 && (
              <div>• {metrics.evidence.chainUntrusted} untrusted chain(s)</div>
            )}
          </div>
        </div>
      )}

      {/* Unavailable Controls Warning */}
      {metrics.unavailableControls && metrics.unavailableControls.length > 0 && (
        <div className="bg-yellow-100 bg-opacity-50 rounded p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-yellow-900 mb-2">
            <HelpCircle className="w-4 h-4" />
            Validation Limitations
          </div>
          <div className="space-y-1 text-xs text-yellow-800">
            {metrics.unavailableControls.includes('certificate_revocation_checking') && (
              <div>• Revocation checking not configured</div>
            )}
            {metrics.unavailableControls.includes('certificate_validation') && (
              <div>• Certificate validation incomplete</div>
            )}
          </div>
          <div className="mt-2 text-xs text-yellow-800 font-medium">
            Confidence reduced due to incomplete validation
          </div>
        </div>
      )}

      {/* Total Certificates */}
      <div className="mt-4 pt-4 border-t border-current border-opacity-20 text-sm opacity-70">
        Monitoring {metrics.evidence.totalCertificates} certificate(s)
      </div>
    </div>
  );
};

export default CertificateSecurityCard;
