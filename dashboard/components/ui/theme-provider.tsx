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
    name: "Graphite",
    description: "Midnight graphite with electric violet details",
    previewBg: "#0b1020",
    previewAccent: "#a6a2ff",
  },
  {
    id: "navy",
    name: "Deep Navy",
    description: "Deep ocean blue with luminous cyan details",
    previewBg: "#071322",
    previewAccent: "#76cfff",
  },
  {
    id: "light",
    name: "Prism",
    description: "Bright pearl surfaces with vivid indigo accents",
    previewBg: "#f3f4fc",
    previewAccent: "#5854db",
  },
  {
    id: "emerald",
    name: "Aurora",
    description: "Deep teal with luminous mint highlights",
    previewBg: "#081a19",
    previewAccent: "#72e0bf",
  },
];

interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  availableThemes: ThemeConfig[];
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  setTheme: () => {},
  availableThemes: AVAILABLE_THEMES,
});

const STORAGE_KEY = "sentinel-grid-active-theme";

export function applyThemeToDocument(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme === "light" ? "light" : "dark";
  
  if (theme === "light") {
    root.classList.remove("dark");
    root.classList.add("light");
  } else {
    root.classList.remove("light");
    root.classList.add("dark");
  }

  window.dispatchEvent(new CustomEvent("sentinel-theme-change", { detail: { theme } }));
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("light");

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
      const initialTheme = savedTheme && AVAILABLE_THEMES.some((t) => t.id === savedTheme)
        ? savedTheme
        : "light";
      setThemeState(initialTheme);
      applyThemeToDocument(initialTheme);
    } catch {
      applyThemeToDocument("light");
    }
  }, []);

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
      applyThemeToDocument(newTheme);
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
