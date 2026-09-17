/**
 * Schedule Report Modal
 * 
 * Allows users to schedule automated report generation and delivery
 */

'use client';

import { useState } from 'react';
import { X, Clock, Mail, Calendar } from 'lucide-react';

interface ScheduleReportModalProps {
  /** Report type */
  reportType: string;
  
  /** Report name for display */
  reportName: string;
  
  /** Close modal callback */
  onClose: () => void;
  
  /** Save schedule callback */
  onSave: (schedule: ReportSchedule) => Promise<void>;
}

export interface ReportSchedule {
  reportType: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  dayOfWeek?: number; // 0-6 (Sunday-Saturday) for weekly
  dayOfMonth?: number; // 1-31 for monthly
  time: string; // HH:MM format
  recipients: string[]; // Email addresses
  format: 'pdf' | 'excel';
  enabled: boolean;
}

export function ScheduleReportModal({
  reportType,
  reportName,
  onClose,
  onSave,
}: ScheduleReportModalProps) {
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [dayOfWeek, setDayOfWeek] = useState<number>(1); // Monday
  const [dayOfMonth, setDayOfMonth] = useState<number>(1);
  const [time, setTime] = useState<string>('09:00');
  const [recipients, setRecipients] = useState<string>('');
  const [format, setFormat] = useState<'pdf' | 'excel'>('pdf');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      
      // Validate recipients
      const emailList = recipients
        .split(',')
        .map(email => email.trim())
        .filter(Boolean);
      
      if (emailList.length === 0) {
        setError('Please enter at least one recipient email');
        return;
      }
      
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const invalidEmails = emailList.filter(email => !emailRegex.test(email));
      if (invalidEmails.length > 0) {
        setError(`Invalid email format: ${invalidEmails.join(', ')}`);
        return;
      }
      
      const schedule: ReportSchedule = {
        reportType,
        frequency,
        dayOfWeek: frequency === 'weekly' ? dayOfWeek : undefined,
        dayOfMonth: frequency === 'monthly' ? dayOfMonth : undefined,
        time,
        recipients: emailList,
        format,
        enabled: true,
      };
      
      await onSave(schedule);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save schedule');
    } finally {
      setSaving(false);
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <Clock size={24} className="text-blue-400" />
            <h2 className="text-xl font-semibold">Schedule {reportName}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Frequency */}
          <div>
            <label className="block text-sm font-medium mb-2">Frequency</label>
            <div className="grid grid-cols-3 gap-3">
              {(['daily', 'weekly', 'monthly'] as const).map(freq => (
                <button
                  key={freq}
                  onClick={() => setFrequency(freq)}
                  className={`px-4 py-3 rounded-lg border-2 transition-colors ${
                    frequency === freq
                      ? 'border-blue-500 bg-blue-500/20'
                      : 'border-gray-600 hover:border-gray-500'
                  }`}
                >
                  {freq.charAt(0).toUpperCase() + freq.slice(1)}
                </button>
              ))}
            </div>
          </div>
          
          {/* Day of Week (for weekly) */}
          {frequency === 'weekly' && (
            <div>
              <label className="block text-sm font-medium mb-2">Day of Week</label>
              <select
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(Number(e.target.value))}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value={0}>Sunday</option>
                <option value={1}>Monday</option>
                <option value={2}>Tuesday</option>
                <option value={3}>Wednesday</option>
                <option value={4}>Thursday</option>
                <option value={5}>Friday</option>
                <option value={6}>Saturday</option>
              </select>
            </div>
          )}
          
          {/* Day of Month (for monthly) */}
          {frequency === 'monthly' && (
            <div>
              <label className="block text-sm font-medium mb-2">Day of Month</label>
              <input
                type="number"
                min="1"
                max="31"
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(Number(e.target.value))}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}
          
          {/* Time */}
          <div>
            <label className="block text-sm font-medium mb-2">Time</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-400 mt-1">
              Report will be generated and sent at this time (server timezone)
            </p>
          </div>
          
          {/* Recipients */}
          <div>
            <label className="block text-sm font-medium mb-2 flex items-center gap-2">
              <Mail size={16} />
              Recipients
            </label>
            <textarea
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder="email1@example.com, email2@example.com"
              rows={3}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-400 mt-1">
              Enter email addresses separated by commas
            </p>
          </div>
          
          {/* Format */}
          <div>
            <label className="block text-sm font-medium mb-2">Format</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setFormat('pdf')}
                className={`px-4 py-3 rounded-lg border-2 transition-colors ${
                  format === 'pdf'
                    ? 'border-blue-500 bg-blue-500/20'
                    : 'border-gray-600 hover:border-gray-500'
                }`}
              >
                PDF
              </button>
              <button
                onClick={() => setFormat('excel')}
                className={`px-4 py-3 rounded-lg border-2 transition-colors ${
                  format === 'excel'
                    ? 'border-blue-500 bg-blue-500/20'
                    : 'border-gray-600 hover:border-gray-500'
                }`}
              >
                Excel
              </button>
            </div>
          </div>
          
          {/* Error message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500 rounded-lg p-4">
              <p className="text-red-400">{error}</p>
            </div>
          )}
          
          {/* Schedule Preview */}
          <div className="bg-blue-500/10 border border-blue-500 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Calendar size={20} className="text-blue-400 mt-0.5" />
              <div>
                <p className="font-medium text-blue-400 mb-1">Schedule Preview</p>
                <p className="text-sm text-gray-300">
                  {frequency === 'daily' && `This report will be sent daily at ${time}`}
                  {frequency === 'weekly' && `This report will be sent every ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek]} at ${time}`}
                  {frequency === 'monthly' && `This report will be sent on day ${dayOfMonth} of each month at ${time}`}
                </p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}
