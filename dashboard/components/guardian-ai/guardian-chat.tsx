"use client";

/**
 * Guardian AI Chat Interface
 * 
 * JARVIS-like AI assistant for security operations
 */

import { useState, useRef, useEffect } from "react";
import { Send, Mic, MicOff, Sparkles, AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";

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

interface GuardianChatProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GuardianChat({ isOpen, onClose }: GuardianChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Guardian AI online. How can I assist you with security operations?",
      type: "text",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const [suggestions, setSuggestions] = useState<string[]>([]);

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
        setSuggestions(data.suggestions || []);
      }
    } catch (error) {
      console.error("Failed to load suggestions:", error);
    }
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
        throw new Error(`Guardian AI error: ${response.status}`);
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
      console.error("Guardian AI error:", error);
      
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
              <h2 className="text-lg font-bold text-slate-100">Guardian AI</h2>
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
                  {message.role === "assistant" && message.type && (
                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-700">
                      {getMessageIcon(message.type)}
                      <span className="text-xs font-medium uppercase">{message.type}</span>
                    </div>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  
                  {/* Actions */}
                  {message.actions && message.actions.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-700 space-y-2">
                      {message.actions.map((action, actionIndex) => (
                        <div
                          key={actionIndex}
                          className="p-2 bg-slate-900/50 rounded-lg text-xs"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-indigo-400">{action.function}</span>
                            {action.executed && (
                              <CheckCircle2 className="w-4 h-4 text-green-400" />
                            )}
                          </div>
                          <pre className="text-slate-500 overflow-x-auto">
                            {JSON.stringify(action.parameters, null, 2)}
                          </pre>
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
                placeholder="Ask Guardian anything... (e.g., 'Show me all cameras', 'Lock doors on floor 3')"
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
