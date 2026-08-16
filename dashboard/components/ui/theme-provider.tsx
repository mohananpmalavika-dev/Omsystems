"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type ThemeMode = "dark" | "navy" | "light" | "emerald";

export interface ThemeConfig {
  id: ThemeMode;
  name: string;
  description: string;
  previewBg: string;
  previewAccent: string;
}

export const AVAILABLE_THEMES: ThemeConfig[] = [
  {
    id: "dark",
    name: "Obsidian Dark",
    description: "Deep obsidian & slate enterprise dark",
    previewBg: "#0f172a",
    previewAccent: "#3b82f6",
  },
  {
    id: "navy",
    name: "Command Navy",
    description: "High-contrast control room navy & cyan",
    previewBg: "#0b1329",
    previewAccent: "#06b6d4",
  },
  {
    id: "light",
    name: "Platinum Light",
    description: "Crisp white & platinum SaaS enterprise",
    previewBg: "#f8fafc",
    previewAccent: "#2563eb",
  },
  {
    id: "emerald",
    name: "Tactical Emerald",
    description: "Tactical defense & cyber emerald green",
    previewBg: "#061a14",
    previewAccent: "#10b981",
  },
];

interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  availableThemes: ThemeConfig[];
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => {},
  availableThemes: AVAILABLE_THEMES,
});

const STORAGE_KEY = "sentinel-grid-active-theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("dark");

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
      if (savedTheme && AVAILABLE_THEMES.some((t) => t.id === savedTheme)) {
        setThemeState(savedTheme);
        document.documentElement.setAttribute("data-theme", savedTheme);
      } else {
        document.documentElement.setAttribute("data-theme", "dark");
      }
    } catch {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  }, []);

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
      document.documentElement.setAttribute("data-theme", newTheme);
    } catch (e) {
      console.error("Failed to save theme to localStorage:", e);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, availableThemes: AVAILABLE_THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
