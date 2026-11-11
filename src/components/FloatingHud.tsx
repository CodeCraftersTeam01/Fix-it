import React, { useRef, useEffect } from "react";
import { HeaderBar } from "./HeaderBar";
import { ErrorGuideCard } from "./ErrorGuideCard";
import { AskBar } from "./AskBar";
import { CodeError, FixExplanation, ChatMessage } from "../types";

interface FloatingHudProps {
  currentError?: CodeError | null;
  explanation?: FixExplanation | null;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onClose: () => void;
  onExpand?: () => void;
  isLoading?: boolean;
}

export const FloatingHud: React.FC<FloatingHudProps> = ({
  currentError,
  explanation,
  messages,
  onSendMessage,
  onClose,
  onExpand,
  isLoading = false,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, explanation]);

  return (
    <div className="w-full h-screen max-w-[380px] mx-auto p-2 flex flex-col justify-end">
      {/* Outer Floating Card Container */}
      <div className="w-full h-[620px] rounded-[32px] hud-glass flex flex-col overflow-hidden shadow-2xl relative">
        {/* Header */}
        <HeaderBar onClose={onClose} onExpand={onExpand} />

        {/* Scrollable Content Body */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-2 space-y-3"
        >
          {/* Active Error Guide */}
          {currentError && explanation ? (
            <ErrorGuideCard error={currentError} explanation={explanation} />
          ) : (
            <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center px-4 text-white/40 space-y-2">
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-sky-400/80 mb-2">
                ✨
              </div>
              <div className="text-sm font-medium text-white/70">
                FixIt Siap Menemani
              </div>
              <p className="text-xs max-w-[220px] leading-relaxed">
                Tulis kodemu di IDE favoritmu. Saat ada error yang belum selesai, FixIt akan otomatis memandu solusinya di sini.
              </p>
            </div>
          )}

          {/* Chat Messages */}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${
                msg.sender === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-xs leading-relaxed ${
                  msg.sender === "user"
                    ? "bg-sky-500/80 text-white rounded-br-sm"
                    : "bg-white/10 text-white/90 rounded-bl-sm border border-white/5"
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-white/5 text-xs text-white/60 animate-pulse">
              <div className="w-2 h-2 rounded-full bg-sky-400"></div>
              <span>Sedang menganalisis kode...</span>
            </div>
          )}
        </div>

        {/* Footer Chat Input */}
        <AskBar onSendMessage={onSendMessage} disabled={isLoading} />
      </div>
    </div>
  );
};

