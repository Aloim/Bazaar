// HubLanding.tsx — Redesigned DappHub landing as a game-style main menu.
//
// Layout is a single vertically-centred "command console" column (emblem →
// wordmark → command list → utilities → footer). Everything is sized in `vmin`
// and the column is centred with a scroll fallback, so it reads the same whether
// the EVE Frontier dApp window is wide, square, or taller-than-wide (portrait).
// The matrix-rain + HAL-eye backdrop cover-fills the window as ambiance behind a
// radial scrim that keeps the menu legible. All on-chain functionality is
// preserved 1:1 via the wired overlays — only the presentation changed.

import { useEffect, useState } from "react";
import { MatrixBackdrop, FrameChrome } from "./MatrixBackdrop";
import { HubKeyframes } from "./HubPrimitives";
import { WalletChip, BuildTag, CornerButton, Eye, Wordmark, MenuItem, MenuDivider, Footer } from "./HubChrome";
import { useHasActiveTribeRole } from "@bazaar/shared/hooks";
import { reclaimEnabled } from "@bazaar/shared/constants";
import { HUB } from "./hubStyle";
import RegisterSSUOverlay from "./overlays/RegisterSSUOverlay";
import StandardTribeOverlay from "./overlays/StandardTribeOverlay";
import AdvancedTribeOverlay from "./overlays/AdvancedTribeOverlay";
import JoinTribeOverlay from "./overlays/JoinTribeOverlay";
import ApplicationOverlay from "./overlays/ApplicationOverlay";
import MySSUsOverlay from "./overlays/MySSUsOverlay";
import ContactOverlay from "./overlays/ContactOverlay";
import LoadHelpOverlay from "./overlays/LoadHelpOverlay";
import HelpOverlay from "./overlays/HelpOverlay";
import ReclaimOverlay from "./overlays/ReclaimOverlay";

const BACKDROP_W = 1920;
const BACKDROP_H = 1080;

type OverlayKey = "register" | "standard" | "advanced" | "join" | "application" | "myssus" | "contact" | "loadhelp" | "help" | "reclaim" | null;

interface Props {
  isOwner: boolean;
  isConnected: boolean;
  walletAddress: string | null;
  onConnect: () => void;
  onManage: () => void;
  onTribeGov: () => void;
  /** Open the per-SSU SSU Governance screen for the given SSU id. */
  onSsuGov: (ssuId: string) => void;
}

// Cover-scale the 1920×1080 matrix backdrop to fill the window at any aspect.
function CoverBackdrop() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.max(window.innerWidth / BACKDROP_W, window.innerHeight / BACKDROP_H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return (
    <div style={{ position: "absolute", top: "50%", left: "50%", width: BACKDROP_W, height: BACKDROP_H, transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: "center center", pointerEvents: "none" }}>
      <MatrixBackdrop />
    </div>
  );
}

export default function HubLanding({ isOwner, isConnected, walletAddress, onConnect, onManage, onTribeGov, onSsuGov }: Props) {
  const [overlay, setOverlay] = useState<OverlayKey>(null);
  const [appPayload, setAppPayload] = useState<{ tribeId: string; tribeName: string } | null>(null);
  const close = () => setOverlay(null);

  // Gate for the "My Tribe Governance" corner button. Shown only to tribe
  // leadership whose tribe is STILL ACTIVE — a TribeLeaderCap (or delegated
  // SuperAdmin/Admin/Mod cap) bound to a tribe with `is_active == true`.
  //
  // Issue-1 fix: "Remove Tribe" in DApp Management only flips `Tribe.is_active`;
  // it never burns the leader's cap. The previous cap-PRESENCE gate therefore kept
  // showing this button (and granting governance access) after a tribe was deleted.
  // `useHasActiveTribeRole` resolves the cap's tribe and checks its live active flag.
  // The old SSU-governance-cap proxy (useOwnedCaps) is dropped: those are per-SSU
  // caps, the wrong class for TRIBE governance, and were a second leak vector — a
  // genuine tribe leader always holds a TribeLeaderCap, so they remain covered.
  const { hasActiveTribeRole } = useHasActiveTribeRole();
  const canGovern = isConnected && hasActiveTribeRole;

  // Collapse the utilities to a single column on genuinely narrow windows.
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1280);
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const utilCols = w < 560 ? "1fr" : "1fr 1fr";

  const gate = (key: OverlayKey) => () => { if (isConnected) setOverlay(key); else onConnect(); };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", overflow: "hidden", color: HUB.FG, fontFamily: '"Frontier Disket Mono", ui-monospace, monospace' }}>
      <CoverBackdrop />
      {/* Radial scrim — darkens the centre so the menu reads over the rain. */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "rgba(8,6,4,0.34)" }} />
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse 70% 92% at center, rgba(8,6,4,0.92) 0%, rgba(8,6,4,0.66) 48%, rgba(8,6,4,0) 84%)" }} />
      <FrameChrome />
      <HubKeyframes />

      <WalletChip isConnected={isConnected} walletAddress={walletAddress} onConnect={onConnect} />
      <BuildTag />

      {/* Top-corner quick actions — My Registered SSUs (left) + role-gated Tribe Governance (right). */}
      <CornerButton side="left" label="My Registered SSUs" disabled={!isConnected} onClick={gate("myssus")} />
      {canGovern && <CornerButton side="right" label="My Tribe Governance" onClick={onTribeGov} />}

      {/* Scrollable centring region (sits between corner chrome and footer). */}
      <div style={{ position: "absolute", inset: 0, paddingBottom: "clamp(30px, 4.5vmin, 40px)", overflowY: "auto" }}>
        <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "clamp(64px, 11vmin, 110px) 20px clamp(28px, 5vmin, 48px)" }}>
          <div style={{ width: "min(540px, 100%)", display: "flex", flexDirection: "column", alignItems: "center", gap: "clamp(14px, 2.6vmin, 26px)" }}>

            {/* Eye + wordmark */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "clamp(12px, 2.4vmin, 22px)", animation: "hubRise 520ms ease-out both" }}>
              <Eye />
              <Wordmark />
            </div>

            {!isConnected && (
              <div style={{ fontSize: "clamp(10px, 1.5vmin, 12px)", letterSpacing: "0.1em", color: HUB.ORANGE, textAlign: "center", animation: "hubRise 520ms ease-out 80ms both" }}>
                ▸ Connect your wallet to begin.
              </div>
            )}

            {/* Primary commands */}
            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "clamp(8px, 1.4vmin, 12px)", animation: "hubRise 560ms ease-out 120ms both" }}>
              <MenuItem idx={1} primary label="Register Just for Me" hint="Best suited for solo players or small player groups. Trades in EVE coin." disabled={!isConnected} onClick={gate("register")} />
              <MenuItem idx={2} primary label="Register to a Tribe" hint="Register your SSU to an existing Tribal Bazaar Network." disabled={!isConnected} onClick={gate("join")} />
              <MenuItem idx={3} primary label="Create a Standard Tribe" hint="Creates a Standard Tribe Network. Trades in EVE." disabled={!isConnected} onClick={gate("standard")} />
              <MenuItem idx={4} primary danger label="Create an Advanced Tribe" hint="⚠ Experimental · has its own currency & exchange; requires an EVE deposit into the exchange to bootstrap the economy." disabled={!isConnected} onClick={gate("advanced")} />
            </div>

            {/* Utilities */}
            <div style={{ width: "100%", animation: "hubRise 600ms ease-out 200ms both" }}>
              <MenuDivider label="// CONSOLE" />
              <div style={{ display: "grid", gridTemplateColumns: utilCols, gap: "clamp(8px, 1.4vmin, 12px)" }}>
                <MenuItem idx={5} label="New? Get Help here" onClick={() => setOverlay("help")} />
                <MenuItem idx={6} label="Contact Us" onClick={() => setOverlay("contact")} />
                <MenuItem idx={7} label="Bazaar Not Loading?" onClick={() => setOverlay("loadhelp")} />
                {isOwner && <MenuItem idx={8} label="DApp Management" onClick={onManage} />}
                {/* Reclaim — only surfaces during an Update Ceremony (reclaimEnabled); dormant on V37. */}
                {reclaimEnabled() && <MenuItem idx={9} label="Reclaim My SSUs / Tribes" hint="Re-materialise your SSUs and tribes after a state-preserving republish." disabled={!isConnected} onClick={gate("reclaim")} />}
              </div>
            </div>

          </div>
        </div>
      </div>

      <Footer onContact={() => setOverlay("contact")} />

      {/* ── Overlays ─────────────────────────────────────────────── */}
      {overlay === "register" && <RegisterSSUOverlay onClose={close} />}
      {overlay === "standard" && <StandardTribeOverlay onClose={close} />}
      {overlay === "advanced" && <AdvancedTribeOverlay onClose={close} />}
      {overlay === "join" && (
        <JoinTribeOverlay onClose={close} onApply={(tribeId, tribeName) => { setAppPayload({ tribeId, tribeName }); setOverlay("application"); }} />
      )}
      {overlay === "application" && appPayload && (
        <ApplicationOverlay onClose={close} tribeId={appPayload.tribeId} tribeName={appPayload.tribeName} />
      )}
      {overlay === "myssus" && (
        <MySSUsOverlay
          onClose={close}
          onSsuGov={(ssuId) => { close(); onSsuGov(ssuId); }}
        />
      )}
      {overlay === "contact" && <ContactOverlay onClose={close} />}
      {overlay === "loadhelp" && <LoadHelpOverlay onClose={close} onContact={() => setOverlay("contact")} />}
      {overlay === "help" && <HelpOverlay onClose={close} />}
      {overlay === "reclaim" && <ReclaimOverlay onClose={close} />}
    </div>
  );
}
