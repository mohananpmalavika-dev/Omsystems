/**
 * Evidence Gallery Component
 * Display and manage video/image evidence
 */

import React, { useState } from 'react';
import type { EvidenceGalleryProps } from '../types/ui-types';
import type { Evidence } from '../../types';
import {
  formatTimestamp,
  formatFileSize,
  formatDuration,
} from '../utils/formatters';

export function EvidenceGallery({
  evidence,
  onEvidenceSelect,
  className,
}: EvidenceGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showMetadata, setShowMetadata] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const selectedEvidence = evidence[selectedIndex];

  const handleSelect = (index: number) => {
    setSelectedIndex(index);
    onEvidenceSelect?.(evidence[index]);
  };

  const handleVerifyIntegrity = async () => {
    if (!selectedEvidence) return;
    
    setVerifying(true);
    // Simulate verification (in real implementation, would call API)
    await new Promise(resolve => setTimeout(resolve, 1000));
    setVerifying(false);
    
    // Would show result in notification
    alert(`Integrity verified:\nExpected: ${selectedEvidence.metadata.hash}\nStatus: Valid`);
  };

  if (evidence.length === 0) {
    return (
      <div className={`flex items-center justify-center h-full bg-gray-50 ${className || ''}`}>
        <div className="text-center text-gray-500">
          <svg
            className="w-16 h-16 mx-auto mb-4 text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"
            />
          </svg>
          <p className="text-lg font-medium">No evidence available</p>
          <p className="text-sm mt-1">Evidence will appear here when collected</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full bg-gray-900 ${className || ''}`}>
      {/* Main viewer */}
      <div className="flex-1 flex items-center justify-center p-6 relative">
        {selectedEvidence && (
          <>
            {/* Video/Image display */}
            <div className="max-w-4xl w-full">
              {selectedEvidence.type === 'video' ? (
                <video
                  key={selectedEvidence.id}
                  controls
                  className="w-full rounded-lg shadow-2xl"
                  src={selectedEvidence.path}
                >
                  Your browser does not support video playback.
                </video>
              ) : (
                <img
                  src={selectedEvidence.path}
                  alt="Evidence"
                  className="w-full rounded-lg shadow-2xl"
                />
              )}
            </div>

            {/* Navigation arrows */}
            {evidence.length > 1 && (
              <>
                <button
                  onClick={() => handleSelect(Math.max(0, selectedIndex - 1))}
                  disabled={selectedIndex === 0}
                  className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 text-white rounded-full hover:bg-black/70 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={() => handleSelect(Math.min(evidence.length - 1, selectedIndex + 1))}
                  disabled={selectedIndex === evidence.length - 1}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 text-white rounded-full hover:bg-black/70 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </>
            )}

            {/* Metadata toggle */}
            <button
              onClick={() => setShowMetadata(!showMetadata)}
              className="absolute top-4 right-4 px-4 py-2 bg-black/50 text-white rounded-lg hover:bg-black/70 transition-all text-sm"
            >
              {showMetadata ? 'Hide' : 'Show'} Metadata
            </button>

            {/* Metadata overlay */}
            {showMetadata && (
              <div className="absolute bottom-4 left-4 right-4 bg-black/90 text-white p-4 rounded-lg backdrop-blur-sm">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-gray-400 text-xs mb-1">Evidence ID</div>
                    <div className="font-mono text-xs">{selectedEvidence.id}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs mb-1">Type</div>
                    <div>{selectedEvidence.type.toUpperCase()}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs mb-1">Source Asset</div>
                    <div>{selectedEvidence.sourceAssetId}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs mb-1">Timestamp</div>
                    <div>{formatTimestamp(selectedEvidence.timestamp)}</div>
                  </div>
                  {selectedEvidence.metadata.duration && (
                    <div>
                      <div className="text-gray-400 text-xs mb-1">Duration</div>
                      <div>{formatDuration(selectedEvidence.metadata.duration)}</div>
                    </div>
                  )}
                  {selectedEvidence.metadata.fileSize && (
                    <div>
                      <div className="text-gray-400 text-xs mb-1">File Size</div>
                      <div>{formatFileSize(selectedEvidence.metadata.fileSize)}</div>
                    </div>
                  )}
                  <div className="col-span-2">
                    <div className="text-gray-400 text-xs mb-1">SHA256 Hash</div>
                    <div className="font-mono text-xs break-all">{selectedEvidence.metadata.hash}</div>
                  </div>
                  <div className="col-span-2">
                    <button
                      onClick={handleVerifyIntegrity}
                      disabled={verifying}
                      className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-600 transition-colors"
                    >
                      {verifying ? 'Verifying...' : 'Verify Integrity'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Thumbnail strip */}
      <div className="flex-none border-t border-gray-700 bg-gray-800 p-4">
        <div className="flex gap-3 overflow-x-auto">
          {evidence.map((item, index) => (
            <button
              key={item.id}
              onClick={() => handleSelect(index)}
              className={`
                flex-none w-32 h-20 rounded overflow-hidden border-2 transition-all
                ${selectedIndex === index ? 'border-blue-500 ring-2 ring-blue-500/50' : 'border-gray-600 hover:border-gray-400'}
              `}
            >
              {item.type === 'video' ? (
                <div className="w-full h-full bg-gray-700 flex items-center justify-center relative">
                  <svg className="w-8 h-8 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                  </svg>
                  {item.metadata.duration && (
                    <div className="absolute bottom-1 right-1 px-1 bg-black/75 text-white text-xs rounded">
                      {formatDuration(item.metadata.duration)}
                    </div>
                  )}
                </div>
              ) : (
                <img src={item.path} alt="Evidence thumbnail" className="w-full h-full object-cover" />
              )}
            </button>
          ))}
        </div>
        <div className="mt-3 text-center text-sm text-gray-400">
          {selectedIndex + 1} of {evidence.length} evidence items
        </div>
      </div>
    </div>
  );
}
