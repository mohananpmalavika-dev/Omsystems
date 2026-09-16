"use client";

/**
 * Natural Language Video Search Component
 * 
 * Features:
 * - Text input with natural language understanding
 * - Voice search with Whisper transcription
 * - Query suggestions
 * - Real-time search results
 * - Video preview and playback
 */

import { useState, useRef, useEffect } from "react";
import { Search, Mic, MicOff, Sparkles, Clock, TrendingUp } from "lucide-react";

interface SearchResult {
  id: string;
  cameraId: string;
  cameraName: string;
  timestamp: string;
  confidence: number;
  description: string;
  matchReason: string;
  thumbnailUrl?: string;
  videoSegmentId?: string;
  metadata: Record<string, any>;
}

interface SearchResponse {
  results: SearchResult[];
  totalCount: number;
  queryUnderstanding: string;
  processingTimeMs: number;
}

export function NaturalLanguageSearch() {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [queryUnderstanding, setQueryUnderstanding] = useState("");
  const [processingTime, setProcessingTime] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Load suggestions on mount
  useEffect(() => {
    loadSuggestions();
  }, []);

  const loadSuggestions = async () => {
    try {
      const response = await fetch("/api/v1/video-search/query-suggestions", {
        credentials: "include",
      });
      
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.suggestions || []);
      }
    } catch (error) {
      console.error("Failed to load suggestions:", error);
    }
  };

  const handleSearch = async (searchQuery?: string) => {
    const finalQuery = searchQuery || query;
    
    if (!finalQuery.trim()) {
      return;
    }

    setIsSearching(true);
    setResults([]);
    setQueryUnderstanding("");

    try {
      const response = await fetch("/api/v1/video-search/natural-language", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          query: finalQuery,
          maxResults: 50,
          confidenceThreshold: 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }

      const data = await response.json();
      const searchData: SearchResponse = data.data;

      setResults(searchData.results);
      setQueryUnderstanding(searchData.queryUnderstanding);
      setProcessingTime(searchData.processingTimeMs);
      setShowSuggestions(false);
    } catch (error) {
      console.error("Search failed:", error);
      alert("Search failed. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await processVoiceQuery(audioBlob);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    } catch (error) {
      console.error("Failed to start voice recording:", error);
      alert("Microphone access denied or not available");
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const processVoiceQuery = async (audioBlob: Blob) => {
    setIsSearching(true);

    try {
      const response = await fetch("/api/v1/video-search/voice-query", {
        method: "POST",
        headers: {
          "Content-Type": "audio/webm",
        },
        credentials: "include",
        body: audioBlob,
      });

      if (!response.ok) {
        throw new Error(`Voice query failed: ${response.status}`);
      }

      const data = await response.json();
      const transcription = data.transcription;
      const searchData: SearchResponse = data.data;

      setQuery(transcription);
      setResults(searchData.results);
      setQueryUnderstanding(searchData.queryUnderstanding);
      setProcessingTime(searchData.processingTimeMs);
    } catch (error) {
      console.error("Voice query failed:", error);
      alert("Voice search failed. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    handleSearch(suggestion);
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <div className="ai-video-search space-y-6">
      {/* Search Header */}
      <div className="search-header">
        <div className="flex items-center gap-3 mb-2">
          <Sparkles className="w-6 h-6 text-indigo-400" />
          <h2 className="text-2xl font-bold text-slate-100">AI Video Search</h2>
        </div>
        <p className="text-sm text-slate-400">
          Search your video footage using natural language or voice commands
        </p>
      </div>

      {/* Search Input */}
      <div className="search-input-container">
        <div className="relative">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSearch();
                  }
                }}
                onFocus={() => setShowSuggestions(true)}
                placeholder='Try: "Show me all people in red shirts near ATM"'
                className="w-full pl-12 pr-4 py-4 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                disabled={isSearching || isRecording}
              />
            </div>

            {/* Voice Button */}
            <button
              onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
              disabled={isSearching}
              className={`p-4 rounded-xl transition-all ${
                isRecording
                  ? "bg-red-500 hover:bg-red-600 text-white animate-pulse"
                  : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
              }`}
              title={isRecording ? "Stop recording" : "Voice search"}
            >
              {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            {/* Search Button */}
            <button
              onClick={() => handleSearch()}
              disabled={isSearching || isRecording || !query.trim()}
              className="px-6 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSearching ? "Searching..." : "Search"}
            </button>
          </div>

          {/* Suggestions Dropdown */}
          {showSuggestions && suggestions.length > 0 && !isSearching && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden">
              <div className="p-3 border-b border-slate-700">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <TrendingUp className="w-4 h-4" />
                  <span>Suggested searches</span>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="w-full px-4 py-3 text-left text-sm text-slate-300 hover:bg-slate-700 transition-colors flex items-center gap-3"
                  >
                    <Search className="w-4 h-4 text-slate-500" />
                    <span>{suggestion}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Query Understanding */}
        {queryUnderstanding && (
          <div className="mt-3 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-indigo-400 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-slate-300">
                  <span className="font-medium text-indigo-400">AI Understanding:</span>{" "}
                  <span dangerouslySetInnerHTML={{ __html: queryUnderstanding }} />
                </p>
                {processingTime > 0 && (
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Found {results.length} results in {processingTime}ms
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Search Results */}
      {results.length > 0 && (
        <div className="search-results space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-100">
              {results.length} {results.length === 1 ? "Result" : "Results"} Found
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((result) => (
              <div
                key={result.id}
                className="result-card bg-slate-800 border border-slate-700 rounded-xl overflow-hidden hover:border-indigo-500/50 transition-all cursor-pointer"
              >
                {/* Thumbnail */}
                {result.thumbnailUrl && (
                  <div className="aspect-video bg-slate-900 relative overflow-hidden">
                    <img
                      src={result.thumbnailUrl}
                      alt="Detection thumbnail"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 right-2 px-2 py-1 bg-black/70 rounded text-xs text-white">
                      {(result.confidence * 100).toFixed(0)}% match
                    </div>
                  </div>
                )}

                {/* Content */}
                <div className="p-4 space-y-3">
                  <div>
                    <h4 className="font-medium text-slate-100 mb-1">{result.cameraName}</h4>
                    <p className="text-xs text-slate-400">{formatTimestamp(result.timestamp)}</p>
                  </div>

                  <p className="text-sm text-slate-300">{result.description}</p>

                  <div className="pt-3 border-t border-slate-700">
                    <p className="text-xs text-slate-500">{result.matchReason}</p>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    {result.videoSegmentId && (
                      <button className="flex-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-all">
                        Play Video
                      </button>
                    )}
                    <button className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition-all">
                      Details
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isSearching && results.length === 0 && query && (
        <div className="text-center py-12">
          <Search className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-300 mb-2">No results found</h3>
          <p className="text-sm text-slate-500">
            Try adjusting your search query or time range
          </p>
        </div>
      )}

      {/* Loading State */}
      {isSearching && (
        <div className="text-center py-12">
          <div className="inline-block w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-slate-400">Searching through your video footage...</p>
        </div>
      )}
    </div>
  );
}
