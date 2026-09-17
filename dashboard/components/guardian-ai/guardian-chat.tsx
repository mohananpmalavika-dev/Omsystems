"use client";

/**
 * KryptonAI Chat Interface
 * 
 * JARVIS-like AI assistant for security operations
 */

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Send, Mic, MicOff, Sparkles, AlertCircle, CheckCircle2, Loader2, X, MonitorPlay, Camera, Play, ExternalLink, ArrowRight, Compass, LayoutGrid } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  type?: "text" | "action" | "suggestion" | "warning" | "error";
  actions?: Array<{
    function: string;
    parameters: Record<string, any>;
    executed: boolean;
    result?: any;
  }>;
  timestamp: string;
}

interface CameraInfo {
  id: string;
  name: string;
  status: string;
}

function extractCameraAction(message: ChatMessage): { cameraIds: string[]; layout: string; cameras: CameraInfo[] } | null {
  // 1. From structured actions
  if (message.actions && message.actions.length > 0) {
    const action = message.actions.find((a) => a.function === "show_camera_feed" || a.function === "show_cameras");
    if (action) {
      const cameraIds: string[] = action.parameters?.cameraIds || [];
      const layout = action.parameters?.layout || "grid";
      const resultCameras: CameraInfo[] = action.result?.cameras || [];
      const cameras = cameraIds.map((id, idx) => {
        const found = resultCameras.find((c) => c.id === id);
        return {
          id,
          name: found?.name || `Camera ${idx + 1} (${id.slice(0, 8)})`,
          status: found?.status || "online",
        };
      });
      return { cameraIds, layout, cameras };
    }
  }

  // 2. Fallback: Parse raw JSON pattern from message content if model dumped raw function call
  if (message.content) {
    const jsonMatch = message.content.match(/(?:show_camera_feed\s*)?\{[\s\S]*?"cameraIds"\s*:\s*\[([\s\S]*?)\][\s\S]*?\}/i);
    if (jsonMatch) {
      try {
        const fullJsonStr = jsonMatch[0].replace(/^show_camera_feed\s*/i, "").trim();
        const parsed = JSON.parse(fullJsonStr);
        if (Array.isArray(parsed.cameraIds) && parsed.cameraIds.length > 0) {
          const layout = parsed.layout || "grid";
          const cameras: CameraInfo[] = parsed.cameraIds.map((id: string, idx: number) => ({
            id: String(id),
            name: `Camera ${idx + 1} (${String(id).slice(0, 8)})`,
            status: "online",
          }));
          return { cameraIds: parsed.cameraIds, layout, cameras };
        }
      } catch {}
    }
  }

  return null;
}

function cleanMessageContent(content: string): string {
  if (!content) return "";
  const cleaned = content.replace(/(?:```(?:json)?\s*)?(?:show_camera_feed\s*)?\{[\s\S]*?"cameraIds"\s*:\s*\[[\s\S]*?\][\s\S]*?\}(?:\s*```)?/gi, "").trim();
  if (!cleaned) {
    return "Displaying requested camera feeds in live monitor:";
  }
  return cleaned;
}

function CameraFeedDisplay({ cameraInfo }: { cameraInfo: { cameraIds: string[]; layout: string; cameras: CameraInfo[] } }) {
  const { cameras, layout } = cameraInfo;
  return (
    <div className="mt-3 p-3 bg-slate-950/80 border border-indigo-500/30 rounded-xl space-y-3 text-left">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <MonitorPlay className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-semibold text-white">Live Camera Feeds</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono">
            {cameras.length} Cameras • {layout}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[10px] font-bold text-green-400 tracking-wider">LIVE</span>
        </div>
      </div>

      <div className={`grid gap-2 ${cameras.length > 1 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
        {cameras.map((cam, idx) => (
          <div
            key={cam.id || idx}
            className="group relative bg-slate-900/90 border border-slate-700/80 hover:border-indigo-500/50 rounded-lg p-2.5 transition-all overflow-hidden"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Camera className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="text-xs font-medium text-white truncate" title={cam.name}>
                  {cam.name}
                </span>
              </div>
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">
                Online
              </span>
            </div>

            <div className="relative aspect-video bg-black/80 rounded border border-slate-800 flex flex-col items-center justify-center p-2 group-hover:border-slate-700 transition-colors">
              <div className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1 py-0.5 rounded bg-black/60 text-[9px] font-mono text-slate-400">
                <span>CAM {idx + 1}</span>
              </div>
              <div className="absolute top-1.5 right-1.5 flex items-center gap-1 px-1 py-0.5 rounded bg-red-950/80 text-[9px] font-bold text-red-400 border border-red-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
                <span>REC</span>
              </div>

              <div className="p-2 rounded-full bg-slate-800/80 text-indigo-400 mb-1 group-hover:scale-110 transition-transform">
                <Play className="w-4 h-4 fill-current" />
              </div>
              <span className="text-[10px] text-slate-400 font-mono truncate max-w-full px-2">
                {cam.id}
              </span>
            </div>

            <div className="mt-2 flex items-center gap-1.5">
              <Link
                href={`/control-room?camera=${encodeURIComponent(cam.id)}`}
                target="_blank"
                className="flex-1 text-center py-1 px-2 rounded bg-indigo-600/80 hover:bg-indigo-500 text-white text-[11px] font-medium flex items-center justify-center gap-1 transition-colors"
              >
                <span>Watch Stream</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </Link>
              <Link
                href={`/playback/synced?camera=${encodeURIComponent(cam.id)}`}
                target="_blank"
                className="py-1 px-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium transition-colors"
                title="Synced Playback"
              >
                Playback
              </Link>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
        <span className="text-[11px] text-slate-400">Security Video Control</span>
        <Link
          href="/control-room"
          target="_blank"
          className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300"
        >
          <span>Open Full Live Video Wall</span>
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}

interface NavigationActionInfo {
  label: string;
  href: string;
  category: string;
}

function extractNavigationAction(message: ChatMessage): NavigationActionInfo | null {
  if (message.actions && message.actions.length > 0) {
    const navAction = message.actions.find((a) => a.function === "navigate_to_menu");
    if (navAction) {
      const href = navAction.result?.href || navAction.parameters?.target || "/";
      const label = navAction.result?.label || navAction.parameters?.label || "Open Requested Page";
      const category = navAction.result?.category || "OPERATIONS";
      return { href, label, category };
    }
  }

  // Check if message content has an internal route link
  if (message.content) {
    const routeMatch = message.content.match(/\/(reports\/mis|control-room|analytics\/alerts|incidents|operations\/cameras|video-search|playback\/synced|analytics\/face-recognition|nbfc-operations|compliance|settings|admin\/users)/);
    if (routeMatch) {
      const href = `/${routeMatch[1]}`;
      const label = href.split("/").pop()?.replace(/-/g, " ").toUpperCase() || "Open Page";
      return {
        href,
        label,
        category: "NAVIGATION",
      };
    }
  }

  return null;
}

function NavigationActionDisplay({
  navInfo,
  onNavigate,
}: {
  navInfo: NavigationActionInfo;
  onNavigate: (href: string) => void;
}) {
  return (
    <div className="mt-3 p-3.5 bg-gradient-to-r from-sky-950/70 via-slate-900 to-indigo-950/70 border border-sky-500/40 rounded-xl space-y-2.5 shadow-lg text-left">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-bold text-white block">{navInfo.label}</span>
            <span className="text-[10px] text-slate-400">{navInfo.category} · {navInfo.href}</span>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
          Ready
        </span>
      </div>

      <div className="pt-1 flex items-center gap-2">
        <button
          onClick={() => onNavigate(navInfo.href)}
          className="flex-1 py-2 px-3 rounded-lg bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-sky-500/20 transition-all cursor-pointer"
        >
          <span>🚀 Open {navInfo.label} Now</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
        <Link
          href={navInfo.href}
          target="_blank"
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs transition-colors"
          title="Open in new tab"
        >
          <ExternalLink className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}

interface GuardianChatProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GuardianChat({ isOpen, onClose }: GuardianChatProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "KryptonAI online. How can I assist you with security operations? You can ask me to open any menu or view live cameras.",
      type: "text",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const handleNavigate = (href: string) => {
    onClose();
    router.push(href);
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load proactive suggestions
  useEffect(() => {
    if (isOpen) {
      loadSuggestions();
    }
  }, [isOpen]);

  const loadSuggestions = async () => {
    try {
      const response = await fetch("/api/v1/guardian/suggestions", {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
          setSuggestions(data.suggestions);
          return;
        }
      }
    } catch {}
    // Safe default suggestions
    setSuggestions([
      "Check all cameras status",
      "Review open operational alerts",
      "Show system operational health overview",
    ]);
  };

  const sendMessage = async (message?: string) => {
    const text = message || input.trim();

    if (!text || isLoading) return;

    // Add user message
    const userMessage: ChatMessage = {
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/v1/guardian/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          message: text,
          sessionId: sessionId || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`KryptonAI error: ${response.status}`);
      }

      const data = await response.json();
      
      // Save session ID
      if (data.sessionId) {
        setSessionId(data.sessionId);
      }

      // Add assistant response
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: data.data.message,
        type: data.data.type,
        actions: data.data.actions,
        timestamp: data.data.timestamp,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("KryptonAI error:", error);
      
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I apologize, but I encountered an error processing your request. Please try again.",
          type: "error",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
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
        await processVoiceCommand(audioBlob);
        
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

  const processVoiceCommand = async (audioBlob: Blob) => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/v1/guardian/voice", {
        method: "POST",
        headers: {
          "Content-Type": "audio/webm",
        },
        credentials: "include",
        body: audioBlob,
      });

      if (!response.ok) {
        throw new Error(`Voice command failed: ${response.status}`);
      }

      const data = await response.json();
      
      // Add transcribed message
      setMessages((prev) => [
        ...prev,
        {
          role: "user",
          content: data.transcription,
          timestamp: new Date().toISOString(),
        },
      ]);

      // Add assistant response
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.data.message,
          type: data.data.type,
          actions: data.data.actions,
          timestamp: data.data.timestamp,
        },
      ]);

      if (data.sessionId) {
        setSessionId(data.sessionId);
      }
    } catch (error) {
      console.error("Voice command failed:", error);
      alert("Voice command failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const getMessageIcon = (type?: string) => {
    switch (type) {
      case "action":
        return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      case "warning":
        return <AlertCircle className="w-4 h-4 text-yellow-400" />;
      case "error":
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      default:
        return <Sparkles className="w-4 h-4 text-indigo-400" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-3xl h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Sparkles className="w-6 h-6 text-indigo-400" />
              <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-slate-900"></div>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">KryptonAI</h2>
              <p className="text-xs text-slate-400">Intelligent Security Assistant</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Quick Menu Launcher Bar */}
        <div className="px-4 py-2 bg-slate-900/90 border-b border-slate-800 flex items-center gap-1.5 overflow-x-auto text-[11px] shrink-0">
          <span className="text-slate-400 font-medium flex items-center gap-1 shrink-0 mr-1">
            <Compass className="w-3.5 h-3.5 text-sky-400" /> Quick Open:
          </span>
          {[
            { label: "📊 MIS Reports", href: "/reports/mis" },
            { label: "🖥️ Video Wall", href: "/control-room" },
            { label: "🚨 AI Alerts", href: "/analytics/alerts" },
            { label: "🔍 Video Search", href: "/video-search" },
            { label: "👤 Face Recognition", href: "/analytics/face-recognition" },
            { label: "📷 Camera Health", href: "/operations/cameras" },
            { label: "🏛️ NBFC Ops", href: "/nbfc-operations" },
            { label: "⚙️ Settings", href: "/settings" },
          ].map((m) => (
            <button
              key={m.href}
              onClick={() => handleNavigate(m.href)}
              className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition-all shrink-0 font-medium cursor-pointer"
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Suggestions Banner */}
        {suggestions.length > 0 && (
          <div className="p-4 bg-indigo-500/10 border-b border-indigo-500/20">
            <p className="text-sm text-slate-300 mb-2 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span className="font-medium">Proactive Suggestions:</span>
            </p>
            <div className="space-y-2">
              {suggestions.slice(0, 2).map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => sendMessage(suggestion)}
                  className="block w-full text-left px-3 py-2 bg-slate-800/50 hover:bg-slate-800 rounded-lg text-sm text-slate-300 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}
            >
              {/* Avatar */}
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                message.role === "user"
                  ? "bg-indigo-600"
                  : "bg-slate-800 border border-slate-700"
              }`}>
                {message.role === "user" ? (
                  <span className="text-xs font-medium text-white">You</span>
                ) : (
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                )}
              </div>

              {/* Message Content */}
              <div className={`flex-1 max-w-[80%] ${message.role === "user" ? "text-right" : ""}`}>
                <div className={`inline-block px-4 py-3 rounded-2xl ${
                  message.role === "user"
                    ? "bg-indigo-600 text-white"
                    : message.type === "error"
                    ? "bg-red-500/10 border border-red-500/20 text-slate-300"
                    : message.type === "warning"
                    ? "bg-yellow-500/10 border border-yellow-500/20 text-slate-300"
                    : "bg-slate-800 border border-slate-700 text-slate-300"
                }`}>
                  {message.role === "assistant" && message.type && message.type !== "text" && message.type !== "action" && (
                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-700">
                      {getMessageIcon(message.type)}
                      <span className="text-xs font-medium uppercase">{message.type}</span>
                    </div>
                  )}
                  {(() => {
                    const cameraAction = extractCameraAction(message);
                    const navAction = extractNavigationAction(message);
                    const cleanText = cameraAction ? cleanMessageContent(message.content) : message.content;

                    return (
                      <>
                        {cleanText && <p className="text-sm whitespace-pre-wrap">{cleanText}</p>}
                        {cameraAction && <CameraFeedDisplay cameraInfo={cameraAction} />}
                        {navAction && <NavigationActionDisplay navInfo={navAction} onNavigate={handleNavigate} />}
                      </>
                    );
                  })()}
                  
                  {/* Executed Action Indicators */}
                  {message.actions && message.actions.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-slate-700/50 flex flex-wrap gap-2">
                      {message.actions
                        .filter((action) => !action.function.startsWith("get_"))
                        .map((action, actionIndex) => (
                          <div
                            key={actionIndex}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-900/60 border border-slate-700/60 rounded-lg text-xs text-indigo-300"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                            <span className="font-medium capitalize">
                              {action.function.replace(/_/g, " ")}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1 px-2">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="flex-1">
                <div className="inline-block px-4 py-3 bg-slate-800 border border-slate-700 rounded-2xl">
                  <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-slate-700">
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask KryptonAI anything... (e.g., 'Show me all cameras', 'Lock doors on floor 3')"
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                rows={2}
                disabled={isLoading || isRecording}
              />
            </div>

            {/* Voice Button */}
            <button
              onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
              disabled={isLoading}
              className={`p-3 rounded-xl transition-all ${
                isRecording
                  ? "bg-red-500 hover:bg-red-600 text-white animate-pulse"
                  : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
              }`}
              title={isRecording ? "Stop recording" : "Voice command"}
            >
              {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            {/* Send Button */}
            <button
              onClick={() => sendMessage()}
              disabled={isLoading || isRecording || !input.trim()}
              className="p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title="Send message"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
