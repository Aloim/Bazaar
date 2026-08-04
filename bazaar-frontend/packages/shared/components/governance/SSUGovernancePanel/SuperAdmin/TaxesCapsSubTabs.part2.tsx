// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * TaxesCapsSubTabs.part2 — R6.7.5.A Article XIV.4 split
 *
 * Extracted from TaxesCapsSubTabs.tsx to keep that file ≤500 lines.
 * Defines: MaxShopsFormProps + MaxShopsForm (OS-35).
 *
 * TreasuryAddressForm (OS-36) REMOVED — V7 Phase 3.2.
 * set_ssu_treasury_address entry fn deleted from ssu_treasury.move (Phase 3.1).
 *
 * Original location: TaxesCapsSubTabs.tsx lines ~215-351
 */

import React, { useState } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import {
  buildSetSSUMaxShopsAsOwner,
  buildSetSSUMaxShopsAsSuperAdmin,
} from "@bazaar/shared/tx/bazaarcore/ssu-governance-caps-tx";

// ── MaxShopsForm (OS-35) ──────────────────────────────────────────────────────

export interface MaxShopsFormProps {
  ssuGovId: string;
  capId: string;
  capType: "owner" | "super_admin";
  superAdminCapId: string | null;
  maxShopsOverride: number | null;
  onRefetch: () => void;
}

export function MaxShopsForm({ ssuGovId, capId, capType, superAdminCapId, maxShopsOverride, onRefetch }: MaxShopsFormProps) {
  const [value,   setValue]   = useState(maxShopsOverride !== null ? String(maxShopsOverride) : "");
  const [loading, setLoading] = useState(false);

  async function apply(clear: boolean) {
    if (!ssuGovId) return;
    const maxShops = clear ? null : (value ? Number(value) : null);
    if (!clear && (maxShops === null || maxShops <= 0)) {
      alert("Enter a positive number, or use Clear to remove the override.");
      return;
    }
    setLoading(true);
    try {
      const tx = capType === "owner"
        ? buildSetSSUMaxShopsAsOwner({ ownerCapId: capId, ssuGovId, maxShops })
        : superAdminCapId
        ? buildSetSSUMaxShopsAsSuperAdmin({ superAdminCapId, ssuGovId, maxShops })
        : null;
      if (!tx) { alert("No eligible cap."); return; }
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      if (clear) setValue("");
      onRefetch();
    } catch (e: unknown) {
      alert((e as Error)?.message ?? "Transaction failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="action-card" style={{ marginTop: "1rem" }}>
      <h4>Max Shops Override (OS-35)</h4>
      <p className="muted" style={{ fontSize: "0.78rem" }}>
        Current override:{" "}
        <strong>{maxShopsOverride !== null ? maxShopsOverride : "None (global default)"}</strong>.
        Set a per-SSU maximum. Clear to revert to global default.
      </p>
      <div className="form-row" style={{ marginTop: "0.5rem" }}>
        <input
          className="input input--xs"
          type="number"
          min={1}
          placeholder="e.g. 20"
          value={value}
          onChange={e => setValue(e.target.value)}
          style={{ width: "7rem" }}
        />
        <button
          className="btn btn--primary btn--sm"
          disabled={loading || !value || !ssuGovId}
          onClick={() => apply(false)}
        >
          {loading ? "..." : "Set"}
        </button>
        <button
          className="btn btn--ghost btn--sm"
          disabled={loading || !ssuGovId}
          onClick={() => apply(true)}
        >
          Clear
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
