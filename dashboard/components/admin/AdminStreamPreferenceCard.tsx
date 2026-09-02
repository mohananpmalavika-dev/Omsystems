'use client';

import React, { useState, useEffect } from 'react';
import {
  VideoCameraIcon,
  BoltIcon,
  SparklesIcon,
  CheckCircleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

export type StreamPreference = 'MAINSTREAM' | 'SUBSTREAM' | 'AUTO';

export function AdminStreamPreferenceCard() {
  const [preference, setPreference] = useState<StreamPreference>('AUTO');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadPreference() {
      try {
        const res = await fetch('/api/admin/system/stream-preference');
        if (res.ok) {
          const data = await res.json();
          setPreference(data.preference || 'AUTO');
        }
      } catch (err) {
        console.error('Failed to load stream preference', err);
      } finally {
        setLoading(false);
      }
    }
    loadPreference();
  }, []);

  const handleUpdate = async (newPref: StreamPreference) => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/system/stream-preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preference: newPref }),
      });
      if (res.ok) {
        const data = await res.json();
        setPreference(data.preference);
        setMessage(`Stream quality successfully updated to ${newPref}`);
        setTimeout(() => setMessage(null), 4000);
      }
    } catch (err: any) {
      setMessage(`Error: ${err.message || 'Failed to update'}`);
    } finally {
      setSaving(false);
    }
  };

  const options = [
    {
      id: 'MAINSTREAM' as StreamPreference,
      title: 'Main Stream (Full Resolution)',
      badge: '1080p / 4K Ultra HD',
      description: 'Forces high-definition clarity across all live camera feeds, video walls, and player views.',
      icon: SparklesIcon,
      color: 'blue',
      bandwidthNote: 'High Bandwidth (~2-4 Mbps/cam)',
    },
    {
      id: 'SUBSTREAM' as StreamPreference,
      title: 'Sub Stream (Low Bandwidth)',
      badge: '640x480 / 360p Fast',
      description: 'Forces ultra-lightweight streams across all channels to maximize speed and minimize network load.',
      icon: BoltIcon,
      color: 'emerald',
      bandwidthNote: 'Low Bandwidth (~256-512 Kbps/cam)',
    },
    {
      id: 'AUTO' as StreamPreference,
      title: 'Adaptive Auto (Dynamic)',
      badge: 'Smart Grid Scheduler',
      description: 'Automatically chooses substream for multi-camera grids and main stream for single-camera zoom.',
      icon: ArrowPathIcon,
      color: 'purple',
      bandwidthNote: 'Optimized Dynamic Bandwidth',
    },
  ];

  if (loading) {
    return (
      <div className="p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 animate-pulse">
        <div className="h-6 w-48 bg-gray-200 dark:bg-gray-700 rounded mb-4"></div>
        <div className="h-4 w-96 bg-gray-200 dark:bg-gray-700 rounded mb-6"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
            <VideoCameraIcon className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Global Video Stream Quality Configuration
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Set whether all DVR and camera streams operate in Full Main Stream (1080p) or Low Sub Stream.
            </p>
          </div>
        </div>
        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 uppercase tracking-wider">
          Active: {preference}
        </span>
      </div>

      {message && (
        <div className="mt-4 p-3 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-sm rounded-lg flex items-center gap-2">
          <CheckCircleIcon className="h-5 w-5 flex-shrink-0" />
          <span>{message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        {options.map((opt) => {
          const isSelected = preference === opt.id;
          const Icon = opt.icon;

          return (
            <div
              key={opt.id}
              onClick={() => !saving && handleUpdate(opt.id)}
              className={`relative p-5 rounded-xl border-2 transition-all cursor-pointer ${
                isSelected
                  ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-950/20 shadow-md ring-2 ring-blue-500/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className={`p-2 rounded-lg ${
                  isSelected ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                }`}>
                  <Icon className="h-5 w-5" />
                </div>
                {isSelected && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/50 px-2 py-0.5 rounded-full">
                    <CheckCircleIcon className="h-3.5 w-3.5" /> Enforced
                  </span>
                )}
              </div>

              <h4 className="font-semibold text-gray-900 dark:text-white text-base mt-4">
                {opt.title}
              </h4>
              <span className="inline-block mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                {opt.badge}
              </span>
              <p className="text-xs text-gray-600 dark:text-gray-300 mt-2 leading-relaxed">
                {opt.description}
              </p>

              <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 text-[11px] font-medium text-gray-500 dark:text-gray-400 flex items-center justify-between">
                <span>{opt.bandwidthNote}</span>
                <button
                  disabled={saving}
                  className={`text-xs font-semibold px-2.5 py-1 rounded transition-colors ${
                    isSelected
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                  }`}
                >
                  {isSelected ? 'Active' : 'Apply'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
