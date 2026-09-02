'use client';

import React from 'react';
import { AppLayout } from '@/components/app-layout';
import { AdminStreamPreferenceCard } from '@/components/admin/AdminStreamPreferenceCard';
import { Video, ShieldCheck, ArrowLeft, Info, Server, Network } from 'lucide-react';
import Link from 'next/link';

export default function AdminStreamSettingsPage() {
  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-800 pb-5">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-1">
              <Link href="/admin" className="hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1">
                <ArrowLeft className="h-4 w-4" /> Administration
              </Link>
              <span>/</span>
              <span className="text-gray-900 dark:text-white font-medium">Video Stream Quality</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Video className="h-7 w-7 text-blue-600 dark:text-blue-400" />
              Global Stream Resolution & Bandwidth Settings
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Configure system-wide video stream resolution across all DVRs, NVRs, live monitoring grids, and AI analytics.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/admin/system"
              className="px-3.5 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              System Management
            </Link>
          </div>
        </div>

        {/* Global Admin Preference Card */}
        <AdminStreamPreferenceCard />

        {/* Technical Explanation & Architecture Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-3">
              <Server className="h-5 w-5 text-blue-600" />
              Main Stream (1080p / 4K) Mode
            </h3>
            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">•</span>
                <span><strong>Resolution:</strong> Full native resolution (1920x1080, 2K, or 4K Ultra HD).</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">•</span>
                <span><strong>Bitrate:</strong> ~2 Mbps to 4 Mbps+ per active camera channel.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">•</span>
                <span><strong>Best For:</strong> High-bandwidth WAN/LAN, high-definition control room monitors, and legal evidence validation.</span>
              </li>
            </ul>
          </div>

          <div className="p-5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-3">
              <Network className="h-5 w-5 text-emerald-600" />
              Sub Stream (640x480 / 360p) Mode
            </h3>
            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
              <li className="flex items-start gap-2">
                <span className="text-emerald-600 font-bold">•</span>
                <span><strong>Resolution:</strong> 640x480 (VGA) or 640x360 (360p).</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-600 font-bold">•</span>
                <span><strong>Bitrate:</strong> ~256 Kbps to 512 Kbps per camera channel.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-600 font-bold">•</span>
                <span><strong>Best For:</strong> Large 16/32/64 camera video walls, 4G/LTE branch failover, and remote mobile viewing.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
