"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Building2,
  Camera,
  Server,
  AlertTriangle,
  Siren,
  FileSearch,
  ArrowRight,
  X,
  CornerDownLeft,
} from "lucide-react";
import { StatusBadge } from "../ui/status-badge";

interface OmniboxSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function OmniboxSearchModal({ isOpen, onClose }: OmniboxSearchModalProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/operations/universal-search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (data.success && data.data?.matches) {
          setResults(data.data.matches);
          setSelectedIndex(0);
        }
      } catch (err) {
        console.error("Search error:", err);
      } finally {
        setLoading(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (results.length || 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + (results.length || 1)) % (results.length || 1));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  const handleSelect = (item: any) => {
    onClose();
    if (item.navigationUrl) {
      router.push(item.navigationUrl);
    }
  };

  const getEntityIcon = (type: string) => {
    switch (type) {
      case "BRANCH":
        return <Building2 className="w-4 h-4 text-blue-400" />;
      case "CAMERA":
        return <Camera className="w-4 h-4 text-emerald-400" />;
      case "RECORDER":
        return <Server className="w-4 h-4 text-purple-400" />;
      case "ALERT":
        return <AlertTriangle className="w-4 h-4 text-rose-400" />;
      case "INCIDENT":
        return <Siren className="w-4 h-4 text-amber-400" />;
      default:
        return <FileSearch className="w-4 h-4 text-slate-400" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden">
        <div className="relative flex items-center border-b border-slate-800 px-4 py-3.5">
          <Search className="w-5 h-5 text-slate-400 mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search branches, cameras, NVRs, P1 alerts, or incidents..."
            className="flex-1 bg-transparent text-slate-100 placeholder-slate-500 text-sm focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="p-1 hover:bg-slate-800 rounded-md text-slate-400 hover:text-slate-200 mr-2"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-xs text-slate-400 bg-slate-800 border border-slate-700 rounded">
            ESC
          </kbd>
        </div>

        <div className="max-h-96 overflow-y-auto p-2 divide-y divide-slate-800/40">
          {loading && (
            <div className="p-8 text-center text-sm text-slate-400">
              Searching surveillance assets...
            </div>
          )}

          {!loading && query && results.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-400">
              No matching branches, cameras, alerts, or incidents found for "{query}".
            </div>
          )}

          {!loading && !query && (
            <div className="p-4 text-xs text-slate-500 flex flex-col gap-2">
              <div className="font-semibold text-slate-400 uppercase tracking-wider">Quick Suggestions</div>
              <div className="grid grid-cols-2 gap-2 text-slate-300">
                <div
                  onClick={() => setQuery("Aluva")}
                  className="p-2.5 rounded-lg bg-slate-800/50 hover:bg-slate-800 cursor-pointer flex items-center justify-between"
                >
                  <span>Branch: Aluva Main</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                </div>
                <div
                  onClick={() => setQuery("Vault")}
                  className="p-2.5 rounded-lg bg-slate-800/50 hover:bg-slate-800 cursor-pointer flex items-center justify-between"
                >
                  <span>Camera: Vault Strongroom</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                </div>
                <div
                  onClick={() => setQuery("CP PLUS")}
                  className="p-2.5 rounded-lg bg-slate-800/50 hover:bg-slate-800 cursor-pointer flex items-center justify-between"
                >
                  <span>Recorder: CP PLUS AI NVR</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                </div>
                <div
                  onClick={() => setQuery("P1")}
                  className="p-2.5 rounded-lg bg-slate-800/50 hover:bg-slate-800 cursor-pointer flex items-center justify-between"
                >
                  <span>Alert: P1 Critical Alarms</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                </div>
              </div>
            </div>
          )}

          {results.map((item, idx) => (
            <div
              key={`${item.entityType}-${item.entityId}`}
              onClick={() => handleSelect(item)}
              className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${
                idx === selectedIndex ? "bg-blue-600/20 border border-blue-500/40" : "hover:bg-slate-800/50"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-slate-800 border border-slate-700/60">
                  {getEntityIcon(item.entityType)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-100">{item.title}</span>
                    {item.status && <StatusBadge status={item.status} size="sm" />}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">{item.subtitle}</div>
                </div>
              </div>
              <CornerDownLeft className="w-4 h-4 text-slate-500 opacity-60" />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/60 border-t border-slate-800 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
          <span>Surveillance OS Omnibox</span>
        </div>
      </div>
    </div>
  );
}
