"use client";

import React, { useState, useRef, useEffect } from "react";
import { Palette, Check, Sun, Moon, Shield, Sparkles } from "lucide-react";
import { useTheme, ThemeMode, AVAILABLE_THEMES } from "./theme-provider";

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getThemeIcon = (themeId: ThemeMode) => {
    switch (themeId) {
      case "light":
        return <Sun size={14} className="text-amber-500" />;
      case "navy":
        return <Shield size={14} className="text-cyan-400" />;
      case "emerald":
        return <Sparkles size={14} className="text-emerald-400" />;
      case "dark":
      default:
        return <Moon size={14} className="text-blue-400" />;
    }
  };

  const getThemeLabel = (themeId: ThemeMode) => {
    const found = AVAILABLE_THEMES.find((t) => t.id === themeId);
    return found ? found.name : "Theme";
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-all shadow-sm"
        aria-label="Select color theme"
        title={`Current theme: ${getThemeLabel(theme)}. Click to change.`}
      >
        {getThemeIcon(theme)}
        <span className="hidden sm:inline">{getThemeLabel(theme)}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-800 bg-slate-900/95 backdrop-blur-md shadow-2xl p-1.5 z-[9999] animate-in fade-in-50 zoom-in-95 duration-100">
          <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800/80 mb-1">
            Select Dashboard Theme
          </div>
          <div className="space-y-1">
            {AVAILABLE_THEMES.map((t) => {
              const isSelected = theme === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setTheme(t.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left text-xs transition-colors ${
                    isSelected
                      ? "bg-blue-600/20 text-blue-300 font-semibold border border-blue-500/30"
                      : "hover:bg-slate-800/60 text-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-slate-600 flex items-center justify-center shrink-0 shadow-inner"
                      style={{ backgroundColor: t.previewBg }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: t.previewAccent }}
                      />
                    </span>
                    <div>
                      <div className="text-xs font-medium leading-tight">{t.name}</div>
                      <div className="text-[10px] text-slate-400 font-normal leading-tight">
                        {t.description}
                      </div>
                    </div>
                  </div>
                  {isSelected && <Check size={14} className="text-blue-400 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
