// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * TribeCapsRevocationSubTab — Item 2 tribe-cap revoke/unrevoke UI.
 *
 * Mirrors the SSU-side revocation pattern (SSUSuperAdminCapManager).
 * Hosts 3 tier sections:
 *   - SuperAdmin-tier revocation (peer: TribeSuperAdminCap authority)
 *   - Admin-tier revocation (TribeSuperAdminCap authority)
 *   - Mod-tier revocation (TribeAdminCap authority)
 *
 * All 6 builders are EXEMPT-MODERATION (work during tribe deactivation — Item 2 property).
 *
 * R6.7.5.B — tribe-governance-caps-tx.ts
 */

import { useState } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import {
  buildRevokeTribeSuperAdminCap,
  buildUnrevokeTribeSuperAdminCap,
  buildRevokeTribeAdminCap,
  buildUnrevokeTribeAdminCap,
  buildRevokeTribeModCap,
  buildUnrevokeTribeModCap,
} from "@bazaar/shared/tx/bazaarcore/tribe-governance-caps-tx";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface TribeCapsRevocationSubTabProps {
  /** TribeGovernance shared object ID (mutable). */
  tribeGovId: string;
  /** TribeSuperAdminCap object ID for peer-SA and admin-tier revocation. */
  superAdminCapId: string | null;
  /** TribeAdminCap object ID for mod-tier revocation. */
  adminCapId: string | null;
}

// ── CapRevokeSection ──────────────────────────────────────────────────────────

interface CapRevokeSectionProps {
  title: string;
  description: string;
  authorityLabel: string;
  hasAuthority: boolean;
  tribeGovId: string;
  onRevoke: (targetCapId: string) => Promise<void>;
  onUnrevoke: (targetCapId: string) => Promise<void>;
}

function CapRevokeSection({
  title,
  description,
  authorityLabel,
  hasAuthority,
  tribeGovId,
  onRevoke,
  onUnrevoke,
}: CapRevokeSectionProps) {
  const [targetCapId, setTargetCapId] = useState("");
  const [loading, setLoading]         = useState<"revoke" | "unrevoke" | null>(null);

  async function handleRevoke() {
    const id = targetCapId.trim();
    if (!id || !tribeGovId) return;
    setLoading("revoke");
    try {
      await onRevoke(id);
      setTargetCapId("");
    } catch (e: unknown) {
      alert((e as Error)?.message ?? String(e));
    } finally {
      setLoading(null);
    }
  }

  async function handleUnrevoke() {
    const id = targetCapId.trim();
    if (!id || !tribeGovId) return;
    setLoading("unrevoke");
    try {
      await onUnrevoke(id);
      setTargetCapId("");
    } catch (e: unknown) {
      alert((e as Error)?.message ?? String(e));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="action-card" style={{ marginTop: "1rem" }}>
      <h4>{title}</h4>
      <p className="muted" style={{ fontSize: "0.78rem" }}>{description}</p>
      {!hasAuthority && (
        <p style={{ color: "var(--color-warn, #f5a623)", fontSize: "0.78rem" }}>
          {authorityLabel} required for this action.
        </p>
      )}
      <div className="form-row" style={{ marginTop: "0.5rem" }}>
        <input
          className="input"
          value={targetCapId}
          onChange={e => setTargetCapId(e.target.value)}
          placeholder="Target cap object ID 0x..."
          disabled={!hasAuthority}
          style={{ flex: 1, fontFamily: "monospace", fontSize: "0.78rem" }}
        />
        <button
          className="btn btn--danger btn--sm"
          disabled={!hasAuthority || !targetCapId.trim() || !!loading}
          onClick={handleRevoke}
        >
          {loading === "revoke" ? "..." : "Revoke"}
        </button>
        <button
          className="btn btn--ghost btn--sm"
          disabled={!hasAuthority || !targetCapId.trim() || !!loading}
          onClick={handleUnrevoke}
        >
          {loading === "unrevoke" ? "..." : "Unrevoke"}
        </button>
      </div>
    </div>
  );
}

// ── TribeCapsRevocationSubTab ─────────────────────────────────────────────────

export function TribeCapsRevocationSubTab({
  tribeGovId,
  superAdminCapId,
  adminCapId,
}: TribeCapsRevocationSubTabProps) {
  return (
    <div>
      <p className="muted" style={{ fontSize: "0.78rem", marginBottom: "0.5rem" }}>
        Enter the object ID of the cap to revoke or unrevoke. These operations are EXEMPT from
        the tribe-active gate and work even when tribe governance is deactivated.
      </p>

      <CapRevokeSection
        title="SuperAdmin Cap Revocation (Peer)"
        description="Revoke or unrevoke a TribeSuperAdminCap. Authority: peer TribeSuperAdminCap. Aborts if your own cap is revoked."
        authorityLabel="TribeSuperAdminCap"
        hasAuthority={!!superAdminCapId}
        tribeGovId={tribeGovId}
        onRevoke={async (targetCapId) => {
          if (!superAdminCapId) return;
          await dAppKit.signAndExecuteTransaction({
            transaction: buildRevokeTribeSuperAdminCap({ authorityCapId: superAdminCapId, tribeGovId, targetCapId }),
          });
        }}
        onUnrevoke={async (targetCapId) => {
          if (!superAdminCapId) return;
          await dAppKit.signAndExecuteTransaction({
            transaction: buildUnrevokeTribeSuperAdminCap({ authorityCapId: superAdminCapId, tribeGovId, targetCapId }),
          });
        }}
      />

      <CapRevokeSection
        title="Admin Cap Revocation"
        description="Revoke or unrevoke a TribeAdminCap. Authority: TribeSuperAdminCap."
        authorityLabel="TribeSuperAdminCap"
        hasAuthority={!!superAdminCapId}
        tribeGovId={tribeGovId}
        onRevoke={async (targetCapId) => {
          if (!superAdminCapId) return;
          await dAppKit.signAndExecuteTransaction({
            transaction: buildRevokeTribeAdminCap({ authorityCapId: superAdminCapId, tribeGovId, targetCapId }),
          });
        }}
        onUnrevoke={async (targetCapId) => {
          if (!superAdminCapId) return;
          await dAppKit.signAndExecuteTransaction({
            transaction: buildUnrevokeTribeAdminCap({ authorityCapId: superAdminCapId, tribeGovId, targetCapId }),
          });
        }}
      />

      <CapRevokeSection
        title="Mod Cap Revocation"
        description="Revoke or unrevoke a TribeModCap. Authority: TribeAdminCap (minimum sufficient)."
        authorityLabel="TribeAdminCap"
        hasAuthority={!!adminCapId}
        tribeGovId={tribeGovId}
        onRevoke={async (targetCapId) => {
          if (!adminCapId) return;
          await dAppKit.signAndExecuteTransaction({
            transaction: buildRevokeTribeModCap({ authorityCapId: adminCapId, tribeGovId, targetCapId }),
          });
        }}
        onUnrevoke={async (targetCapId) => {
          if (!adminCapId) return;
          await dAppKit.signAndExecuteTransaction({
            transaction: buildUnrevokeTribeModCap({ authorityCapId: adminCapId, tribeGovId, targetCapId }),
          });
        }}
      />
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
