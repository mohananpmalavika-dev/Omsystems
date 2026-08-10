/**
 * Security Commander App
 * Main application component combining all UI elements
 */

import React, { useState } from 'react';
import { CommanderProvider, useCommander } from './context/CommanderContext';
import { CommanderChat } from './components/CommanderChat';
import { InvestigationViewer } from './components/InvestigationViewer';
import type { Investigation } from '../types';

interface SecurityCommanderAppProps {
  className?: string;
  initialQuery?: string;
}

function SecurityCommanderAppContent({ className, initialQuery }: SecurityCommanderAppProps) {
  const { state, clearActiveInvestigation } = useCommander();
  const [viewMode, setViewMode] = useState<'chat' | 'investigation'>('chat');

  const handleInvestigationCreated = (investigation: Investigation) => {
    setViewMode('investigation');
  };

  const handleCloseInvestigation = () => {
    clearActiveInvestigation();
    setViewMode('chat');
  };

  return (
    <div className={`h-screen flex flex-col bg-gray-100 ${className || ''}`}>
      {/* App header */}
      <header className="flex-none bg-gray-900 text-white shadow-lg">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <div>
              <h1 className="text-xl font-bold">AI Security Commander</h1>
              <p className="text-sm text-gray-400">Intelligent security investigation and response</p>
            </div>
          </div>

          {/* Status indicators */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${state.isConnected ? 'bg-green-400' : 'bg-red-400'}`}></div>
              <span className="text-sm">{state.isConnected ? 'Connected' : 'Disconnected'}</span>
            </div>
            {state.llmAvailable && (
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M13 7H7v6h6V7z" />
                  <path fillRule="evenodd" d="M7 2a1 1 0 012 0v1h2V2a1 1 0 112 0v1h2a2 2 0 012 2v2h1a1 1 0 110 2h-1v2h1a1 1 0 110 2h-1v2a2 2 0 01-2 2h-2v1a1 1 0 11-2 0v-1H9v1a1 1 0 11-2 0v-1H5a2 2 0 01-2-2v-2H2a1 1 0 110-2h1V9H2a1 1 0 010-2h1V5a2 2 0 012-2h2V2z" clipRule="evenodd" />
                </svg>
                <span className="text-sm">AI Enhanced</span>
              </div>
            )}
          </div>
        </div>

        {/* Navigation tabs */}
        <div className="border-t border-gray-700">
          <div className="px-6 flex gap-6">
            <button
              onClick={() => setViewMode('chat')}
              className={`
                py-3 px-1 border-b-2 font-medium text-sm transition-colors
                ${viewMode === 'chat' ? 'border-blue-400 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-200'}
              `}
            >
              Commander Chat
            </button>
            <button
              onClick={() => setViewMode('investigation')}
              disabled={!state.activeInvestigation}
              className={`
                py-3 px-1 border-b-2 font-medium text-sm transition-colors
                ${viewMode === 'investigation' ? 'border-blue-400 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-200'}
                ${!state.activeInvestigation && 'opacity-50 cursor-not-allowed'}
              `}
            >
              Active Investigation
              {state.activeInvestigation && (
                <span className="ml-2 px-2 py-0.5 bg-blue-500 text-white rounded-full text-xs">
                  {state.activeInvestigation.incidents.length}
                </span>
              )}
            </button>
            <button
              className={`
                py-3 px-1 border-b-2 font-medium text-sm transition-colors
                border-transparent text-gray-400 hover:text-gray-200
              `}
            >
              History
              {state.investigations.length > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-gray-600 text-white rounded-full text-xs">
                  {state.investigations.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main content area */}
      <main className="flex-1 overflow-hidden">
        {viewMode === 'chat' ? (
          <CommanderChat
            initialQuery={initialQuery}
            onInvestigationCreated={handleInvestigationCreated}
            className="h-full"
          />
        ) : state.activeInvestigation ? (
          <InvestigationViewer
            investigationId={state.activeInvestigation.id}
            onClose={handleCloseInvestigation}
            className="h-full"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-lg font-medium">No active investigation</p>
              <p className="text-sm mt-1">Create an investigation from the Commander Chat</p>
            </div>
          </div>
        )}
      </main>

      {/* Notifications */}
      {state.notifications.length > 0 && (
        <div className="fixed top-20 right-4 z-50 space-y-2 max-w-md">
          {state.notifications.map((notification) => {
            const bgColor = {
              info: 'bg-blue-500',
              success: 'bg-green-500',
              warning: 'bg-yellow-500',
              error: 'bg-red-500',
            }[notification.type];

            return (
              <div
                key={notification.id}
                className={`${bgColor} text-white rounded-lg shadow-lg p-4 animate-slide-in-right`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-semibold">{notification.title}</div>
                    <div className="text-sm mt-1 opacity-90">{notification.message}</div>
                  </div>
                  <button
                    onClick={() => {
                      // Would call removeNotification(notification.id)
                    }}
                    className="ml-4 text-white/80 hover:text-white"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Main app with provider
export function SecurityCommanderApp(props: SecurityCommanderAppProps) {
  return (
    <CommanderProvider>
      <SecurityCommanderAppContent {...props} />
    </CommanderProvider>
  );
}
