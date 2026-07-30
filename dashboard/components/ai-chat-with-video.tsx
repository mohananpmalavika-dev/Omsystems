"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Send,
  Video,
  Camera,
  Play,
  User,
  Car,
  Clock,
  MapPin,
  Search,
  Sparkles,
  TrendingUp,
  Filter,
} from "lucide-react";

interface SearchResult {
  id: string;
  score: number;
  matchType: "exact" | "high-confidence" | "probable" | "possible";
  cameraId: string;
  cameraName?: string;
  branchId?: string;
  timestamp: string;
  object: {
    objectType: "person" | "vehicle" | "object";
    attributes: Record<string, any>;
    confidence: number;
  };
  segmentId: string;
  seekTimestamp: string;
  matchReason?: string;
  relatedDetections?: Array<{
    cameraId: string;
    timestamp: string;
    confidence: number;
  }>;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  results?: SearchResult[];
  timestamp: Date;
}

export function AIChatWithVideo({ branchId }: { branchId?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hello! I can help you search through video footage using natural language. Try asking me something like:\n\n• Show the person entering with a red shirt\n• Find all white cars seen near the ATM\n• Show everyone who entered the vault corridor\n• Find a person carrying a black bag",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Filters
  const [filters, setFilters] = useState({
    timeRange: "today",
    cameraIds: [] as string[],
    minConfidence: 60,
  });

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSearch = async () => {
    if (!inputValue.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setLoading(true);

    try {
      // Perform search
      const response = await fetch("/api/v1/ai/video/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: inputValue,
          branchId,
          from: getTimeRangeStart(filters.timeRange),
          to: new Date().toISOString(),
          limit: 10,
        }),
      });

      const data = await response.json();
      const results: SearchResult[] = data.results || [];

      // Create assistant response
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: generateResponseMessage(results, inputValue),
        results,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Auto-select first result if available
      if (results.length > 0) {
        setSelectedResult(results[0]);
      }
    } catch (error) {
      console.error("Search failed:", error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Sorry, I encountered an error while searching. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const generateResponseMessage = (results: SearchResult[], query: string): string => {
    if (results.length === 0) {
      return `I couldn't find any matches for "${query}". Try:\n• Adjusting the time range\n• Using different colors or descriptions\n• Checking if the cameras were online during that period`;
    }

    if (results.length === 1) {
      const result = results[0];
      return `I found 1 match for "${query}".\n\n📹 ${result.cameraName || result.cameraId}\n🕐 ${new Date(result.timestamp).toLocaleString()}\n✓ ${Math.round(result.score * 100)}% match confidence`;
    }

    const topResult = results[0];
    return `I found ${results.length} matches for "${query}".\n\n**Best match:**\n📹 ${topResult.cameraName || topResult.cameraId}\n🕐 ${new Date(topResult.timestamp).toLocaleString()}\n✓ ${Math.round(topResult.score * 100)}% match confidence\n\nClick on any result below to view the video.`;
  };

  const getTimeRangeStart = (range: string): string => {
    const now = new Date();
    switch (range) {
      case "last-hour":
        return new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      case "today":
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        return today.toISOString();
      case "yesterday":
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        return yesterday.toISOString();
      case "week":
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      default:
        return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    }
  };

  const getMatchTypeColor = (matchType: string) => {
    switch (matchType) {
      case "exact":
        return "bg-green-500";
      case "high-confidence":
        return "bg-blue-500";
      case "probable":
        return "bg-yellow-500";
      case "possible":
        return "bg-gray-500";
      default:
        return "bg-gray-400";
    }
  };

  const getObjectTypeIcon = (objectType: string) => {
    switch (objectType) {
      case "person":
        return <User className="h-4 w-4" />;
      case "vehicle":
        return <Car className="h-4 w-4" />;
      default:
        return <Camera className="h-4 w-4" />;
    }
  };

  const quickSearches = [
    "Show person entering with red shirt",
    "Find white car near ATM",
    "Show all people after closing time",
    "Find person carrying black bag",
    "Show last person in vault corridor",
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-12rem)]">
      {/* Chat Interface - Left Side */}
      <div className="lg:col-span-2 flex flex-col h-full">
        <Card className="flex-1 flex flex-col h-full">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-purple-600" />
                  AI Video Search
                </CardTitle>
                <CardDescription>
                  Ask questions in natural language to find specific people, vehicles, or events
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="h-4 w-4 mr-2" />
                Filters
              </Button>
            </div>

            {/* Filters */}
            {showFilters && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-3">
                <div>
                  <label className="text-sm font-medium mb-2 block">Time Range</label>
                  <select
                    value={filters.timeRange}
                    onChange={(e) => setFilters({ ...filters, timeRange: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                  >
                    <option value="last-hour">Last Hour</option>
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                    <option value="week">Last 7 Days</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Minimum Confidence: {filters.minConfidence}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={filters.minConfidence}
                    onChange={(e) =>
                      setFilters({ ...filters, minConfidence: parseInt(e.target.value) })
                    }
                    className="w-full"
                  />
                </div>
              </div>
            )}
          </CardHeader>

          {/* Messages */}
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-4 ${
                    message.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-900"
                  }`}
                >
                  <div className="whitespace-pre-wrap">{message.content}</div>

                  {/* Search Results */}
                  {message.results && message.results.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {message.results.map((result) => (
                        <div
                          key={result.id}
                          className={`p-3 rounded-lg cursor-pointer transition-all ${
                            selectedResult?.id === result.id
                              ? "bg-blue-100 border-2 border-blue-500"
                              : "bg-white border border-gray-200 hover:bg-gray-50"
                          }`}
                          onClick={() => setSelectedResult(result)}
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-1">
                              {getObjectTypeIcon(result.object.objectType)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-sm text-gray-900">
                                  {result.cameraName || result.cameraId}
                                </span>
                                <Badge
                                  className={`${getMatchTypeColor(result.matchType)} text-xs`}
                                >
                                  {Math.round(result.score * 100)}%
                                </Badge>
                              </div>
                              <div className="text-xs text-gray-600 flex items-center gap-2">
                                <Clock className="h-3 w-3" />
                                {new Date(result.timestamp).toLocaleString()}
                              </div>
                              {result.matchReason && (
                                <div className="text-xs text-gray-500 mt-1">
                                  {result.matchReason}
                                </div>
                              )}
                              {result.relatedDetections && result.relatedDetections.length > 0 && (
                                <div className="text-xs text-blue-600 mt-1">
                                  <TrendingUp className="h-3 w-3 inline mr-1" />
                                  Also seen on {result.relatedDetections.length} other cameras
                                </div>
                              )}
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-gray-900 hover:text-blue-600"
                            >
                              <Play className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="text-xs opacity-70 mt-2">
                    {message.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <div className="animate-pulse">🔍</div>
                    <span className="text-gray-600">Searching videos...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </CardContent>

          {/* Input */}
          <div className="border-t p-4">
            {/* Quick Searches */}
            <div className="mb-3 flex flex-wrap gap-2">
              {quickSearches.map((search, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setInputValue(search);
                    setTimeout(() => handleSearch(), 100);
                  }}
                  className="text-xs"
                >
                  {search}
                </Button>
              ))}
            </div>

            <div className="flex gap-2">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Ask me to find something... (e.g., 'Show person with red shirt')"
                disabled={loading}
                className="flex-1"
              />
              <Button onClick={handleSearch} disabled={loading || !inputValue.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Video Player - Right Side */}
      <div className="lg:col-span-1 flex flex-col h-full">
        <Card className="flex-1 flex flex-col h-full">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              Video Playback
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-4">
            {selectedResult ? (
              <div className="space-y-4">
                {/* Video Player Placeholder */}
                <div className="aspect-video bg-gray-900 rounded-lg flex items-center justify-center">
                  <div className="text-center text-white">
                    <Video className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm opacity-75">Video Player</p>
                    <p className="text-xs opacity-50 mt-1">
                      {selectedResult.cameraName || selectedResult.cameraId}
                    </p>
                  </div>
                </div>

                {/* Video Controls */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">
                        {selectedResult.cameraName || selectedResult.cameraId}
                      </div>
                      <div className="text-sm text-gray-500">
                        {new Date(selectedResult.timestamp).toLocaleString()}
                      </div>
                    </div>
                    <Badge className={getMatchTypeColor(selectedResult.matchType)}>
                      {Math.round(selectedResult.score * 100)}% match
                    </Badge>
                  </div>

                  {/* Object Details */}
                  <Card>
                    <CardContent className="pt-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          {getObjectTypeIcon(selectedResult.object.objectType)}
                          <span className="font-medium capitalize">
                            {selectedResult.object.objectType}
                          </span>
                          <Badge variant="outline">
                            {Math.round(selectedResult.object.confidence * 100)}% confidence
                          </Badge>
                        </div>

                        {/* Attributes */}
                        {Object.keys(selectedResult.object.attributes).length > 0 && (
                          <div className="pt-2 border-t">
                            <div className="text-sm font-medium mb-2">Attributes</div>
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(selectedResult.object.attributes).map(
                                ([key, value]) => (
                                  <Badge key={key} variant="secondary" className="text-xs">
                                    {key}: {String(value)}
                                  </Badge>
                                )
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Related Detections */}
                  {selectedResult.relatedDetections &&
                    selectedResult.relatedDetections.length > 0 && (
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm">Also Seen On</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          {selectedResult.relatedDetections.map((detection, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between p-2 bg-gray-50 rounded"
                            >
                              <div className="flex items-center gap-2 text-sm">
                                <Camera className="h-4 w-4 text-gray-500" />
                                <span>{detection.cameraId}</span>
                              </div>
                              <div className="text-xs text-gray-500">
                                <Clock className="h-3 w-3 inline mr-1" />
                                {new Date(detection.timestamp).toLocaleTimeString()}
                              </div>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" size="sm">
                      <MapPin className="h-4 w-4 mr-2" />
                      Show on Map
                    </Button>
                    <Button variant="outline" className="flex-1" size="sm">
                      <TrendingUp className="h-4 w-4 mr-2" />
                      Track Journey
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-center">
                <div>
                  <Search className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                  <p className="text-gray-600 font-medium">No video selected</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Search for something to view video
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
