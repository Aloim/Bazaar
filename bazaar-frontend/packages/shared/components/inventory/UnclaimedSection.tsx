// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * UnclaimedSection.tsx — Unclaimed items pouch with real Claim TX wiring (FP1-13).
 *
 * Buttons gracefully disable when userStorageId is null (resolution still pending).
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { useState } from "react";
import { useGatedTransaction } from "@bazaar/shared/hooks/announcements";
import { buildClaimUnclaimedItem } from "../../tx/claims";
import { buildBatchClaimUnclaimed } from "../../tx/bazaarcore/inventory-tx";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Shape mirrors the return type of useUnclaimedItems().items */
interface UnclaimedItem {
  typeId:   number;
  quantity: number;
  shopId?:  string;
}

export interface UnclaimedSectionProps {
  items:         UnclaimedItem[];
  error?:        string | null;
  resolveName:   (typeId: number) => string;
  userStorageId: string | null;
  onRefresh?:    () => Promise<void> | void;
}

// ── UnclaimedSection ──────────────────────────────────────────────────────────

export default function UnclaimedSection({
  items, error, resolveName, userStorageId, onRefresh,
}: UnclaimedSectionProps) {
  const { signGated } = useGatedTransaction();
  const [busy, setBusy] = useState<string | "all" | null>(null);

  if (items.length === 0) return null;

  const canClaim = userStorageId !== null;

  async function claimOne(shopId: string | undefined) {
    if (!userStorageId || !shopId) return;
    setBusy(shopId);
    try {
      const tx = buildClaimUnclaimedItem(userStorageId, shopId);
      const result = await signGated(tx);
      if (result.$kind === "FailedTransaction") {
        throw new Error("Claim transaction failed.");
      }
      if (onRefresh) await onRefresh();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function claimAll() {
    if (!userStorageId) return;
    const shopIds = items.map(i => i.shopId).filter((id): id is string => !!id);
    if (shopIds.length === 0) return;
    setBusy("all");
    try {
      const tx = buildBatchClaimUnclaimed({ userStorageId, shopIds });
      const result = await signGated(tx);
      if (result.$kind === "FailedTransaction") {
        throw new Error("Batch claim transaction failed.");
      }
      if (onRefresh) await onRefresh();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="inventory__unclaimed">
      <div className="inventory__unclaimed-header">
        <h4>Unclaimed Items ({items.length})</h4>
        <button
          className="btn btn--primary btn--sm"
          disabled={!canClaim || busy !== null}
          title={!canClaim ? "Waiting for UserStorage ID..." : undefined}
          onClick={claimAll}
        >
          {busy === "all" ? "Signing..." : "Claim All"}
        </button>
      </div>
      <div className="inventory__unclaimed-list">
        {items.map(u => (
          <div
            key={`${u.typeId}-${u.shopId ?? "none"}`}
            className="inventory__unclaimed-item"
          >
            <span style={{ flex: 1 }}>{resolveName(u.typeId)}</span>
            <span className="muted">×{u.quantity}</span>
            <button
              className="btn btn--ghost btn--sm"
              disabled={!canClaim || !u.shopId || busy !== null}
              title={!canClaim ? "Waiting for UserStorage ID..." : (!u.shopId ? "Missing shopId on unclaimed item" : undefined)}
              onClick={() => claimOne(u.shopId)}
            >
              {busy === u.shopId ? "Signing..." : "Claim"}
            </button>
          </div>
        ))}
      </div>
      {error && (
        <p style={{ color: "var(--danger)", fontSize: "0.8rem", marginTop: "0.5rem" }}>
          {error}
        </p>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
