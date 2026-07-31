/**
 * Enterprise Security Dashboard Component
 * Real-time security posture monitoring and alerts
 */

'use client';

import { useEffect, useState } from 'react';
import {
  Shield,
  Lock,
  Key,
  FileText,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp,
  TrendingDown,
  Activity,
  Database,
  Wifi,
  HardDrive,
  Menu,
  X,
  Home,
  Settings,
  Users,
  Server,
  Eye,
  Zap,
  Clock,
  History,
  FileSearch,
  Layers,
  ShieldAlert
} from 'lucide-react';

interface SecurityPosture {
  overallScore: number;
  timestamp: string;
  metrics: {
    zeroTrust: {
      score: number;
      devicesCompliant: number;
      devicesTotal: number;
      highRiskSessions: number;
    };
    encryption: {
      score: number;
      videosEncrypted: number;
      videosTotal: number;
      tlsCompliance: number;
    };
    certificates: {
      score: number;
      healthy: number;
      expiringSoon: number;
      expired: number;
      revoked: number;
    };
    secrets: {
      status: string;
      rotationCompliance: number;
      expiring: number;
    };
    ransomware: {
      activeThreats: number;
      eventsToday: number;
      riskLevel: string;
    };
    tamper: {
      activeEvents: number;
      criticalEvents: number;
      resolvedToday: number;
    };
    secureBoot: {
      score: number;
      compliantDevices: number;
      totalDevices: number;
    };
    tpm: {
      score: number;
      attestedDevices: number;
      totalDevices: number;
      failedAttestations: number;
    };
  };
  alerts: Array<{
    id: string;
    type: string;
    severity: string;
    title: string;
    timestamp: string;
    acknowledged: boolean;
  }>;
}

export default function SecurityDashboard() {
  const [posture, setPosture] = useState<SecurityPosture | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    fetchSecurityPosture();
    const interval = setInterval(fetchSecurityPosture, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  const fetchSecurityPosture = async () => {
    try {
      const response = await fetch('/api/security/posture');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      setPosture(data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch security posture:', error);
      setLoading(false);
      // Set fallback data so component doesn't crash
      setPosture({
        overallScore: 0,
        timestamp: new Date().toISOString(),
        metrics: {
          zeroTrust: {
            score: 0,
            devicesCompliant: 0,
            devicesTotal: 0,
            highRiskSessions: 0,
          },
          encryption: {
            score: 0,
            videosEncrypted: 0,
            videosTotal: 0,
            tlsCompliance: 0,
          },
          certificates: {
            score: 0,
            healthy: 0,
            expiringSoon: 0,
            expired: 0,
            revoked: 0,
          },
          secrets: {
            status: 'Unknown',
            rotationCompliance: 0,
            expiring: 0,
          },
          ransomware: {
            activeThreats: 0,
            eventsToday: 0,
            riskLevel: 'Unknown',
          },
          tamper: {
            activeEvents: 0,
            criticalEvents: 0,
            resolvedToday: 0,
          },
          secureBoot: {
            score: 0,
            compliantDevices: 0,
            totalDevices: 0,
          },
          tpm: {
            score: 0,
            attestedDevices: 0,
            totalDevices: 0,
            failedAttestations: 0,
          },
        },
        alerts: [],
      });
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 95) return 'text-green-500';
    if (score >= 90) return 'text-blue-500';
    if (score >= 80) return 'text-yellow-500';
    if (score >= 70) return 'text-orange-500';
    return 'text-red-500';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 95) return 'bg-green-500';
    if (score >= 90) return 'bg-blue-500';
    if (score >= 80) return 'bg-yellow-500';
    if (score >= 70) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'text-red-500 bg-red-50 border-red-200';
      case 'HIGH': return 'text-orange-500 bg-orange-50 border-orange-200';
      case 'MEDIUM': return 'text-yellow-500 bg-yellow-50 border-yellow-200';
      case 'LOW': return 'text-blue-500 bg-blue-50 border-blue-200';
      default: return 'text-gray-500 bg-gray-50 border-gray-200';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!posture) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-12 h-12 mx-auto text-yellow-500 mb-4" />
        <p className="text-gray-600">Failed to load security posture</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Left Sidebar */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-0'} transition-all duration-300 ease-in-out bg-white border-r border-gray-200 overflow-hidden`}>
        <div className="flex flex-col h-full">
          {/* Sidebar Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Shield className="w-6 h-6 text-blue-600" />
              <span className="font-bold text-gray-900">Security</span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          {/* Navigation Menu */}
          <nav className="flex-1 overflow-y-auto p-4">
            <div className="space-y-6">
              {/* Overview Section */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Overview
                </h3>
                <div className="space-y-1">
                  <NavItem icon={<Home className="w-5 h-5" />} label="Dashboard" active />
                  <NavItem icon={<Activity className="w-5 h-5" />} label="Live Monitoring" />
                  <NavItem icon={<ShieldAlert className="w-5 h-5" />} label="Active Alerts" badge={posture?.alerts.length} />
                </div>
              </div>

              {/* Core Security */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Core Security
                </h3>
                <div className="space-y-1">
                  <NavItem icon={<Shield className="w-5 h-5" />} label="Zero Trust" />
                  <NavItem icon={<Lock className="w-5 h-5" />} label="Encryption" />
                  <NavItem icon={<FileText className="w-5 h-5" />} label="Certificates" />
                  <NavItem icon={<Key className="w-5 h-5" />} label="Secret Vault" />
                </div>
              </div>

              {/* Threat Protection */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Threat Protection
                </h3>
                <div className="space-y-1">
                  <NavItem icon={<AlertTriangle className="w-5 h-5" />} label="Ransomware" />
                  <NavItem icon={<Eye className="w-5 h-5" />} label="Tamper Detection" />
                  <NavItem icon={<Zap className="w-5 h-5" />} label="Intrusion Detection" />
                  <NavItem icon={<FileSearch className="w-5 h-5" />} label="Threat Intelligence" />
                </div>
              </div>

              {/* Hardware Security */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Hardware Security
                </h3>
                <div className="space-y-1">
                  <NavItem icon={<HardDrive className="w-5 h-5" />} label="Secure Boot" />
                  <NavItem icon={<Database className="w-5 h-5" />} label="TPM Attestation" />
                  <NavItem icon={<Server className="w-5 h-5" />} label="Device Health" />
                </div>
              </div>

              {/* Compliance & Audit */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Compliance & Audit
                </h3>
                <div className="space-y-1">
                  <NavItem icon={<FileText className="w-5 h-5" />} label="Audit Logs" />
                  <NavItem icon={<History className="w-5 h-5" />} label="Event History" />
                  <NavItem icon={<CheckCircle className="w-5 h-5" />} label="Compliance" />
                  <NavItem icon={<Layers className="w-5 h-5" />} label="Supply Chain" />
                </div>
              </div>

              {/* Access Management */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Access Management
                </h3>
                <div className="space-y-1">
                  <NavItem icon={<Users className="w-5 h-5" />} label="User Sessions" />
                  <NavItem icon={<Key className="w-5 h-5" />} label="API Keys" />
                  <NavItem icon={<RefreshCw className="w-5 h-5" />} label="Password Rotation" />
                </div>
              </div>

              {/* Settings */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Configuration
                </h3>
                <div className="space-y-1">
                  <NavItem icon={<Settings className="w-5 h-5" />} label="Security Settings" />
                  <NavItem icon={<Clock className="w-5 h-5" />} label="Scheduled Tasks" />
                </div>
              </div>
            </div>
          </nav>

          {/* Sidebar Footer */}
          <div className="p-4 border-t border-gray-200">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Last updated</span>
              <span>{posture ? new Date(posture.timestamp).toLocaleTimeString() : '--:--'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        {/* Toggle Sidebar Button (when closed) */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="fixed top-4 left-4 z-10 p-2 bg-white rounded-lg shadow-lg hover:bg-gray-50"
          >
            <Menu className="w-6 h-6 text-gray-600" />
          </button>
        )}

        {/* Content */}
        <div className="p-8">
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Security Operations Center</h1>
          <p className="text-gray-500 mt-1">Real-time enterprise security monitoring</p>
        </div>
        <button
          onClick={fetchSecurityPosture}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Overall Score */}
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-2xl p-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-blue-100 text-sm uppercase tracking-wide mb-2">Overall Security Score</p>
            <div className="flex items-baseline gap-4">
              <h2 className={`text-6xl font-bold ${getScoreColor(posture.overallScore)}`}>
                {posture.overallScore}
              </h2>
              <span className="text-3xl text-blue-100">/100</span>
            </div>
            <p className="mt-4 text-blue-100">
              {posture.overallScore >= 95 && '🎉 Excellent - Enterprise-grade security'}
              {posture.overallScore >= 90 && posture.overallScore < 95 && '✅ Good - Minor improvements needed'}
              {posture.overallScore >= 80 && posture.overallScore < 90 && '⚠️ Fair - Several areas need attention'}
              {posture.overallScore < 80 && '❌ Critical - Immediate action required'}
            </p>
          </div>
          <Shield className="w-32 h-32 text-blue-300 opacity-50" />
        </div>
      </div>

      {/* Active Alerts */}
      {posture.alerts.length > 0 && (
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-gray-900">Active Security Alerts</h3>
            <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
              {posture.alerts.length} Active
            </span>
          </div>
          <div className="space-y-3">
            {posture.alerts.slice(0, 5).map((alert) => (
              <div
                key={alert.id}
                className={`p-4 rounded-lg border ${getSeverityColor(alert.severity)}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold uppercase">{alert.severity}</span>
                      <span className="text-xs text-gray-500">•</span>
                      <span className="text-xs text-gray-500">{alert.type}</span>
                    </div>
                    <p className="font-medium">{alert.title}</p>
                    <p className="text-sm text-gray-500 mt-1">
                      {new Date(alert.timestamp).toLocaleString()}
                    </p>
                  </div>
                  <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                    Acknowledge
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Security Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Zero Trust */}
        <MetricCard
          icon={<Shield className="w-8 h-8" />}
          title="Zero Trust"
          score={posture.metrics.zeroTrust.score}
          status={`${posture.metrics.zeroTrust.devicesCompliant}/${posture.metrics.zeroTrust.devicesTotal} Compliant`}
          warning={posture.metrics.zeroTrust.highRiskSessions > 0 ? `${posture.metrics.zeroTrust.highRiskSessions} High Risk` : undefined}
        />

        {/* Encryption */}
        <MetricCard
          icon={<Lock className="w-8 h-8" />}
          title="Encryption"
          score={posture.metrics.encryption.score}
          status={`${posture.metrics.encryption.videosEncrypted}/${posture.metrics.encryption.videosTotal} Videos`}
        />

        {/* Certificates */}
        <MetricCard
          icon={<FileText className="w-8 h-8" />}
          title="Certificates"
          score={posture.metrics.certificates.score}
          status={`${posture.metrics.certificates.healthy} Healthy`}
          warning={posture.metrics.certificates.expired > 0 ? `${posture.metrics.certificates.expired} Expired` : undefined}
        />

        {/* Ransomware */}
        <MetricCard
          icon={<AlertTriangle className="w-8 h-8" />}
          title="Ransomware"
          score={posture.metrics.ransomware.activeThreats === 0 ? 100 : 0}
          status={posture.metrics.ransomware.riskLevel}
          warning={posture.metrics.ransomware.activeThreats > 0 ? `${posture.metrics.ransomware.activeThreats} Active Threats` : undefined}
        />

        {/* Tamper Detection */}
        <MetricCard
          icon={<Activity className="w-8 h-8" />}
          title="Tamper Detection"
          score={posture.metrics.tamper.criticalEvents === 0 ? 100 : 50}
          status={`${posture.metrics.tamper.activeEvents} Active Events`}
          warning={posture.metrics.tamper.criticalEvents > 0 ? `${posture.metrics.tamper.criticalEvents} Critical` : undefined}
        />

        {/* Secrets */}
        <MetricCard
          icon={<Key className="w-8 h-8" />}
          title="Secret Vault"
          score={100}
          status={posture.metrics.secrets.status}
        />

        {/* Secure Boot */}
        <MetricCard
          icon={<HardDrive className="w-8 h-8" />}
          title="Secure Boot"
          score={posture.metrics.secureBoot.score}
          status={`${posture.metrics.secureBoot.compliantDevices}/${posture.metrics.secureBoot.totalDevices} Valid`}
        />

        {/* TPM */}
        <MetricCard
          icon={<Database className="w-8 h-8" />}
          title="TPM Attestation"
          score={posture.metrics.tpm.score}
          status={`${posture.metrics.tpm.attestedDevices}/${posture.metrics.tpm.totalDevices} Attested`}
          warning={posture.metrics.tpm.failedAttestations > 0 ? `${posture.metrics.tpm.failedAttestations} Failed` : undefined}
        />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ActionButton icon={<Shield />} label="Zero Trust" href="/security/zero-trust" />
          <ActionButton icon={<FileText />} label="Certificates" href="/security/certificates" />
          <ActionButton icon={<RefreshCw />} label="Password Rotation" href="/security/passwords" />
          <ActionButton icon={<AlertTriangle />} label="Tamper Events" href="/security/tamper" />
          <ActionButton icon={<Lock />} label="Video Encryption" href="/security/encryption" />
          <ActionButton icon={<Database />} label="Immutable Storage" href="/security/immutable" />
          <ActionButton icon={<Activity />} label="Ransomware" href="/security/ransomware" />
          <ActionButton icon={<Key />} label="Supply Chain" href="/security/supply-chain" />
        </div>
      </div>
        </div>
      </div>
    </div>
  );
}

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  badge?: number;
  href?: string;
}

function NavItem({ icon, label, active, badge, href }: NavItemProps) {
  const baseClasses = "flex items-center justify-between px-3 py-2 rounded-lg transition-colors cursor-pointer";
  const activeClasses = active 
    ? "bg-blue-50 text-blue-600 font-medium" 
    : "text-gray-700 hover:bg-gray-50";

  const content = (
    <>
      <div className="flex items-center gap-3">
        <span className={active ? "text-blue-600" : "text-gray-500"}>
          {icon}
        </span>
        <span className="text-sm">{label}</span>
      </div>
      {badge !== undefined && badge > 0 && (
        <span className="px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-600 rounded-full">
          {badge}
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <a href={href} className={`${baseClasses} ${activeClasses}`}>
        {content}
      </a>
    );
  }

  return (
    <div className={`${baseClasses} ${activeClasses}`}>
      {content}
    </div>
  );
}

interface MetricCardProps {
  icon: React.ReactNode;
  title: string;
  score: number;
  status: string;
  warning?: string;
}

function MetricCard({ icon, title, score, status, warning }: MetricCardProps) {
  const scoreColor = score >= 95 ? 'text-green-500' : score >= 80 ? 'text-yellow-500' : 'text-red-500';

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="text-gray-600">{icon}</div>
        <span className={`text-2xl font-bold ${scoreColor}`}>{Math.round(score)}</span>
      </div>
      <h4 className="font-semibold text-gray-900 mb-2">{title}</h4>
      <p className="text-sm text-gray-600">{status}</p>
      {warning && (
        <p className="text-sm text-red-600 mt-2 flex items-center gap-1">
          <AlertTriangle className="w-4 h-4" />
          {warning}
        </p>
      )}
    </div>
  );
}

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  href: string;
}

function ActionButton({ icon, label, href }: ActionButtonProps) {
  return (
    <a
      href={href}
      className="flex flex-col items-center justify-center p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
    >
      <div className="text-blue-600 mb-2">{icon}</div>
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </a>
  );
}
