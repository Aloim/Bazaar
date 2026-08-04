// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * CreateShopModal Step Components (Steps 0-3 banners)
 *
 * This file contains the JSX render components for multi-step form steps
 * extracted from index.tsx to keep index.tsx under the
 * Constitution §14.4 500-line ceiling.
 *
 * All state management and form handlers remain in index.tsx.
 * This file provides stateless sub-components called by the main modal.
 *
 * Original location: Bazar1/dapp/frontend/src/components/CreateShopModal.tsx
 * Split for 500-line guard compliance (Phase 4.7).
 */

import React from "react";
import type { ShopKind } from "@bazaar/shared/types";
import { SSU_OBJECT_ID, SHOP_TITLE_MAX } from "@bazaar/shared/constants";
import type { BazaarTypeName } from "@bazaar/shared/hooks/useBazaarType";

// ── Step 0: SSU Selector ─────────────────────────────────────────────────────

export interface Step0Props {
  bazarSsuIds: string[];
  selectedShopSsuId: string;
  setSelectedShopSsuId: (id: string) => void;
}

export const Step0: React.FC<Step0Props> = ({ bazarSsuIds, selectedShopSsuId, setSelectedShopSsuId }) => (
  <div className="step">
    <h4>Where do you want to open your shop?</h4>
    <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "1rem" }}>Select the SSU where your items are stored.</p>
    <div className="type-selector" style={{ flexDirection: "column", gap: "0.5rem" }}>
      {bazarSsuIds.map(id => {
        const isCurrent = id === SSU_OBJECT_ID;
        const label = isCurrent ? `${id.slice(0, 6)}...${id.slice(-4)} (your current SSU)` : `${id.slice(0, 6)}...${id.slice(-4)}`;
        return (
          <label key={id} className={`type-btn ${selectedShopSsuId === id ? "type-btn--active" : ""}`} style={{ cursor: "pointer", textAlign: "left" }} title={id}>
            <input type="radio" name="ssu-select" value={id} checked={selectedShopSsuId === id} onChange={() => setSelectedShopSsuId(id)} style={{ marginRight: "0.5rem" }} />
            <strong>{label}</strong>
          </label>
        );
      })}
    </div>
  </div>
);

// ── Step 1: Shop Kind Selector ────────────────────────────────────────────────

export interface Step1Props {
  kind: ShopKind;
  setKind: (k: ShopKind) => void;
  displayCurrency: string;
  bazaarType: BazaarTypeName | null;
}

const ALL_KINDS: ShopKind[] = ["WTS", "WTB", "DE", "FREE", "MIS"];

/**
 * Returns the set of shop kinds permitted for the given bazaar type.
 *
 * All four personal shop kinds (WTS, WTB, DE, FREE) are universal across all
 * bazaar types. FREE giveaways are personal shops, NOT tribe constructs, so
 * NoTribe users may create them. Tribe affiliation is now derived from the SSU
 * governance config (govConfig.tribeId) — not user-settable in the UI.
 *
 * Sweep C revert (2026-05-06): NoTribe exclusion of FREE was a CLAUDE.md misread.
 * Reverted per user clarification: "There should be a giveaway Shop for nobazaar."
 *
 * `bazaarType` parameter retained as a future hook in case per-type filtering
 * becomes necessary later. Currently always returns ALL_KINDS.
 */
function resolveAllowedKinds(bazaarType: BazaarTypeName | null): ShopKind[] {
  void bazaarType;
  return ALL_KINDS;
}

export const Step1: React.FC<Step1Props> = ({ kind, setKind, displayCurrency, bazaarType }) => (
  <div className="step">
    <h4>What kind of shop?</h4>
    <div className="type-selector">
      {resolveAllowedKinds(bazaarType).map(k => (
        <button key={k} className={`type-btn ${kind === k ? "type-btn--active" : ""}`}
          onClick={() => setKind(k)}>
          <strong>{k}</strong>
          <span>{k === "WTS" ? "Want to Sell" : k === "WTB" ? "Want to Buy" : k === "DE" ? "Direct Exchange" : k === "FREE" ? "Free Claim" : "Mission"}</span>
          <small className="muted">
            {k === "WTS" && `List items for sale — buyers pay you ${displayCurrency}.`}
            {k === "WTB" && `Request items — pre-fund escrow in ${displayCurrency}.`}
            {k === "DE"  && `Swap items directly — flat ${displayCurrency} fee applies.`}
            {k === "FREE" && "Give items away — per-wallet claim limit."}
            {k === "MIS" && "Post a quest — escrow a reward per run; takers complete it."}
          </small>
        </button>
      ))}
    </div>
  </div>
);

// ── Step 2: Shop Name ─────────────────────────────────────────────────────────

export interface Step2Props {
  title: string;
  setTitle: (v: string) => void;
}

export const Step2: React.FC<Step2Props> = ({ title, setTitle }) => (
  <div className="step">
    <h4>Shop Name</h4>
    <div className="form-row">
      <input className="input" maxLength={SHOP_TITLE_MAX} value={title} onChange={e => setTitle(e.target.value)} placeholder="Max 20 characters" />
      <span className="char-count">{title.length}/{SHOP_TITLE_MAX}</span>
    </div>
  </div>
);

// ── Step 3 Validation Banners ─────────────────────────────────────────────────

export interface Step3BannersProps {
  kind: ShopKind;
  inventory: { typeId: number }[];
  hasFilledListing: boolean;
  hasFilledPair: boolean;
  allListingsFromInventory: boolean;
  coinGiveawayAmount: number;
}

export const Step3Banners: React.FC<Step3BannersProps> = ({
  kind, inventory, hasFilledListing, hasFilledPair, allListingsFromInventory, coinGiveawayAmount,
}) => (
  <>
    {kind === "WTS" && inventory.length === 0 && (
      <div className="currency-selector__warning" style={{ margin: "0.5rem 1rem" }}>No items in SSU storage. You must have items in the SSU before creating a WTS shop.</div>
    )}
    {kind === "FREE" && !hasFilledListing && coinGiveawayAmount <= 0 && (
      <div className="currency-selector__warning" style={{ margin: "0.5rem 1rem" }}>A FREE shop needs items or a coin giveaway.</div>
    )}
    {kind !== "DE" && kind !== "FREE" && inventory.length > 0 && !hasFilledListing && (
      <div className="currency-selector__warning" style={{ margin: "0.5rem 1rem" }}>Select items from the SSU inventory and place them into the listing slots.</div>
    )}
    {kind === "FREE" && inventory.length > 0 && !hasFilledListing && coinGiveawayAmount > 0 && (
      <div className="muted" style={{ margin: "0.5rem 1rem", fontSize: "0.82rem" }}>Coin-only giveaway — no items needed.</div>
    )}
    {(kind === "WTS" || kind === "FREE") && hasFilledListing && !allListingsFromInventory && (
      <div className="currency-selector__warning" style={{ margin: "0.5rem 1rem" }}>Some listed items are not in the SSU inventory.</div>
    )}
    {kind === "DE" && !hasFilledPair && (
      <div className="currency-selector__warning" style={{ margin: "0.5rem 1rem" }}>You must fill both sides of at least one exchange pair before continuing.</div>
    )}
  </>
);

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
