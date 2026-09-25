"use client";

/**
 * KryptonAI Floating Action Button
 * 
 * Always-accessible AI assistant button
 */

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { isPublicDashboardRoute } from "@/lib/session-navigation";
import { GuardianChat } from "./guardian-chat";

export function GuardianFAB() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  if (isPublicDashboardRoute(pathname)) return null;

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 text-white rounded-full shadow-xl hover:shadow-2xl transition-all transform hover:scale-110 flex items-center justify-center group"
        style={{ background: "linear-gradient(145deg, var(--ui-accent), var(--ui-accent-hover))" }}
        title="Open KryptonAI Assistant"
      >
        <Sparkles className="w-6 h-6 group-hover:animate-pulse" />
        
        {/* Pulse effect */}
        <span className="absolute inset-0 rounded-full opacity-40 animate-ping" style={{ background: "var(--ui-accent)" }}></span>
      </button>

      {/* Chat Interface */}
      <GuardianChat isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
