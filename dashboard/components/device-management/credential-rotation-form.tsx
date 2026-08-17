"use client";

import React, { useState } from "react";
import { deviceManagementApi } from "@/lib/api-client";

interface Device {
  id: string;
  deviceId: string;
  manufacturer: string;
  model: string;
  healthStatus: string;
  capabilities?: string[];
}

interface CredentialRotationFormProps {
  device: Device;
  onSuccess?: (jobId: string) => void;
}

export function CredentialRotationForm({ device, onSuccess }: CredentialRotationFormProps) {
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<'scheduled' | 'emergency'>('scheduled');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; jobId?: string; message?: string; error?: string } | null>(null);

  const supportsRotation = device.capabilities?.includes('credential-rotation') ?? true;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (reason.length < 10) {
      setResult({
        success: false,
        error: 'Please provide a detailed reason (minimum 10 characters)',
      });
      return;
    }

    setSubmitting(true);
    setResult(null);

    try {
      const response = await deviceManagementApi.startPasswordRotation({
        deviceId: device.id,
        reason,
        rotationMode: mode,
      });

      setResult({
        success: true,
        jobId: response.jobId,
        message: response.message,
      });

      setReason('');

      if (onSuccess && response.jobId) {
        onSuccess(response.jobId);
      }
    } catch (error: any) {
      setResult({
        success: false,
        error: error.message || 'Failed to initiate credential rotation',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!supportsRotation) {
    return (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-yellow-800">Credential rotation not supported</h3>
            <div className="mt-2 text-sm text-yellow-700">
              <p>This device does not support automated credential rotation. Please contact support for manual credential updates.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="credential-rotation-form">
      {/* Important Notice */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">Important</h3>
            <div className="mt-2 text-sm text-blue-700">
              <p>
                A secure password will be generated automatically. The device will be updated remotely,
                and all connections will be reconfigured. This process typically takes 1-2 minutes.
              </p>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Reason */}
        <div>
          <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-2">
            Reason for Rotation <span className="text-red-500">*</span>
          </label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g., Quarterly security rotation, suspected compromise, employee termination"
            rows={3}
            required
            minLength={10}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            Minimum 10 characters. This will be recorded in audit logs.
          </p>
        </div>

        {/* Rotation Mode */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Rotation Mode
          </label>
          <div className="space-y-3">
            <label className="flex items-start p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                value="scheduled"
                checked={mode === 'scheduled'}
                onChange={(e) => setMode(e.target.value as 'scheduled')}
                className="mt-1 mr-3"
              />
              <div>
                <div className="font-medium text-gray-900">Scheduled Rotation</div>
                <div className="text-sm text-gray-600">
                  Normal priority. Will be processed in maintenance window.
                </div>
              </div>
            </label>
            <label className="flex items-start p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                value="emergency"
                checked={mode === 'emergency'}
                onChange={(e) => setMode(e.target.value as 'emergency')}
                className="mt-1 mr-3"
              />
              <div>
                <div className="font-medium text-gray-900">Emergency Rotation</div>
                <div className="text-sm text-gray-600">
                  High priority. Executes immediately. Use for security incidents.
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Expected Impact */}
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <h4 className="text-sm font-medium text-gray-900 mb-2">Expected Impact</h4>
          <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
            <li>RTSP stream will reconnect (~5-15 seconds)</li>
            <li>ONVIF connections will re-authenticate</li>
            <li>Recording may pause briefly during reconnection</li>
            <li>Current live viewers will need to reconnect</li>
          </ul>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={submitting || reason.length < 10}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {submitting ? 'Initiating Rotation...' : 'Rotate Credentials'}
        </button>
      </form>

      {/* Result Messages */}
      {result && (
        <div className={`mt-6 p-4 rounded-lg border ${
          result.success
            ? 'bg-green-50 border-green-200'
            : 'bg-red-50 border-red-200'
        }`}>
          {result.success ? (
            <>
              <h4 className="text-sm font-medium text-green-800 mb-2">Rotation Initiated</h4>
              <p className="text-sm text-green-700 mb-2">{result.message}</p>
              {result.jobId && (
                <>
                  <p className="text-xs text-green-600 mb-3">Job ID: {result.jobId}</p>
                  <a
                    href={`/maintenance/device-management/jobs/${result.jobId}`}
                    className="inline-flex items-center text-sm text-green-700 hover:text-green-800 font-medium"
                  >
                    Monitor Progress →
                  </a>
                </>
              )}
            </>
          ) : (
            <>
              <h4 className="text-sm font-medium text-red-800 mb-2">Failed</h4>
              <p className="text-sm text-red-700">{result.error}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
