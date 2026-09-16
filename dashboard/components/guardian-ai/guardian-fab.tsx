"use client";

/**
 * KryptonAI Floating Action Button
 * 
 * Always-accessible AI assistant button
 */

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { GuardianChat } from "./guardian-chat";

export function GuardianFAB() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-gradient-to-br from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-full shadow-xl hover:shadow-2xl transition-all transform hover:scale-110 flex items-center justify-center group"
        title="Open KryptonAI Assistant"
      >
        <Sparkles className="w-6 h-6 group-hover:animate-pulse" />
        
        {/* Pulse effect */}
        <span className="absolute inset-0 rounded-full bg-indigo-600 opacity-75 animate-ping"></span>
      </button>

      {/* Chat Interface */}
      <GuardianChat isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
