// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * MissionWizard — the 6-step Mission (MIS) shop-type creation flow (Slice 5).
 *
 * Rendered by CreateShopModal when the user picks the MIS kind. Owns the wizard's
 * own step state (1..6), its own actions bar, and the create submit. The SSU /
 * cap / wallet context is passed in from CreateShopModal (already resolved there);
 * the wizard resolves its own item-name map, sibling missions (position check),
 * and the live listing-fee aggregate.
 *
 * Build PTB (Part 4 §6 of MissionShopPlan):
 *   NoTribe → buildCreateMissionNoTribe · Easy → buildCreateMissionEasy
 *   Advanced → buildCreateMissionAdvanced (tribe-token, no Coin<EVE>)
 * Reward items are escrowed = reward×runs via buildRewardBundles (asOwner→Main).
 * EVE reward + listing fee are split EXACT from one source coin (Move aborts on
 * mismatch); Advanced settles reward + fee on the tribe-token ledger.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { useState, useMemo, type Dispatch, type SetStateAction } from "react";
import { Transaction } from "@mysten/sui/transactions";
import { dAppKit } from "@evefrontier/dapp-kit";
import { COIN_DECIMALS, EVE_COIN_TYPE } from "@bazaar/shared/constants";
import { BAZAAR_TYPE_NUM, COMPLETION_MODE } from "@bazaar/shared/types";
import { useItemTypes } from "@bazaar/shared/hooks";
import { useMissions } from "@bazaar/shared/hooks/bazaarcore/mission-hooks";
import { useMissionListingFee } from "@bazaar/shared/hooks/bazaarcore/useMissionListingFee";
import { splitEveCoin } from "@bazaar/shared/hooks/useEveCoinSplitter";
import { maybeRegisterStranger } from "@bazaar/shared/tx";
import {
  buildCreateMissionNoTribe, buildCreateMissionEasy,
  type MissionItemReqInput, type CreateMissionParams,
} from "@bazaar/shared/tx/bazaarcore/mission-tx";
import { buildCreateMissionAdvanced } from "@bazaar/shared/tx/bazaareconomy/mission-ledger-tx";
import type { CharOwnerCapRef } from "@bazaar/shared/tx/bazaarcore/shop-escrow-helpers";
import type { SSUOwnerCapRef } from "@bazaar/shared/tx/bazaarcore/ssu-receiving-tx";
import { checkShopPositionClear } from "@bazaar/shared/utils/checkShopPositionClear";
import { validateMissionDraft, missionRewardTotals, composeVisibilityMask, missionCollateralRaw, VISIBILITY, type VisibilityCheckboxState } from "@bazaar/shared/utils/mission";
import { useRoles } from "@bazaar/shared/hooks/useRoles";
import { useToast } from "@bazaar/shared/components/widgets/Toast";
import {
  MisStep1, MisStep2, MisStep3, MisStep4, MisStep5, MisStep6,
  MAX_PROOF_ITEMS, MAX_REWARD_ITEMS, MS_PER_HOUR,
} from "./MissionSteps";

export interface MissionWizardProps {
  onClose: () => void;
  /** Return to the CreateShopModal kind selector. */
  onBack: () => void;
  selectedShopSsuId: string;
  ssuGovId: string;
  memberRegistryId: string;
  bazaarType: number;             // govConfig.bazaarType (0/1/2)
  tribeId: number;
  tribeGovId: string | null;
  ledgerId: string | null;        // tribe-token ledger (Advanced)
  walletAddress: string;
  characterId?: string;
  charCapRef?: CharOwnerCapRef;
  isSSUOwner: boolean;
  ssuOwnerCapRef?: SSUOwnerCapRef;
  ssuOwnerCapLoading: boolean;
  displayCurrency: string;
  /** MIST (1e9) for NoTribe/Easy; 10^tokenDecimals for Advanced. */
  priceScale: number;
  eveBalance: number;             // MIST
  tribeTokenBalance: number;      // scaled token units
  isRegistered: boolean;
  refetchRoles: () => void;
  playerPositionRef?: { current: { x: number; y: number } };
  playerPosition?: { x: number; y: number };
}

type MisStep = 1 | 2 | 3 | 4 | 5 | 6;
const emptyReq = (): MissionItemReqInput => ({ typeId: 0, amount: 1 });

export default function MissionWizard(props: MissionWizardProps) {
  const {
    onClose, onBack, selectedShopSsuId, ssuGovId, memberRegistryId, bazaarType, tribeId,
    tribeGovId, ledgerId, walletAddress, characterId, charCapRef, isSSUOwner, ssuOwnerCapRef,
    ssuOwnerCapLoading, displayCurrency, priceScale, eveBalance, tribeTokenBalance,
    isRegistered, refetchRoles, playerPositionRef, playerPosition,
  } = props;
  const toast = useToast();

  const [step, setStep] = useState<MisStep>(1);
  const [title, setTitle] = useState("");
  const [missionType, setMissionType] = useState(0);
  const [description, setDescription] = useState("");
  const [maxRuns, setMaxRuns] = useState(1);
  const [completionMode, setCompletionMode] = useState<number>(COMPLETION_MODE.ITEM_PROOF);
  const [proofItems, setProofItems] = useState<MissionItemReqInput[]>([emptyReq()]);
  const [rewardItems, setRewardItems] = useState<MissionItemReqInput[]>([emptyReq()]);
  const [rewardMoney, setRewardMoney] = useState(0);
  const [takerTimeLimitHours, setTakerTimeLimitHours] = useState(24);
  const [durationHours, setDurationHours] = useState(24);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [collateralMoney, setCollateralMoney] = useState(0);
  const [visibility, setVisibility] = useState<VisibilityCheckboxState>({
    everyone: true, owner: false, admin: false, moderator: false, member: false,
  });

  const roles = useRoles(props.selectedShopSsuId || null);
  const privileged = roles.isModerator || roles.isAdmin || roles.isOwner;
  const visibilityRoles = composeVisibilityMask(visibility);

  const isAdvanced = bazaarType === BAZAAR_TYPE_NUM.ADVANCED;
  const tribeApplies = bazaarType !== BAZAAR_TYPE_NUM.NOTRIBE;

  // Item-name map for proof + reward rows (resolves by NAME, never id).
  const allTypeIds = useMemo(
    () => [...proofItems, ...rewardItems].map((r) => r.typeId).filter((id) => id !== 0),
    [proofItems, rewardItems],
  );
  const itemTypes = useItemTypes(allTypeIds);

  // Sibling missions on the SSU — for the Chebyshev position pre-check (empty pre-V33).
  const { data: missionsOnSsu = [] } = useMissions(selectedShopSsuId || null);

  const fee = useMissionListingFee({ bazaarType: bazaarType as 0 | 1 | 2, ssuGovId, tribeGovId, hours: durationHours });

  const fmtMoney = (raw: number) => (raw === 0 ? "0" : Number((raw / priceScale).toFixed(6)).toString());
  const feeTotalDisplay = fee.isLoading ? "…" : `${fmtMoney(fee.totalFee)} ${displayCurrency}`;

  // ── Row mutators ────────────────────────────────────────────────────────────
  const mutate = (
    setter: Dispatch<SetStateAction<MissionItemReqInput[]>>,
  ) => ({
    setType: (i: number, typeId: number) => setter((rows) => rows.map((r, idx) => idx === i ? { ...r, typeId } : r)),
    setAmount: (i: number, amount: number) => setter((rows) => rows.map((r, idx) => idx === i ? { ...r, amount } : r)),
    remove: (i: number) => setter((rows) => (rows.length <= 1 ? [emptyReq()] : rows.filter((_, idx) => idx !== i))),
    add: (max: number) => setter((rows) => (rows.length >= max ? rows : [...rows, emptyReq()])),
  });
  const proof = mutate(setProofItems);
  const reward = mutate(setRewardItems);

  // ── Per-step Next gating ─────────────────────────────────────────────────────
  const filledProof = proofItems.filter((r) => r.typeId !== 0);
  const filledReward = rewardItems.filter((r) => r.typeId !== 0);
  const hasReward = filledReward.length > 0 || rewardMoney > 0;
  const nextDisabled =
    (step === 1 && !title.trim()) ||
    (step === 3 && completionMode === COMPLETION_MODE.ITEM_PROOF && filledProof.length === 0) ||
    (step === 4 && !hasReward);

  // ── Submit ───────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setError("");
    const draftError = validateMissionDraft({
      title, maxRuns, completionMode,
      filledProofCount: filledProof.length, filledRewardCount: filledReward.length,
      hasMoneyReward: rewardMoney > 0, takerTimeLimitHours, durationHours,
    });
    if (draftError) { setError(draftError); return; }
    if (tribeApplies && !tribeGovId) { setError("Tribe governance not resolved — please wait."); return; }
    if (isAdvanced && !ledgerId) { setError("Tribe token ledger not resolved — please wait."); return; }
    if (filledReward.length > 0) {
      if (isSSUOwner && (ssuOwnerCapLoading || !ssuOwnerCapRef)) { setError("Resolving SSU owner cap — please wait."); return; }
      if (!isSSUOwner && (!characterId || !charCapRef)) { setError("Character not resolved — please wait and retry."); return; }
    }
    if (fee.isLoading) { setError("Loading listing fee — please wait."); return; }

    const livePos = playerPositionRef?.current ?? playerPosition;
    const posX = Math.floor(livePos?.x ?? 0);
    const posY = Math.floor(livePos?.y ?? 0);
    if (posX === 0 && posY === 0) {
      setError("Player position not yet received from Godot. Move one tile (W/A/S/D), then retry."); return;
    }
    const posError = checkShopPositionClear({ x: posX, y: posY }, missionsOnSsu);
    if (posError) { setError(posError); return; }

    // Scale money: per-run raw amount in the bazaar's denomination.
    const { rewardPerRunRaw, rewardTotalRaw } = missionRewardTotals({ rewardMoney, priceScale, maxRuns });
    const feeTotalRaw = fee.totalFee;

    // Balance pre-checks (friendly errors; Move is the backstop).
    if (!isAdvanced && eveBalance < rewardTotalRaw + feeTotalRaw) {
      setError(`Insufficient EVE: need ${(rewardTotalRaw + feeTotalRaw) / COIN_DECIMALS} EVE for reward escrow + listing fee.`); return;
    }
    if (isAdvanced && tribeTokenBalance < rewardTotalRaw + feeTotalRaw) {
      setError(`Insufficient ${displayCurrency} for reward escrow + listing fee.`); return;
    }

    const durationMs = durationHours * MS_PER_HOUR;
    const takerTimeLimitMs = takerTimeLimitHours * MS_PER_HOUR;
    const sharedParams = {
      ssuGovId, ssuId: selectedShopSsuId, characterId: characterId ?? "",
      missionType, title, description, completionMode,
      proofItems: completionMode === COMPLETION_MODE.ITEM_PROOF ? filledProof : [],
      rewardItems: filledReward, maxRuns,
      takerTimeLimitMs, durationMs, positionX: posX, positionY: posY,
      asOwner: isSSUOwner, charCapRef, ssuOwnerCapRef,
      collateralEvePerRun: !isAdvanced
        ? missionCollateralRaw({ collateralMoney, priceScale })  // priceScale=COIN_DECIMALS for EVE
        : 0,
      visibilityRoles,
    };

    setLoading(true);
    try {
      let tx: Transaction;
      if (isAdvanced) {
        tx = new Transaction();
        buildCreateMissionAdvanced({
          ...sharedParams,
          tribeGovId: tribeGovId!, ledgerId: ledgerId!, memberRegistryId,
          rewardTokenPerRun: rewardPerRunRaw, listingFeeTokens: feeTotalRaw,
          collateralTokenPerRun: isAdvanced
            ? missionCollateralRaw({ collateralMoney, priceScale })  // priceScale=10^tribeTokenDecimals
            : 0,
          visibilityRoles,
        }, tx);
      } else {
        tx = new Transaction();
        // Split reward EVE + listing fee EXACT from one source coin (avoids a
        // double fetch/merge; either leg may be a 0-value coin).
        const combined = rewardTotalRaw + feeTotalRaw;
        let rewardEveCoin, listingFeeCoin;
        if (combined === 0) {
          rewardEveCoin = tx.moveCall({ target: "0x2::coin::zero", typeArguments: [EVE_COIN_TYPE] });
          listingFeeCoin = tx.moveCall({ target: "0x2::coin::zero", typeArguments: [EVE_COIN_TYPE] });
        } else {
          const src = await splitEveCoin(walletAddress, BigInt(combined), tx);
          const [rc, fc] = tx.splitCoins(src.coinArg, [
            tx.pure.u64(BigInt(rewardTotalRaw)), tx.pure.u64(BigInt(feeTotalRaw)),
          ]);
          rewardEveCoin = rc; listingFeeCoin = fc;
        }
        const eveParams: CreateMissionParams = {
          ...sharedParams, rewardEvePerRun: rewardPerRunRaw, rewardEveCoin, listingFeeCoin,
        };
        if (bazaarType === BAZAAR_TYPE_NUM.EASY) {
          buildCreateMissionEasy({ ...eveParams, tribeGovId: tribeGovId! }, tx);
        } else {
          buildCreateMissionNoTribe(eveParams, tx);
        }
      }
      maybeRegisterStranger(tx, isRegistered, ssuGovId, memberRegistryId);
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      if (!isRegistered) refetchRoles();
      toast.success("Mission published.");
      window.dispatchEvent(new CustomEvent("bazar-soft-refresh"));
      setTimeout(() => window.dispatchEvent(new CustomEvent("bazar-soft-refresh")), 1500);
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Transaction failed.";
      setError(msg);
      toast.error(msg);
    } finally { setLoading(false); }
  }

  return (
    <>
      <div className="modal__header">
        <h3>Create Mission — Step {step} of 6</h3>
        <div className="step-dots">
          {([1, 2, 3, 4, 5, 6] as MisStep[]).map((s) => (
            <span key={s} className={`step-dot ${step >= s ? "step-dot--active" : ""}`} />
          ))}
        </div>
      </div>

      {step === 1 && <MisStep1 title={title} setTitle={setTitle} missionType={missionType} setMissionType={setMissionType}
        visibilityValue={visibility} onVisibilityChange={setVisibility} privileged={privileged} />}
      {step === 2 && <MisStep2 description={description} setDescription={setDescription} />}
      {step === 3 && (
        <MisStep3
          maxRuns={maxRuns} setMaxRuns={setMaxRuns}
          completionMode={completionMode} setCompletionMode={setCompletionMode}
          proofItems={proofItems} itemTypes={itemTypes}
          onSetProofType={proof.setType} onSetProofAmount={proof.setAmount}
          onRemoveProof={proof.remove} onAddProof={() => proof.add(MAX_PROOF_ITEMS)}
          takerTimeLimitHours={takerTimeLimitHours} setTakerTimeLimitHours={setTakerTimeLimitHours}
          collateralMoney={collateralMoney} setCollateralMoney={setCollateralMoney}
          displayCurrency={displayCurrency} />
      )}
      {step === 4 && (
        <MisStep4
          rewardItems={rewardItems} itemTypes={itemTypes}
          onSetRewardType={reward.setType} onSetRewardAmount={reward.setAmount}
          onRemoveReward={reward.remove} onAddReward={() => reward.add(MAX_REWARD_ITEMS)}
          rewardMoney={rewardMoney} setRewardMoney={setRewardMoney} displayCurrency={displayCurrency} />
      )}
      {step === 5 && (
        <MisStep5
          durationHours={durationHours} setDurationHours={setDurationHours}
          fee={fee} displayCurrency={displayCurrency} priceScale={priceScale}
          excludeDapp={isAdvanced} tribeApplies={tribeApplies} />
      )}
      {step === 6 && (
        <MisStep6
          title={title} missionType={missionType} description={description}
          completionMode={completionMode} proofItems={filledProof} rewardItems={filledReward}
          rewardMoney={rewardMoney} displayCurrency={displayCurrency} maxRuns={maxRuns}
          takerTimeLimitHours={takerTimeLimitHours} durationHours={durationHours}
          feeTotalDisplay={feeTotalDisplay} itemTypes={itemTypes} error={error}
          collateralPerRun={collateralMoney} />
      )}

      <div className="modal__actions">
        <button className="btn btn--ghost" onClick={step === 1 ? onBack : () => setStep((s) => (s - 1) as MisStep)}>
          {step === 1 ? "Back" : "Back"}
        </button>
        {step < 6
          ? <button className="btn btn--primary" disabled={nextDisabled} onClick={() => setStep((s) => (s + 1) as MisStep)}>Next</button>
          : <button className="btn btn--primary" onClick={handleSubmit} disabled={loading}>{loading ? "Publishing…" : "Publish Mission"}</button>}
      </div>
    </>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
