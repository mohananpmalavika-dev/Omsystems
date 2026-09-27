'use client';

/**
 * KryptoVision Connect - Device Management Page
 * 
 * Admin interface for managing branch devices and enrollment codes
 */

import { FieldVisual } from "@/components/field-visual";
import React, { useState, useEffect } from 'react';
import { 
  Smartphone, 
  Plus, 
  Copy, 
  Trash2, 
  RefreshCw, 
  Clock, 
  CheckCircle2, 
  XCircle,
  Settings,
  Users,
  Building2,
  AlertCircle,
  Link as LinkIcon,
  Radio,
  Zap
} from 'lucide-react';
import { communicationAPI } from '@/services/communication-api';
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
  const [activeTab, setActiveTab] = useState<'codes' | 'devices'>('codes');
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
        typeof communicationAPI?.listDevices === 'function' ? communicationAPI.listDevices() : Promise.resolve({ data: [] }),
        typeof communicationAPI?.listEnrollmentCodes === 'function' ? communicationAPI.listEnrollmentCodes() : Promise.resolve({ data: [] }),
        typeof communicationAPI?.getBranchDirectory === 'function' ? communicationAPI.getBranchDirectory() : Promise.resolve([]),
        typeof communicationAPI?.getEmployeeDirectory === 'function' ? communicationAPI.getEmployeeDirectory() : Promise.resolve({ data: [] }),
      ]);

      setDevices(Array.isArray(devicesRes) ? devicesRes : devicesRes?.data || []);
      setEnrollmentCodes(Array.isArray(codesRes) ? codesRes : codesRes?.data || []);
      setBranches(Array.isArray(branchesRes) ? branchesRes : branchesRes?.data || []);
      setEmployees(Array.isArray(employeesRes) ? employeesRes : employeesRes?.data || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Generate enrollment code
  const handleGenerateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await communicationAPI.generateEnrollmentCode({
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
      await communicationAPI.revokeEnrollmentCode(codeId);
      await loadData();
    } catch (err: any) {
      alert('Failed to revoke code: ' + err.message);
    }
  };

  // Revoke device
  const handleRevokeDevice = async (deviceId: string) => {
    if (!confirm('Revoke this device? It will be disconnected immediately and cannot reconnect.')) return;

    try {
      await communicationAPI.revokeDevice(deviceId);
      await loadData();
    } catch (err: any) {
      alert('Failed to revoke device: ' + err.message);
    }
  };

  // Link employee to device
  const handleLinkEmployee = async () => {
    if (!selectedDevice || !selectedEmployeeId) return;

    try {
      await communicationAPI.linkEmployeeToDevice(selectedDevice.deviceId, selectedEmployeeId);
      
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
    // Could add a toast notification here
  };

  // Calculate stats
  const onlineDeviceCount = devices.filter(d => 
    d.lastSeenAt && new Date(d.lastSeenAt) > new Date(Date.now() - 120000)
  ).length;
  const activeCodeCount = enrollmentCodes.filter(c => c.status === 'active').length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading device management...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between workspace-heading">
            <div>
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                <span>Communications</span>
                <span>›</span>
                <span>Device Management</span>
              </div>
              <h1 className="text-2xl font-semibold text-gray-900">
                Device Management
              </h1>
              <p className="text-gray-600 mt-1">
                Manage branch device enrollment and access
              </p>
            </div>
            <button
              onClick={() => loadData()}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-5 h-5 text-gray-600" />
            </button>
          <FieldVisual /></div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-blue-600 mb-1">Total Devices</div>
                  <div className="text-3xl font-bold text-blue-900">{devices.length}</div>
                </div>
                <Smartphone className="w-8 h-8 text-blue-600 opacity-50" />
              </div>
            </div>
            <div className="bg-green-50 rounded-lg p-4 border border-green-100">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-green-600 mb-1">Online Now</div>
                  <div className="text-3xl font-bold text-green-900">{onlineDeviceCount}</div>
                </div>
                <Radio className="w-8 h-8 text-green-600 opacity-50" />
              </div>
            </div>
            <div className="bg-purple-50 rounded-lg p-4 border border-purple-100">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-purple-600 mb-1">Active Codes</div>
                  <div className="text-3xl font-bold text-purple-900">{activeCodeCount}</div>
                </div>
                <Zap className="w-8 h-8 text-purple-600 opacity-50" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-red-800">{error}</div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="border-b border-gray-200">
            <div className="flex">
              <button
                onClick={() => setActiveTab('codes')}
                className={`px-6 py-4 font-medium border-b-2 transition-colors ${
                  activeTab === 'codes'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Enrollment Codes
              </button>
              <button
                onClick={() => setActiveTab('devices')}
                className={`px-6 py-4 font-medium border-b-2 transition-colors ${
                  activeTab === 'devices'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Enrolled Devices
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'codes' && (
              <div>
                {/* Generate Code Button */}
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">Enrollment Codes</h3>
                    <p className="text-sm text-gray-500 mt-1">Generate codes for device enrollment</p>
                  </div>
                  {!showCodeForm && (
                    <button
                      onClick={() => setShowCodeForm(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                    >
                      <Plus className="w-4 h-4" />
                      Generate Code
                    </button>
                  )}
                </div>

                {/* Generate Code Form */}
                {showCodeForm && (
                  <div className="mb-6 p-6 bg-gray-50 border border-gray-200 rounded-lg">
                    <h4 className="text-base font-medium text-gray-900 mb-4">Generate Enrollment Code</h4>
                    <form onSubmit={handleGenerateCode}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Branch *
                          </label>
                          <select
                            value={codeForm.branchId}
                            onChange={(e) => setCodeForm({ ...codeForm, branchId: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            required
                          >
                            <option value="">Select branch...</option>
                            {branches.map((branch) => (
                              <option key={branch.branchId} value={branch.branchId}>
                                {branch.branchName} {branch.branchCode ? `(${branch.branchCode})` : ''}
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
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div className="flex gap-3">
                        <button
                          type="submit"
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                        >
                          Generate Code
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowCodeForm(false)}
                          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* Codes List */}
                <div className="space-y-3">
                  {enrollmentCodes.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <Smartphone className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                      <p>No enrollment codes generated yet.</p>
                      <p className="text-sm mt-1">Click "Generate Code" to create one.</p>
                    </div>
                  ) : (
                    enrollmentCodes.map((code) => {
                      const branch = branches.find(b => b.branchId === code.branchId);
                      const isExpired = new Date(code.expiresAt) < new Date();
                      
                      return (
                        <div
                          key={code.codeId}
                          className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <code className="text-lg font-mono font-semibold bg-gray-100 px-3 py-1 rounded">
                                  {code.code}
                                </code>
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                  code.status === 'active' && !isExpired
                                    ? 'bg-green-100 text-green-800'
                                    : code.status === 'used'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {isExpired ? 'Expired' : code.status}
                                </span>
                              </div>
                              <div className="flex items-center gap-4 text-sm text-gray-600">
                                <div className="flex items-center gap-1">
                                  <Building2 className="w-4 h-4" />
                                  <span>{branch?.branchName || code.branchId}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Clock className="w-4 h-4" />
                                  <span>Expires {new Date(code.expiresAt).toLocaleString()}</span>
                                </div>
                              </div>
                              {code.note && (
                                <div className="text-sm text-gray-500 mt-2">
                                  Note: {code.note}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 ml-4">
                              <button
                                onClick={() => copyToClipboard(code.code)}
                                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                title="Copy code"
                              >
                                <Copy className="w-4 h-4 text-gray-600" />
                              </button>
                              {code.status === 'active' && !isExpired && (
                                <button
                                  onClick={() => handleRevokeCode(code.codeId)}
                                  className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Revoke code"
                                >
                                  <Trash2 className="w-4 h-4 text-red-600" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {activeTab === 'devices' && (
              <div>
                {/* Header */}
                <div className="mb-6">
                  <h3 className="text-lg font-medium text-gray-900">Enrolled Devices</h3>
                  <p className="text-sm text-gray-500 mt-1">Manage devices and employee links</p>
                </div>

                {/* Devices List */}
                <div className="space-y-3">
                  {devices.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <Smartphone className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                      <p>No devices enrolled yet.</p>
                      <p className="text-sm mt-1">Generate an enrollment code to get started.</p>
                    </div>
                  ) : (
                    devices.map((device) => {
                      const branch = branches.find(b => b.branchId === device.branchId);
                      const isOnline = device.lastSeenAt && new Date(device.lastSeenAt) > new Date(Date.now() - 120000);
                      const linkedEmployees = employees.filter(e => 
                        device.linkedEmployeeIds?.includes(e.employeeId)
                      );

                      return (
                        <div
                          key={device.deviceId}
                          className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-4 flex-1">
                              {/* Status Indicator */}
                              <div className={`w-3 h-3 rounded-full mt-1 ${
                                isOnline ? 'bg-green-500' : 'bg-gray-300'
                              }`} />
                              
                              {/* Device Info */}
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <h4 className="text-base font-medium text-gray-900">
                                    {device.deviceName}
                                  </h4>
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                    isOnline
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-gray-100 text-gray-600'
                                  }`}>
                                    {isOnline ? 'Online' : 'Offline'}
                                  </span>
                                </div>
                                
                                <div className="space-y-1 text-sm text-gray-600">
                                  <div className="flex items-center gap-2">
                                    <Building2 className="w-4 h-4" />
                                    <span>{branch?.branchName || device.branchId}</span>
                                  </div>
                                  {device.lastSeenAt && (
                                    <div className="flex items-center gap-2">
                                      <Clock className="w-4 h-4" />
                                      <span>Last seen {new Date(device.lastSeenAt).toLocaleString()}</span>
                                    </div>
                                  )}
                                  {linkedEmployees.length > 0 && (
                                    <div className="flex items-center gap-2">
                                      <Users className="w-4 h-4" />
                                      <span>{linkedEmployees.map(e => e.employeeName).join(', ')}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 ml-4">
                              <button
                                onClick={() => {
                                  setSelectedDevice(device);
                                  setShowLinkEmployeeModal(true);
                                }}
                                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                              >
                                <LinkIcon className="w-3.5 h-3.5" />
                                Link
                              </button>
                              <button
                                onClick={() => handleRevokeDevice(device.deviceId)}
                                className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                                title="Revoke device"
                              >
                                <Trash2 className="w-4 h-4 text-red-600" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Link Employee Modal */}
      {showLinkEmployeeModal && selectedDevice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Link Employee to Device
              </h3>
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Device</div>
                <div className="font-medium text-gray-900">{selectedDevice.deviceName}</div>
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Employee
                </label>
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  Link Employee
                </button>
                <button
                  onClick={() => {
                    setShowLinkEmployeeModal(false);
                    setSelectedDevice(null);
                    setSelectedEmployeeId('');
                  }}
                  className="flex-1 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
