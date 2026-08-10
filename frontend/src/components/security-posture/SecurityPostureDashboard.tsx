/**
 * Enhanced Security Posture Dashboard
 * 
 * Displays comprehensive security telemetry with availability states,
 * quality metrics, evidence, and collector health monitoring.
 */

import React, { useEffect, useState } from 'react';
import { SecurityPostureTelemetry } from '../../types/security-posture';
import { TelemetryMetricCard } from './TelemetryMetricCard';
import { CollectorHealthPanel } from './CollectorHealthPanel';

export const SecurityPostureDashboard: React.FC = () => {
  const [telemetry, setTelemetry] = useState<SecurityPostureTelemetry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEvidence, setShowEvidence] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'health'>('overview');
  
  useEffect(() => {
    fetchTelemetry();
    
    // Refresh every 60 seconds
    const interval = setInterval(fetchTelemetry, 60000);
    return () => clearInterval(interval);
  }, []);
  
  const fetchTelemetry = async () => {
    try {
      const response = await fetch('/api/security-posture/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: 'default' }),
      });
      
      if (!response.ok) throw new Error('Failed to fetch telemetry');
      
      const data = await response.json();
      setTelemetry(data.data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    if (score >= 50) return 'text-orange-600';
    return 'text-red-600';
  };
  
  const getScoreGrade = (score: number) => {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  };
  
  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-gray-200 rounded-lg"></div>
          <div className="grid grid-cols-3 gap-4">
            <div className="h-48 bg-gray-200 rounded-lg"></div>
            <div className="h-48 bg-gray-200 rounded-lg"></div>
            <div className="h-48 bg-gray-200 rounded-lg"></div>
          </div>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h3 className="text-red-800 font-semibold mb-2">Error Loading Security Posture</h3>
          <p className="text-red-600">{error}</p>
          <button
            onClick={fetchTelemetry}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }
  
  if (!telemetry) return null;
  
  return (
    <div className="p-6 space-y-6">
      {/* Header with tabs */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Security Posture Dashboard</h1>
        
        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'overview'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('health')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'health'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Collector Health
            </button>
          </div>
          
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showEvidence}
              onChange={(e) => setShowEvidence(e.target.checked)}
              className="rounded"
            />
            Show Evidence
          </label>
        </div>
      </div>
      
      {activeTab === 'overview' ? (
        <>
          {/* Overall Score Card */}
          <div className="bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg p-6 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium opacity-90 mb-1">Overall Security Score</h2>
                <div className="flex items-baseline gap-3">
                  <span className="text-6xl font-bold">{telemetry.overallScore}</span>
                  <span className="text-3xl font-semibold opacity-80">
                    / 100
                  </span>
                  <span className="text-4xl font-bold ml-4">
                    {getScoreGrade(telemetry.overallScore)}
                  </span>
                </div>
              </div>
              
              <div className="text-right">
                <div className="text-sm opacity-90 mb-1">Confidence</div>
                <div className="text-3xl font-bold">
                  {Math.round(telemetry.overallConfidence * 100)}%
                </div>
                <div className="text-xs opacity-75 mt-2">
                  Last updated: {new Date(telemetry.timestamp).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
          
          {/* Encryption Section */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Encryption & Key Management</h2>
            <div className="grid grid-cols-3 gap-4">
              <TelemetryMetricCard metric={telemetry.encryption.dataAtRest} showEvidence={showEvidence} />
              <TelemetryMetricCard metric={telemetry.encryption.encryptedRecordings} showEvidence={showEvidence} />
              <TelemetryMetricCard metric={telemetry.encryption.kmsAvailability} showEvidence={showEvidence} />
            </div>
          </section>
          
          {/* TLS & Certificates Section */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">TLS & Certificate Security</h2>
            <div className="grid grid-cols-4 gap-4">
              <TelemetryMetricCard metric={telemetry.tls.tlsVersion} showEvidence={showEvidence} />
              <TelemetryMetricCard metric={telemetry.tls.cipherStrength} showEvidence={showEvidence} />
              <TelemetryMetricCard metric={telemetry.tls.httpsOnly} showEvidence={showEvidence} />
              <TelemetryMetricCard metric={telemetry.tls.certValidation} showEvidence={showEvidence} />
            </div>
            <div className="grid grid-cols-3 gap-4 mt-4">
              <TelemetryMetricCard metric={telemetry.certificates.healthyCount} showEvidence={showEvidence} />
              <TelemetryMetricCard metric={telemetry.certificates.expiringSoonCount} showEvidence={showEvidence} />
              <TelemetryMetricCard metric={telemetry.certificates.expiredCount} showEvidence={showEvidence} />
            </div>
          </section>
          
          {/* Platform Integrity Section */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Platform Integrity</h2>
            <div className="grid grid-cols-4 gap-4">
              <TelemetryMetricCard metric={telemetry.secureBoot.enabled} showEvidence={showEvidence} />
              <TelemetryMetricCard metric={telemetry.secureBoot.uefiValidation} showEvidence={showEvidence} />
              <TelemetryMetricCard metric={telemetry.tpm.tpmPresent} showEvidence={showEvidence} />
              <TelemetryMetricCard metric={telemetry.tpm.attestationSuccess} showEvidence={showEvidence} />
            </div>
          </section>
          
          {/* Threat Detection Section */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Threat Detection</h2>
            <div className="grid grid-cols-4 gap-4">
              <TelemetryMetricCard metric={telemetry.ransomware.activeThreats} showEvidence={showEvidence} />
              <TelemetryMetricCard metric={telemetry.ransomware.suspiciousProcesses} showEvidence={showEvidence} />
              <TelemetryMetricCard metric={telemetry.tamper.cameraCovers} showEvidence={showEvidence} />
              <TelemetryMetricCard metric={telemetry.tamper.activeEvents} showEvidence={showEvidence} />
            </div>
          </section>
          
          {/* Secrets Management Section */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Secrets Management</h2>
            <div className="grid grid-cols-3 gap-4">
              <TelemetryMetricCard metric={telemetry.secrets.vaultAvailability} showEvidence={showEvidence} />
              <TelemetryMetricCard metric={telemetry.secrets.rotationCompliance} showEvidence={showEvidence} />
              <TelemetryMetricCard metric={telemetry.secrets.expiringSecrets} showEvidence={showEvidence} />
            </div>
          </section>
        </>
      ) : (
        <CollectorHealthPanel />
      )}
    </div>
  );
};
