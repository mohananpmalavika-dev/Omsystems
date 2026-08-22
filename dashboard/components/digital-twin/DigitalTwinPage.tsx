"use client";

/**
 * Digital Twin Main Page Component
 * 
 * Integrated page with topology, blast radius, security, and AI assistant.
 */

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TopologyVisualization } from './TopologyVisualization';
import { BlastRadiusVisualization } from './BlastRadiusVisualization';
import { SecurityPostureDashboard } from './SecurityPostureDashboard';
import { DigitalTwinAssistant } from './DigitalTwinAssistant';
import {
  Network,
  AlertTriangle,
  Shield,
  Bot,
  Info,
  RefreshCw,
} from 'lucide-react';

export function DigitalTwinPage() {
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [showBlastRadius, setShowBlastRadius] = useState(false);
  const [highlightedNodes, setHighlightedNodes] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState('topology');

  const handleNodeClick = (nodeId: string) => {
    setSelectedAssetId(nodeId);
  };

  const handleNodeDoubleClick = (nodeId: string) => {
    setSelectedAssetId(nodeId);
    setShowBlastRadius(true);
    setActiveTab('blast-radius');
  };

  const handleRefresh = async () => {
    try {
      const response = await fetch('/api/digital-twin/refresh', {
        method: 'POST',
      });

      if (response.ok) {
        window.location.reload();
      }
    } catch (error) {
      console.error('Failed to refresh:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Digital Twin
              </h1>
              <p className="mt-1 text-sm text-gray-600">
                Real-time infrastructure modeling and analysis
              </p>
            </div>
            <button
              onClick={handleRefresh}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh Data
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          {/* Tab Navigation */}
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="topology" className="flex items-center gap-2">
              <Network className="h-4 w-4" />
              <span className="hidden sm:inline">Topology</span>
            </TabsTrigger>
            <TabsTrigger value="blast-radius" className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              <span className="hidden sm:inline">Blast Radius</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Security</span>
            </TabsTrigger>
            <TabsTrigger value="assistant" className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              <span className="hidden sm:inline">AI Assistant</span>
            </TabsTrigger>
          </TabsList>

          {/* Topology Tab */}
          <TabsContent value="topology" className="space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    Infrastructure Topology
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Interactive visualization of your surveillance infrastructure.
                    Click a node to view details, double-click to see blast radius.
                  </p>
                </div>
              </div>

              <TopologyVisualization
                onNodeClick={handleNodeClick}
                onNodeDoubleClick={handleNodeDoubleClick}
                highlightedNodes={highlightedNodes}
              />

              {/* Selected Asset Info */}
              {selectedAssetId && (
                <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-semibold text-blue-900">
                        Selected Asset: {selectedAssetId}
                      </div>
                      <div className="text-xs text-blue-700 mt-1">
                        Double-click the node to view blast radius analysis
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setShowBlastRadius(true);
                        setActiveTab('blast-radius');
                      }}
                      className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                    >
                      Show Blast Radius
                    </button>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Blast Radius Tab */}
          <TabsContent value="blast-radius" className="space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              {selectedAssetId || showBlastRadius ? (
                <BlastRadiusVisualization
                  assetId={selectedAssetId || 'enterprise_default'}
                  onClose={() => {
                    setShowBlastRadius(false);
                    setSelectedAssetId(null);
                  }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-96 text-center">
                  <AlertTriangle className="h-16 w-16 text-gray-300 mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    No Asset Selected
                  </h3>
                  <p className="text-sm text-gray-600 max-w-md">
                    Select an asset from the topology view or use the AI assistant
                    to analyze the blast radius of potential failures.
                  </p>
                  <button
                    onClick={() => setActiveTab('topology')}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Go to Topology
                  </button>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <SecurityPostureDashboard assetId={selectedAssetId || 'enterprise_default'} />
            </div>
          </TabsContent>

          {/* AI Assistant Tab */}
          <TabsContent value="assistant" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Assistant Chat */}
              <div className="lg:col-span-2">
                <DigitalTwinAssistant className="h-[600px]" />
              </div>

              {/* Helper Panel */}
              <div className="space-y-4">
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Info className="h-5 w-5 text-blue-600" />
                    <h3 className="font-semibold text-gray-900">What Can I Ask?</h3>
                  </div>
                  
                  <div className="space-y-3 text-sm">
                    <div>
                      <div className="font-semibold text-gray-900 mb-1">
                        Camera Status
                      </div>
                      <div className="text-gray-600 text-xs">
                        "Are any cameras offline?"
                        <br />
                        "Show camera status in Mumbai branch"
                      </div>
                    </div>

                    <div>
                      <div className="font-semibold text-gray-900 mb-1">
                        Blast Radius
                      </div>
                      <div className="text-gray-600 text-xs">
                        "What happens if Switch-03 fails?"
                        <br />
                        "Calculate blast radius for NVR-01"
                      </div>
                    </div>

                    <div>
                      <div className="font-semibold text-gray-900 mb-1">
                        Security
                      </div>
                      <div className="text-gray-600 text-xs">
                        "What's our security posture?"
                        <br />
                        "Show devices with outdated firmware"
                      </div>
                    </div>

                    <div>
                      <div className="font-semibold text-gray-900 mb-1">
                        Infrastructure
                      </div>
                      <div className="text-gray-600 text-xs">
                        "Show infrastructure health"
                        <br />
                        "What does Camera-123 depend on?"
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200 p-6">
                  <h3 className="font-semibold text-gray-900 mb-4">
                    Quick Stats
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Natural Language</span>
                      <span className="font-semibold text-blue-600">✓ Enabled</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Real-time Data</span>
                      <span className="font-semibold text-green-600">✓ Live</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Context-Aware</span>
                      <span className="font-semibold text-green-600">✓ Yes</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
