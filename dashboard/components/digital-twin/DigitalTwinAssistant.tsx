"use client";

/**
 * Digital Twin AI Assistant Component
 * 
 * Natural language interface for querying the digital twin.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Bot,
  User,
  Loader2,
  AlertTriangle,
  Activity,
  Shield,
  TrendingUp,
  Camera,
  Server,
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  data?: any;
}

interface DigitalTwinAssistantProps {
  className?: string;
}

export function DigitalTwinAssistant({ className = '' }: DigitalTwinAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Hello! I'm your Digital Twin AI assistant. I can help you understand your surveillance infrastructure, analyze dependencies, check security posture, and answer questions about asset status. What would you like to know?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      // Parse user intent and call appropriate API
      const response = await queryDigitalTwin(input);
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.content,
        timestamp: new Date(),
        data: response.data,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const queryDigitalTwin = async (query: string): Promise<{ content: string; data?: any }> => {
    const lowerQuery = query.toLowerCase();

    // Check for camera status queries
    if (lowerQuery.includes('camera') && (lowerQuery.includes('offline') || lowerQuery.includes('status'))) {
      const response = await fetch('/api/digital-twin/topology');
      const topology = await response.json();
      
      const offlineCameras = topology.nodes.filter(
        (n: any) => n.type === 'camera' && n.status === 'offline'
      );

      if (offlineCameras.length === 0) {
        return {
          content: 'All cameras are currently online and operational! ✓',
          data: { type: 'camera_status', offlineCount: 0 },
        };
      }

      return {
        content: `I found ${offlineCameras.length} camera(s) that are currently offline:\n\n${offlineCameras
          .map((cam: any) => `• ${cam.label} (Health: ${cam.healthScore})`)
          .join('\n')}\n\nWould you like me to analyze the root cause or calculate the blast radius?`,
        data: { type: 'camera_status', offlineCameras },
      };
    }

    // Check for blast radius queries
    if (lowerQuery.includes('what happens if') || lowerQuery.includes('blast radius') || lowerQuery.includes('fails')) {
      // Extract asset identifier from query
      const assetMatch = query.match(/(?:switch|camera|nvr|storage|gateway)\s*[^\s]*/i);
      
      if (!assetMatch) {
        return {
          content: 'To calculate blast radius, please specify which asset you want to analyze. For example: "What happens if Switch-03 fails?"',
        };
      }

      return {
        content: `I'll analyze the blast radius for ${assetMatch[0]}. This will show all assets that would be affected if it goes offline, including cameras, recording systems, and storage. The analysis includes dependency paths and business impact assessment.`,
        data: { type: 'blast_radius_needed', asset: assetMatch[0] },
      };
    }

    // Check for security queries
    if (lowerQuery.includes('security') || lowerQuery.includes('vulnerab') || lowerQuery.includes('firmware')) {
      const response = await fetch('/api/digital-twin');
      const enterprise = await response.json();
      
      const securityResponse = await fetch(`/api/digital-twin/security-posture/${enterprise.id}`);
      const securityPosture = await securityResponse.json();

      return {
        content: `Security Posture Summary:\n\n• Overall Score: ${securityPosture.score}/100 (Grade ${securityPosture.grade})\n• Total Vulnerabilities: ${securityPosture.vulnerabilities.total} (${securityPosture.vulnerabilities.critical} critical)\n• Outdated Firmware: ${securityPosture.issues.outdatedFirmware} devices\n• Default Credentials: ${securityPosture.issues.defaultCredentials} devices\n• Compliance: ${securityPosture.compliance.compliant ? 'Compliant' : 'Non-compliant'}\n\nTop recommendation: ${securityPosture.recommendations[0]?.title || 'No immediate actions needed'}`,
        data: { type: 'security_posture', securityPosture },
      };
    }

    // Check for infrastructure health queries
    if (lowerQuery.includes('health') || lowerQuery.includes('status') || lowerQuery.includes('overview')) {
      const response = await fetch('/api/digital-twin/topology');
      const topology = await response.json();

      const healthPercentage = Math.round(
        (topology.healthySummary.healthy / topology.totalAssets) * 100
      );

      return {
        content: `Infrastructure Health Overview:\n\n• Total Assets: ${topology.totalAssets}\n• Healthy: ${topology.healthySummary.healthy} (${healthPercentage}%)\n• Warning: ${topology.healthySummary.warning}\n• Critical: ${topology.healthySummary.critical}\n• Offline: ${topology.healthySummary.offline}\n\n${
          topology.healthySummary.critical > 0
            ? `⚠️ Attention needed: ${topology.healthySummary.critical} assets in critical state`
            : '✓ Overall infrastructure health is good'
        }`,
        data: { type: 'health_overview', topology },
      };
    }

    // Check for dependency queries
    if (lowerQuery.includes('depend') || lowerQuery.includes('connect')) {
      return {
        content: 'To show dependencies, please specify an asset. For example: "What does Camera-123 depend on?" or "Show dependencies for NVR-01"',
      };
    }

    // Default response for unrecognized queries
    return {
      content: `I can help you with:\n\n• Camera status: "Are any cameras offline?"\n• Security analysis: "What's our security posture?"\n• Health overview: "Show infrastructure health"\n• Blast radius: "What happens if Switch-03 fails?"\n• Dependencies: "What does Camera-123 depend on?"\n\nWhat would you like to know?`,
    };
  };

  const suggestedQueries = [
    "Are any cameras offline?",
    "What's our security posture?",
    "Show infrastructure health",
    "What happens if the main switch fails?",
  ];

  return (
    <div className={`flex flex-col h-full bg-white rounded-lg border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center">
          <Bot className="h-6 w-6 text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">Digital Twin AI Assistant</h3>
          <p className="text-xs text-gray-600">Ask me anything about your infrastructure</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div
              className={`
                h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0
                ${message.role === 'user' ? 'bg-gray-200' : 'bg-blue-100'}
              `}
            >
              {message.role === 'user' ? (
                <User className="h-4 w-4 text-gray-600" />
              ) : (
                <Bot className="h-4 w-4 text-blue-600" />
              )}
            </div>

            <div
              className={`
                flex-1 px-4 py-3 rounded-lg max-w-[80%]
                ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-900'
                }
              `}
            >
              <div className="text-sm whitespace-pre-wrap">{message.content}</div>
              
              {/* Render special data visualizations */}
              {message.data?.type === 'camera_status' && message.data.offlineCameras?.length > 0 && (
                <div className="mt-3 p-3 bg-white rounded-lg text-gray-900">
                  <div className="text-xs font-semibold mb-2">Offline Cameras:</div>
                  <div className="space-y-1">
                    {message.data.offlineCameras.slice(0, 3).map((cam: any) => (
                      <div key={cam.id} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2">
                          <Camera className="h-3 w-3" />
                          {cam.label}
                        </span>
                        <span className="text-red-600">Offline</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {message.data?.type === 'security_posture' && (
                <div className="mt-3 p-3 bg-white rounded-lg text-gray-900">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold">Security Score</span>
                    <Shield className={`h-4 w-4 ${
                      message.data.securityPosture.score >= 80 ? 'text-green-600' :
                      message.data.securityPosture.score >= 60 ? 'text-yellow-600' :
                      'text-red-600'
                    }`} />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold">{message.data.securityPosture.score}</span>
                    <span className="text-sm text-gray-600">/ 100</span>
                  </div>
                </div>
              )}

              <div className="text-xs text-gray-500 mt-2">
                {message.timestamp.toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
              <Bot className="h-4 w-4 text-blue-600" />
            </div>
            <div className="bg-gray-100 px-4 py-3 rounded-lg">
              <Loader2 className="h-4 w-4 animate-spin text-gray-600" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Queries */}
      {messages.length === 1 && (
        <div className="px-4 pb-3">
          <div className="text-xs text-gray-600 mb-2">Try asking:</div>
          <div className="flex flex-wrap gap-2">
            {suggestedQueries.map((query, idx) => (
              <button
                key={idx}
                onClick={() => setInput(query)}
                className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
              >
                {query}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask about your infrastructure..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
