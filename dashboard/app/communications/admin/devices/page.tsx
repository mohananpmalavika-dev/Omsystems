'use client';

/**
 * KryptoVision Connect - Device Management Page (Admin)
 * 
 * Features:
 * - Generate enrollment codes
 * - View all enrolled devices
 * - Link employees to devices
 * - Revoke devices
 * - Monitor device health
 */

import React, { useState, useEffect } from 'react';
import { communicationApi } from '@/services/communication-api';
import type {
  CommunicationDevice,
  CommunicationEnrollmentCode,
  CommunicationEmployee,
} from '@/types/communication';

interface EnrollmentCodeForm {
  branchId: string;
  expiresInHours: number;
  note: string;
}

export default function DeviceManagementPage() {
  // State
  const [devices, setDevices] = useState<CommunicationDevice[]>([]);
  const [enrollmentCodes, setEnrollmentCodes] = useState<CommunicationEnrollmentCode[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [employees, setEmployees] = useState<CommunicationEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI State
  const [showCodeForm, setShowCodeForm] = useState(false);
  const [showLinkEmployeeModal, setShowLinkEmployeeModal] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<CommunicationDevice | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');

  // Form State
  const [codeForm, setCodeForm] = useState<EnrollmentCodeForm>({
    branchId: '',
    expiresInHours: 24,
    note: '',
  });

  // Load data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [devicesRes, codesRes, branchesRes, employeesRes] = await Promise.all([
        communicationApi.listDevices(),
        communicationApi.listEnrollmentCodes(),
        communicationApi.getBranchDirectory(),
        communicationApi.getEmployeeDirectory(),
      ]);

      setDevices(devicesRes.data);
      setEnrollmentCodes(codesRes.data);
      setBranches(branchesRes.data);
      setEmployees(employeesRes.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Generate enrollment code
  const handleGenerateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await communicationApi.generateEnrollmentCode({
        branchId: codeForm.branchId,
        expiresInHours: codeForm.expiresInHours,
        note: codeForm.note || undefined,
      });

      setShowCodeForm(false);
      setCodeForm({ branchId: '', expiresInHours: 24, note: '' });
      await loadData();
    } catch (err: any) {
      alert('Failed to generate code: ' + err.message);
    }
  };

  // Revoke enrollment code
  const handleRevokeCode = async (codeId: string) => {
    if (!confirm('Revoke this enrollment code? It can no longer be used.')) return;

    try {
      await communicationApi.revokeEnrollmentCode(codeId);
      await loadData();
    } catch (err: any) {
      alert('Failed to revoke code: ' + err.message);
    }
  };

  // Revoke device
  const handleRevokeDevice = async (deviceId: string) => {
    if (!confirm('Revoke this device? It will be disconnected immediately and cannot reconnect.')) return;

    try {
      await communicationApi.revokeDevice(deviceId);
      await loadData();
    } catch (err: any) {
      alert('Failed to revoke device: ' + err.message);
    }
  };

  // Link employee to device
  const handleLinkEmployee = async () => {
    if (!selectedDevice || !selectedEmployeeId) return;

    try {
      await communicationApi.linkEmployeeToDevice(selectedDevice.deviceId, selectedEmployeeId);
      
      setShowLinkEmployeeModal(false);
      setSelectedDevice(null);
      setSelectedEmployeeId('');
      await loadData();
    } catch (err: any) {
      alert('Failed to link employee: ' + err.message);
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading device management...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Device Management
        </h1>
        <p className="text-gray-600">
          Manage branch device enrollment, view device status, and link employees.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="text-sm font-medium text-gray-500 mb-1">Total Devices</div>
          <div className="text-3xl font-bold text-gray-900">{devices.length}</div>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="text-sm font-medium text-gray-500 mb-1">Online Devices</div>
          <div className="text-3xl font-bold text-green-600">
            {devices.filter(d => d.lastSeenAt && new Date(d.lastSeenAt) > new Date(Date.now() - 120000)).length}
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="text-sm font-medium text-gray-500 mb-1">Active Codes</div>
          <div className="text-3xl font-bold text-blue-600">
            {enrollmentCodes.filter(c => c.status === 'active').length}
          </div>
        </div>
      </div>

      {/* Enrollment Codes Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Enrollment Codes</h2>
          <button
            onClick={() => setShowCodeForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            + Generate Code
          </button>
        </div>

        {showCodeForm && (
          <div className="mb-6 p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Generate Enrollment Code</h3>
            <form onSubmit={handleGenerateCode}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Branch *
                  </label>
                  <select
                    value={codeForm.branchId}
                    onChange={(e) => setCodeForm({ ...codeForm, branchId: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Select branch...</option>
                    {branches.map((branch) => (
                      <option key={branch.branchId} value={branch.branchId}>
                        {branch.branchName} ({branch.branchCode})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Expires In (hours) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="168"
                    value={codeForm.expiresInHours}
                    onChange={(e) => setCodeForm({ ...codeForm, expiresInHours: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Note (optional)
                </label>
                <input
                  type="text"
                  value={codeForm.note}
                  onChange={(e) => setCodeForm({ ...codeForm, note: e.target.value })}
                  placeholder="e.g., For new security desk PC"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  Generate Code
                </button>
                <button
                  type="button"
                  onClick={() => setShowCodeForm(false)}
                  className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Branch</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expires</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Note</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {enrollmentCodes.map((code) => {
                const branch = branches.find(b => b.branchId === code.branchId);
                return (
                  <tr key={code.codeId} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
                        {code.code}
                      </code>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {branch?.branchName || code.branchId}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        code.status === 'active' ? 'bg-green-100 text-green-800' :
                        code.status === 'used' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {code.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(code.expiresAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {code.note || '-'}
                    </td>
                    <td className="px-6 py-4 text-right text-sm">
                      <button
                        onClick={() => copyToClipboard(code.code)}
                        className="text-blue-600 hover:text-blue-800 mr-3"
                      >
                        Copy
                      </button>
                      {code.status === 'active' && (
                        <button
                          onClick={() => handleRevokeCode(code.codeId)}
                          className="text-red-600 hover:text-red-800"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {enrollmentCodes.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    No enrollment codes. Click "Generate Code" to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Enrolled Devices Section */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Enrolled Devices</h2>
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Device Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Branch</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Seen</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Linked Employees</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {devices.map((device) => {
                const branch = branches.find(b => b.branchId === device.branchId);
                const isOnline = device.lastSeenAt && new Date(device.lastSeenAt) > new Date(Date.now() - 120000);
                const linkedEmployees = employees.filter(e => 
                  device.linkedEmployeeIds?.includes(e.employeeId)
                );

                return (
                  <tr key={device.deviceId} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className={`w-2 h-2 rounded-full mr-3 ${isOnline ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">{device.deviceName}</div>
                          <div className="text-xs text-gray-500">{device.deviceId.substring(0, 8)}...</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {branch?.branchName || device.branchId}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        isOnline ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {isOnline ? 'Online' : 'Offline'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : 'Never'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {linkedEmployees.length > 0 ? (
                        <div>
                          {linkedEmployees.map(emp => emp.employeeName).join(', ')}
                        </div>
                      ) : (
                        <span className="text-gray-400">None</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right text-sm space-x-3">
                      <button
                        onClick={() => {
                          setSelectedDevice(device);
                          setShowLinkEmployeeModal(true);
                        }}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        Link Employee
                      </button>
                      <button
                        onClick={() => handleRevokeDevice(device.deviceId)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                );
              })}
              {devices.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    No devices enrolled yet. Generate an enrollment code to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Link Employee Modal */}
      {showLinkEmployeeModal && selectedDevice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Link Employee to Device</h3>
            <p className="text-sm text-gray-600 mb-4">
              Device: <strong>{selectedDevice.deviceName}</strong>
            </p>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Employee
              </label>
              <select
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select employee...</option>
                {employees
                  .filter(e => e.branchId === selectedDevice.branchId)
                  .map((emp) => (
                    <option key={emp.employeeId} value={emp.employeeId}>
                      {emp.employeeName} - {emp.employeeRole}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleLinkEmployee}
                disabled={!selectedEmployeeId}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Link Employee
              </button>
              <button
                onClick={() => {
                  setShowLinkEmployeeModal(false);
                  setSelectedDevice(null);
                  setSelectedEmployeeId('');
                }}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
