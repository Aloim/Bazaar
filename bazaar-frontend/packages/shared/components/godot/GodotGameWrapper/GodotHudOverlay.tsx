// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * GodotHudOverlay — R6.6.4 OS-14
 *
 * HUD render layer shown when Godot is running. Renders:
 *   - Balance display (top-right)
 *   - Controls hint + UI-scale buttons (bottom-left)
 *   - Navigation row (top-right): MP indicator + panel openers + SSU/Global/dApp Gov
 *   - Inline TradeConfirmBanner
 *   - Proximity warning
 *
 * Article XIV.2 exemption: verbatim from Bazar1 GodotGameWrapper.tsx lines 219-265,
 * 1183-1292.
 * Drops: useDappLinks HUD cluster (Bazar1 lines 1286-1290). Zero ISK/BAZ literals.
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { useEffect, useState } from "react";
import { COIN_DECIMALS, SSU_OBJECT_ID } from "@bazaar/shared/constants";
import { Z } from "@bazaar/shared/constants/zIndex";
import { AdvancedOnly } from "@bazaar/shared/components";
import { useSSUSharedObjects } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { useSSURoles } from "@bazaar/shared/hooks/bazaarcore/ssu-governance-hooks";
import { useBazaarType } from "@bazaar/shared/hooks/useBazaarType";
import { formatTribeAmount, TRIBE_TOKEN_DECIMALS } from "@bazaar/shared/utils/tribeToken";
import { UI_SCALE_CHANGED_EVENT } from "@bazaar/shared/hooks/useGodotUiScale";
import NewsMenu from "./NewsMenu";
import MarketMenu from "./MarketMenu";
import GovernanceMenu from "./GovernanceMenu";
import HelpMenu from "./HelpMenu";
import HelpWindow from "@bazaar/shared/components/windows/HelpWindow";
import type { BazaarHelpKind } from "@bazaar/shared/components/help/HelpContent";
import type { MarketTab } from "@bazaar/shared/components/windows/MarketWindow";
import type { TradeConfirmPopupState } from "./useGodotCanvas";

// ── TradeConfirmBanner (Bazar1 lines 219-265, inlined here) ──────────────────

interface TradeConfirmBannerProps {
  tradeId:          string;
  counterpartyName: string;
  expiresAt:        number;
  onConfirm:        () => void;
  onDismiss:        () => void;
}

function TradeConfirmBanner({ counterpartyName, expiresAt, onConfirm, onDismiss }: TradeConfirmBannerProps) {
  const [remaining, setRemaining] = useState("");
  useEffect(() => {
    const tick = () => {
      const diff = Math.max(0, expiresAt - Date.now());
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${m}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [expiresAt]);

  return (
    <div style={{
      position: "absolute", top: "12px", left: "50%", transform: "translateX(-50%)",
      zIndex: Z.BANNER, background: "rgba(10, 8, 5, 0.94)", border: "1px solid rgba(204,112,0,0.6)",
      borderRadius: "8px", padding: "12px 20px", pointerEvents: "auto",
      boxShadow: "0 0 24px rgba(204,112,0,0.25)", textAlign: "center", minWidth: "300px",
    }}>
      <div style={{ fontFamily: "var(--font)", color: "#fff", fontSize: "0.85rem", marginBottom: "6px" }}>
        <span style={{ color: "var(--accent, #cc7000)" }}>{counterpartyName}</span>
        {" accepted your trade proposal."}
      </div>
      <div style={{ fontSize: "0.75rem", color: "#aaa", marginBottom: "10px" }}>
        Confirm within {remaining} or it expires.
      </div>
      <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
        <button className="btn btn--primary btn--sm" onClick={onConfirm}>View Trade</button>
        <button className="btn btn--ghost btn--sm" onClick={onDismiss}>Dismiss</button>
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface GodotHudOverlayProps {
  // balances
  displayCurrency: string;
  eveBalance:      number;
  /** Raw tribe-token balance, scaled units (V26+ decimals=2; was 0-decimal int
   *  in V20-V25). null when player is not in an Advanced tribe or balance
   *  hasn't resolved yet. Row is Advanced-gated. */
  tribeTokenBalance: number | null;
  /** On-chain tribe-token decimals (V26+ default 2). null until ledger loads;
   *  HUD falls back to the FE default `TRIBE_TOKEN_DECIMALS`. */
  tribeTokenDecimals: number | null;
  /** Tribe token symbol (e.g. "GOLD"). null falls back to "TOKEN". */
  tribeTokenSymbol:  string | null;
  // multiplayer
  multiplayerEnabled: boolean;
  mpConnected:        boolean;
  mpPlayerCount:      number;
  // panel openers
  onOpenTrade:       () => void;
  onOpenInventory:   () => void;
  /** Opens the in-HUD Market & Missions window on a given tab (from the HUD dropdown). */
  onOpenMarket:      (tab: MarketTab) => void;
  onOpenQuicktrade:  () => void;
  onOpenArchive:     () => void;
  onOpenSSUGov:      () => void;
  onOpenGlobalGov:   () => void;
  onOpenDAppGov:     () => void;
  onOpenFinanceNews: () => void;
  /** Opens the DApp-wide Bazaar News board (consolidated into the News menu). */
  onOpenBazaarNews:  () => void;
  /** Restores WASD focus to the input overlay after the Help window closes. */
  focusOverlay?:     () => void;
  // role gates
  roles: { isRegistered: boolean };
  caps: { hasOwnerCap: boolean; hasSuperAdminCap: boolean; hasAdminCap: boolean; hasModCap: boolean };
  ssuGov: { hasSSUOwnerCap: boolean; hasSSUSuperAdminCap: boolean; hasSSUAdminCap: boolean; hasSSUModCap: boolean; hasGovernance: boolean; isLoading: boolean };
  dappCaps: { isDAppOwner: boolean; isDAppAdmin: boolean };
  walletAddress: string | null;
  // trade banner
  tradeConfirmPopup: TradeConfirmPopupState | null;
  showTrade:         boolean;
  onTradeConfirm:    () => void;
  onTradeDismiss:    () => Promise<void>;
  // proximity warning
  proximityWarning: string | null;
  // Post-V26 Wave 1 — in-HUD bug-report opener (Issue 9). When provided, the
  // HUD renders a "Bug Report" button that opens ContactTicketWindow with
  // `defaultCategory="bug"` prefilled. Omit to hide the button.
  onOpenBugReport?: () => void;
  // Post-V26 Wave 1 — in-HUD bootstrap economy opener (Issue 3). When provided
  // AND the connected wallet holds the TribeLeaderCap (`isTribeLeader`) of an
  // unbootstrapped Advanced tribe, the HUD renders the pulsing setup button.
  // `bootstrapAlreadyDone === true` (the leader's own tribe is fully wired)
  // hides it. Omit `onOpenBootstrapEconomy` to hide the button entirely (e.g.
  // for NoTribe/Easy apps).
  //
  // NOTE: gated on TribeLeaderCap, NOT the SSU OwnerCap (`caps.hasOwnerCap`).
  // Tribe members own their own SSUOwnerCap but must never see this — bootstrap
  // is a one-time tribe-leader action.
  onOpenBootstrapEconomy?: () => void;
  bootstrapAlreadyDone?:   boolean;
  isTribeLeader?:          boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GodotHudOverlay({
  eveBalance,
  tribeTokenBalance, tribeTokenDecimals, tribeTokenSymbol,
  multiplayerEnabled, mpConnected, mpPlayerCount,
  onOpenTrade, onOpenInventory, onOpenMarket, onOpenQuicktrade, onOpenArchive,
  onOpenSSUGov, onOpenGlobalGov, onOpenDAppGov, onOpenFinanceNews, onOpenBazaarNews,
  focusOverlay,
  roles, caps, ssuGov, dappCaps, walletAddress,
  tradeConfirmPopup, showTrade, onTradeConfirm, onTradeDismiss,
  proximityWarning,
  onOpenBugReport,
  onOpenBootstrapEconomy,
  bootstrapAlreadyDone,
  isTribeLeader,
}: GodotHudOverlayProps) {
  const { hasOwnerCap, hasSuperAdminCap, hasAdminCap, hasModCap } = caps;

  // Help window ("New? Get Help here") — opened from the HelpMenu dropdown on a
  // chosen bazaar type. State lives here so index.tsx stays under its line guard.
  const [helpKind, setHelpKind] = useState<BazaarHelpKind | null>(null);

  // Registry-role staff (Admin/Mod hold no cap object — SSU Admin/Mod caps are
  // never minted) should also see the SSU Gov button. Gate on the caller's ssu_role.
  const { data: hudSsuShared } = useSSUSharedObjects(SSU_OBJECT_ID || null);
  const { data: hudSsuRoles } = useSSURoles(walletAddress, hudSsuShared?.memberRegistryId ?? null);
  const ssuRegistryRole = hudSsuRoles?.ssuRole ?? 0;

  // Governance dropdown gating — preserves the previous standalone SSU Gov / Tribe
  // Gov button visibility exactly. Tribe Gov is Easy/Advanced + a tribe staff cap;
  // useBazaarType matches the old <EasyOrAdvanced> wrapper (closed-by-default while loading).
  const { bazaarType: hudBazaarType } = useBazaarType(SSU_OBJECT_ID || null);
  const isEasyOrAdvanced = hudBazaarType === "Easy" || hudBazaarType === "Advanced";
  const canSSUGov = !!SSU_OBJECT_ID && (
    ssuGov.hasSSUOwnerCap || ssuGov.hasSSUSuperAdminCap ||
    ssuGov.hasSSUAdminCap || ssuGov.hasSSUModCap || ssuRegistryRole >= 4
  );
  const canTribeGov = isEasyOrAdvanced && (hasModCap || hasAdminCap || hasSuperAdminCap || hasOwnerCap);

  return (
    <>
      {/* Balance display — top right (Bazar1 lines 1183-1193).
          Advanced bazaar also shows the player's tribe-token balance below
          the EVE row (0-decimal integer, grouped). Hidden in NoTribe/Easy. */}
      <div className="game-hud game-hud--balance">
        <div className="game-hud__row">
          <span className="game-hud__label">EVE</span>
          <span className="game-hud__value">{((eveBalance ?? 0) / COIN_DECIMALS).toFixed(2)}</span>
        </div>
        <AdvancedOnly>
          {tribeTokenBalance !== null && (
            <div className="game-hud__row">
              <span className="game-hud__label">{tribeTokenSymbol ?? "TOKEN"}</span>
              <span className="game-hud__value">{formatTribeAmount(tribeTokenBalance, { decimals: tribeTokenDecimals ?? TRIBE_TOKEN_DECIMALS })}</span>
            </div>
          )}
        </AdvancedOnly>
      </div>

      {/* Controls hint + UI scale (Bazar1 lines 1196-1219) */}
      <div className="game-hud game-hud--controls">
        <span>WASD move</span>
        <span className="game-hud__key--important">C create stall</span>
        <span>Space jump</span>
        <span>F emote</span>
        <span>Shift sprint</span>
        <span className="game-hud__scale">
          UI{" "}
          {["0.8", "1", "1.2", "1.5", "2"].map(v => (
            <button
              key={v}
              className={`game-hud__scale-btn${(localStorage.getItem("bazar-ui-scale") ?? "1") === v ? " active" : ""}`}
              onClick={e => {
                document.documentElement.style.setProperty("--ui-scale", v);
                localStorage.setItem("bazar-ui-scale", v);
                // Tell Godot to scale its in-world chat bubbles to match.
                window.dispatchEvent(new CustomEvent(UI_SCALE_CHANGED_EVENT, { detail: v }));
                const parent = (e.target as HTMLElement).parentElement;
                parent?.querySelectorAll(".game-hud__scale-btn").forEach(btn => btn.classList.remove("active"));
                (e.target as HTMLElement).classList.add("active");
              }}
            >
              {v === "1" ? "1.0" : v}x
            </button>
          ))}
        </span>
      </div>

      {/* Navigation row — top right (Bazar1 lines 1222-1291, minus dappLinks cluster) */}
      <div className="game-hud game-hud--nav">
        {multiplayerEnabled && (
          <span
            style={{
              fontSize: "0.7rem",
              color: mpConnected ? "var(--accent, #cc7000)" : "#555",
              fontFamily: "var(--font-display)",
              letterSpacing: "0.06em",
              userSelect: "none",
              alignSelf: "center",
              paddingRight: "2px",
            }}
            title={mpConnected
              ? `${mpPlayerCount} other player${mpPlayerCount !== 1 ? "s" : ""} online`
              : "Multiplayer: connecting..."}
          >
            {mpConnected ? `MP \u00b7 ${mpPlayerCount}` : "MP \u00b7 --"}
          </span>
        )}
        <HelpMenu onOpen={setHelpKind} />
        <MarketMenu onOpen={onOpenMarket} />
        <button className="btn btn--ghost btn--sm" onClick={onOpenTrade}>Direct Trade</button>
        <button className="btn btn--ghost btn--sm" onClick={onOpenInventory}>Inventory</button>
        {(roles.isRegistered || hasSuperAdminCap || hasOwnerCap) && (
          <button className="btn btn--ghost btn--sm" onClick={onOpenQuicktrade}>Quicktrade</button>
        )}
        <NewsMenu
          onOpenFinanceNews={onOpenFinanceNews}
          onOpenBazaarNews={onOpenBazaarNews}
          onOpenTribeNews={onOpenArchive}
        />
        {/* Guestbook removed from the HUD — it's an in-world gimmick reached via its
            in-world beacon (onOpenGuestbook is still wired there), not the nav row. */}
        {/* Role-gated Governance dropdown — hidden entirely for normal users. The
            per-item gating (SSU vs Tribe) mirrors the previous standalone buttons. */}
        <GovernanceMenu
          canSSUGov={canSSUGov}
          canTribeGov={canTribeGov}
          onOpenSSUGov={onOpenSSUGov}
          onOpenTribeGov={onOpenGlobalGov}
        />
        <AdvancedOnly>
          {isTribeLeader && onOpenBootstrapEconomy && !bootstrapAlreadyDone && (
            <button
              className="btn btn--primary btn--sm"
              onClick={onOpenBootstrapEconomy}
              style={{ animation: "pulse-setup 2s ease-in-out infinite" }}
              title="Initialize tribe ledger, vault, exchange, and mint genesis tokens"
            >
              Bootstrap Advanced Tribe Economy
            </button>
          )}
        </AdvancedOnly>
        {(dappCaps.isDAppOwner || dappCaps.isDAppAdmin) && (
          <button className="btn btn--ghost btn--sm" onClick={onOpenDAppGov}>dApp Gov</button>
        )}
        {/* Finance News moved into the consolidated News menu (Advanced-gated there). */}
        {/* NOTE: dappLinks HUD cluster DROPPED per FA §6 / OS-19 removal */}
      </div>

      {/* Trade Confirmation Banner (Bazar1 lines 1295-1331) */}
      {tradeConfirmPopup && !showTrade && (
        <TradeConfirmBanner
          tradeId={tradeConfirmPopup.tradeId}
          counterpartyName={tradeConfirmPopup.counterpartyName}
          expiresAt={tradeConfirmPopup.expiresAt}
          onConfirm={onTradeConfirm}
          onDismiss={onTradeDismiss}
        />
      )}

      {/* Proximity warning */}
      {proximityWarning && (
        <div className="game-proximity-warning">{proximityWarning}</div>
      )}

      {/* Floating Bug Report — fixed to the bottom-right of the screen (relocated
          out of the top nav menu). Opens ContactTicketWindow with category "bug". */}
      {onOpenBugReport && (
        <button
          className="btn btn--ghost btn--sm"
          onClick={onOpenBugReport}
          title="Report a bug or send feedback"
          style={{
            position: "fixed",
            right: "12px",
            // Raised to the chat-row height (chat sits at bottom:52px) so it no
            // longer overlaps the bottom controls/chat UI.
            bottom: "52px",
            zIndex: Z.NOTICE,
            color: "var(--accent)",
            background: "rgba(0, 0, 0, 0.55)",
            border: "1px solid var(--accent, #cc7000)",
            backdropFilter: "blur(2px)",
          }}
        >
          🐛 Bug Report
        </button>
      )}

      {/* New? Get Help here — floating guide window (Solo / Easy / Advanced).
          Bare (no .game-overlay-panel wrapper) — it brings its own .market-window
          chrome. key={helpKind} remounts it so reselecting from the dropdown jumps
          to that bazaar type. */}
      {helpKind && (
        <HelpWindow
          key={helpKind}
          initialKind={helpKind}
          onClose={() => { setHelpKind(null); focusOverlay?.(); }}
        />
      )}
    </>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
