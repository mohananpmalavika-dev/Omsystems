/**
 * Recipient Group Manager
 * UI for managing notification recipient groups and members
 */

import React, { useState, useEffect } from 'react';
import { Users, Mail, Phone, Plus, Trash2, Edit2, Save, X, CheckCircle } from 'lucide-react';

interface RecipientMember {
  id?: string;
  userId?: string;
  displayName: string;
  email?: string;
  phone?: string;
  voiceNumber?: string;
  preferredLanguage: string;
  enabled: boolean;
}

interface RecipientGroup {
  id?: string;
  name: string;
  description?: string;
  scopeType: string;
  members: RecipientMember[];
}

export function RecipientGroupManager() {
  const [groups, setGroups] = useState<RecipientGroup[]>([]);
  const [editingGroup, setEditingGroup] = useState<RecipientGroup | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    try {
      const response = await fetch('/v1/notification-recipient-groups');
      const data = await response.json();
      setGroups(data.data || []);
    } catch (error) {
      console.error('Failed to load recipient groups:', error);
    }
  };

  const handleCreateGroup = () => {
    setEditingGroup({
      name: '',
      description: '',
      scopeType: 'TENANT',
      members: [],
    });
    setShowCreateForm(true);
  };

  const handleSaveGroup = async () => {
    if (!editingGroup) return;

    if (!editingGroup.name.trim()) {
      alert('Group name is required');
      return;
    }

    if (editingGroup.members.length === 0) {
      alert('At least one member is required');
      return;
    }

    setLoading(true);
    try {
      const endpoint = editingGroup.id
        ? `/v1/notification-recipient-groups/${editingGroup.id}`
        : '/v1/notification-recipient-groups';

      const method = editingGroup.id ? 'PUT' : 'POST';

      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingGroup),
      });

      if (!response.ok) {
        throw new Error('Failed to save recipient group');
      }

      await loadGroups();
      setEditingGroup(null);
      setShowCreateForm(false);
    } catch (error) {
      alert('Failed to save recipient group: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = () => {
    if (!editingGroup) return;

    setEditingGroup({
      ...editingGroup,
      members: [
        ...editingGroup.members,
        {
          displayName: '',
          email: '',
          phone: '',
          preferredLanguage: 'en',
          enabled: true,
        },
      ],
    });
  };

  const handleUpdateMember = (index: number, updates: Partial<RecipientMember>) => {
    if (!editingGroup) return;

    const updatedMembers = [...editingGroup.members];
    updatedMembers[index] = { ...updatedMembers[index], ...updates };

    setEditingGroup({
      ...editingGroup,
      members: updatedMembers,
    });
  };

  const handleRemoveMember = (index: number) => {
    if (!editingGroup) return;

    setEditingGroup({
      ...editingGroup,
      members: editingGroup.members.filter((_, i) => i !== index),
    });
  };

  const validatePhoneNumber = (phone: string): boolean => {
    return /^\+[1-9]\d{1,14}$/.test(phone);
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Recipient Groups</h1>
          <p className="text-sm text-gray-600 mt-1">
            Manage notification recipient groups and their members
          </p>
        </div>
        <button
          onClick={handleCreateGroup}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Group
        </button>
      </div>

      {/* Groups List */}
      {!showCreateForm && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map(group => (
            <div key={group.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{group.name}</h3>
                  {group.description && (
                    <p className="text-sm text-gray-600 mt-1">{group.description}</p>
                  )}
                </div>
                <button
                  onClick={() => {
                    setEditingGroup(group);
                    setShowCreateForm(true);
                  }}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Users className="w-4 h-4" />
                <span>{group.members?.length || 0} members</span>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-200">
                <div className="flex flex-wrap gap-1">
                  {group.members?.slice(0, 3).map((member, idx) => (
                    <div key={idx} className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                      {member.displayName}
                    </div>
                  ))}
                  {(group.members?.length || 0) > 3 && (
                    <div className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">
                      +{(group.members?.length || 0) - 3} more
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Form */}
      {showCreateForm && editingGroup && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              {editingGroup.id ? 'Edit' : 'Create'} Recipient Group
            </h2>
            <button
              onClick={() => {
                setEditingGroup(null);
                setShowCreateForm(false);
              }}
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Group Details */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Group Name *
              </label>
              <input
                type="text"
                value={editingGroup.name}
                onChange={(e) => setEditingGroup({ ...editingGroup, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., SOC Team"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Description
              </label>
              <textarea
                value={editingGroup.description || ''}
                onChange={(e) => setEditingGroup({ ...editingGroup, description: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Optional description"
              />
            </div>
          </div>

          {/* Members */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900">Members</h3>
              <button
                onClick={handleAddMember}
                className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                Add Member
              </button>
            </div>

            <div className="space-y-3">
              {editingGroup.members.map((member, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Display Name *
                      </label>
                      <input
                        type="text"
                        value={member.displayName}
                        onChange={(e) => handleUpdateMember(index, { displayName: e.target.value })}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="John Doe"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Email
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="email"
                          value={member.email || ''}
                          onChange={(e) => handleUpdateMember(index, { email: e.target.value })}
                          className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="email@example.com"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Phone (E.164)
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="tel"
                          value={member.phone || ''}
                          onChange={(e) => handleUpdateMember(index, { phone: e.target.value })}
                          className={`w-full pl-8 pr-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                            member.phone && !validatePhoneNumber(member.phone)
                              ? 'border-red-300'
                              : 'border-gray-300'
                          }`}
                          placeholder="+919876543210"
                        />
                      </div>
                      {member.phone && !validatePhoneNumber(member.phone) && (
                        <p className="text-xs text-red-600 mt-1">Invalid format. Use +[country][number]</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={member.enabled}
                        onChange={(e) => handleUpdateMember(index, { enabled: e.target.checked })}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Enabled</span>
                    </label>

                    <button
                      onClick={() => handleRemoveMember(index)}
                      className="p-1 text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}

              {editingGroup.members.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No members yet. Click "Add Member" to get started.</p>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-200">
            <button
              onClick={() => {
                setEditingGroup(null);
                setShowCreateForm(false);
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveGroup}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Group
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
