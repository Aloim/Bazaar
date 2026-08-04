// HubChrome.tsx — Presentational chrome for the redesigned DappHub main menu.
// Recomposed from the old "Station Hub" HUD into a game-style command console:
// a vertically-centred column (emblem → wordmark → command list → footer) that
// scales on `vmin` so it reads the same in a wide, square, or portrait dApp
// window. Minimal corner chrome (wallet chip + build tag) replaces the dense
// top HUD bar. All on-chain wiring lives in HubLanding; this file is pure UI.

import { useState, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { HUB } from "./hubStyle";

function abbreviate(a: string): string { return a.length <= 12 ? a : `${a.slice(0, 5)}··${a.slice(-4)}`; }

// ── Top-left wallet chip (connect / online) ───────────────────────────────────
export function WalletChip({ isConnected, walletAddress, onConnect }: {
  isConnected: boolean; walletAddress: string | null; onConnect: () => void;
}) {
  const [hover, setHover] = useState(false);
  if (isConnected && walletAddress) {
    return (
      <div style={{
        position: "absolute", top: "clamp(22px, 4vmin, 38px)", left: "clamp(22px, 4vmin, 38px)", zIndex: 20,
        display: "flex", alignItems: "center", gap: 9, padding: "6px 13px",
        border: `1px solid ${HUB.BORDER}`, background: "rgba(8,6,4,0.6)", backdropFilter: "blur(3px)",
        fontSize: 11, letterSpacing: "0.12em", color: HUB.FG2, fontWeight: 700,
      }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: HUB.ORANGE, boxShadow: `0 0 8px ${HUB.ORANGE}` }} />
        <span style={{ opacity: 0.85 }}>{abbreviate(walletAddress)}</span>
      </div>
    );
  }
  return (
    <button type="button" onClick={onConnect}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        position: "absolute", top: "clamp(22px, 4vmin, 38px)", left: "clamp(22px, 4vmin, 38px)", zIndex: 20,
        display: "flex", alignItems: "center", gap: 9, padding: "7px 15px",
        border: `1px solid ${HUB.ORANGE}`, background: hover ? HUB.ORANGE : "rgba(255,144,48,0.10)",
        color: hover ? "#080604" : HUB.ORANGE, fontFamily: "inherit",
        fontSize: 11, letterSpacing: "0.14em", fontWeight: 700, cursor: "pointer",
        transition: "background 140ms ease, color 140ms ease", boxShadow: "0 0 18px rgba(255,144,48,0.18)",
      }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "currentColor" }} />
      CONNECT WALLET
    </button>
  );
}

// ── Top-right build tag ───────────────────────────────────────────────────────
export function BuildTag() {
  return (
    <div style={{
      position: "absolute", top: "clamp(22px, 4vmin, 38px)", right: "clamp(22px, 4vmin, 38px)", zIndex: 20,
      textAlign: "right", fontSize: 10, letterSpacing: "0.18em", color: HUB.MUTED, fontWeight: 700, lineHeight: 1.7,
    }}>
      <div>EVE&nbsp;FRONTIER</div>
      <div style={{ color: HUB.DIM }}>TESTNET · BUILD <span style={{ color: HUB.FG2 }}>0.7β</span></div>
    </div>
  );
}

// ── Corner action button (flanks the central Eye) ─────────────────────────────
// Compact HUD button used for the landing's quick actions (My Registered SSUs on
// the left, My Tribe Governance on the right). `side` pins it to that edge.
// Positioned to flank the central Eye rather than sit in the extreme corner: the
// side inset grows with viewport width (clamp on vw) and the top offset drops it
// toward the Eye's band (clamp on vmin). Both clamps collapse back toward the
// corner on narrow/portrait windows so the buttons never overlap the centred
// command column (min(540px)). Exact values tuned in Chrome at wide/square/portrait.
export function CornerButton({ side, label, disabled, onClick }: {
  side: "left" | "right"; label: string; disabled?: boolean; onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const active = hover && !disabled;
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "absolute", zIndex: 20,
        top: "clamp(70px, 15vmin, 168px)",
        [side]: "clamp(20px, 7vw, 150px)",
        display: "flex", alignItems: "center", gap: 8, padding: "7px 14px",
        border: `1px solid ${active ? HUB.ORANGE : HUB.BORDER}`,
        background: active ? "rgba(30,19,9,0.93)" : "rgba(8,6,4,0.6)", backdropFilter: "blur(3px)",
        color: disabled ? HUB.MUTED : active ? HUB.ORANGE : HUB.FG2, fontFamily: "inherit",
        fontSize: 11, letterSpacing: "0.12em", fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
        transition: "border-color 140ms ease, color 140ms ease, background 140ms ease",
      }}
    >
      <span style={{ color: disabled ? HUB.MUTED : HUB.ORANGE }}>▸</span>
      {label}
    </button>
  );
}

// ── Eye emblem (HAL watcher — pupil tracks the cursor) ────────────────────────
// The centrepiece, replacing the old rotated-diamond mark. Self-contained SVG so
// it always sits directly above the wordmark and scales with the column (vmin),
// regardless of where the cover-scaled rain backdrop crops.
export function Eye() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pupil, setPupil] = useState({ x: 0, y: 0 });
  useEffect(() => {
    let raf = 0, tx = 0, ty = 0, cx = 0, cy = 0;
    const onMove = (e: MouseEvent) => {
      const el = wrapRef.current; if (!el) return;
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const dist = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, dist / 240) * 14; // ramp → max 14 user-units
      tx = (dx / dist) * k; ty = (dy / dist) * k;
    };
    const loop = () => { raf = requestAnimationFrame(loop); cx += (tx - cx) * 0.12; cy += (ty - cy) * 0.12; setPupil({ x: cx, y: cy }); };
    window.addEventListener("mousemove", onMove);
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("mousemove", onMove); };
  }, []);
  const S = "clamp(74px, 13vmin, 132px)";
  const spokes = Array.from({ length: 24 }, (_, i) => i * 15);
  return (
    <div ref={wrapRef} style={{ width: S, height: S, position: "relative", pointerEvents: "none" }}>
      <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%", overflow: "visible", filter: "drop-shadow(0 0 18px rgba(255,144,48,0.5))" }}>
        <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(184,102,32,0.5)" strokeWidth="0.6" strokeDasharray="2 4" style={{ transformBox: "fill-box", transformOrigin: "center", animation: "hubSpin2 32s linear infinite" }} />
        <circle cx="50" cy="50" r="38" fill="rgba(8,6,4,0.55)" stroke={HUB.ORANGE} strokeWidth="1.6" />
        <circle cx="50" cy="50" r="30" fill="none" stroke="rgba(184,102,32,0.45)" strokeWidth="0.8" />
        <g stroke="rgba(184,102,32,0.38)" strokeWidth="0.5">
          {spokes.map((a) => { const rad = (a * Math.PI) / 180; return <line key={a} x1={50 + Math.cos(rad) * 18} y1={50 + Math.sin(rad) * 18} x2={50 + Math.cos(rad) * 36} y2={50 + Math.sin(rad) * 36} />; })}
        </g>
        <g transform={`translate(${pupil.x} ${pupil.y})`}>
          <circle cx="50" cy="50" r="13" fill={HUB.ORANGE} />
          <circle cx="50" cy="50" r="13" fill="none" stroke="#ffd9a8" strokeWidth="0.8" />
          <circle cx="50" cy="50" r="4.5" fill="#fff3e0" />
        </g>
      </svg>
    </div>
  );
}

// ── Wordmark + tagline ────────────────────────────────────────────────────────
export function Wordmark() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "clamp(8px, 1.6vmin, 16px)" }}>
      <h1 style={{
        margin: 0, fontFamily: "inherit", fontWeight: 700, lineHeight: 0.9, textAlign: "center",
        fontSize: "clamp(42px, 9vmin, 82px)", letterSpacing: "0.14em", color: HUB.FG,
        textShadow: "0 0 38px rgba(255,144,48,0.28)",
      }}>
        <span style={{ color: HUB.ORANGE }}>BAZAAR</span>
        <span style={{
          marginLeft: "0.5em", fontSize: "0.26em", padding: "0.3em 0.6em", verticalAlign: "middle",
          border: `1.5px solid ${HUB.RED}`, color: HUB.RED, letterSpacing: "0.24em",
          transform: "translateY(-0.55em)", display: "inline-block",
        }}>BETA</span>
      </h1>
      <div style={{ fontSize: "clamp(9px, 1.5vmin, 12px)", letterSpacing: "0.36em", color: HUB.DIM, fontWeight: 700, textAlign: "center" }}>
        ISOMETRIC WALK-ON MARKETPLACE · EVE FRONTIER
      </div>
      <div style={{ fontSize: "clamp(10px, 1.5vmin, 12px)", letterSpacing: "0.08em", color: HUB.MUTED, textAlign: "center" }}>
        Register your SSU → paste the link into it → walk in &amp; trade.
      </div>
    </div>
  );
}

// ── Command row (the game-menu item) ──────────────────────────────────────────
export function MenuItem({ idx, label, hint, primary, disabled, danger, onClick }: {
  idx: number; label: string; hint?: ReactNode; primary?: boolean; disabled?: boolean; danger?: boolean; onClick?: () => void;
}) {
  const [hover, setHover] = useState(false);
  const active = hover && !disabled;
  const accent = danger ? HUB.RED : HUB.ORANGE;
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative", width: "100%", textAlign: "left", fontFamily: "inherit",
        display: "flex", alignItems: "center", gap: "clamp(12px, 2vmin, 18px)",
        padding: `clamp(13px, 2vmin, 18px) clamp(16px, 2.4vmin, 22px)`,
        background: active ? "rgba(30,19,9,0.93)" : primary ? "rgba(10,7,4,0.86)" : "rgba(8,6,4,0.74)",
        border: `1px solid ${active ? accent : primary ? "rgba(184,102,32,0.5)" : HUB.BORDER}`,
        color: disabled ? HUB.MUTED : HUB.FG,
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1,
        backdropFilter: "blur(3px)", overflow: "hidden",
        transform: active ? "translateX(8px)" : "translateX(0)",
        transition: "transform 150ms ease, background 150ms ease, border-color 150ms ease",
        boxShadow: active ? `0 10px 34px -14px ${accent}` : "none",
      }}
    >
      {/* left selection bar — grows on hover */}
      <span style={{
        position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
        width: 3, height: active ? "72%" : "0%", background: accent,
        boxShadow: active ? `0 0 12px ${accent}` : "none", transition: "height 180ms ease",
      }} />
      {/* caret + index */}
      <span style={{
        display: "flex", alignItems: "center", gap: 8, minWidth: "clamp(34px, 6vmin, 48px)",
        fontSize: "clamp(10px, 1.6vmin, 12px)", fontWeight: 700, letterSpacing: "0.12em",
        color: active ? accent : primary ? HUB.DIM : HUB.MUTED,
      }}>
        <span style={{ opacity: active ? 1 : 0, transform: active ? "translateX(0)" : "translateX(-4px)", transition: "all 150ms ease" }}>▸</span>
        {String(idx).padStart(2, "0")}
      </span>
      {/* label + hint */}
      <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
        <span style={{ fontSize: primary ? "clamp(15px, 2.5vmin, 21px)" : "clamp(13px, 2vmin, 16px)", fontWeight: 700, letterSpacing: "0.05em", color: active ? (danger ? HUB.RED : HUB.ORANGE) : HUB.FG, lineHeight: 1.1 }}>{label}</span>
        {hint && primary && (
          <span style={{ fontSize: "clamp(10px, 1.4vmin, 12px)", lineHeight: 1.4, color: HUB.MUTED, letterSpacing: "0.01em" }}>{hint}</span>
        )}
      </span>
      {/* chevron */}
      <span style={{ fontSize: "clamp(13px, 2vmin, 17px)", fontWeight: 700, color: active ? accent : primary ? HUB.DIM : HUB.MUTED, transform: active ? "translateX(4px)" : "translateX(0)", transition: "transform 160ms ease" }}>▸</span>
    </button>
  );
}

// ── Thin section divider with a label ─────────────────────────────────────────
export function MenuDivider({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "clamp(8px, 1.6vmin, 16px) 2px clamp(4px, 1vmin, 8px)" }}>
      <span style={{ fontSize: 10, letterSpacing: "0.3em", fontWeight: 700, color: HUB.MUTED }}>{label}</span>
      <span style={{ flex: 1, height: 1, background: "linear-gradient(90deg, rgba(184,102,32,0.4), rgba(184,102,32,0))" }} />
    </div>
  );
}

// ── Bottom footer rail ────────────────────────────────────────────────────────
export function Footer({ onContact }: { onContact: () => void }) {
  return (
    <div style={{
      position: "absolute", left: 0, right: 0, bottom: 0, height: "clamp(30px, 4.5vmin, 40px)",
      borderTop: "1px solid rgba(255,144,48,0.22)",
      background: "linear-gradient(0deg, rgba(8,6,4,0.9), rgba(8,6,4,0.35))",
      display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 clamp(18px, 4vmin, 34px)",
      fontSize: 10, letterSpacing: "0.16em", color: HUB.MUTED, fontWeight: 700, zIndex: 15,
    }}>
      <span>SECURE LINK · TLS 1.3</span>
      <span style={{ color: HUB.DIM }}>EVE FRONTIER · TESTNET</span>
      <span style={{ color: HUB.ORANGE, cursor: "pointer" }} onClick={onContact}>CONTACT ▸</span>
    </div>
  );
}
