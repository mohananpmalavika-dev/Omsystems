/**
 * Action Checklist Component
 * Display and track recommended actions
 */

import React, { useState } from 'react';
import type { ActionChecklistProps } from '../types/ui-types';
import type { ActionState } from '../types/ui-types';
import { formatEventType } from '../utils/formatters';

export function ActionChecklist({
  actions,
  onActionUpdate,
  className,
}: ActionChecklistProps) {
  const [actionStates, setActionStates] = useState<Map<string, ActionState>>(
    new Map(
      actions.map((action) => [
        action.id,
        {
          actionId: action.id,
          status: 'pending',
        },
      ])
    )
  );

  const handleStatusChange = (actionId: string, status: ActionState['status']) => {
    const currentState = actionStates.get(actionId);
    const newState: ActionState = {
      ...currentState,
      actionId,
      status,
      completedAt: status === 'completed' ? new Date() : undefined,
    };

    setActionStates(new Map(actionStates.set(actionId, newState)));
    onActionUpdate?.(actionId, newState);
  };

  const handleAddNotes = (actionId: string) => {
    const notes = prompt('Add notes for this action:');
    if (notes) {
      const currentState = actionStates.get(actionId);
      const newState: ActionState = {
        ...currentState,
        actionId,
        notes,
      };
      setActionStates(new Map(actionStates.set(actionId, newState)));
      onActionUpdate?.(actionId, newState);
    }
  };

  const getStatusColor = (status: ActionState['status']) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-50';
      case 'in_progress':
        return 'text-blue-600 bg-blue-50';
      case 'failed':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusIcon = (status: ActionState['status']) => {
    switch (status) {
      case 'completed':
        return (
          <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        );
      case 'in_progress':
        return (
          <svg className="w-5 h-5 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        );
      case 'failed':
        return (
          <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-2a6 6 0 100-12 6 6 0 000 12z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  const completedCount = Array.from(actionStates.values()).filter(
    (state) => state.status === 'completed'
  ).length;

  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const sortedActions = [...actions].sort(
    (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
  );

  if (actions.length === 0) {
    return (
      <div className={`flex items-center justify-center h-32 text-gray-500 ${className || ''}`}>
        <p>No recommended actions</p>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Progress header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-900">Recommended Actions</h3>
          <span className="text-sm text-gray-600">
            {completedCount} of {actions.length} completed
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${(completedCount / actions.length) * 100}%` }}
          ></div>
        </div>
      </div>

      {/* Action list */}
      <div className="space-y-3">
        {sortedActions.map((action) => {
          const state = actionStates.get(action.id)!;
          const statusColor = getStatusColor(state.status);

          return (
            <div
              key={action.id}
              className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start gap-3">
                {/* Status icon */}
                <div className="flex-none mt-0.5">{getStatusIcon(state.status)}</div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Title and category */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900">{action.action}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded">
                          {formatEventType(action.category)}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-medium ${
                            action.priority === 'critical'
                              ? 'bg-red-100 text-red-700'
                              : action.priority === 'high'
                              ? 'bg-orange-100 text-orange-700'
                              : action.priority === 'medium'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {action.priority.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${statusColor}`}>
                      {state.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>

                  {/* Description */}
                  {action.description && (
                    <p className="text-sm text-gray-600 mb-3">{action.description}</p>
                  )}

                  {/* Notes */}
                  {state.notes && (
                    <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded text-sm">
                      <div className="text-xs text-blue-700 font-medium mb-1">Notes:</div>
                      <div className="text-blue-900">{state.notes}</div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2">
                    {state.status === 'pending' && (
                      <button
                        onClick={() => handleStatusChange(action.id, 'in_progress')}
                        className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                      >
                        Start
                      </button>
                    )}
                    {state.status === 'in_progress' && (
                      <>
                        <button
                          onClick={() => handleStatusChange(action.id, 'completed')}
                          className="text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                        >
                          Complete
                        </button>
                        <button
                          onClick={() => handleStatusChange(action.id, 'failed')}
                          className="text-xs px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                        >
                          Mark Failed
                        </button>
                      </>
                    )}
                    {(state.status === 'completed' || state.status === 'failed') && (
                      <button
                        onClick={() => handleStatusChange(action.id, 'pending')}
                        className="text-xs px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                      >
                        Reset
                      </button>
                    )}
                    <button
                      onClick={() => handleAddNotes(action.id)}
                      className="text-xs px-3 py-1 bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors"
                    >
                      Add Notes
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
