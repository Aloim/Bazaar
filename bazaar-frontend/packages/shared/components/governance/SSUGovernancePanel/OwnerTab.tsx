// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * OwnerTab — R6.6.4b OS-32 | OS-58 (Elevate-to-Owner card)
 * SSUOwnerTab orchestrator + SSUInfoSubTab + DeauthDialog.
 * Drift: buildIssueSSUSuperAdminCap, buildRevokeSSUSuperAdminCap (cap ID),
 *   buildFreezeSSU (SuperAdmin-only), buildUnfreezeSSUAsOwner.
 *   OS-37: Transfer-Ownership HIDDEN. OS-38: DESTROY replaced by deactivate.
 * Article XIV.2 exemption: verbatim Bazar1 with adaptations. 500 lines max.
 */

import { useState } from "react";
import { dAppKit, abbreviateAddress, useConnection } from "@evefrontier/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { appendSetSSURole } from "@bazaar/shared/tx/dapp_hub/auto-register-tx";
import { useSSUSharedObjects } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { useRoles, LOADING_SENTINEL } from "@bazaar/shared/hooks/useRoles";
import {
  buildIssueSSUSuperAdminCap,
  buildRevokeSSUSuperAdminCap,
} from "@bazaar/shared/tx/bazaarcore/ssu-governance-tx";
import {
  buildFreezeSSU,
  buildUnfreezeSSUAsOwner,
} from "@bazaar/shared/tx/bazaarcore/ssu-ban-tx";
import {
  buildDeactivateSSUGovernance,
  buildActivateSSUGovernance,
} from "@bazaar/shared/tx/bazaarcore/ssu-lifecycle-tx";
import { WtbEscrowPoolTab } from "@bazaar/shared/components/inventory/WtbEscrowPoolTab";
import AddressInput from "@bazaar/shared/components/AddressInput";
import { SSUBazarAuthSubTab } from "./Owner/BazarAuthSubTab";
import { DeauthDialog } from "./OwnerTab.DeauthDialog";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SSUOwnerTabProps {
  ssuId: string;
  ownerCapId: string | null;
  ssuSuperAdmins: string[];
  /** Extended hook field: Map<holderAddress, capObjectId> for SuperAdmin caps. */
  ssuSuperAdminCapIds: Map<string, string>;
  ssuOwner: string;
  isFrozen: boolean;
  /** isActive — false when SSU governance has been soft-deactivated via OS-38. */
  isActive: boolean;
  hasGovernance: boolean;
  hasSSUSuperAdminCap: boolean;
  hasSSUOwnerCap: boolean;
  /** SuperAdmin cap object ID for the current user (if they hold one). */
  ssuSuperAdminCapId: string | null;
  ssuGovId: string;
  characterNames: Map<string, string>;
  onRefetch: () => void;
}

// ── SSUOwnerTab orchestrator ──────────────────────────────────────────────────

export function SSUOwnerTab({
  ssuId,
  ownerCapId,
  ssuSuperAdmins,
  ssuSuperAdminCapIds,
  ssuOwner,
  isFrozen,
  isActive,
  hasGovernance,
  hasSSUSuperAdminCap,
  hasSSUOwnerCap,
  ssuSuperAdminCapId,
  ssuGovId,
  characterNames,
  onRefetch,
}: SSUOwnerTabProps) {
  type OwnerSubTab = "info" | "bazarauth" | "wtbpool";
  const [subTab, setSubTab] = useState<OwnerSubTab>("info");
  const { walletAddress } = useConnection();
  // OS-58: resolve memberRegistryId for Elevate-to-Owner action card
  const { data: sharedObjects } = useSSUSharedObjects(ssuId || null);
  // OS-58 CC-001: full SDC C-03 predicate — read current SSU role for card guard
  const { ssuRole: currentSSURole, isLoading: rolesLoading, isInRegistry } = useRoles(ssuId || null);

  const subTabs: { key: OwnerSubTab; label: string }[] = [
    { key: "info",      label: "SSU Info" },
    { key: "bazarauth", label: "BazarAuth" },
    { key: "wtbpool",   label: "WTB Pool" },
  ];

  return (
    <div className="panel__section">
      {/* OS-58: Elevate-to-Owner card. CC-001 full 5-guard predicate (SDC C-03). */}
      {/* OS-59: isInRegistry guard added — card hidden when wallet not in MemberRegistry. */}
      {walletAddress &&
       !rolesLoading &&
       isInRegistry &&
       currentSSURole !== LOADING_SENTINEL &&
       currentSSURole !== 7 &&
       hasSSUOwnerCap &&
       ownerCapId &&
       sharedObjects?.memberRegistryId && (
        <ElevateToOwnerCard
          ownerCapId={ownerCapId}
          memberRegistryId={sharedObjects.memberRegistryId}
          walletAddress={walletAddress}
          ssuId={ssuId}
          onRefetch={onRefetch}
        />
      )}

      {hasGovernance && (
        <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          {subTabs.map(st => (
            <button
              key={st.key}
              className={`btn btn--sm ${subTab === st.key ? "btn--primary" : "btn--ghost"}`}
              onClick={() => setSubTab(st.key)}
            >
              {st.label}
            </button>
          ))}
        </div>
      )}

      {hasGovernance && subTab === "info" && (
        <SSUInfoSubTab
          ssuId={ssuId}
          ownerCapId={ownerCapId}
          ssuSuperAdmins={ssuSuperAdmins}
          ssuSuperAdminCapIds={ssuSuperAdminCapIds}
          ssuOwner={ssuOwner}
          isFrozen={isFrozen}
          isActive={isActive}
          hasSSUSuperAdminCap={hasSSUSuperAdminCap}
          hasSSUOwnerCap={hasSSUOwnerCap}
          ssuSuperAdminCapId={ssuSuperAdminCapId}
          ssuGovId={ssuGovId}
          characterNames={characterNames}
          onRefetch={onRefetch}
        />
      )}

      {hasGovernance && subTab === "bazarauth" && (
        <SSUBazarAuthSubTab ssuId={ssuId} />
      )}

      {hasGovernance && subTab === "wtbpool" && (
        <WtbEscrowPoolTab ownerCapId={ownerCapId ?? ""} />
      )}
    </div>
  );
}

// ── ElevateToOwnerCard ────────────────────────────────────────────────────────

interface ElevateToOwnerCardProps {
  ownerCapId:       string;
  memberRegistryId: string;
  walletAddress:    string;
  ssuId:            string;
  onRefetch:        () => void;
}

/** OS-58: Idempotent recovery card. Move target: bazaar_core::membership::set_ssu_role.
 *  Full SDC C-03 predicate delegated to parent SSUOwnerTab conditional render. */
function ElevateToOwnerCard({
  ownerCapId,
  memberRegistryId,
  walletAddress,
  onRefetch,
}: ElevateToOwnerCardProps) {
  const [elevating, setElevating] = useState(false);

  async function handleElevate() {
    if (!ownerCapId || !memberRegistryId || !walletAddress) return;
    setElevating(true);
    try {
      const tx = new Transaction();
      appendSetSSURole(tx, {
        ownerCapId,
        memberRegistryId,
        player: walletAddress,
        role: 7,
      });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      onRefetch();
    } catch (e: unknown) {
      console.error("[OwnerTab] Elevate to Owner failed:", e);
      alert("Elevation failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setElevating(false);
    }
  }

  return (
    <div className="action-card" style={{ marginBottom: "1rem", border: "1px solid var(--accent2)" }}>
      <h4 style={{ color: "var(--accent2)" }}>Elevate to Owner</h4>
      <p className="muted" style={{ fontSize: "0.78rem" }}>
        You hold an SSUOwnerCap but may not be registered as Owner (role 7) in this
        SSU&apos;s MemberRegistry. Click below to set your role to Owner. Idempotent
        — safe to run even if you are already Owner.
      </p>
      <button
        className="btn btn--primary btn--sm"
        disabled={elevating}
        onClick={handleElevate}
      >
        {elevating ? "Elevating..." : "Elevate to Owner (one click)"}
      </button>
    </div>
  );
}

// ── SSUInfoSubTab ─────────────────────────────────────────────────────────────

interface SSUInfoSubTabProps {
  ssuId: string;
  ownerCapId: string | null;
  ssuSuperAdmins: string[];
  /** Extended hook field: Map<holderAddress, capObjectId> for SuperAdmin caps. */
  ssuSuperAdminCapIds: Map<string, string>;
  ssuOwner: string;
  isFrozen: boolean;
  isActive: boolean;
  hasSSUSuperAdminCap: boolean;
  hasSSUOwnerCap: boolean;
  ssuSuperAdminCapId: string | null;
  ssuGovId: string;
  characterNames: Map<string, string>;
  onRefetch: () => void;
}

function SSUInfoSubTab({
  ownerCapId,
  ssuSuperAdmins,
  ssuSuperAdminCapIds,
  ssuOwner,
  isFrozen,
  isActive,
  hasSSUSuperAdminCap,
  hasSSUOwnerCap,
  ssuSuperAdminCapId,
  ssuGovId,
  characterNames,
  onRefetch,
}: SSUInfoSubTabProps) {
  const [superAdminTarget, setSuperAdminTarget] = useState("");
  // OS-37: transferTarget useState REMOVED — Transfer-Ownership form is hidden (no Move fn).
  const [loading, setLoading] = useState("");
  const [showDeauthDialog, setShowDeauthDialog] = useState(false);

  async function grantSuperAdmin() {
    if (!superAdminTarget || !ownerCapId) return;
    setLoading("grant-sa");
    try {
      await dAppKit.signAndExecuteTransaction({
        transaction: buildIssueSSUSuperAdminCap({
          ownerCapId,
          ssuGovId,
          recipient: superAdminTarget,
        }),
      });
      setSuperAdminTarget("");
      onRefetch();
    } catch (e: any) {
      alert(e?.message);
    } finally {
      setLoading("");
    }
  }

  async function revokeSuperAdmin(address: string) {
    if (!ownerCapId) return;
    // Revoke uses cap object ID — NOT the holder address.
    // ssuSuperAdminCapIds: Map<holderAddress, capObjectId> from hook-extension specialist.
    const targetCapId = ssuSuperAdminCapIds.get(address);
    if (!targetCapId) {
      alert("Could not resolve SuperAdmin cap ID for this address. Refresh and try again.");
      return;
    }
    setLoading(`revoke-sa-${address}`);
    try {
      await dAppKit.signAndExecuteTransaction({
        transaction: buildRevokeSSUSuperAdminCap({
          ownerCapId,
          ssuGovId,
          targetCapId,
        }),
      });
      onRefetch();
    } catch (e: any) {
      alert(e?.message);
    } finally {
      setLoading("");
    }
  }

  // OS-37: transferOwnership fn REMOVED alongside the hidden Transfer-Ownership form section.

  async function freezeGovernance() {
    // buildFreezeSSU requires SuperAdmin cap — owner cap alone is insufficient.
    if (!ssuSuperAdminCapId) return;
    setLoading("freeze");
    try {
      await dAppKit.signAndExecuteTransaction({
        transaction: buildFreezeSSU({
          superAdminCapId: ssuSuperAdminCapId,
          ssuGovId,
        }),
      });
      setShowDeauthDialog(false);
      onRefetch();
    } catch (e: any) {
      alert(e?.message);
    } finally {
      setLoading("");
    }
  }

  async function unfreezeGovernance() {
    if (!ownerCapId) return;
    setLoading("unfreeze");
    try {
      await dAppKit.signAndExecuteTransaction({
        transaction: buildUnfreezeSSUAsOwner({
          ownerCapId,
          ssuGovId,
        }),
      });
      onRefetch();
    } catch (e: any) {
      alert(e?.message);
    } finally {
      setLoading("");
    }
  }

  async function deactivateGovernance() {
    if (!ownerCapId) return;
    setLoading("deactivate");
    try {
      await dAppKit.signAndExecuteTransaction({
        transaction: buildDeactivateSSUGovernance({ ownerCapId, ssuGovId }),
      });
      setShowDeauthDialog(false);
      onRefetch();
    } catch (e: any) {
      alert(e?.message);
    } finally {
      setLoading("");
    }
  }

  async function activateGovernance() {
    if (!ownerCapId) return;
    setLoading("activate");
    try {
      await dAppKit.signAndExecuteTransaction({
        transaction: buildActivateSSUGovernance({ ownerCapId, ssuGovId }),
      });
      setShowDeauthDialog(false);
      onRefetch();
    } catch (e: any) {
      alert(e?.message);
    } finally {
      setLoading("");
    }
  }

  // OS-38: Decision B — deactivate/activate handlers added above (DESTROY replaced).

  const ownerCharName = ssuOwner ? characterNames.get(ssuOwner) : undefined;

  return (
    <div>
      {/* SSU owner identity */}
      {ssuOwner && (
        <div className="action-card" style={{ marginBottom: "1rem" }}>
          <h4>SSU Owner</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem", marginTop: "0.35rem" }}>
            {ownerCharName && (
              <span style={{ fontSize: "0.9rem", color: "var(--accent2)", fontFamily: "var(--font-display)" }}>
                {ownerCharName}
              </span>
            )}
            <span className="muted" style={{ fontSize: "0.78rem" }} title={ssuOwner}>
              {abbreviateAddress(ssuOwner)}
            </span>
          </div>
          <div style={{ marginTop: "0.5rem" }}>
            <span className="muted" style={{ fontSize: "0.72rem" }}>
              Governance: <strong>{isFrozen ? "FROZEN" : "Active"}</strong>
            </span>
          </div>
          {/* Unfreeze via Owner cap — Owner CAN unfreeze (buildUnfreezeSSUAsOwner) */}
          {isFrozen && (
            <button
              className="btn btn--primary btn--sm"
              style={{ marginTop: "0.5rem" }}
              disabled={!ownerCapId || loading === "unfreeze"}
              onClick={unfreezeGovernance}
            >
              {loading === "unfreeze" ? "Unfreezing..." : "Unfreeze Governance"}
            </button>
          )}
        </div>
      )}

      {/* Super Admins list + appoint form */}
      <div className="action-card">
        <h4>SSU Super Admins ({ssuSuperAdmins.length})</h4>
        {ssuSuperAdmins.length > 0 && (
          <table className="table" style={{ fontSize: "0.78rem", marginBottom: "0.75rem" }}>
            <thead><tr><th>Player</th><th>Revoke</th></tr></thead>
            <tbody>
              {ssuSuperAdmins.map(addr => {
                const charName = characterNames.get(addr);
                return (
                  <tr key={addr}>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.1rem" }}>
                        {charName && (
                          <span style={{ fontSize: "0.75rem", color: "var(--accent2)" }}>{charName}</span>
                        )}
                        <span className="muted" title={addr}>{abbreviateAddress(addr)}</span>
                      </div>
                    </td>
                    <td>
                      <button
                        className="btn btn--danger btn--sm"
                        disabled={!!loading || !ownerCapId}
                        onClick={() => revokeSuperAdmin(addr)}
                      >
                        {loading === `revoke-sa-${addr}` ? "..." : "Revoke"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="form-row">
          <AddressInput value={superAdminTarget} onChange={setSuperAdminTarget} placeholder="New SuperAdmin 0x..." />
          <button
            className="btn btn--primary btn--sm"
            disabled={!superAdminTarget || !ownerCapId || loading === "grant-sa"}
            onClick={grantSuperAdmin}
          >
            {loading === "grant-sa" ? "Granting..." : "Appoint SuperAdmin"}
          </button>
        </div>
      </div>

      {/* Freeze Governance — SuperAdmin-only action (Owner can only unfreeze, not freeze) */}
      <div className="action-card action-card--danger" style={{ marginTop: "1rem" }}>
        <h4>Freeze Governance</h4>
        <p className="muted" style={{ fontSize: "0.78rem" }}>
          Current status: <strong>{isFrozen ? "FROZEN" : "Active"}</strong>
        </p>
        {/* Freeze button per FA §3.2 R5:
            - hasSSUSuperAdminCap = true  → button ENABLED
            - hasSSUOwnerCap + !hasSSUSuperAdminCap → button DISABLED with tooltip
            buildFreezeSSU requires &SSUSuperAdminCap; Owner alone cannot freeze.
            Owner CAN unfreeze via buildUnfreezeSSUAsOwner (button above). */}
        <button
          className="btn btn--danger btn--sm"
          disabled={!hasSSUSuperAdminCap || isFrozen || !!loading}
          title={hasSSUOwnerCap && !hasSSUSuperAdminCap ? "SuperAdmin cap required to freeze governance" : undefined}
          onClick={() => setShowDeauthDialog(true)}
        >
          {hasSSUOwnerCap && !hasSSUSuperAdminCap
            ? "Freeze Governance (SuperAdmin cap required)"
            : "Deauthorize / Freeze Options"
          }
        </button>
      </div>

      {showDeauthDialog && (
        <DeauthDialog
          isFrozen={isFrozen}
          isActive={isActive}
          loading={loading}
          onFreeze={freezeGovernance}
          onDeactivate={deactivateGovernance}
          onActivate={activateGovernance}
          onClose={() => setShowDeauthDialog(false)}
        />
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
