// HelpOverlay.tsx — "New? Get Help here" overlay for the DappHub landing.
// Station-Hub chrome (OverlayShell) wrapping two read-first "primer" entries
// (what the Bazaar is + how to get EVE) above the shared <HelpContent/> bazaar-type
// guides. The primers orient a brand-new player; the type picker below goes deeper
// once they know which bazaar they're running. Mirrors LoadHelpOverlay / ContactOverlay.

import { useState, type ReactNode } from "react";
import { HUB, HUB_MONO } from "../hubStyle";
import { OverlayShell } from "../HubPrimitives";
import HelpContent, { type BazaarHelpKind } from "@bazaar/shared/components/help/HelpContent";

// The DappHub URL a player pastes into their Storage Unit's dApp field. Derived
// from the live origin so it stays correct on whatever host the hub is served from
// (falls back to the canonical dev deploy for SSR / empty origin). Trailing slash
// is required by the in-game URL field — see reference_evefrontier_ssu_url_trailing_slash.
const DAPPHUB_URL =
  (typeof window !== "undefined" && window.location.origin
    ? window.location.origin
    : "https://devbazaarfrontier.netlify.app") + "/dapphub/";

// ── Small copy-to-clipboard link row (shows the URL + a Copy button) ───────────
function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    try {
      navigator.clipboard?.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the URL is still selectable for a manual copy */
    }
  };
  return (
    <div
      style={{
        display: "flex", alignItems: "stretch", gap: 0, marginTop: 8,
        border: `1px solid ${HUB.DIM}`, background: "rgba(8,6,4,0.6)",
      }}
    >
      <code
        style={{
          flex: 1, minWidth: 0, padding: "9px 12px", fontFamily: HUB_MONO, fontSize: 12.5,
          color: HUB.FG, letterSpacing: "0.01em", overflowX: "auto", whiteSpace: "nowrap",
          userSelect: "all",
        }}
      >{url}</code>
      <button
        type="button"
        onClick={copy}
        style={{
          flex: "0 0 auto", padding: "0 16px", cursor: "pointer", fontFamily: "inherit",
          fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
          background: copied ? "rgba(58,210,120,0.14)" : "rgba(255,144,48,0.12)",
          border: "none", borderLeft: `1px solid ${HUB.DIM}`,
          color: copied ? HUB.GREEN : HUB.ORANGE, transition: "all 120ms ease",
        }}
      >{copied ? "Copied" : "Copy"}</button>
    </div>
  );
}

// ── One expandable primer entry (terminal-prompt row → reveal) ─────────────────
function Primer({
  id, title, open, onToggle, children,
}: { id: string; title: string; open: boolean; onToggle: (id: string) => void; children: ReactNode }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      style={{
        border: `1px solid ${open ? HUB.ORANGE : HUB.BORDER}`,
        background: open ? "rgba(255,144,48,0.05)" : "transparent",
        boxShadow: open ? "0 0 18px rgba(255,144,48,0.10)" : "none",
        transition: "border-color 140ms ease, background 140ms ease, box-shadow 140ms ease",
      }}
    >
      <button
        type="button"
        onClick={() => onToggle(id)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 12,
          padding: "12px 14px", cursor: "pointer", textAlign: "left",
          background: hover && !open ? "rgba(255,144,48,0.06)" : "transparent",
          border: "none", color: open || hover ? HUB.ORANGE : HUB.FG,
          fontFamily: "inherit", fontSize: 14, fontWeight: 700, letterSpacing: "0.03em",
          transition: "color 120ms ease, background 120ms ease",
        }}
      >
        <span
          aria-hidden
          style={{
            color: HUB.ORANGE, fontSize: 13, lineHeight: 1, transformOrigin: "center",
            transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 160ms ease",
          }}
        >›</span>
        <span style={{ flex: 1 }}>{title}</span>
      </button>
      {open && (
        <div
          style={{
            borderTop: `1px solid ${HUB.BORDER}`,
            borderLeft: `2px solid ${HUB.ORANGE}`,
            padding: "12px 16px 14px", margin: "0 0 0 0",
            color: HUB.FG2, fontSize: 13, lineHeight: 1.62,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// Shared text styles for primer bodies.
const P: React.CSSProperties = { margin: "0 0 10px", color: HUB.FG2, fontSize: 13, lineHeight: 1.62 };
const STEP_LIST: React.CSSProperties = { margin: "0 0 4px", paddingLeft: 18, color: HUB.FG2, fontSize: 13, lineHeight: 1.6 };
const NOTE: React.CSSProperties = {
  marginTop: 6, padding: "9px 12px", borderLeft: `2px solid ${HUB.ORANGE}`,
  background: "rgba(255,144,48,0.07)", color: HUB.MUTED, fontSize: 12.5, lineHeight: 1.55,
};
const SUBTITLE: React.CSSProperties = {
  margin: "14px 0 6px", color: HUB.ORANGE, fontSize: 12.5, fontWeight: 700,
  letterSpacing: "0.08em", textTransform: "uppercase",
};
const eyebrow: React.CSSProperties = {
  margin: "0 0 10px", color: HUB.MUTED, fontSize: 11, fontWeight: 700,
  letterSpacing: "0.22em", textTransform: "uppercase",
};

export default function HelpOverlay({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<BazaarHelpKind>("notribe");
  const [openPrimer, setOpenPrimer] = useState<string | null>(null);
  const toggle = (id: string) => setOpenPrimer((cur) => (cur === id ? null : id));

  return (
    <OverlayShell title="NEW? GET HELP HERE" width={760} onClose={onClose}>
      {/* ── Read-first primers ─────────────────────────────────────────── */}
      <p style={eyebrow}>Start here</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 }}>
        <Primer id="what" title="I'm new, what is this?" open={openPrimer === "what"} onToggle={toggle}>
          <p style={P}>
            The Bazaar is a dApp built by players for EVE Frontier. It adds a trading and taxation
            layer on top of your own structures, turning a Smart Storage Unit into a shopfront
            other players can visit.
          </p>

          <div style={SUBTITLE}>So what is the Bazaar?</div>
          <p style={P}>
            It's an isometric trade hub and taxation tool. Walk around the station, chat with other
            players, and open or close shop and mission stalls to sell items, buy items, and collect
            tax on every transaction.
          </p>
          <div style={NOTE}>
            You can browse and buy from any SSU's Bazaar remotely, but the trade still settles inside
            that SSU. So to collect what you bought, you'll need to travel there and pick it up in person.
          </div>

          <div style={SUBTITLE}>Register your Storage Unit</div>
          <p style={P}>
            You can register your own Storage Unit so it joins the Bazaar. It must be a Smart
            Storage Unit. A Field Storage won't work.
          </p>
          <ol style={STEP_LIST}>
            <li style={{ marginBottom: 6 }}>Open your Storage Unit's window in the game.</li>
            <li style={{ marginBottom: 6 }}>Paste this link into its dApp URL field and save it:</li>
          </ol>
          <CopyLink url={DAPPHUB_URL} />
          <p style={{ ...P, marginTop: 10 }}>
            The window now loads the Bazaar registration page, where you pick your bazaar type and
            finish setup.
          </p>
        </Primer>

        <Primer id="eve" title="How do I get EVE?" open={openPrimer === "eve"} onToggle={toggle}>
          <p style={P}>
            EVE is EVE Frontier's testnet currency, and most dApps (including the Bazaar) trade in it.
            You get EVE by exchanging the game's currency LUX for it, or by selling goods and services
            in a dApp like this one, the Bazaar.
          </p>
          <p style={P}>One way to earn LUX and turn it into EVE:</p>
          <ol style={STEP_LIST}>
            <li style={{ marginBottom: 6 }}>Build a Network Node and a Relay.</li>
            <li style={{ marginBottom: 6 }}>
              At the Relay, sell Feral Data, found at various sites around the Universe, for LUX.
            </li>
            <li style={{ marginBottom: 6 }}>
              Open your wallet and find the button that exchanges LUX for EVE. Click it, set the
              amount you want, and confirm the swap.
            </li>
          </ol>
          <p style={{ ...P, marginBottom: 0 }}>
            That EVE is what you'll spend trading across the Bazaar and other dApps.
          </p>
        </Primer>
      </div>

      {/* ── Bazaar-type guides ─────────────────────────────────────────── */}
      <p style={eyebrow}>Choose your bazaar</p>
      <p style={{ margin: "0 0 14px", color: HUB.FG2, fontSize: 13, lineHeight: 1.6 }}>
        Pick the kind of bazaar you are using. Each guide covers its economy, shop types, taxes and
        fees, roles, and (for Advanced) how the tribe token is kept safe.
      </p>
      <HelpContent kind={kind} onKindChange={setKind} />
    </OverlayShell>
  );
}
