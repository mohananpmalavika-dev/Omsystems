/**
 * Banking Analytics Dashboard
 * 
 * Main dashboard for cash van monitoring with:
 * - Active sessions list with real-time status
 * - Violation alerts and criticality indicators
 * - Session timeline and state visualization
 * - Summary statistics and trends
 */

import React, { useState, useEffect } from 'react';
import {
  Shield,
  Truck,
  Users,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  MapPin,
  Activity,
  FileText,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface CashVanSession {
  sessionId: string;
  tenantId: string;
  branchId: string;
  monitorId: string;
  state: string;
  assessment: 'compliant' | 'non_compliant' | 'suspicious' | 'in_progress' | 'insufficient_evidence';
  confidence: number;
  vehicle?: {
    trackId: string;
    plate?: string;
    authorized: boolean;
  };
  personnel: {
    observed: number;
    identified: number;
    guards: number;
  };
  violations: Array<{
    code: string;
    name: string;
    severity: string;
    message: string;
    detectedAt: string;
  }>;
  startedAt: string;
  lastUpdatedAt: string;
  evidenceAvailable: string[];
}

interface BankingSummary {
  activeSessions: number;
  completedSessions: number;
  compliantSessions: number;
  suspiciousSessions: number;
  nonCompliantSessions: number;
  totalViolations: number;
  criticalViolations: number;
  highViolations: number;
}

// ============================================================================
// Main Dashboard Component
// ============================================================================

export const BankingAnalyticsDashboard: React.FC = () => {
  const [sessions, setSessions] = useState<CashVanSession[]>([]);
  const [summary, setSummary] = useState<BankingSummary | null>(null);
  const [selectedSession, setSelectedSession] = useState<CashVanSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'history' | 'violations'>('active');

  useEffect(() => {
    loadData();
    
    // Refresh every 5 seconds
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [activeTab]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load sessions
      const sessionsParams = new URLSearchParams({
        tenantId: 'default', // Get from context
        activeOnly: activeTab === 'active' ? 'true' : 'false',
      });
      
      const sessionsResponse = await fetch(`/v1/banking/sessions?${sessionsParams}`);
      const sessionsData = await sessionsResponse.json();
      setSessions(sessionsData.data || []);

      // Load summary
      const summaryResponse = await fetch('/v1/banking/sessions/summary?tenantId=default');
      const summaryData = await summaryResponse.json();
      setSummary(summaryData.data || null);
    } catch (error) {
      console.error('Failed to load banking analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
          <Shield className="w-8 h-8 text-blue-600" />
          Banking Analytics
        </h1>
        <p className="text-gray-600 mt-1">Cash van monitoring and compliance tracking</p>
      </div>

      {/* Summary Cards */}
      {summary && <SummaryCards summary={summary} />}

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm mb-6">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('active')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'active'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Activity className="w-4 h-4 inline mr-2" />
              Active Sessions
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'history'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Clock className="w-4 h-4 inline mr-2" />
              History
            </button>
            <button
              onClick={() => setActiveTab('violations')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'violations'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <AlertTriangle className="w-4 h-4 inline mr-2" />
              Violations
              {summary && summary.totalViolations > 0 && (
                <span className="ml-2 bg-red-100 text-red-800 text-xs font-medium px-2 py-0.5 rounded-full">
                  {summary.totalViolations}
                </span>
              )}
            </button>
          </nav>
        </div>
      </div>

      {/* Sessions List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SessionsList
            sessions={sessions}
            loading={loading}
            onSelectSession={setSelectedSession}
            selectedSessionId={selectedSession?.sessionId}
          />
        </div>

        {/* Session Details Sidebar */}
        <div className="lg:col-span-1">
          {selectedSession ? (
            <SessionDetails session={selectedSession} />
          ) : (
            <div className="bg-white rounded-lg shadow-sm p-6 text-center text-gray-500">
              Select a session to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Summary Cards Component
// ============================================================================

const SummaryCards: React.FC<{ summary: BankingSummary }> = ({ summary }) => {
  const cards = [
    {
      label: 'Active Sessions',
      value: summary.activeSessions,
      icon: Activity,
      color: 'blue',
    },
    {
      label: 'Compliant',
      value: summary.compliantSessions,
      icon: CheckCircle,
      color: 'green',
    },
    {
      label: 'Suspicious',
      value: summary.suspiciousSessions,
      icon: AlertTriangle,
      color: 'yellow',
    },
    {
      label: 'Violations',
      value: summary.totalViolations,
      icon: XCircle,
      color: 'red',
      subtitle: `${summary.criticalViolations} critical`,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card, index) => (
        <div key={index} className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">{card.label}</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{card.value}</p>
              {card.subtitle && (
                <p className="text-sm text-gray-500 mt-1">{card.subtitle}</p>
              )}
            </div>
            <card.icon
              className={`w-12 h-12 text-${card.color}-500 opacity-80`}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

// ============================================================================
// Sessions List Component
// ============================================================================

const SessionsList: React.FC<{
  sessions: CashVanSession[];
  loading: boolean;
  onSelectSession: (session: CashVanSession) => void;
  selectedSessionId?: string;
}> = ({ sessions, loading, onSelectSession, selectedSessionId }) => {
  if (loading && sessions.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="text-gray-600 mt-4">Loading sessions...</p>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6 text-center">
        <Truck className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600">No sessions found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sessions.map((session) => (
        <SessionCard
          key={session.sessionId}
          session={session}
          isSelected={session.sessionId === selectedSessionId}
          onClick={() => onSelectSession(session)}
        />
      ))}
    </div>
  );
};

// ============================================================================
// Session Card Component
// ============================================================================

const SessionCard: React.FC<{
  session: CashVanSession;
  isSelected: boolean;
  onClick: () => void;
}> = ({ session, isSelected, onClick }) => {
  const assessmentColors = {
    compliant: 'bg-green-100 text-green-800',
    suspicious: 'bg-yellow-100 text-yellow-800',
    non_compliant: 'bg-red-100 text-red-800',
    in_progress: 'bg-blue-100 text-blue-800',
    insufficient_evidence: 'bg-gray-100 text-gray-800',
  };

  const stateLabels: Record<string, string> = {
    expected: 'Expected',
    vehicle_detected: 'Vehicle Detected',
    vehicle_verified: 'Vehicle Verified',
    personnel_verification: 'Verifying Personnel',
    escort_verified: 'Escort Verified',
    unloading: 'Unloading',
    secure_zone_entry: 'Secure Zone',
    transfer_complete: 'Complete',
    departed: 'Departed',
    violation: 'Violation',
    expired: 'Expired',
  };

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-lg shadow-sm p-6 cursor-pointer transition-all ${
        isSelected ? 'ring-2 ring-blue-500' : 'hover:shadow-md'
      }`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <Truck className="w-6 h-6 text-gray-600" />
          <div>
            <h3 className="font-semibold text-gray-900">
              {session.vehicle?.plate || 'Unknown Vehicle'}
            </h3>
            <p className="text-sm text-gray-500">
              Session {session.sessionId.slice(0, 8)}
            </p>
          </div>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-xs font-medium ${
            assessmentColors[session.assessment]
          }`}
        >
          {session.assessment.replace('_', ' ').toUpperCase()}
        </span>
      </div>

      {/* State Progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-gray-600">State:</span>
          <span className="font-medium text-gray-900">
            {stateLabels[session.state] || session.state}
          </span>
        </div>
      </div>

      {/* Personnel Info */}
      <div className="flex items-center gap-4 text-sm text-gray-600 mb-4">
        <div className="flex items-center gap-1">
          <Users className="w-4 h-4" />
          <span>{session.personnel.observed} personnel</span>
        </div>
        <div className="flex items-center gap-1">
          <Shield className="w-4 h-4" />
          <span>{session.personnel.guards} guards</span>
        </div>
      </div>

      {/* Violations */}
      {session.violations.length > 0 && (
        <div className="border-t border-gray-200 pt-4">
          <div className="flex items-center gap-2 text-red-600 text-sm font-medium">
            <AlertTriangle className="w-4 h-4" />
            <span>{session.violations.length} violation(s)</span>
          </div>
          <ul className="mt-2 space-y-1">
            {session.violations.slice(0, 2).map((violation, index) => (
              <li key={index} className="text-sm text-gray-600 truncate">
                • {violation.name}
              </li>
            ))}
            {session.violations.length > 2 && (
              <li className="text-sm text-gray-500 italic">
                +{session.violations.length - 2} more
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Timestamp */}
      <div className="text-xs text-gray-500 mt-4">
        Started {new Date(session.startedAt).toLocaleString()}
      </div>
    </div>
  );
};

// ============================================================================
// Session Details Component
// ============================================================================

const SessionDetails: React.FC<{ session: CashVanSession }> = ({ session }) => {
  const [evidencePackage, setEvidencePackage] = useState<any>(null);
  const [loadingEvidence, setLoadingEvidence] = useState(false);

  const generateEvidence = async () => {
    try {
      setLoadingEvidence(true);
      const response = await fetch(
        `/v1/banking/sessions/${session.sessionId}/evidence`,
        { method: 'POST' }
      );
      const data = await response.json();
      setEvidencePackage(data.data);
    } catch (error) {
      console.error('Failed to generate evidence:', error);
    } finally {
      setLoadingEvidence(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h3 className="text-lg font-bold text-gray-900 mb-4">Session Details</h3>

      {/* Vehicle Info */}
      {session.vehicle && (
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Vehicle</h4>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Plate:</span>
              <span className="font-medium">{session.vehicle.plate || 'N/A'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Authorized:</span>
              <span
                className={`font-medium ${
                  session.vehicle.authorized ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {session.vehicle.authorized ? 'Yes' : 'No'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Personnel Info */}
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Personnel</h4>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Observed:</span>
            <span className="font-medium">{session.personnel.observed}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Identified:</span>
            <span className="font-medium">{session.personnel.identified}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Guards:</span>
            <span className="font-medium">{session.personnel.guards}</span>
          </div>
        </div>
      </div>

      {/* Violations */}
      {session.violations.length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Violations</h4>
          <ul className="space-y-2">
            {session.violations.map((violation, index) => (
              <li
                key={index}
                className="p-3 bg-red-50 rounded-lg border border-red-200"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-900">
                      {violation.name}
                    </p>
                    <p className="text-xs text-red-700 mt-1">
                      {violation.message}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(violation.detectedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Evidence */}
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Evidence Available</h4>
        <div className="flex flex-wrap gap-2">
          {session.evidenceAvailable.map((evidence) => (
            <span
              key={evidence}
              className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded"
            >
              {evidence.replace('_', ' ')}
            </span>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <button
          onClick={generateEvidence}
          disabled={loadingEvidence}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <FileText className="w-4 h-4" />
          {loadingEvidence ? 'Generating...' : 'Generate Evidence Package'}
        </button>

        {evidencePackage && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-800">
              Evidence package generated successfully
            </p>
            <p className="text-xs text-gray-600 mt-1">
              {evidencePackage.totalClips} clips, {evidencePackage.totalSnapshots}{' '}
              snapshots
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default BankingAnalyticsDashboard;
