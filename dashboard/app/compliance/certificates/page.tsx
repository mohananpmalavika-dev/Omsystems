'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Certificate {
  id: string;
  certificateNumber: string;
  title: string;
  status: string;
  issuedAt: string;
  expiryDate: string;
  assessmentId: string;
  metadata?: {
    complianceScore?: number;
    framework?: string;
    branch?: string;
  };
}

export default function CertificatesPage() {
  const router = useRouter();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [showVerification, setShowVerification] = useState(false);

  useEffect(() => {
    fetchCertificates();
  }, []);

  const fetchCertificates = async () => {
    try {
      const response = await fetch('/api/compliance/certificates');
      const data = await response.json();
      setCertificates(data);
    } catch (error) {
      console.error('Failed to fetch certificates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    try {
      const response = await fetch('/api/compliance/certificates/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verificationCode }),
      });
      const result = await response.json();
      setVerificationResult(result);
    } catch (error) {
      console.error('Verification failed:', error);
      setVerificationResult({ valid: false, message: 'Verification failed' });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'compliant':
        return 'text-green-600 bg-green-50';
      case 'compliant_with_exceptions':
        return 'text-yellow-600 bg-yellow-50';
      case 'non_compliant':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const isExpiringSoon = (expiryDate: string) => {
    const daysUntilExpiry = Math.floor(
      (new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    return daysUntilExpiry <= 30 && daysUntilExpiry > 0;
  };

  const isExpired = (expiryDate: string) => {
    return new Date(expiryDate) < new Date();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Compliance Certificates</h1>
        <p className="text-gray-600 mt-1">
          View and verify compliance certificates
        </p>
      </div>

      {/* Verification Section */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 mb-6 border border-blue-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Verify Certificate</h2>
            <p className="text-sm text-gray-600">Enter verification code to check certificate authenticity</p>
          </div>
          <button
            onClick={() => setShowVerification(!showVerification)}
            className="text-blue-600 hover:text-blue-700"
          >
            {showVerification ? 'Hide' : 'Show'} Verification
          </button>
        </div>

        {showVerification && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                maxLength={29}
              />
              <button
                onClick={handleVerify}
                disabled={!verificationCode}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Verify
              </button>
            </div>

            {verificationResult && (
              <div
                className={`p-4 rounded-lg ${
                  verificationResult.valid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                }`}
              >
                {verificationResult.valid ? (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="font-semibold text-green-900">Certificate is Valid</span>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div><span className="font-medium">Certificate Number:</span> {verificationResult.certificate.certificateNumber}</div>
                      <div><span className="font-medium">Title:</span> {verificationResult.certificate.title}</div>
                      <div><span className="font-medium">Status:</span> {verificationResult.certificate.status}</div>
                      <div><span className="font-medium">Issued:</span> {new Date(verificationResult.certificate.issuedAt).toLocaleDateString()}</div>
                      <div><span className="font-medium">Expires:</span> {new Date(verificationResult.certificate.expiryDate).toLocaleDateString()}</div>
                      <div><span className="font-medium">Verified:</span> {verificationResult.verification.verificationCount} times</div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-semibold text-red-900">{verificationResult.message}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 mb-1">Total Certificates</div>
          <div className="text-2xl font-bold text-gray-900">{certificates.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 mb-1">Valid</div>
          <div className="text-2xl font-bold text-green-600">
            {certificates.filter((c) => !isExpired(c.expiryDate)).length}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 mb-1">Expiring Soon</div>
          <div className="text-2xl font-bold text-yellow-600">
            {certificates.filter((c) => isExpiringSoon(c.expiryDate)).length}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 mb-1">Expired</div>
          <div className="text-2xl font-bold text-red-600">
            {certificates.filter((c) => isExpired(c.expiryDate)).length}
          </div>
        </div>
      </div>

      {/* Certificate List */}
      <div className="space-y-4">
        {certificates.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="text-gray-400 text-lg">No certificates found</div>
          </div>
        ) : (
          certificates.map((cert) => (
            <div
              key={cert.id}
              className="bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">{cert.title}</h3>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(cert.status)}`}>
                      {cert.status.replace('_', ' ').toUpperCase()}
                    </span>
                    {isExpiringSoon(cert.expiryDate) && (
                      <span className="px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        EXPIRING SOON
                      </span>
                    )}
                    {isExpired(cert.expiryDate) && (
                      <span className="px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        EXPIRED
                      </span>
                    )}
                  </div>

                  <div className="text-sm text-gray-600 mb-3">
                    Certificate #: {cert.certificateNumber}
                  </div>

                  <div className="flex items-center gap-6 text-sm">
                    <div>
                      <span className="text-gray-600">Issued:</span>{' '}
                      <span className="font-medium">{new Date(cert.issuedAt).toLocaleDateString()}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Expires:</span>{' '}
                      <span className="font-medium">{new Date(cert.expiryDate).toLocaleDateString()}</span>
                    </div>
                    {cert.metadata?.complianceScore && (
                      <div>
                        <span className="text-gray-600">Score:</span>{' '}
                        <span className="font-medium text-blue-600">{cert.metadata.complianceScore}%</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => router.push(`/compliance/certificates/${cert.id}`)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                  >
                    View
                  </button>
                  <button
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
                  >
                    Download
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
