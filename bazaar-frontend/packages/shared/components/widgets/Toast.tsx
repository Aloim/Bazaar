// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * Toast — reusable transient notification system.
 *
 * Mount once per app via <ToastProvider> (in main.tsx). Any descendant can
 * fire a toast via the useToast() hook:
 *
 *   const toast = useToast();
 *   toast.success("Saved");
 *   toast.error("Something went wrong", { duration: 8000 });
 *
 * Toasts stack top-right, auto-dismiss after `duration` ms (default 4500),
 * fade out, and use the sci-fi orange palette to match the rest of the UI.
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Z } from "../../constants/zIndex";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ToastVariant = "success" | "error" | "info";

export interface ToastOptions {
  /** Auto-dismiss timeout in ms. Default 4500. Pass 0 to disable. */
  duration?: number;
  /** Optional secondary line under the main message. */
  detail?: string;
}

interface ToastEntry {
  id:       number;
  variant:  ToastVariant;
  message:  string;
  detail?:  string;
  duration: number;
  exiting:  boolean;
}

interface ToastContextValue {
  success: (message: string, opts?: ToastOptions) => number;
  error:   (message: string, opts?: ToastOptions) => number;
  info:    (message: string, opts?: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 4500;
const EXIT_ANIMATION_MS = 220;

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Soft fallback so components don't crash if provider is missing.
    // Logs once and no-ops. Useful during unit tests + early app boot.
    if (typeof console !== "undefined") {
      console.warn("[Toast] useToast() called outside <ToastProvider> — falling back to console.");
    }
    return {
      success: (m) => { console.log("[toast.success]", m); return -1; },
      error:   (m) => { console.error("[toast.error]", m); return -1; },
      info:    (m) => { console.info("[toast.info]", m); return -1; },
      dismiss: () => { /* no-op */ },
    };
  }
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextIdRef = useRef(1);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    // Two-phase removal: mark exiting → wait for fade → strip from list.
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
    const existing = timersRef.current.get(id);
    if (existing) {
      clearTimeout(existing);
      timersRef.current.delete(id);
    }
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, EXIT_ANIMATION_MS);
  }, []);

  const fire = useCallback((variant: ToastVariant, message: string, opts?: ToastOptions) => {
    const id = nextIdRef.current++;
    const duration = opts?.duration ?? DEFAULT_DURATION;
    setToasts(prev => [
      ...prev,
      { id, variant, message, detail: opts?.detail, duration, exiting: false },
    ]);
    if (duration > 0) {
      const timer = setTimeout(() => dismiss(id), duration);
      timersRef.current.set(id, timer);
    }
    return id;
  }, [dismiss]);

  const value = useMemo<ToastContextValue>(() => ({
    success: (m, o) => fire("success", m, o),
    error:   (m, o) => fire("error",   m, o),
    info:    (m, o) => fire("info",    m, o),
    dismiss,
  }), [fire, dismiss]);

  // Cleanup pending timers on unmount.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ── Stack renderer (portal to <body>) ─────────────────────────────────────────

interface ToastStackProps {
  toasts:    ToastEntry[];
  onDismiss: (id: number) => void;
}

function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (typeof document === "undefined") return null; // SSR guard
  if (toasts.length === 0) return null;
  return createPortal(
    <div
      role="region"
      aria-label="Notifications"
      style={{
        position: "fixed",
        top: "16px",
        right: "16px",
        zIndex: Z.TOAST,
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        pointerEvents: "none",
        maxWidth: "min(420px, calc(100vw - 32px))",
      }}
    >
      {toasts.map(t => (
        <ToastItem key={t.id} entry={t} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body,
  );
}

// ── Single toast ──────────────────────────────────────────────────────────────

interface ToastItemProps {
  entry:     ToastEntry;
  onDismiss: (id: number) => void;
}

function variantPalette(variant: ToastVariant) {
  switch (variant) {
    case "success":
      return {
        border:    "rgba(74, 222, 128, 0.6)",
        background:"rgba(15, 32, 18, 0.94)",
        glow:      "rgba(74, 222, 128, 0.25)",
        accent:    "#4ade80",
        icon:      "✓",
      };
    case "error":
      return {
        border:    "rgba(244, 67, 67, 0.6)",
        background:"rgba(32, 14, 14, 0.94)",
        glow:      "rgba(244, 67, 67, 0.25)",
        accent:    "#f44343",
        icon:      "!",
      };
    case "info":
    default:
      return {
        border:    "rgba(204, 112, 0, 0.6)",
        background:"rgba(15, 12, 8, 0.94)",
        glow:      "rgba(204, 112, 0, 0.25)",
        accent:    "var(--accent, #cc7000)",
        icon:      "i",
      };
  }
}

function ToastItem({ entry, onDismiss }: ToastItemProps) {
  const palette = variantPalette(entry.variant);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const visible = mounted && !entry.exiting;

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={() => onDismiss(entry.id)}
      style={{
        pointerEvents:  "auto",
        cursor:         "pointer",
        background:     palette.background,
        border:         `1px solid ${palette.border}`,
        borderRadius:   "6px",
        padding:        "10px 14px",
        boxShadow:      `0 0 18px ${palette.glow}`,
        color:          "#e7e1d4",
        fontFamily:     "var(--font, sans-serif)",
        fontSize:       "0.85rem",
        letterSpacing:  "0.02em",
        display:        "flex",
        alignItems:     "flex-start",
        gap:            "10px",
        transform:      visible ? "translateX(0)" : "translateX(120%)",
        opacity:        visible ? 1 : 0,
        transition:     `transform ${EXIT_ANIMATION_MS}ms ease, opacity ${EXIT_ANIMATION_MS}ms ease`,
      }}
    >
      <span
        aria-hidden
        style={{
          flexShrink:     0,
          width:          "20px",
          height:         "20px",
          borderRadius:   "50%",
          border:         `1px solid ${palette.accent}`,
          color:          palette.accent,
          fontWeight:     "bold",
          fontSize:       "0.85rem",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          lineHeight:     1,
        }}
      >
        {palette.icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ wordBreak: "break-word" }}>{entry.message}</div>
        {entry.detail && (
          <div style={{
            marginTop:  "3px",
            fontSize:   "0.74rem",
            color:      "rgba(231, 225, 212, 0.7)",
            wordBreak:  "break-word",
          }}>
            {entry.detail}
          </div>
        )}
      </div>
      <span
        aria-hidden
        style={{
          flexShrink: 0,
          color:      "rgba(231, 225, 212, 0.45)",
          fontSize:   "0.78rem",
          lineHeight: 1,
          padding:    "2px 4px",
        }}
        title="Dismiss"
      >
        ×
      </span>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
