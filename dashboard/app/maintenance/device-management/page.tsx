"use client";

import React, { useState } from "react";
import Link from "next/link";
import { DeviceSelector, type Device } from "@/components/device-management/device-selector";
import { CredentialRotationForm } from "@/components/device-management/credential-rotation-form";
import { JobMonitor } from "@/components/device-management/job-monitor";

export default function DeviceManagementPage() {
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'credentials' | 'network' | 'configuration' | 'history'>('overview');

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Device Management</h1>
        <p className="mt-1 text-sm text-gray-600">
          Secure device configuration, credential rotation, and template management
        </p>
        <Link href="/maintenance" className="mt-2 inline-block text-sm text-blue-600 hover:text-blue-700">
          ← Back to maintenance dashboard
        </Link>
      </div>

      {/* Branch Selector */}
      <div className="mb-6 p-4 bg-white border border-gray-200 rounded-lg">
        <label htmlFor="branch" className="block text-sm font-medium text-gray-700 mb-2">
          Select Branch
        </label>
        <select
          id="branch"
          value={selectedBranch}
          onChange={(e) => {
            setSelectedBranch(e.target.value);
            setSelectedDevice(null);
          }}
          className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">-- Select a branch --</option>
          <option value="branch-1">Branch 1 - Mumbai</option>
          <option value="branch-2">Branch 2 - Delhi</option>
          <option value="branch-3">Branch 3 - Bangalore</option>
        </select>
      </div>

      {/* Device Selector */}
      {selectedBranch && (
        <div className="mb-6">
          <DeviceSelector
            branchId={selectedBranch}
            value={selectedDevice}
            onChange={setSelectedDevice}
          />
        </div>
      )}

      {/* Device Info and Tabs */}
      {selectedDevice && (
        <>
          {/* Device Summary Card */}
          <div className="mb-6 p-4 bg-white border border-gray-200 rounded-lg">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{selectedDevice.deviceId}</h2>
                <p className="text-sm text-gray-600">
                  {selectedDevice.manufacturer} {selectedDevice.model}
                </p>
              </div>
              <span
                className={`px-3 py-1 text-sm rounded-full ${
                  selectedDevice.healthStatus === 'online'
                    ? 'bg-green-100 text-green-800'
                    : selectedDevice.healthStatus === 'offline'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-yellow-100 text-yellow-800'
                }`}
              >
                {selectedDevice.healthStatus}
              </span>
            </div>
          </div>

          {/* Tabs */}
          <div className="mb-6">
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8">
                {[
                  { id: 'overview', label: 'Overview' },
                  { id: 'credentials', label: 'Credentials' },
                  { id: 'network', label: 'Network' },
                  { id: 'configuration', label: 'Configuration' },
                  { id: 'history', label: 'History' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {/* Tab Content */}
          <div className="space-y-6">
            {activeTab === 'overview' && (
              <div className="p-6 bg-white border border-gray-200 rounded-lg">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Device Overview</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Device ID</dt>
                    <dd className="mt-1 text-sm text-gray-900">{selectedDevice.deviceId}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Status</dt>
                    <dd className="mt-1 text-sm text-gray-900">{selectedDevice.healthStatus}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Manufacturer</dt>
                    <dd className="mt-1 text-sm text-gray-900">{selectedDevice.manufacturer}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Model</dt>
                    <dd className="mt-1 text-sm text-gray-900">{selectedDevice.model}</dd>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'credentials' && (
              <div className="p-6 bg-white border border-gray-200 rounded-lg">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Credential Rotation</h3>
                <CredentialRotationForm device={selectedDevice} />
              </div>
            )}

            {activeTab === 'network' && (
              <div className="p-6 bg-white border border-gray-200 rounded-lg">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Network Configuration</h3>
                <p className="text-sm text-gray-600">Network configuration management coming soon...</p>
              </div>
            )}

            {activeTab === 'configuration' && (
              <div className="p-6 bg-white border border-gray-200 rounded-lg">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Configuration</h3>
                <p className="text-sm text-gray-600">Configuration management coming soon...</p>
              </div>
            )}

            {activeTab === 'history' && (
              <div className="p-6 bg-white border border-gray-200 rounded-lg">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Change History</h3>
                <p className="text-sm text-gray-600">Change history coming soon...</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Job Monitor - Always visible when there are active jobs */}
      <div className="mt-8">
        <JobMonitor deviceId={selectedDevice?.id} />
      </div>
    </div>
  );
}
