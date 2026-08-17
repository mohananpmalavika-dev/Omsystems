/**
 * Notification Policy Editor
 * Production-ready UI for configuring notification policies
 */

import React, { useState, useEffect } from 'react';
import { 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  Users, 
  Bell, 
  Mail, 
  MessageSquare, 
  Phone,
  Monitor,
  Send,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  Save,
  Eye,
  AlertTriangle,
} from 'lucide-react';

interface NotificationChannel {
  id: string;
  name: string;
  icon: React.ReactNode;
  description: string;
}

interface AlertSeverity {
  level: string;
  label: string;
  color: string;
  description: string;
}

interface RecipientGroup {
  id: string;
  name: string;
  memberCount: number;
  scope: string;
}

interface NotificationRule {
  channels: string[];
  recipientGroupIds: string[];
  requireAcknowledgement: boolean;
  repeatUntilAcknowledged: boolean;
}

interface EscalationStep {
  afterSeconds: number;
  recipientGroupIds: string[];
  channels: string[];
  stopOnAcknowledgement: boolean;
}

interface NotificationPolicy {
  id?: string;
  name: string;
  description?: string;
  status: 'DRAFT' | 'PUBLISHED';
  p1Rule: NotificationRule;
  p2Rule: NotificationRule;
  p3Rule: NotificationRule;
  p4Rule: NotificationRule;
  p5Rule: NotificationRule;
  quietHours?: {
    enabled: boolean;
    start: string;
    end: string;
    timezone: string;
    bypassSeverities: string[];
  };
  rateLimits: {
    perMinute: number;
    perRecipientPerMinute: number;
  };
  p1Escalation?: {
    acknowledgeRequired: boolean;
    steps: EscalationStep[];
  };
  p2Escalation?: {
    acknowledgeRequired: boolean;
    steps: EscalationStep[];
  };
}

const CHANNELS: NotificationChannel[] = [
  { id: 'dashboard', name: 'Dashboard', icon: <Monitor className="w-4 h-4" />, description: 'Real-time dashboard alerts' },
  { id: 'email', name: 'Email', icon: <Mail className="w-4 h-4" />, description: 'Email notifications' },
  { id: 'sms', name: 'SMS', icon: <MessageSquare className="w-4 h-4" />, description: 'SMS text messages' },
  { id: 'voice', name: 'Voice', icon: <Phone className="w-4 h-4" />, description: 'Voice call alerts' },
];

const SEVERITIES: AlertSeverity[] = [
  { level: 'P1', label: 'Critical', color: 'red', description: 'Immediate action required' },
  { level: 'P2', label: 'High', color: 'orange', description: 'Urgent attention needed' },
  { level: 'P3', label: 'Medium', color: 'yellow', description: 'Important but not urgent' },
  { level: 'P4', label: 'Low', color: 'blue', description: 'Informational' },
  { level: 'P5', label: 'Info', color: 'gray', description: 'Logging only' },
];

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export function NotificationPolicyEditor() {
  const [policy, setPolicy] = useState<NotificationPolicy>({
    name: '',
    status: 'DRAFT',
    p1Rule: { channels: ['dashboard', 'sms', 'email', 'voice'], recipientGroupIds: [], requireAcknowledgement: true, repeatUntilAcknowledged: true },
    p2Rule: { channels: ['dashboard', 'email', 'sms'], recipientGroupIds: [], requireAcknowledgement: true, repeatUntilAcknowledged: false },
    p3Rule: { channels: ['dashboard', 'email'], recipientGroupIds: [], requireAcknowledgement: false, repeatUntilAcknowledged: false },
    p4Rule: { channels: ['dashboard'], recipientGroupIds: [], requireAcknowledgement: false, repeatUntilAcknowledged: false },
    p5Rule: { channels: [], recipientGroupIds: [], requireAcknowledgement: false, repeatUntilAcknowledged: false },
    rateLimits: { perMinute: 120, perRecipientPerMinute: 10 },
  });

  const [recipientGroups, setRecipientGroups] = useState<RecipientGroup[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['matrix', 'quietHours']));

  useEffect(() => {
    loadRecipientGroups();
  }, []);

  const loadRecipientGroups = async () => {
    try {
      const response = await fetch('/v1/notification-recipient-groups');
      const data = await response.json();
      setRecipientGroups(data.data || []);
    } catch (error) {
      console.error('Failed to load recipient groups:', error);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const updateRule = (severity: string, updates: Partial<NotificationRule>) => {
    const ruleKey = `${severity.toLowerCase()}Rule` as keyof NotificationPolicy;
    setPolicy(prev => ({
      ...prev,
      [ruleKey]: { ...prev[ruleKey] as NotificationRule, ...updates },
    }));
  };

  const toggleChannel = (severity: string, channelId: string) => {
    const ruleKey = `${severity.toLowerCase()}Rule` as keyof NotificationPolicy;
    const rule = policy[ruleKey] as NotificationRule;
    const channels = rule.channels.includes(channelId)
      ? rule.channels.filter(c => c !== channelId)
      : [...rule.channels, channelId];
    
    updateRule(severity, { channels });
  };

  const addRecipientGroup = (severity: string, groupId: string) => {
    const ruleKey = `${severity.toLowerCase()}Rule` as keyof NotificationPolicy;
    const rule = policy[ruleKey] as NotificationRule;
    if (!rule.recipientGroupIds.includes(groupId)) {
      updateRule(severity, {
        recipientGroupIds: [...rule.recipientGroupIds, groupId],
      });
    }
  };

  const removeRecipientGroup = (severity: string, groupId: string) => {
    const ruleKey = `${severity.toLowerCase()}Rule` as keyof NotificationPolicy;
    const rule = policy[ruleKey] as NotificationRule;
    updateRule(severity, {
      recipientGroupIds: rule.recipientGroupIds.filter(id => id !== groupId),
    });
  };

  const validatePolicy = (): boolean => {
    const errors: string[] = [];

    if (!policy.name || policy.name.trim().length === 0) {
      errors.push('Policy name is required');
    }

    // Validate quiet hours
    if (policy.quietHours?.enabled) {
      if (!policy.quietHours.start || !policy.quietHours.end) {
        errors.push('Quiet hours start and end times are required');
      }
      if (!policy.quietHours.timezone) {
        errors.push('Quiet hours timezone is required');
      }
    }

    // Validate rules
    SEVERITIES.forEach(severity => {
      const ruleKey = `${severity.level.toLowerCase()}Rule` as keyof NotificationPolicy;
      const rule = policy[ruleKey] as NotificationRule;
      
      if (rule.channels.length > 0 && rule.recipientGroupIds.length === 0) {
        errors.push(`${severity.label} (${severity.level}): Channels selected but no recipient groups`);
      }
      if (rule.recipientGroupIds.length > 0 && rule.channels.length === 0) {
        errors.push(`${severity.label} (${severity.level}): Recipient groups selected but no channels`);
      }
    });

    setErrors(errors);
    return errors.length === 0;
  };

  const handleSave = async () => {
    if (!validatePolicy()) {
      return;
    }

    setSaving(true);
    try {
      const endpoint = policy.id 
        ? `/v1/notification-policies/${policy.id}`
        : '/v1/notification-policies';
      
      const method = policy.id ? 'PUT' : 'POST';

      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(policy),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save policy');
      }

      const result = await response.json();
      setPolicy(result.data);
      
      // Show success message
      alert('Policy saved successfully');
    } catch (error) {
      alert('Failed to save policy: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!policy.id) {
      alert('Please save the policy before publishing');
      return;
    }

    if (!validatePolicy()) {
      return;
    }

    if (!confirm('Publishing will activate this policy. Are you sure?')) {
      return;
    }

    try {
      const response = await fetch(`/v1/notification-policies/${policy.id}/publish`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to publish policy');
      }

      const result = await response.json();
      setPolicy(result.data);
      
      alert('Policy published successfully');
    } catch (error) {
      alert('Failed to publish policy: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleTest = async () => {
    if (!validatePolicy()) {
      return;
    }

    setTesting(true);
    try {
      const response = await fetch('/v1/notification-policies/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          severity: 'P2',
          channels: policy.p2Rule.channels,
          recipientGroupIds: policy.p2Rule.recipientGroupIds,
          customMessage: 'This is a test notification from Sentinel Grid',
        }),
      });

      if (!response.ok) {
        throw new Error('Test notification failed');
      }

      const result = await response.json();
      
      alert(`Test notification sent successfully!\n\nDelivered to ${result.results.length} recipients`);
    } catch (error) {
      alert('Failed to send test notification: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Notification Policy</h1>
            <p className="text-sm text-gray-600 mt-1">
              Configure alert notification routing, escalation, and delivery preferences
            </p>
          </div>
          <div className="flex items-center gap-2">
            {policy.status === 'PUBLISHED' && (
              <span className="px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded-full">
                ● Published
              </span>
            )}
            {policy.status === 'DRAFT' && (
              <span className="px-3 py-1 bg-gray-100 text-gray-600 text-sm font-medium rounded-full">
                ● Draft
              </span>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Policy Name
            </label>
            <input
              type="text"
              value={policy.name}
              onChange={(e) => setPolicy(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., Default Notification Policy"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Description
            </label>
            <textarea
              value={policy.description || ''}
              onChange={(e) => setPolicy(prev => ({ ...prev, description: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Optional description of this policy"
            />
          </div>
        </div>
      </div>

      {/* Validation Errors */}
      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 mr-3" />
            <div>
              <h3 className="text-sm font-medium text-red-800 mb-2">Policy Validation Errors</h3>
              <ul className="space-y-1">
                {errors.map((error, index) => (
                  <li key={index} className="text-sm text-red-700">• {error}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Notification Matrix */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <button
          onClick={() => toggleSection('matrix')}
          className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-gray-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Notification Matrix</h2>
              <p className="text-sm text-gray-600">Configure channels and recipients for each severity level</p>
            </div>
          </div>
          {expandedSections.has('matrix') ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </button>

        {expandedSections.has('matrix') && (
          <div className="px-6 pb-6 space-y-6">
            {SEVERITIES.map(severity => {
              const ruleKey = `${severity.level.toLowerCase()}Rule` as keyof NotificationPolicy;
              const rule = policy[ruleKey] as NotificationRule;

              return (
                <div key={severity.level} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className={`text-lg font-semibold text-${severity.color}-600`}>
                        {severity.level} - {severity.label}
                      </h3>
                      <p className="text-sm text-gray-600">{severity.description}</p>
                    </div>
                  </div>

                  {/* Channels */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                      Notification Channels
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {CHANNELS.map(channel => (
                        <button
                          key={channel.id}
                          onClick={() => toggleChannel(severity.level, channel.id)}
                          className={`px-4 py-2 rounded-lg border-2 transition-all flex items-center gap-2 ${
                            rule.channels.includes(channel.id)
                              ? 'border-blue-500 bg-blue-50 text-blue-700'
                              : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                          }`}
                          title={channel.description}
                        >
                          {channel.icon}
                          <span className="text-sm font-medium">{channel.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Recipient Groups */}
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                      Recipient Groups
                    </label>
                    
                    {/* Selected Groups */}
                    {rule.recipientGroupIds.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {rule.recipientGroupIds.map(groupId => {
                          const group = recipientGroups.find(g => g.id === groupId);
                          if (!group) return null;
                          
                          return (
                            <div
                              key={groupId}
                              className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 text-blue-800 rounded-full text-sm"
                            >
                              <Users className="w-3.5 h-3.5" />
                              <span>{group.name}</span>
                              <span className="text-blue-600">({group.memberCount})</span>
                              <button
                                onClick={() => removeRecipientGroup(severity.level, groupId)}
                                className="hover:bg-blue-200 rounded-full p-0.5 transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Add Group Dropdown */}
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          addRecipientGroup(severity.level, e.target.value);
                          e.target.value = '';
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    >
                      <option value="">+ Add recipient group</option>
                      {recipientGroups
                        .filter(g => !rule.recipientGroupIds.includes(g.id))
                        .map(group => (
                          <option key={group.id} value={group.id}>
                            {group.name} ({group.memberCount} members)
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Acknowledgement Options */}
                  <div className="mt-4 space-y-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={rule.requireAcknowledgement}
                        onChange={(e) => updateRule(severity.level, { requireAcknowledgement: e.target.checked })}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Require acknowledgement</span>
                    </label>

                    {rule.requireAcknowledgement && (
                      <label className="flex items-center gap-2 ml-6">
                        <input
                          type="checkbox"
                          checked={rule.repeatUntilAcknowledged}
                          onChange={(e) => updateRule(severity.level, { repeatUntilAcknowledged: e.target.checked })}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">Repeat until acknowledged</span>
                      </label>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quiet Hours */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <button
          onClick={() => toggleSection('quietHours')}
          className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-gray-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Quiet Hours</h2>
              <p className="text-sm text-gray-600">Suppress non-critical notifications during specific hours</p>
            </div>
          </div>
          {expandedSections.has('quietHours') ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </button>

        {expandedSections.has('quietHours') && (
          <div className="px-6 pb-6 space-y-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={policy.quietHours?.enabled || false}
                onChange={(e) => setPolicy(prev => ({
                  ...prev,
                  quietHours: {
                    enabled: e.target.checked,
                    start: prev.quietHours?.start || '22:00',
                    end: prev.quietHours?.end || '06:00',
                    timezone: prev.quietHours?.timezone || 'UTC',
                    bypassSeverities: prev.quietHours?.bypassSeverities || ['P1'],
                  },
                }))}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-900">Enable quiet hours</span>
            </label>

            {policy.quietHours?.enabled && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={policy.quietHours.start}
                    onChange={(e) => setPolicy(prev => ({
                      ...prev,
                      quietHours: { ...prev.quietHours!, start: e.target.value },
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1">End Time</label>
                  <input
                    type="time"
                    value={policy.quietHours.end}
                    onChange={(e) => setPolicy(prev => ({
                      ...prev,
                      quietHours: { ...prev.quietHours!, end: e.target.value },
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-900 mb-1">Timezone</label>
                  <select
                    value={policy.quietHours.timezone}
                    onChange={(e) => setPolicy(prev => ({
                      ...prev,
                      quietHours: { ...prev.quietHours!, timezone: e.target.value },
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {TIMEZONES.map(tz => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Bypass quiet hours for
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {SEVERITIES.slice(0, 3).map(severity => (
                      <label key={severity.level} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={policy.quietHours?.bypassSeverities.includes(severity.level)}
                          onChange={(e) => {
                            const bypassed = policy.quietHours!.bypassSeverities;
                            setPolicy(prev => ({
                              ...prev,
                              quietHours: {
                                ...prev.quietHours!,
                                bypassSeverities: e.target.checked
                                  ? [...bypassed, severity.level]
                                  : bypassed.filter(s => s !== severity.level),
                              },
                            }));
                          }}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{severity.level}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Rate Limits */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Rate Limits</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Notifications per minute
            </label>
            <input
              type="number"
              value={policy.rateLimits.perMinute}
              onChange={(e) => setPolicy(prev => ({
                ...prev,
                rateLimits: { ...prev.rateLimits, perMinute: parseInt(e.target.value) || 120 },
              }))}
              min={1}
              max={10000}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Per recipient per minute
            </label>
            <input
              type="number"
              value={policy.rateLimits.perRecipientPerMinute}
              onChange={(e) => setPolicy(prev => ({
                ...prev,
                rateLimits: { ...prev.rateLimits, perRecipientPerMinute: parseInt(e.target.value) || 10 },
              }))}
              min={1}
              max={100}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-4">
        <div className="text-sm text-gray-600">
          {policy.status === 'DRAFT' && 'Save as draft or publish to activate'}
          {policy.status === 'PUBLISHED' && 'Policy is live and active'}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleTest}
            disabled={testing || !policy.p2Rule.recipientGroupIds.length}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {testing ? (
              <>
                <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send Test
              </>
            )}
          </button>

          <button
            onClick={handleSave}
            disabled={saving || policy.status === 'PUBLISHED'}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Draft
              </>
            )}
          </button>

          {policy.status === 'DRAFT' && (
            <button
              onClick={handlePublish}
              disabled={!policy.id}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              Publish
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
