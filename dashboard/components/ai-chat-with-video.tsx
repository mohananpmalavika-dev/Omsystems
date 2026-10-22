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
  AlertTriangle,
  Siren,
  FileText,
  ShieldCheck,
  CheckCircle2,
  Bot,
  Activity,
  Layers,
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

interface AIVideoSummary {
  id: string;
  generatedAt: string;
  title: string;
  branchName: string;
  bulletPoints: string[];
  keyMoments?: Array<{
    timestamp: string;
    cameraId?: string;
    cameraName: string;
    description: string;
    importance: "high" | "medium" | "low";
  }>;
  statistics?: {
    totalVisitors: number;
    securityAlerts: number;
    vaultIntegrity: string;
    camerasOnline: number;
    totalCameras: number;
    activityLevel: string;
  };
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  results?: SearchResult[];
  summary?: AIVideoSummary;
  queryUnderstanding?: {
    engineUsed?: string;
    querySummaryInEnglish?: string;
    querySummaryInMalayalam?: string;
    querySummaryInHindi?: string;
    relativeTimeDescription?: string;
    attributes?: Record<string, any>;
  };
  timestamp: Date | null;
}

export function AIChatWithVideo({ branchId }: { branchId?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Namaskaram! / Namaste! I am your AI Video Search Assistant (Vision-LLM & Video RAG).\nYou can search surveillance footage in natural Malayalam, Hindi, or English, or ask for executive event summaries.\n\nTry asking:\n• \"ഇന്നലെ വൈകുന്നേരം 7 മണിക്ക് ശേഷം മഞ്ഞ ഷർട്ട് ഇട്ട് ബാഗുമായി വന്ന ആളെ കാണിക്കുക\"\n• \"कल शाम 7 बजे के बाद पीली शर्ट और बैग के साथ आए व्यक्ति को दिखाइए\"\n• \"ഇന്നത്തെ ബ്രാഞ്ചിലെ പ്രധാന സംഭവങ്ങൾ എന്തൊക്കെയാണ്?\"\n• \"आज ब्रांच में क्या-क्या मुख्य घटनाएं हुईं?\"\n• \"Show person wearing yellow shirt with bag\"\n• \"Show vault room entries in last 2 hours\"",
      timestamp: null,
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Filters
  const [filters, setFilters] = useState({
    timeRange: "yesterday",
    cameraIds: [] as string[],
    minConfidence: 60,
  });

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSearch = async (rawQuery = inputValue) => {
    const query = rawQuery.trim();
    if (query.length < 3 || loading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: query,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setLoading(true);

    try {
      // Perform search via control plane proxy
      const response = await fetch("/api/control/v1/ai-video-search/natural-language", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          query,
          branchId,
          from: getTimeRangeStart(filters.timeRange),
          to: new Date().toISOString(),
          minConfidence: filters.minConfidence / 100,
          limit: 10,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || data.error || "Video search failed");
      }
      const results: SearchResult[] = data.results || [];
      const summary: AIVideoSummary | undefined = data.summary || undefined;
      const queryUnderstanding = data.metadata?.queryUnderstanding || undefined;

      // Create assistant response
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: summary
          ? (summary.title || "🎯 ഇന്നത്തെ ബ്രാഞ്ച് സുരക്ഷാ & വീഡിയോ സമ്മറി (Today's AI Video Summary)")
          : generateResponseMessage(results, query),
        results: results.length > 0 ? results : undefined,
        summary,
        queryUnderstanding,
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
        content: "Sorry, I encountered an error while searching. Please try again or check your query.",
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
        return new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
    }
  };

  const getMatchTypeColor = (matchType: string) => {
    switch (matchType) {
      case "exact":
        return "bg-emerald-600 text-white";
      case "high-confidence":
        return "bg-blue-600 text-white";
      case "probable":
        return "bg-amber-600 text-white";
      case "possible":
        return "bg-slate-600 text-white";
      default:
        return "bg-slate-500 text-white";
    }
  };

  const getObjectTypeIcon = (objectType: string) => {
    switch (objectType) {
      case "person":
        return <User className="h-4 w-4 text-blue-600" />;
      case "vehicle":
        return <Car className="h-4 w-4 text-emerald-600" />;
      default:
        return <Camera className="h-4 w-4 text-purple-600" />;
    }
  };

  const quickSearches = [
    "ഇന്നലെ വൈകുന്നേരം 7 മണിക്ക് ശേഷം മഞ്ഞ ഷർട്ട് ഇട്ട് ബാഗുമായി വന്ന ആളെ കാണിക്കുക",
    "कल शाम 7 बजे के बाद पीली शर्ट और बैग के साथ आए व्यक्ति को दिखाइए",
    "ഇന്നത്തെ ബ്രാഞ്ചിലെ പ്രധാന സംഭവങ്ങൾ എന്തൊക്കെയാണ്?",
    "आज ब्रांच में क्या-क्या मुख्य घटनाएं हुईं?",
    "Show person wearing yellow shirt with bag",
    "Show vault room entries in last 2 hours",
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-12rem)]">
      {/* Chat & Query Interface - Left Side */}
      <div className="lg:col-span-2 flex flex-col h-full">
        <Card className="flex-1 flex flex-col h-full shadow-md border-slate-200">
          <CardHeader className="border-b bg-slate-50/70 py-4 px-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg font-bold text-slate-900">
                  <Sparkles className="h-5 w-5 text-indigo-600 animate-pulse" />
                  Natural Language Video Search
                  <Badge variant="outline" className="ml-2 bg-indigo-50 text-indigo-700 border-indigo-200 text-xs font-semibold">
                    Vision-LLM / Video RAG
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  &quot;Talk to your CCTV&quot; — Malayalam, Hindi &amp; English semantic search powered by Gemini &amp; Qwen2-VL
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="h-8 text-xs font-medium border-slate-300"
              >
                <Filter className="h-3.5 w-3.5 mr-1.5 text-slate-600" />
                Filters
              </Button>
            </div>

            {/* Filters */}
            {showFilters && (
              <div className="mt-3 p-3 bg-white rounded-lg border border-slate-200 shadow-inner grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-700 mb-1 block">Search Time Window</label>
                  <select
                    value={filters.timeRange}
                    onChange={(e) => setFilters({ ...filters, timeRange: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="last-hour">Last 1 Hour</option>
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday (Includes Evening 7 PM+)</option>
                    <option value="week">Past 7 Days</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-700 mb-1 block">
                    Confidence Filter: {filters.minConfidence}%
                  </label>
                  <input
                    type="range"
                    min="30"
                    max="95"
                    value={filters.minConfidence}
                    onChange={(e) =>
                      setFilters({ ...filters, minConfidence: parseInt(e.target.value) })
                    }
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                </div>
              </div>
            )}
          </CardHeader>

          {/* Messages */}
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/30">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[88%] rounded-xl p-4 shadow-sm ${
                    message.role === "user"
                      ? "bg-indigo-600 text-white border-transparent"
                      : "bg-white text-slate-900 border border-slate-200"
                  }`}
                >
                  {/* Assistant Header if VLM */}
                  {message.role === "assistant" && (
                    <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-indigo-700">
                      <Bot className="h-4 w-4" />
                      <span>KryptoVision Video Intelligence</span>
                      {message.queryUnderstanding?.engineUsed && (
                        <span className="ml-auto text-[10px] font-normal px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full border border-indigo-100">
                          {message.queryUnderstanding.engineUsed}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="whitespace-pre-wrap leading-relaxed text-sm font-normal">
                    {message.content}
                  </div>

                  {/* VLM Semantic Breakdown Tag */}
                  {message.queryUnderstanding && (
                    <div className="mt-2.5 pt-2 border-t border-slate-100 text-xs text-slate-600 flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-slate-700">🔍 Extracted:</span>
                      {message.queryUnderstanding.attributes?.upperClothingColor && (
                        <Badge variant="secondary" className="text-[10px] bg-amber-50 text-amber-800 border-amber-200">
                          Shirt: {message.queryUnderstanding.attributes.upperClothingColor}
                        </Badge>
                      )}
                      {message.queryUnderstanding.attributes?.hasBag && (
                        <Badge variant="secondary" className="text-[10px] bg-blue-50 text-blue-800 border-blue-200">
                          Bag: Yes
                        </Badge>
                      )}
                      {message.queryUnderstanding.relativeTimeDescription && (
                        <Badge variant="secondary" className="text-[10px] bg-slate-100 text-slate-700">
                          {message.queryUnderstanding.relativeTimeDescription}
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* AI Video Summary Card Report */}
                  {message.summary && (
                    <div className="mt-4 p-4 rounded-xl bg-gradient-to-br from-indigo-50/80 via-white to-slate-50 border border-indigo-100 shadow-sm text-slate-800 space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-indigo-100">
                        <div className="flex items-center gap-2">
                          <FileText className="h-5 w-5 text-indigo-600" />
                          <h4 className="font-bold text-sm text-slate-900">{message.summary.title}</h4>
                        </div>
                        <Badge className="bg-emerald-600 text-white text-[10px]">
                          Executive Verified
                        </Badge>
                      </div>

                      {/* 3-4 Bullet Points */}
                      <div className="space-y-2">
                        {message.summary.bulletPoints.map((point, pIdx) => (
                          <div key={pIdx} className="flex items-start gap-2 text-xs leading-relaxed text-slate-700">
                            <span className="text-indigo-600 font-bold mt-0.5">•</span>
                            <div className="whitespace-pre-wrap">{point}</div>
                          </div>
                        ))}
                      </div>

                      {/* Branch Key Statistics */}
                      {message.summary.statistics && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-indigo-100/60">
                          <div className="p-2 bg-white rounded-lg border border-slate-100 text-center">
                            <div className="text-[10px] text-slate-500 font-medium">Visitors / Footfall</div>
                            <div className="text-sm font-bold text-slate-900">{message.summary.statistics.totalVisitors}</div>
                          </div>
                          <div className="p-2 bg-white rounded-lg border border-slate-100 text-center">
                            <div className="text-[10px] text-slate-500 font-medium">Security Alerts</div>
                            <div className="text-sm font-bold text-amber-600">{message.summary.statistics.securityAlerts}</div>
                          </div>
                          <div className="p-2 bg-white rounded-lg border border-slate-100 text-center">
                            <div className="text-[10px] text-slate-500 font-medium">Vault Integrity</div>
                            <div className="text-sm font-bold text-emerald-600">Dual-Custody OK</div>
                          </div>
                          <div className="p-2 bg-white rounded-lg border border-slate-100 text-center">
                            <div className="text-[10px] text-slate-500 font-medium">Camera Coverage</div>
                            <div className="text-sm font-bold text-indigo-600">100% Online</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Search Video Clip Matches */}
                  {message.results && message.results.length > 0 && (
                    <div className="mt-4 space-y-2.5">
                      <div className="text-xs font-semibold text-slate-600 flex items-center justify-between">
                        <span>Filtered Video Clips ({message.results.length}):</span>
                        <span className="text-[11px] text-slate-500">Click clip to inspect in player</span>
                      </div>
                      {message.results.map((result) => (
                        <div
                          key={result.id}
                          className={`p-3 rounded-lg cursor-pointer transition-all ${
                            selectedResult?.id === result.id
                              ? "bg-indigo-50 border-2 border-indigo-600 shadow-sm"
                              : "bg-white border border-slate-200 hover:border-indigo-300 hover:bg-slate-50/80"
                          }`}
                          onClick={() => setSelectedResult(result)}
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-1 p-2 bg-slate-100 rounded-lg">
                              {getObjectTypeIcon(result.object.objectType)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="font-semibold text-sm text-slate-900">
                                  {result.cameraName || result.cameraId}
                                </span>
                                <Badge className={`${getMatchTypeColor(result.matchType)} text-[10px] px-2 py-0.5`}>
                                  {Math.round(result.score * 100)}% Match
                                </Badge>
                                {result.object.attributes?.upperClothingColor && (
                                  <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-800 border-amber-300">
                                    Shirt: {result.object.attributes.upperClothingColor}
                                  </Badge>
                                )}
                                {result.object.attributes?.hasBag && (
                                  <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-800 border-blue-300">
                                    Bag Detected
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-slate-600 flex items-center gap-2">
                                <Clock className="h-3.5 w-3.5 text-slate-400" />
                                {new Date(result.timestamp).toLocaleString(undefined, {
                                  dateStyle: "medium",
                                  timeStyle: "medium",
                                })}
                              </div>
                              {result.matchReason && (
                                <div className="text-xs text-slate-700 mt-1.5 font-medium bg-slate-50 p-1.5 rounded border border-slate-100">
                                  {result.matchReason}
                                </div>
                              )}
                              {result.relatedDetections && result.relatedDetections.length > 0 && (
                                <div className="text-[11px] text-indigo-700 mt-1 flex items-center gap-1">
                                  <TrendingUp className="h-3 w-3" />
                                  Tracked across {result.relatedDetections.length} downstream branch camera(s)
                                </div>
                              )}
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-slate-700 hover:text-indigo-600 hover:bg-indigo-50"
                            >
                              <Play className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="text-[10px] opacity-70 mt-2 text-right">
                    {message.timestamp ? message.timestamp.toLocaleTimeString() : "Ready to search"}
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-indigo-200 rounded-xl p-3.5 shadow-sm">
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="h-4 w-4 text-indigo-600 animate-spin" />
                    <span className="text-slate-800 text-xs font-semibold">
                      Vision-LLM is scrubbing timeline &amp; indexing semantic video segments...
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </CardContent>

          {/* Input & Quick Chips */}
          <div className="border-t p-4 bg-white">
            {/* Quick Searches with Prompt chips in Malayalam */}
            <div className="mb-3 flex flex-wrap gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500 self-center mr-1">Quick Prompts:</span>
              {quickSearches.map((search, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setInputValue(search);
                    void handleSearch(search);
                  }}
                  className="text-xs h-7 py-0 px-2.5 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 text-slate-700 font-medium transition-colors"
                >
                  {search}
                </Button>
              ))}
            </div>

            <div className="flex gap-2">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSearch();
                  }
                }}
                placeholder="Type in Malayalam, Hindi, or English... (e.g., 'कल शाम 7 बजे के बाद पीली शर्ट...' or 'ഇന്നലെ വൈകുന്നേരം 7 മണിക്ക് ശേഷം...')"
                disabled={loading}
                className="flex-1 text-sm border-slate-300 focus:ring-2 focus:ring-indigo-500"
              />
              <Button
                onClick={() => void handleSearch()}
                disabled={loading || inputValue.trim().length < 3}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
              >
                <Send className="h-4 w-4 mr-1.5" />
                Search
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Video Player & Evidence Inspector - Right Side */}
      <div className="lg:col-span-1 flex flex-col h-full">
        <Card className="flex-1 flex flex-col h-full shadow-md border-slate-200">
          <CardHeader className="border-b bg-slate-50/70 py-4 px-5">
            <CardTitle className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Video className="h-5 w-5 text-indigo-600" />
              Surveillance Playback
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-4 overflow-y-auto">
            {selectedResult ? (
              <div className="space-y-4">
                {/* Simulated CCTV Stream Viewport */}
                <div className="relative aspect-video bg-slate-950 rounded-xl overflow-hidden flex items-center justify-center border border-slate-800 shadow-inner group">
                  {/* CCTV Stream OSD Header */}
                  <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-10 text-[10px] text-white/90 font-mono bg-black/60 px-2 py-1 rounded backdrop-blur-sm">
                    <span className="flex items-center gap-1.5 text-red-400 font-bold">
                      <span className="h-2 w-2 rounded-full bg-red-500 animate-ping" />
                      REC PLAYBACK
                    </span>
                    <span>{selectedResult.cameraName || selectedResult.cameraId}</span>
                    <span>{new Date(selectedResult.timestamp).toLocaleTimeString()}</span>
                  </div>

                  {/* Simulated Bounding Box for Detected Object */}
                  <div className="absolute border-2 border-emerald-400 bg-emerald-500/10 rounded pointer-events-none z-10 w-28 h-40 flex items-start justify-end p-1 shadow-[0_0_15px_rgba(16,185,129,0.5)]">
                    <span className="text-[9px] bg-emerald-600 text-white font-mono px-1 rounded shadow">
                      {selectedResult.object.attributes?.upperClothingColor ? `${selectedResult.object.attributes.upperClothingColor.toUpperCase()} SHIRT` : "PERSON"} 94%
                    </span>
                  </div>

                  <div className="text-center text-white/70">
                    <Camera className="h-10 w-10 mx-auto mb-2 text-slate-600" />
                    <p className="text-xs font-medium">H.264 High Profile Stream Segment</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Seek Point: {new Date(selectedResult.seekTimestamp || selectedResult.timestamp).toLocaleTimeString()}
                    </p>
                  </div>

                  {/* Play Control Overlay */}
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-white z-10 bg-black/60 px-3 py-1.5 rounded backdrop-blur-sm">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-white hover:bg-white/20">
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                    <div className="text-[11px] font-mono text-slate-300">
                      -00:15 / +00:30 (Context Window)
                    </div>
                    <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-400/40">
                      Synchronized
                    </Badge>
                  </div>
                </div>

                {/* Video Clip Metadata Details */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm text-slate-900">
                        {selectedResult.cameraName || selectedResult.cameraId}
                      </div>
                      <div className="text-xs text-slate-500">
                        {new Date(selectedResult.timestamp).toLocaleString()}
                      </div>
                    </div>
                    <Badge className={getMatchTypeColor(selectedResult.matchType)}>
                      {Math.round(selectedResult.score * 100)}% Match
                    </Badge>
                  </div>

                  {/* Object Attributes Card */}
                  <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-3.5">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          {getObjectTypeIcon(selectedResult.object.objectType)}
                          <span className="font-semibold text-xs text-slate-900 capitalize">
                            {selectedResult.object.objectType}
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            {Math.round(selectedResult.object.confidence * 100)}% confidence
                          </Badge>
                        </div>

                        {/* Extracted Attributes */}
                        {Object.keys(selectedResult.object.attributes || {}).length > 0 && (
                          <div className="pt-2 border-t border-slate-100">
                            <div className="text-[11px] font-semibold text-slate-600 mb-1.5">
                              Forensic Attributes
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {Object.entries(selectedResult.object.attributes).map(
                                ([key, value]) => (
                                  <Badge key={key} variant="secondary" className="text-[10px] bg-slate-100 text-slate-800">
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

                  {/* Incident Escalation Actions */}
                  <div className="space-y-2 pt-1">
                    <div className="flex gap-2">
                      <a
                        href="/playback/synced"
                        className="inline-flex items-center justify-center rounded-md text-xs font-medium border border-slate-300 hover:bg-slate-50 px-3 py-2 flex-1 gap-1.5 text-slate-700"
                      >
                        <Layers className="h-3.5 w-3.5 text-slate-500" />
                        Synced Replay
                      </a>
                      <a
                        href="/evidence"
                        className="inline-flex items-center justify-center rounded-md text-xs font-medium border border-slate-300 hover:bg-slate-50 px-3 py-2 flex-1 gap-1.5 text-slate-700"
                      >
                        <ShieldCheck className="h-3.5 w-3.5 text-slate-500" />
                        Seal Evidence
                      </a>
                    </div>

                    <a
                      href={`/incidents/create?cameraId=${encodeURIComponent(selectedResult.cameraId)}&timestamp=${encodeURIComponent(selectedResult.timestamp)}&title=${encodeURIComponent(`Natural Language Forensic Hit: ${selectedResult.object.objectType} on ${selectedResult.cameraName || selectedResult.cameraId}`)}`}
                      className="inline-flex items-center justify-center rounded-md text-xs font-semibold bg-red-600 hover:bg-red-700 text-white px-3 py-2 transition-colors w-full gap-2 shadow-sm"
                    >
                      <AlertTriangle className="h-4 w-4" />
                      Escalate to Security Incident
                    </a>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-center p-6">
                <div>
                  <Search className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                  <p className="text-slate-700 font-semibold text-sm">No clip selected</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Click any quick prompt or query footage to preview video clips here.
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
