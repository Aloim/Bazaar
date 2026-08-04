// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * UpdateCeremonyPlan v1 — LegacySSUWithdrawButton.
 *
 * Defense-in-depth rescue control for an SSU owner. When residual EVE
 * survives Phase B's admin drain on:
 *   - the outgoing-version `SSUGovernance.tax_wallet`, OR
 *   - one or more of their WTB shops' entries in the per-SSU `WtbEscrowPool`,
 * this button drains both into the caller's wallet in ONE PTB:
 *   1. (if ssuGovBalance > 0)  buildWithdrawLegacySsuEve → Coin<EVE>
 *   2. (if any shop residuals) buildWithdrawLegacyWtbPoolResidual → Coin<EVE>
 *   3. tx.transferObjects([coins...], sender)
 *
 * NoTribe + Easy only — Advanced WTB uses tribe-token credit, no EVE
 * residual to rescue. Render this hidden when `bazaarType === "Advanced"`.
 *
 * Signer injection: the component accepts a `signTx: (tx) => Promise<unknown>`
 * prop so callers wire their own signer. Bazaar-app call sites pass a
 * `useGatedTransaction`-wrapped signer (so the rescue still respects the
 * Warning window). DappHub callers pass dAppKit.signAndExecuteTransaction
 * directly (DappHub-EXEMPT).
 */

import { useCallback, useMemo, useState } from "react";
import { Transaction } from "@mysten/sui/transactions";
import {
  buildWithdrawLegacySsuEve,
  buildWithdrawLegacyWtbPoolResidual,
} from "@bazaar/shared/tx/bazaarcore/legacy-withdraw-tx";
import type { PerShopResidual } from "@bazaar/shared/hooks/ceremony";

export type LegacyBazaarType = "NoTribe" | "Easy" | "Advanced";

export interface LegacySSUWithdrawButtonProps {
  bazaarType: LegacyBazaarType;
  ssuOwnerCapId: string | null;
  ssuGovId: string | null;
  wtbEscrowPoolId: string | null;
  /** Address that should receive the rescued EVE — typically the connected wallet. */
  recipient: string | null;
  /** Per-SSU tax wallet balance (mist) — from `useLegacySsuEveBalance`. */
  ssuGovBalanceMist: bigint;
  /** Per-shop residuals owned by `recipient` — from `useOutgoingWtbPoolResidual`. */
  perShopResiduals: PerShopResidual[];
  /** Caller-supplied signer. Build + sign + execute. */
  signTx: (tx: Transaction) => Promise<unknown>;
  /** Optional refetch hook fired post-success so balances reset to zero. */
  onWithdrawn?: () => void;
}

const ROOT_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
  fontFamily: "monospace",
  fontSize: "0.8rem",
};

const BTN_STYLE: React.CSSProperties = {
  background: "rgba(74, 158, 222, 0.12)",
  border: "1px solid rgba(74, 158, 222, 0.6)",
  color: "#9bccef",
  padding: "0.45rem 0.9rem",
  cursor: "pointer",
  fontFamily: "monospace",
  fontSize: "0.82rem",
  alignSelf: "flex-start",
};

const BTN_DISABLED: React.CSSProperties = {
  ...BTN_STYLE,
  opacity: 0.45,
  cursor: "not-allowed",
};

const TOOLTIP_STYLE: React.CSSProperties = {
  fontSize: "0.7rem",
  opacity: 0.75,
  lineHeight: 1.3,
};

const ERR_STYLE: React.CSSProperties = { color: "#e55555", fontSize: "0.75rem" };
const OK_STYLE: React.CSSProperties = { color: "#7fc97f", fontSize: "0.75rem" };

const MIST_PER_EVE = 1_000_000_000n;

function formatMistAsEve(mist: bigint): string {
  // Two decimals; integer division then remainder.
  const whole = mist / MIST_PER_EVE;
  const frac = mist % MIST_PER_EVE;
  const fracTwo = Number(frac / (MIST_PER_EVE / 100n));
  return `${whole.toString()}.${fracTwo.toString().padStart(2, "0")}`;
}

/** Visibility predicate — exported so call sites can hide their wrapper too. */
export function shouldRenderLegacyWithdraw(args: {
  bazaarType: LegacyBazaarType;
  ssuGovBalanceMist: bigint;
  perShopResidualsTotalMist: bigint;
}): boolean {
  if (args.bazaarType === "Advanced") return false;
  return args.ssuGovBalanceMist > 0n || args.perShopResidualsTotalMist > 0n;
}

export default function LegacySSUWithdrawButton({
  bazaarType,
  ssuOwnerCapId,
  ssuGovId,
  wtbEscrowPoolId,
  recipient,
  ssuGovBalanceMist,
  perShopResiduals,
  signTx,
  onWithdrawn,
}: LegacySSUWithdrawButtonProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSuccess, setLastSuccess] = useState(false);

  const residualsTotal = useMemo<bigint>(
    () => perShopResiduals.reduce<bigint>((sum, r) => sum + r.residualMist, 0n),
    [perShopResiduals],
  );
  const totalMist = ssuGovBalanceMist + residualsTotal;
  const sourceCount =
    (ssuGovBalanceMist > 0n ? 1 : 0) + perShopResiduals.filter((r) => r.residualMist > 0n).length;

  const canSubmit =
    !!ssuOwnerCapId &&
    !!ssuGovId &&
    !!wtbEscrowPoolId &&
    !!recipient &&
    totalMist > 0n;

  const onClick = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setLastSuccess(false);
    try {
      const tx = new Transaction();
      const coinArgs = [];

      if (ssuGovBalanceMist > 0n) {
        const { result } = buildWithdrawLegacySsuEve(
          { ssuOwnerCapId: ssuOwnerCapId!, ssuGovId: ssuGovId! },
          tx,
        );
        coinArgs.push(result);
      }

      const nonZeroResiduals = perShopResiduals.filter((r) => r.residualMist > 0n);
      if (nonZeroResiduals.length > 0) {
        const { result } = buildWithdrawLegacyWtbPoolResidual(
          {
            wtbEscrowPoolId: wtbEscrowPoolId!,
            shopIds: nonZeroResiduals.map((r) => r.shopId),
          },
          tx,
        );
        coinArgs.push(result);
      }

      if (coinArgs.length > 0) {
        tx.transferObjects(coinArgs, tx.pure.address(recipient!));
      }

      await signTx(tx);
      setLastSuccess(true);
      onWithdrawn?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }, [
    canSubmit,
    ssuOwnerCapId,
    ssuGovId,
    wtbEscrowPoolId,
    recipient,
    ssuGovBalanceMist,
    perShopResiduals,
    signTx,
    onWithdrawn,
  ]);

  const eveStr = formatMistAsEve(totalMist);
  const tooltip = useMemo(() => {
    const parts: string[] = [];
    if (ssuGovBalanceMist > 0n) {
      parts.push(`SSU tax wallet: ${formatMistAsEve(ssuGovBalanceMist)} EVE`);
    }
    for (const r of perShopResiduals) {
      if (r.residualMist > 0n) {
        const shopShort = `${r.shopId.slice(0, 6)}…${r.shopId.slice(-4)}`;
        parts.push(`WTB pool shop ${shopShort}: ${formatMistAsEve(r.residualMist)} EVE`);
      }
    }
    return parts.join(" + ");
  }, [ssuGovBalanceMist, perShopResiduals]);

  // Visibility gate AFTER all hooks (Rules of Hooks).
  if (
    !shouldRenderLegacyWithdraw({
      bazaarType,
      ssuGovBalanceMist,
      perShopResidualsTotalMist: residualsTotal,
    })
  ) {
    return null;
  }

  return (
    <div style={ROOT_STYLE}>
      <button
        style={!canSubmit || submitting ? BTN_DISABLED : BTN_STYLE}
        onClick={onClick}
        disabled={!canSubmit || submitting}
        title={tooltip}
      >
        {submitting
          ? "Signing…"
          : `Withdraw ${eveStr} EVE from legacy wallets (${sourceCount} source${sourceCount === 1 ? "" : "s"})`}
      </button>
      <div style={TOOLTIP_STYLE}>{tooltip}</div>
      {lastSuccess && <div style={OK_STYLE}>✓ Withdraw signed. Balances refresh next poll.</div>}
      {error && <div style={ERR_STYLE}>Error: {error}</div>}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
