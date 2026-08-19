"use client";

import { useEffect, useState } from "react";

export interface ToastProps {
  message: string;
  visible: boolean;
  onDismiss: () => void;
  duration?: number;
}

export function Toast({ message, visible, onDismiss, duration = 4000 }: ToastProps) {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [visible, duration, onDismiss]);

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-lg animate-in slide-in-from-bottom-2"
      role="status"
      aria-live="polite"
    >
      <span className="text-sm font-medium text-ink">{message}</span>
      <button
        onClick={onDismiss}
        className="text-muted hover:text-ink transition-colors text-sm"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
