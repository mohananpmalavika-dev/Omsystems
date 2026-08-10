/**
 * Commander Chat Component
 * Natural language interface for Security Commander
 */

import React, { useState, useRef, useEffect } from 'react';
import { useCommander } from '../context/CommanderContext';
import { useCommanderApi } from '../hooks/useCommanderApi';
import { formatTimestamp, formatRelativeTime } from '../utils/formatters';
import type { CommanderChatProps } from '../types/ui-types';

export function CommanderChat({ className, onInvestigationCreated, initialQuery }: CommanderChatProps) {
  const [input, setInput] = useState(initialQuery || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { state, addMessage, updateMessage, setActiveInvestigation, addNotification } = useCommander();
  const { executeQuery } = useCommanderApi();

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);

  // Execute initial query if provided
  useEffect(() => {
    if (initialQuery && state.messages.length === 0) {
      handleSubmit({ preventDefault: () => {} } as React.FormEvent);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;

    const userQuery = input.trim();
    setInput('');
    setIsProcessing(true);

    // Add user message
    addMessage({
      type: 'user',
      content: userQuery,
    });

    // Add loading assistant message
    const loadingMsgId = addMessage({
      type: 'assistant',
      content: 'Processing your request...',
      isLoading: true,
    });

    try {
      // Execute query
      const response = await executeQuery(userQuery);

      if (response.error) {
        // Update with error message
        updateMessage(loadingMsgId, {
          type: 'error',
          content: `Error: ${response.error}`,
          isLoading: false,
        });
        addNotification({
          type: 'error',
          title: 'Query Failed',
          message: response.error,
        });
      } else if (response.data) {
        // Update with success response
        const commanderResponse = response.data;
        
        updateMessage(loadingMsgId, {
          type: 'assistant',
          content: commanderResponse.summary || 'Query executed successfully.',
          response: commanderResponse,
          investigation: commanderResponse.investigation,
          isLoading: false,
        });

        // Set active investigation if created
        if (commanderResponse.investigation) {
          setActiveInvestigation(commanderResponse.investigation);
          onInvestigationCreated?.(commanderResponse.investigation);
          addNotification({
            type: 'success',
            title: 'Investigation Created',
            message: `Investigation ${commanderResponse.investigation.id} created with ${commanderResponse.investigation.incidents.length} incidents.`,
          });
        }
      }
    } catch (err) {
      updateMessage(loadingMsgId, {
        type: 'error',
        content: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        isLoading: false,
      });
    } finally {
      setIsProcessing(false);
      inputRef.current?.focus();
    }
  };

  const renderMessage = (message: typeof state.messages[0]) => {
    const bgColor = {
      user: 'bg-blue-100',
      assistant: 'bg-gray-100',
      system: 'bg-yellow-50',
      error: 'bg-red-50',
    }[message.type];

    const textColor = {
      user: 'text-blue-900',
      assistant: 'text-gray-900',
      system: 'text-yellow-900',
      error: 'text-red-900',
    }[message.type];

    return (
      <div
        key={message.id}
        className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'} mb-4`}
      >
        <div className={`max-w-[80%] rounded-lg px-4 py-3 ${bgColor} ${textColor}`}>
          {/* Message header */}
          <div className="flex items-center gap-2 mb-1 text-xs opacity-70">
            <span className="font-semibold">
              {message.type === 'user' ? 'You' : 'Security Commander'}
            </span>
            <span>•</span>
            <span>{formatRelativeTime(message.timestamp)}</span>
          </div>

          {/* Message content */}
          <div className="whitespace-pre-wrap">{message.content}</div>

          {/* Loading indicator */}
          {message.isLoading && (
            <div className="mt-2 flex items-center gap-2 text-sm">
              <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full"></div>
              <span>Processing...</span>
            </div>
          )}

          {/* Investigation summary */}
          {message.investigation && !message.isLoading && (
            <div className="mt-3 pt-3 border-t border-current/20">
              <div className="text-sm font-semibold mb-2">Investigation Summary</div>
              <div className="text-sm space-y-1">
                <div>ID: <span className="font-mono">{message.investigation.id}</span></div>
                <div>Incidents: {message.investigation.incidents.length}</div>
                <div>Events: {message.investigation.events.length}</div>
                <div>
                  Time Range: {formatTimestamp(message.investigation.timeRange.start)} - {formatTimestamp(message.investigation.timeRange.end)}
                </div>
              </div>
            </div>
          )}

          {/* Response metadata */}
          {message.response && !message.isLoading && (
            <div className="mt-3 pt-3 border-t border-current/20">
              <div className="text-xs space-y-1 opacity-70">
                <div>Intent: {message.response.metadata.intent}</div>
                {message.response.metadata.llmUsed && (
                  <div>AI-Enhanced Analysis</div>
                )}
                <div>Processing Time: {message.response.metadata.processingTimeMs}ms</div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={`flex flex-col h-full ${className || ''}`}>
      {/* Header */}
      <div className="flex-none px-6 py-4 border-b border-gray-200 bg-white">
        <h2 className="text-xl font-semibold text-gray-900">Security Commander</h2>
        <p className="text-sm text-gray-600 mt-1">
          Ask questions in natural language about security events and incidents
        </p>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-6 py-4 bg-gray-50">
        {state.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="max-w-md">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Welcome to Security Commander
              </h3>
              <p className="text-sm text-gray-600 mb-6">
                I can help you investigate security incidents, search for events, and analyze patterns.
              </p>
              <div className="text-left space-y-2 text-sm text-gray-700">
                <div className="font-semibold">Try asking:</div>
                <ul className="space-y-1 ml-4">
                  <li>• "Show me abnormal events from the last 30 minutes"</li>
                  <li>• "What happened at camera lobby_main this morning?"</li>
                  <li>• "Investigate unauthorized access events"</li>
                  <li>• "Show fire safety incidents from yesterday"</li>
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <>
            {state.messages.map(renderMessage)}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input area */}
      <div className="flex-none px-6 py-4 border-t border-gray-200 bg-white">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about security events..."
            disabled={isProcessing}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!input.trim() || isProcessing}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {isProcessing ? 'Processing...' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  );
}
