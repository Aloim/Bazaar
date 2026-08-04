// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * HelpContent — chrome-agnostic body for the "New? Get Help here" guides.
 *
 * Renders an optional bazaar-type chooser (Solo / Easy / Advanced pills), the
 * active guide's topic tabs, and the selected tab's blocks. Both hosts wrap it:
 *   • in-game  → HelpWindow (.market-window chrome)
 *   • DappHub  → HelpOverlay (OverlayShell chrome)
 *
 * Styled with the shared CSS-variable theme (var(--accent) etc.) + fallbacks so
 * it reads the same in either app without depending on which stylesheet loaded.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { useState, useEffect } from "react";
import { HELP_GUIDES, HELP_KIND_ORDER, HELP_KIND_META, type BazaarHelpKind, type HelpBlock } from "./helpData";

// Re-export so consumers (HelpWindow / HelpMenu / HelpOverlay) import everything
// from this .tsx — the deep-import alias resolves .tsx only, not the .ts data.
export { HELP_KIND_ORDER, HELP_KIND_META } from "./helpData";
export type { BazaarHelpKind } from "./helpData";

const ACCENT = "var(--accent, #cc7000)";
const TEXT = "var(--text, #e9e4dc)";
const MUTED = "var(--muted, #9a9082)";

function Block({ block }: { block: HelpBlock }) {
  return (
    <div style={{ marginBottom: "0.9rem" }}>
      {block.heading && (
        <h4 style={{ margin: "0 0 0.35rem", color: ACCENT, fontSize: "0.8rem", letterSpacing: "0.04em", fontFamily: "var(--font-display, inherit)" }}>
          {block.heading}
        </h4>
      )}
      {block.body && (
        <p style={{ margin: "0 0 0.4rem", color: TEXT, fontSize: "0.78rem", lineHeight: 1.55 }}>{block.body}</p>
      )}
      {block.bullets && (
        <ul style={{ margin: "0.1rem 0 0.2rem", paddingLeft: "1.1rem", color: TEXT, fontSize: "0.78rem", lineHeight: 1.5 }}>
          {block.bullets.map((b, i) => (
            <li key={i} style={{ marginBottom: "0.25rem" }}>{b}</li>
          ))}
        </ul>
      )}
      {block.note && (
        <div style={{ marginTop: "0.35rem", padding: "0.5rem 0.7rem", borderLeft: `2px solid ${ACCENT}`, background: "rgba(204,112,0,0.08)", color: MUTED, fontSize: "0.74rem", lineHeight: 1.5 }}>
          {block.note}
        </div>
      )}
    </div>
  );
}

interface Props {
  kind: BazaarHelpKind;
  /** When provided, the bazaar-type chooser pills are shown and call this. */
  onKindChange?: (k: BazaarHelpKind) => void;
}

export default function HelpContent({ kind, onKindChange }: Props) {
  const guide = HELP_GUIDES[kind];
  const [tabId, setTabId] = useState(guide.tabs[0].id);

  // Jump back to the first tab whenever the chosen bazaar type changes.
  useEffect(() => { setTabId(HELP_GUIDES[kind].tabs[0].id); }, [kind]);

  const tab = guide.tabs.find((t) => t.id === tabId) ?? guide.tabs[0];

  return (
    <div style={{ fontFamily: "var(--font, inherit)" }}>
      {onKindChange && (
        <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.7rem", flexWrap: "wrap" }}>
          {HELP_KIND_ORDER.map((k) => {
            const active = k === kind;
            return (
              <button
                key={k}
                type="button"
                onClick={() => onKindChange(k)}
                style={{
                  flex: "1 1 120px", textAlign: "left", padding: "0.5rem 0.6rem", cursor: "pointer",
                  background: active ? "rgba(204,112,0,0.16)" : "transparent",
                  border: `1px solid ${active ? ACCENT : "rgba(204,112,0,0.3)"}`,
                  borderRadius: 6, color: active ? ACCENT : TEXT, fontFamily: "inherit",
                  transition: "border-color 120ms ease, background 120ms ease",
                }}
              >
                <div style={{ fontSize: "0.78rem", fontWeight: 700 }}>{HELP_KIND_META[k].label}</div>
                <div style={{ fontSize: "0.68rem", color: MUTED }}>{HELP_KIND_META[k].hint}</div>
              </button>
            );
          })}
        </div>
      )}

      <p style={{ margin: "0 0 0.6rem", color: MUTED, fontSize: "0.76rem", lineHeight: 1.5 }}>{guide.tagline}</p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.2rem", borderBottom: "1px solid rgba(204,112,0,0.18)", marginBottom: "0.7rem" }}>
        {guide.tabs.map((t) => {
          const active = t.id === tab.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTabId(t.id)}
              style={{
                padding: "0.4rem 0.6rem", cursor: "pointer", background: "transparent", border: "none",
                borderBottom: `2px solid ${active ? ACCENT : "transparent"}`,
                color: active ? ACCENT : MUTED, fontFamily: "inherit", fontSize: "0.74rem",
                fontWeight: active ? 700 : 400, letterSpacing: "0.02em",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div>
        {tab.blocks.map((b, i) => <Block key={i} block={b} />)}
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
