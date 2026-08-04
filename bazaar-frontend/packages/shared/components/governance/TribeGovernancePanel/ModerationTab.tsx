// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * TribeModerationTab — Moderation cluster for TribeGovernancePanel.
 *
 * Phase 8 Wave A2 (AUD-ET-18/19/20/22): rewired to the V35 timed-ban system.
 *  - Writes go through buildTribeBanAs / buildTribeUnbanAs (tribe_governance_caps
 *    4-tier entries) — the former buildBanTribeMember targeted set_tribe_ban,
 *    DELETED at V35, so every ban/unban aborted on live V35.
 *  - The list reads TribeGovernance.global_bans via useTribeBanList — the former
 *    useBanList(null) read SSU MemberEntry booleans and was always empty.
 *  - Works in tribeOnly (SSU-less) mode: the ban entries take ANY MemberRegistry
 *    for their best-effort rank check (SA-06; no tribe binding on members), so
 *    we resolve one from the tribe's first registered SSU, falling back to the
 *    in-game host SSU.
 *
 * Enforcement coverage note (until the V36 wave lands): tribe bans gate tribe
 * TRADES on live V35; missions and quicktrade enforce no ban yet (AUD-ET-11/13).
 */

import { useState } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import { buildTribeBanAs, buildTribeUnbanAs, type TribeCapTier } from "@bazaar/shared/tx/bazaarcore/tribe-ban-tx";
import { TribeBanListView } from "./ModerationTab.shops";
import { useTribeBanList } from "@bazaar/shared/hooks/bazaarcore/useTribeBanList";
import { useTribeCaps } from "@bazaar/shared/hooks/useTribeCaps";
import { useTribeRegistry } from "@bazaar/shared/hooks/useTribeRegistry";
import { useSSUSharedObjects } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { SSU_OBJECT_ID } from "@bazaar/shared/constants";
import AddressInput from "@bazaar/shared/components/AddressInput";

// ── Prop interfaces ───────────────────────────────────────────────────────────

interface TribeModerationTabProps {
  capId: string;
  capType: "owner" | "superadmin" | "admin" | "mod";
  /** Tribe-tier cap IDs for OS-50 dispatchers. Each is undefined when caller lacks the cap. */
  superAdminCapId?: string;
  adminCapId?:      string;
  modCapId?:        string;
}

const DURATIONS: Array<{ label: string; ms: number | "permanent" }> = [
  { label: "1 hour",    ms: 3_600_000 },
  { label: "1 day",     ms: 86_400_000 },
  { label: "7 days",    ms: 604_800_000 },
  { label: "30 days",   ms: 2_592_000_000 },
  { label: "Permanent", ms: "permanent" },
];

// ── TribeModerationTab ────────────────────────────────────────────────────────

// Tribe moderation = tribe-wide timed bans only (per-SSU shop moderation lives in
// SSU Governance → Moderation). Legacy SSU-cap props are retained for caller
// back-compat but the V35 ban entries are TRIBE-cap-gated, resolved here.
export function TribeModerationTab({ capId, capType, superAdminCapId, adminCapId, modCapId }: TribeModerationTabProps) {
  void capId; void capType; void superAdminCapId; void adminCapId; void modCapId;

  const {
    hasLeaderCap, hasSuperAdminCap, hasAdminCap, hasModCap,
    leaderCapId, superAdminCapId: tribeSACapId, adminCapId: tribeAdminCapId, modCapId: tribeModCapId,
    leaderTribeIdx, superAdminTribeIdx, adminTribeIdx, modTribeIdx,
  } = useTribeCaps();
  const { tribes } = useTribeRegistry();

  // Most-privileged held tribe cap drives ban/unban.
  const tier: TribeCapTier | null =
    hasLeaderCap ? "leader"
  : hasSuperAdminCap ? "super_admin"
  : hasAdminCap ? "admin"
  : hasModCap ? "mod"
  : null;
  const tierCapId =
    hasLeaderCap ? leaderCapId
  : hasSuperAdminCap ? tribeSACapId
  : hasAdminCap ? tribeAdminCapId
  : tribeModCapId;

  const govTribeIdx = leaderTribeIdx ?? superAdminTribeIdx ?? adminTribeIdx ?? modTribeIdx ?? null;
  const tribeGovId  = govTribeIdx !== null
    ? (tribes.find(t => t.idx === govTribeIdx)?.tribeGovId ?? null)
    : null;

  const { bans, ssuIds, refetch: refetchBans } = useTribeBanList(tribeGovId);

  // ANY MemberRegistry satisfies the best-effort rank check; prefer the tribe's
  // own first SSU, fall back to the in-game host SSU (tribeOnly DappHub host has
  // no SSU context).
  const registrySsuId = ssuIds[0] ?? (SSU_OBJECT_ID || null);
  const { data: shared } = useSSUSharedObjects(registrySsuId);
  const memberRegistryId = shared?.memberRegistryId ?? null;

  if (!tier || !tierCapId) {
    return (
      <div className="panel__section">
        <p className="muted">
          Tribe moderation needs a tribe cap (Leader / SuperAdmin / Admin / Mod).
          SSU-level caps moderate shops in SSU Governance → Moderation.
        </p>
      </div>
    );
  }

  return (
    <div className="panel__section">
      <div className="action-card" style={{ marginBottom: "1rem" }}>
        <h4>Ban Player (tribe-wide, timed)</h4>
        <p className="muted" style={{ fontSize: "0.78rem" }}>
          Tribe bans currently block tribe trades; mission and quicktrade
          enforcement arrives with the V36 publish. Bans expire automatically.
        </p>
        <BanAddressForm
          tier={tier}
          tierCapId={tierCapId}
          tribeGovId={tribeGovId}
          memberRegistryId={memberRegistryId}
          onBanned={() => refetchBans()}
        />
      </div>
      <TribeBanListView
        bans={bans}
        tier={tier}
        tierCapId={tierCapId}
        tribeGovId={tribeGovId}
        onRefresh={() => refetchBans()}
      />
    </div>
  );
}

// ── BanAddressForm ─────────────────────────────────────────────────────────────

interface BanAddressFormProps {
  tier:             TribeCapTier;
  tierCapId:        string;
  tribeGovId:       string | null;
  memberRegistryId: string | null;
  onBanned:         () => void;
}

function BanAddressForm({ tier, tierCapId, tribeGovId, memberRegistryId, onBanned }: BanAddressFormProps) {
  const [banTarget, setBanTarget] = useState("");
  const [durationIdx, setDurationIdx] = useState(DURATIONS.length - 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const ready = !!tribeGovId && !!memberRegistryId;

  async function ban() {
    if (!ready) return;
    setLoading(true); setError("");
    try {
      const d = DURATIONS[durationIdx].ms;
      await dAppKit.signAndExecuteTransaction({
        transaction: buildTribeBanAs({
          capTier:          tier,
          capId:            tierCapId,
          tribeGovId:       tribeGovId!,
          memberRegistryId: memberRegistryId!,
          target:           banTarget,
          expiresAtMs:      d === "permanent" ? "permanent" : Date.now() + d,
        }),
      });
      setBanTarget("");
      onBanned();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const banDisabled = !ready || loading || !banTarget.trim();

  return (
    <div>
      {error && <div className="currency-selector__warning" style={{ marginBottom: "0.5rem" }}>{error}</div>}
      <div className="form-row">
        <AddressInput value={banTarget} onChange={setBanTarget} placeholder="Player address 0x..." />
      </div>
      {/* Duration + Ban always shown so the timed-ban control is obvious (it used
          to appear only after an address was entered, so it read as "no timelimit"). */}
      <div className="form-row" style={{ flexWrap: "wrap", gap: "0.4rem", marginTop: "0.5rem", alignItems: "center" }}>
        <label className="muted" style={{ fontSize: "0.78rem" }}>Ban duration:</label>
        <select
          className="input input--xs"
          value={durationIdx}
          onChange={e => setDurationIdx(Number(e.target.value))}
        >
          {DURATIONS.map((d, i) => <option key={d.label} value={i}>{d.label}</option>)}
        </select>
        <button
          className="btn btn--danger btn--sm"
          disabled={banDisabled}
          title={
            !banTarget.trim() ? "Enter a player address to ban"
            : !ready ? "Resolving tribe governance / member registry — please wait"
            : undefined
          }
          onClick={ban}
        >
          {loading ? "Banning..." : "Ban"}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
