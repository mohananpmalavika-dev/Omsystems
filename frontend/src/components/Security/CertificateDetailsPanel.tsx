/**
 * Certificate Details Panel
 * Displays comprehensive certificate information with evidence and assessment
 * Shows real validation states (VALID/INVALID/UNKNOWN) without hiding uncertainty
 */

import React from 'react';
import { 
  Shield, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  HelpCircle,
  Clock,
  Key,
  Link,
  FileText,
  Lock
} from 'lucide-react';

export interface CertificateDetails {
  fingerprintSha256: string;
  serialNumber: string;
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  publicKeyAlgorithm: string;
  publicKeySize?: number;
  subjectAltNames: Array<{ type: string; value: string }>;
}

export interface CertificateAssessment {
  deviceId: string;
  observedAt: string;
  certificate?: CertificateDetails;
  checks: {
    parsing: 'PASS' | 'FAIL' | 'UNKNOWN';
    time: 'PASS' | 'FAIL' | 'UNKNOWN';
    chain: 'PASS' | 'FAIL' | 'UNKNOWN';
    identity: 'PASS' | 'FAIL' | 'UNKNOWN';
    revocation: 'PASS' | 'FAIL' | 'UNKNOWN';
  };
  overall: 'VALID' | 'INVALID' | 'UNKNOWN';
  findings: Array<{
    code: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    message: string;
    recommendation?: string;
  }>;
  errors: string[];
  evidence: {
    source: string;
    observedAt: string;
    fingerprintSha256?: string;
    rawAvailable: boolean;
    parser: string;
    simulated: boolean;
  };
}

interface CertificateDetailsPanelProps {
  assessment: CertificateAssessment;
}

export const CertificateDetailsPanel: React.FC<CertificateDetailsPanelProps> = ({ assessment }) => {
  const getOverallStatusColor = (status: string) => {
    switch (status) {
      case 'VALID': return 'text-green-600 bg-green-50';
      case 'INVALID': return 'text-red-600 bg-red-50';
      case 'UNKNOWN': return 'text-yellow-600 bg-yellow-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getOverallStatusIcon = (status: string) => {
    switch (status) {
      case 'VALID': return <CheckCircle className="w-5 h-5" />;
      case 'INVALID': return <XCircle className="w-5 h-5" />;
      case 'UNKNOWN': return <HelpCircle className="w-5 h-5" />;
      default: return <HelpCircle className="w-5 h-5" />;
    }
  };

  const getCheckStatusBadge = (status: 'PASS' | 'FAIL' | 'UNKNOWN') => {
    const styles = {
      PASS: 'bg-green-100 text-green-800',
      FAIL: 'bg-red-100 text-red-800',
      UNKNOWN: 'bg-yellow-100 text-yellow-800'
    };

    const icons = {
      PASS: <CheckCircle className="w-4 h-4" />,
      FAIL: <XCircle className="w-4 h-4" />,
      UNKNOWN: <HelpCircle className="w-4 h-4" />
    };

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${styles[status]}`}>
        {icons[status]}
        {status}
      </span>
    );
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'text-red-700 bg-red-50 border-red-200';
      case 'HIGH': return 'text-orange-700 bg-orange-50 border-orange-200';
      case 'MEDIUM': return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      case 'LOW': return 'text-blue-700 bg-blue-50 border-blue-200';
      default: return 'text-gray-700 bg-gray-50 border-gray-200';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatFingerprint = (fingerprint: string) => {
    return fingerprint.match(/.{1,2}/g)?.join(':').toUpperCase() || fingerprint;
  };

  return (
    <div className="space-y-6">
      {/* Overall Status */}
      <div className={`rounded-lg border-2 p-4 ${getOverallStatusColor(assessment.overall)}`}>
        <div className="flex items-center gap-3">
          {getOverallStatusIcon(assessment.overall)}
          <div>
            <h3 className="font-semibold text-lg">
              Certificate Status: {assessment.overall}
            </h3>
            <p className="text-sm opacity-80">
              Observed: {formatDate(assessment.observedAt)}
            </p>
          </div>
        </div>
      </div>

      {/* Evidence Section */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-5 h-5 text-gray-600" />
          <h4 className="font-semibold">Certificate Evidence</h4>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-gray-600">Source:</span>
            <span className="ml-2 font-medium">{assessment.evidence.source}</span>
          </div>
          <div>
            <span className="text-gray-600">Parser:</span>
            <span className="ml-2 font-medium">{assessment.evidence.parser}</span>
          </div>
          <div>
            <span className="text-gray-600">Raw Available:</span>
            <span className="ml-2 font-medium">{assessment.evidence.rawAvailable ? 'Yes' : 'No'}</span>
          </div>
          <div>
            <span className="text-gray-600">Simulated:</span>
            <span className={`ml-2 font-medium ${assessment.evidence.simulated ? 'text-red-600' : 'text-green-600'}`}>
              {assessment.evidence.simulated ? 'Yes ⚠️' : 'No ✓'}
            </span>
          </div>
        </div>
      </div>

      {/* Validation Checks */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-5 h-5 text-gray-600" />
          <h4 className="font-semibold">Validation Checks</h4>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-sm font-medium">Certificate Parsing</span>
            {getCheckStatusBadge(assessment.checks.parsing)}
          </div>
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-sm font-medium">Time Validity</span>
            {getCheckStatusBadge(assessment.checks.time)}
          </div>
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-sm font-medium">Certificate Chain</span>
            {getCheckStatusBadge(assessment.checks.chain)}
          </div>
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-sm font-medium">Hostname Identity</span>
            {getCheckStatusBadge(assessment.checks.identity)}
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm font-medium">Revocation Status</span>
            {getCheckStatusBadge(assessment.checks.revocation)}
          </div>
        </div>
      </div>

      {/* Certificate Details */}
      {assessment.certificate && (
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-2 mb-3">
            <Lock className="w-5 h-5 text-gray-600" />
            <h4 className="font-semibold">Certificate Details</h4>
          </div>
          <div className="space-y-3 text-sm">
            <div>
              <span className="text-gray-600 block mb-1">Subject:</span>
              <code className="block bg-gray-50 p-2 rounded text-xs break-all">
                {assessment.certificate.subject}
              </code>
            </div>
            <div>
              <span className="text-gray-600 block mb-1">Issuer:</span>
              <code className="block bg-gray-50 p-2 rounded text-xs break-all">
                {assessment.certificate.issuer}
              </code>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-gray-600 block mb-1">Valid From:</span>
                <span className="font-medium">{formatDate(assessment.certificate.validFrom)}</span>
              </div>
              <div>
                <span className="text-gray-600 block mb-1">Valid To:</span>
                <span className="font-medium">{formatDate(assessment.certificate.validTo)}</span>
              </div>
            </div>
            <div>
              <span className="text-gray-600 block mb-1">Serial Number:</span>
              <code className="block bg-gray-50 p-2 rounded text-xs">
                {assessment.certificate.serialNumber}
              </code>
            </div>
            <div>
              <span className="text-gray-600 block mb-1">Fingerprint (SHA-256):</span>
              <code className="block bg-gray-50 p-2 rounded text-xs break-all font-mono">
                {formatFingerprint(assessment.certificate.fingerprintSha256)}
              </code>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-gray-600 block mb-1">
                  <Key className="w-4 h-4 inline mr-1" />
                  Public Key Algorithm:
                </span>
                <span className="font-medium">{assessment.certificate.publicKeyAlgorithm}</span>
              </div>
              {assessment.certificate.publicKeySize && (
                <div>
                  <span className="text-gray-600 block mb-1">Key Size:</span>
                  <span className="font-medium">{assessment.certificate.publicKeySize} bits</span>
                </div>
              )}
            </div>
            {assessment.certificate.subjectAltNames.length > 0 && (
              <div>
                <span className="text-gray-600 block mb-1">Subject Alternative Names:</span>
                <div className="space-y-1">
                  {assessment.certificate.subjectAltNames.map((san, index) => (
                    <div key={index} className="bg-gray-50 p-2 rounded text-xs">
                      <span className="font-medium">{san.type}:</span> {san.value}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Security Findings */}
      {assessment.findings.length > 0 && (
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600" />
            <h4 className="font-semibold">Security Findings ({assessment.findings.length})</h4>
          </div>
          <div className="space-y-2">
            {assessment.findings.map((finding, index) => (
              <div key={index} className={`border rounded-lg p-3 ${getSeverityColor(finding.severity)}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="font-semibold text-sm">{finding.code}</span>
                    <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${getSeverityColor(finding.severity)}`}>
                      {finding.severity}
                    </span>
                  </div>
                </div>
                <p className="text-sm mb-2">{finding.message}</p>
                {finding.recommendation && (
                  <div className="bg-white bg-opacity-50 rounded p-2 text-xs">
                    <span className="font-medium">Recommendation:</span> {finding.recommendation}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Errors */}
      {assessment.errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="w-5 h-5 text-red-600" />
            <h4 className="font-semibold text-red-900">Validation Errors</h4>
          </div>
          <ul className="list-disc list-inside space-y-1 text-sm text-red-800">
            {assessment.errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Important Notice for UNKNOWN States */}
      {assessment.overall === 'UNKNOWN' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <HelpCircle className="w-5 h-5 text-yellow-600" />
            <h4 className="font-semibold text-yellow-900">Validation Status Unknown</h4>
          </div>
          <p className="text-sm text-yellow-800">
            Some validation checks could not be completed. This does not mean the certificate is valid.
            Configure trust anchors, enable revocation checking, or review the validation errors above.
          </p>
        </div>
      )}
    </div>
  );
};

export default CertificateDetailsPanel;
