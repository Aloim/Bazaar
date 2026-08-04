// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * MissionWizard step render components (Steps 1–6) — stateless JSX, mirroring the
 * shop CreateShopModal/Steps.tsx split. All state + handlers live in ./index.tsx.
 *
 * Steps:
 *   1 Name + Mission type (Mining/PVP/PVE/Loot — cosmetic)
 *   2 Description
 *   3 Runs + completion condition (item-proof ≤10 items / "other" trust-warning)
 *     + per-taker time limit
 *   4 Reward — items (≤10) and/or payable EVE / tribe-token
 *   5 Listing duration (1h–7d slider) + live per-hour fee readout
 *   6 Review + Publish
 *
 * Items are always shown / searched by NAME (ItemTypeSearch + useItemTypes), never id.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import React from "react";
import {
  MISSION_TYPE_LABEL, COMPLETION_MODE,
} from "@bazaar/shared/types";
import MissionVisibilityPicker from "./MissionVisibilityPicker";
import type { VisibilityCheckboxState } from "@bazaar/shared/utils/mission";
import { SHOP_TITLE_MAX } from "@bazaar/shared/constants";
import type { MissionItemReqInput } from "@bazaar/shared/tx/bazaarcore/mission-tx";
import type { MissionListingFeeOutput } from "@bazaar/shared/hooks/bazaarcore/useMissionListingFee";
import { ItemReqRows } from "./ItemReqRows";
import { DecimalInput } from "@bazaar/shared/components/widgets/DecimalInput";
import {
  MAX_PROOF_ITEMS, MAX_REWARD_ITEMS, MIN_DURATION_HOURS, MAX_DURATION_HOURS, MS_PER_HOUR,
} from "@bazaar/shared/utils/mission";

// Re-export the canonical Mission wizard constants (defined in utils/mission) so
// existing importers (MissionWizard/index.tsx) keep their import path.
export { MAX_PROOF_ITEMS, MAX_REWARD_ITEMS, MIN_DURATION_HOURS, MAX_DURATION_HOURS, MS_PER_HOUR };
const DURATION_CHIPS: { label: string; hours: number }[] = [
  { label: "1h", hours: 1 }, { label: "6h", hours: 6 }, { label: "12h", hours: 12 },
  { label: "1d", hours: 24 }, { label: "3d", hours: 72 }, { label: "7d", hours: 168 },
];

type ItemTypeMap = Map<number, { name?: string } | undefined>;

// ── Step 1: Name + Mission type ───────────────────────────────────────────────

export interface Step1Props {
  title: string;
  setTitle: (v: string) => void;
  missionType: number;
  setMissionType: (n: number) => void;
  visibilityValue: VisibilityCheckboxState;
  onVisibilityChange: (s: VisibilityCheckboxState) => void;
  privileged: boolean;
}
export const MisStep1: React.FC<Step1Props> = ({
  title, setTitle, missionType, setMissionType,
  visibilityValue, onVisibilityChange, privileged,
}) => (
  <div className="step">
    <h4>Mission Name &amp; Type</h4>
    <div className="mis-field">
      <label className="mis-field__label">Mission name</label>
      <div className="form-row">
        <input className="input" maxLength={SHOP_TITLE_MAX} value={title}
          onChange={(e) => setTitle(e.target.value)} placeholder="Max 20 characters" />
        <span className="char-count">{title.length}/{SHOP_TITLE_MAX}</span>
      </div>
    </div>
    <div className="mis-field">
      <label className="mis-field__label">Mission type <span className="muted">(cosmetic label)</span></label>
      <div className="mis-typegrid">
        {Object.entries(MISSION_TYPE_LABEL).map(([num, label]) => {
          const n = Number(num);
          return (
            <button key={num} type="button"
              className={`type-btn ${missionType === n ? "type-btn--active" : ""}`}
              onClick={() => setMissionType(n)}>
              <strong>{label}</strong>
            </button>
          );
        })}
      </div>
    </div>
    <MissionVisibilityPicker value={visibilityValue} onChange={onVisibilityChange} privileged={privileged} />
  </div>
);

// ── Step 2: Description ───────────────────────────────────────────────────────

export interface Step2Props { description: string; setDescription: (v: string) => void; }
export const MisStep2: React.FC<Step2Props> = ({ description, setDescription }) => (
  <div className="step">
    <h4>Description</h4>
    <p className="muted" style={{ fontSize: "0.82rem", marginBottom: "0.6rem" }}>
      Tell takers what the mission involves. Shown on the in-world mission stall.
    </p>
    <textarea className="textarea" rows={5} value={description}
      onChange={(e) => setDescription(e.target.value)}
      placeholder="e.g. Clear the asteroid field of pirate drones and bring back the salvage." />
  </div>
);

// ── Step 3: Runs + completion condition + time limit ──────────────────────────

export interface Step3Props {
  maxRuns: number;
  setMaxRuns: (n: number) => void;
  completionMode: number;
  setCompletionMode: (n: number) => void;
  proofItems: MissionItemReqInput[];
  itemTypes: ItemTypeMap;
  onSetProofType: (i: number, typeId: number) => void;
  onSetProofAmount: (i: number, amount: number) => void;
  onRemoveProof: (i: number) => void;
  onAddProof: () => void;
  takerTimeLimitHours: number;
  setTakerTimeLimitHours: (n: number) => void;
  collateralMoney: number;
  setCollateralMoney: (n: number) => void;
  displayCurrency: string;
}
export const MisStep3: React.FC<Step3Props> = ({
  maxRuns, setMaxRuns, completionMode, setCompletionMode,
  proofItems, itemTypes, onSetProofType, onSetProofAmount, onRemoveProof, onAddProof,
  takerTimeLimitHours, setTakerTimeLimitHours,
  collateralMoney, setCollateralMoney, displayCurrency,
}) => (
  <div className="step">
    <h4>Runs &amp; Completion</h4>
    <div className="mis-field">
      <label className="mis-field__label">Number of runs <span className="muted">(reward is escrowed per run)</span></label>
      <input type="number" min={1} className="input mis-num" value={maxRuns}
        onChange={(e) => setMaxRuns(Math.max(1, Math.floor(Number(e.target.value) || 1)))} />
    </div>

    <div className="mis-field">
      <label className="mis-field__label">Completion condition</label>
      <div className="type-selector">
        <button type="button" className={`type-btn ${completionMode === COMPLETION_MODE.ITEM_PROOF ? "type-btn--active" : ""}`}
          onClick={() => setCompletionMode(COMPLETION_MODE.ITEM_PROOF)}>
          <strong>Item proof</strong>
          <small className="muted">Taker submits items — completes trustlessly in one transaction.</small>
        </button>
        <button type="button" className={`type-btn ${completionMode === COMPLETION_MODE.OTHER ? "type-btn--active" : ""}`}
          onClick={() => setCompletionMode(COMPLETION_MODE.OTHER)}>
          <strong>Other</strong>
          <small className="muted">You confirm or reject each submission manually.</small>
        </button>
      </div>
    </div>

    {completionMode === COMPLETION_MODE.ITEM_PROOF ? (
      <div className="mis-field">
        <label className="mis-field__label">Items Required for Completion <span className="muted">(per run, up to {MAX_PROOF_ITEMS})</span></label>
        <ItemReqRows
          rows={proofItems} itemTypes={itemTypes} maxRows={MAX_PROOF_ITEMS}
          addLabel="+ Add proof item"
          onSetType={onSetProofType} onSetAmount={onSetProofAmount}
          onRemove={onRemoveProof} onAdd={onAddProof} />
      </div>
    ) : (
      <div className="mis-trust">
        <strong>Trust warning.</strong> "Other" missions are <strong>not</strong> auto-completed. Each
        taker's submission waits for you to <strong>Confirm</strong> (releases the reward) or
        <strong> Reject</strong> (frees the run). Only post these to takers you trust.
      </div>
    )}

    <div className="mis-field" style={{ marginTop: "0.9rem" }}>
      <label className="mis-field__label">Per-taker time limit <span className="muted">(hours to finish after accepting)</span></label>
      <input type="number" min={1} className="input mis-num" value={takerTimeLimitHours}
        onChange={(e) => setTakerTimeLimitHours(Math.max(1, Math.floor(Number(e.target.value) || 1)))} />
    </div>
    <div className="mis-field" style={{ marginTop: "0.9rem" }}>
      <label className="mis-field__label">
        Collateral per run ({displayCurrency})
        <span className="muted"> — optional deposit taker posts to accept; returned on completion,
          split 50/50 on cancel, forfeited on timeout.</span>
      </label>
      <DecimalInput className="input mis-num" showZero
        value={collateralMoney}
        onValueChange={(v) => setCollateralMoney(v)}
        style={{ width: 160 }} />
    </div>
  </div>
);

// ── Step 4: Reward ────────────────────────────────────────────────────────────

export interface Step4Props {
  rewardItems: MissionItemReqInput[];
  itemTypes: ItemTypeMap;
  onSetRewardType: (i: number, typeId: number) => void;
  onSetRewardAmount: (i: number, amount: number) => void;
  onRemoveReward: (i: number) => void;
  onAddReward: () => void;
  rewardMoney: number;
  setRewardMoney: (n: number) => void;
  displayCurrency: string;
}
export const MisStep4: React.FC<Step4Props> = ({
  rewardItems, itemTypes, onSetRewardType, onSetRewardAmount, onRemoveReward, onAddReward,
  rewardMoney, setRewardMoney, displayCurrency,
}) => (
  <div className="step">
    <h4>Reward <span className="muted" style={{ fontWeight: 400, fontSize: "0.82rem" }}>(per completed run)</span></h4>
    <p className="muted" style={{ fontSize: "0.82rem", marginBottom: "0.6rem" }}>
      Items and/or currency. Everything is escrowed at creation = reward × runs; unused escrow refunds
      to you when the mission closes or expires.
    </p>
    <div className="mis-field">
      <label className="mis-field__label">Reward items <span className="muted">(from your inventory, up to {MAX_REWARD_ITEMS})</span></label>
      <ItemReqRows
        rows={rewardItems} itemTypes={itemTypes} maxRows={MAX_REWARD_ITEMS}
        addLabel="+ Add reward item"
        onSetType={onSetRewardType} onSetAmount={onSetRewardAmount}
        onRemove={onRemoveReward} onAdd={onAddReward} />
    </div>
    <div className="mis-field">
      <label className="mis-field__label">Currency reward per run ({displayCurrency})</label>
      <DecimalInput className="input mis-num" showZero value={rewardMoney}
        onValueChange={(v) => setRewardMoney(v)} style={{ width: 160 }} />
    </div>
  </div>
);

// ── Step 5: Listing duration + live fee ───────────────────────────────────────

function fmtMoney(raw: number, scale: number): string {
  if (raw === 0) return "0";
  const v = raw / scale;
  // Trim to at most 6 significant fractional digits without trailing zeros.
  return Number(v.toFixed(6)).toString();
}

export interface Step5Props {
  durationHours: number;
  setDurationHours: (n: number) => void;
  fee: MissionListingFeeOutput;
  displayCurrency: string;
  /** MIST (1e9) for NoTribe/Easy, 10^tokenDecimals for Advanced. */
  priceScale: number;
  excludeDapp: boolean;
  tribeApplies: boolean;
}
export const MisStep5: React.FC<Step5Props> = ({
  durationHours, setDurationHours, fee, displayCurrency, priceScale, excludeDapp, tribeApplies,
}) => {
  const days = Math.floor(durationHours / 24);
  const hrs = durationHours % 24;
  const human = days > 0 ? `${days}d${hrs > 0 ? ` ${hrs}h` : ""}` : `${hrs}h`;
  return (
    <div className="step">
      <h4>Listing Duration</h4>
      <div className="mis-slider-head">
        <span className="muted" style={{ fontSize: "0.82rem" }}>How long the mission stays listed</span>
        <span className="mis-slider-head__val">{human}</span>
      </div>
      <input type="range" className="mis-range"
        min={MIN_DURATION_HOURS} max={MAX_DURATION_HOURS} step={1}
        value={durationHours}
        onChange={(e) => setDurationHours(Number(e.target.value))} />
      <div className="mis-range-ticks"><span>1h</span><span>7d</span></div>
      <div className="mis-chips">
        {DURATION_CHIPS.map((c) => (
          <button key={c.hours} type="button"
            className={`mis-chip ${durationHours === c.hours ? "mis-chip--active" : ""}`}
            onClick={() => setDurationHours(c.hours)}>{c.label}</button>
        ))}
      </div>

      <div className="mis-fee">
        <div className="mis-fee__row">
          <span>SSU fee /h</span><span>{fmtMoney(fee.ssuFeePerHour, priceScale)} {displayCurrency}</span>
        </div>
        {tribeApplies && (
          <div className="mis-fee__row">
            <span>Tribe fee /h</span><span>{fmtMoney(fee.tribeFeePerHour, priceScale)} {displayCurrency}</span>
          </div>
        )}
        {!excludeDapp && (
          <div className="mis-fee__row">
            <span>DApp fee /h</span><span>{fmtMoney(fee.dappFeePerHour, priceScale)} {displayCurrency}</span>
          </div>
        )}
        <div className="mis-fee__row">
          <span>Per hour × {durationHours}h</span>
          <span>{fmtMoney(fee.totalFeePerHour, priceScale)} {displayCurrency}/h</span>
        </div>
        <div className="mis-fee__row mis-fee__row--total">
          <span>Total listing fee</span>
          <span>{fee.isLoading ? "…" : `${fmtMoney(fee.totalFee, priceScale)} ${displayCurrency}`}</span>
        </div>
      </div>
    </div>
  );
};

// ── Step 6: Review ────────────────────────────────────────────────────────────

export interface Step6Props {
  title: string;
  missionType: number;
  description: string;
  completionMode: number;
  proofItems: MissionItemReqInput[];
  rewardItems: MissionItemReqInput[];
  rewardMoney: number;
  displayCurrency: string;
  maxRuns: number;
  takerTimeLimitHours: number;
  durationHours: number;
  feeTotalDisplay: string;
  itemTypes: ItemTypeMap;
  error: string;
  collateralPerRun: number;  // human-scale display (same scale as rewardMoney)
}
function reqLine(rows: MissionItemReqInput[], itemTypes: ItemTypeMap): string {
  if (rows.length === 0) return "—";
  return rows.map((r) => `${r.amount}× ${itemTypes.get(r.typeId)?.name ?? `#${r.typeId}`}`).join(", ");
}
export const MisStep6: React.FC<Step6Props> = ({
  title, missionType, description, completionMode, proofItems, rewardItems, rewardMoney,
  displayCurrency, maxRuns, takerTimeLimitHours, durationHours, feeTotalDisplay, itemTypes, error,
  collateralPerRun,
}) => {
  const days = Math.floor(durationHours / 24);
  const hrs = durationHours % 24;
  const human = days > 0 ? `${days}d${hrs > 0 ? ` ${hrs}h` : ""}` : `${hrs}h`;
  const rewardMoneyLine = rewardMoney > 0 ? `${rewardMoney} ${displayCurrency}` : null;
  const rewardItemsLine = rewardItems.length > 0 ? reqLine(rewardItems, itemTypes) : null;
  return (
    <div className="step">
      <h4>Review &amp; Publish</h4>
      <div className="mis-review">
        <span className="mis-review__k">Name</span><span className="mis-review__v">{title || <span className="muted">(none)</span>}</span>
        <span className="mis-review__k">Type</span><span className="mis-review__v">{MISSION_TYPE_LABEL[missionType]}</span>
        <span className="mis-review__k">Description</span><span className="mis-review__v">{description || <span className="muted">(none)</span>}</span>
        <span className="mis-review__k">Runs</span><span className="mis-review__v">{maxRuns}</span>
        <span className="mis-review__k">Completion</span>
        <span className="mis-review__v">
          {completionMode === COMPLETION_MODE.ITEM_PROOF
            ? <>Item proof — <span className="muted">{reqLine(proofItems, itemTypes)}</span></>
            : <>Other — <span className="muted">manual confirm / reject</span></>}
        </span>
        <span className="mis-review__k">Time limit</span><span className="mis-review__v">{takerTimeLimitHours}h per taker</span>
        <span className="mis-review__k">Reward / run</span>
        <span className="mis-review__v">
          {rewardItemsLine || rewardMoneyLine
            ? [rewardItemsLine, rewardMoneyLine].filter(Boolean).join("  +  ")
            : <span className="muted">(none)</span>}
          <span className="muted"> · deposited on creation (× {maxRuns} runs)</span>
        </span>
        {collateralPerRun > 0 && (
          <>
            <span className="mis-review__k">Collateral / run</span>
            <span className="mis-review__v">{collateralPerRun} {displayCurrency} (posted by taker at accept)</span>
          </>
        )}
        <span className="mis-review__k">Duration</span><span className="mis-review__v">{human}</span>
        <span className="mis-review__k">Listing fee</span><span className="mis-review__v">{feeTotalDisplay}</span>
      </div>
      {error && <div className="currency-selector__warning" style={{ marginTop: "0.8rem" }}>{error}</div>}
    </div>
  );
};

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
