// HubPrimitives.tsx — Reusable building blocks for the redesigned DappHub.
// Corner brackets, buttons, the overlay shell (backdrop + panel + esc/close),
// step dots, and the 1920×1080 auto-scaling stage. Ported from
// design-reference/BazaarDappHub.

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { HUB, HUB_FONT, overlayBackdrop, overlayPanel } from "./hubStyle";

// ── Corner brackets (decorative L-shapes on the 4 corners) ────────────────────
export function CornerBrackets({ size = 14, color = HUB.ORANGE }: { size?: number; color?: string }) {
  const corners: CSSProperties[] = [
    { top: -1, left: -1, borderWidth: "2px 0 0 2px" },
    { top: -1, right: -1, borderWidth: "2px 2px 0 0" },
    { bottom: -1, left: -1, borderWidth: "0 0 2px 2px" },
    { bottom: -1, right: -1, borderWidth: "0 2px 2px 0" },
  ];
  return (
    <>
      {corners.map((s, i) => (
        <span
          key={i}
          style={{ position: "absolute", width: size, height: size, borderColor: color, borderStyle: "solid", ...s }}
        />
      ))}
    </>
  );
}

// ── Primary action button (orange) ────────────────────────────────────────────
export function PrimaryBtn({
  children, onClick, disabled, small,
}: { children: ReactNode; onClick?: () => void; disabled?: boolean; small?: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: small ? "7px 14px" : "11px 22px",
        background: disabled ? "rgba(184,102,32,0.18)" : hover ? HUB.ORANGE : "rgba(255,144,48,0.16)",
        border: `1px solid ${disabled ? HUB.DIM : HUB.ORANGE}`,
        color: disabled ? HUB.MUTED : hover ? "#080604" : HUB.ORANGE,
        fontFamily: "inherit",
        fontSize: small ? 12 : 13,
        letterSpacing: "0.04em",
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: hover && !disabled ? "0 0 22px rgba(255,144,48,0.35)" : small ? "none" : "0 0 18px rgba(255,144,48,0.18)",
        transition: "all 120ms ease",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

// ── Ghost button (text / outline) ─────────────────────────────────────────────
export function GhostBtn({
  children, onClick, danger, small, outlined,
}: { children: ReactNode; onClick?: () => void; danger?: boolean; small?: boolean; outlined?: boolean }) {
  const [hover, setHover] = useState(false);
  const c = danger ? HUB.RED : HUB.ORANGE;
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: small ? "7px 14px" : "8px 16px",
        background: hover
          ? danger ? "rgba(255,90,48,0.14)" : "rgba(255,144,48,0.12)"
          : "transparent",
        border: outlined || danger ? `1px solid ${c}` : `1px solid ${hover ? c : "transparent"}`,
        color: hover ? c : danger ? c : HUB.FG2,
        fontFamily: "inherit",
        fontSize: small ? 12 : 13,
        letterSpacing: "0.06em",
        cursor: "pointer",
        transition: "all 120ms ease",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

// ── Full-width copy button ────────────────────────────────────────────────────
export function FullCopyBtn({ label, onClick }: { label: string; onClick?: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: "100%",
        padding: "11px 14px",
        background: hover ? "rgba(255,144,48,0.14)" : "transparent",
        border: `1px solid ${HUB.ORANGE}`,
        color: HUB.ORANGE,
        fontFamily: "inherit",
        fontSize: 13,
        letterSpacing: "0.06em",
        cursor: "pointer",
        transition: "background 120ms ease",
      }}
    >
      {label}
    </button>
  );
}

// ── Step dots (wizard progress) ───────────────────────────────────────────────
export function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 14, margin: "4px 0 20px" }}>
      {Array.from({ length: total }).map((_, i) => {
        const active = i === step;
        return (
          <span
            key={i}
            style={{
              width: 10, height: 10, borderRadius: "50%",
              background: active ? HUB.ORANGE : "transparent",
              border: `1.5px solid ${active ? HUB.ORANGE : HUB.DIM}`,
              boxShadow: active ? "0 0 8px rgba(255,144,48,0.6)" : "none",
              transition: "all 160ms ease",
            }}
          />
        );
      })}
    </div>
  );
}

// ── Overlay shell — backdrop + panel + header + esc/click-outside close ────────
export function OverlayShell({
  title, onClose, width = 960, children, hideClose,
}: {
  title: string;
  onClose: () => void;
  width?: number;
  children: ReactNode;
  hideClose?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div style={overlayBackdrop} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...overlayPanel,
          width: `min(${width}px, 100%)`,
          maxHeight: "calc(100vh - 80px)",
          overflowY: "auto",
          animation: "hubPop 200ms ease-out",
        }}
      >
        <CornerBrackets />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{
            margin: 0, fontFamily: "inherit", fontSize: 16, fontWeight: 700,
            letterSpacing: "0.16em", color: HUB.ORANGE,
          }}>{title}</h2>
          {!hideClose && (
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "transparent", border: "none", color: HUB.FG2,
                fontFamily: "inherit", fontSize: 13, letterSpacing: "0.06em",
                cursor: "pointer", padding: 4,
              }}
            >Close</button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

// ── 1920×1080 auto-scaling letterboxed stage ──────────────────────────────────
export function HubStage({ children }: { children: ReactNode }) {
  const W = 1920, H = 1080;
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", overflow: "hidden" }}>
      <div style={{
        position: "absolute", top: "50%", left: "50%",
        width: W, height: H,
        transform: `translate(-50%, -50%) scale(${scale})`,
        transformOrigin: "center center",
        background: HUB.BG,
        fontFamily: HUB_FONT,
        color: HUB.FG,
      }}>
        {children}
      </div>
    </div>
  );
}

// ── Shared keyframes (mount once) ─────────────────────────────────────────────
export function HubKeyframes() {
  return (
    <style>{`
      @keyframes hubFade { from { opacity: 0; } to { opacity: 1; } }
      @keyframes hubPop {
        from { opacity: 0; transform: translateY(8px) scale(0.985); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes hubSpin { from { transform: rotate(45deg); } to { transform: rotate(405deg); } }
      @keyframes hubSpin2 { to { transform: rotate(360deg); } }
      @keyframes hubPulse { 0%,100% { opacity: 0.85; box-shadow: 0 0 10px rgba(255,144,48,0.7); } 50% { opacity: 1; box-shadow: 0 0 20px rgba(255,144,48,1); } }
      @keyframes hubRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
    `}</style>
  );
}
