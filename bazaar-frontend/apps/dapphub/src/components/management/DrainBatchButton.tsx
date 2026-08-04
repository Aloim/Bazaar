// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * UpdateCeremonyPlan v1 — generic paginated drain-batch button.
 *
 * Pattern (state machine):
 *   IDLE -> FETCHING_IDS -> SIGNING(page 1..N) -> DONE
 *                       \-> ERROR (retryable)
 *
 * The button is a leaf widget. Parent (`<UpdateCeremonyTab />`) supplies:
 *   - `label`                — button copy.
 *   - `fetchIds`             — async returning the full list of target IDs
 *                              (e.g. shop_ids belonging to one SSU).
 *   - `buildChunkTx`         — pure (ids, tx) → Transaction that appends one
 *                              Move call per chunk.
 *   - `liveCount` (optional) — informational live row count; button disables
 *                              when `disabledWhenZero` AND count === 0.
 *
 * DappHub is EXEMPT — this calls `dAppKit.signAndExecuteTransaction` directly
 * (NOT the bazaar-app gated wrapper hook). Admin needs to drive the ceremony
 * without the Warning gate locking themselves out.
 */

import { useCallback, useState } from "react";
import { Transaction } from "@mysten/sui/transactions";
import { dAppKit } from "@evefrontier/dapp-kit";

const PAGE_SIZE = 100;

export type FetchIdsFn = () => Promise<string[]>;
export type BuildChunkTxFn = (ids: string[], tx: Transaction) => Transaction;

export interface DrainBatchButtonProps {
  label: string;
  fetchIds: FetchIdsFn;
  buildChunkTx: BuildChunkTxFn;
  /** When provided AND `disabledWhenZero`, button disables on count === 0. */
  liveCount?: number | null;
  disabledWhenZero?: boolean;
  /** Override the page size (default 100, matches Move-side MAX_BATCH_ROWS). */
  pageSize?: number;
  /** Called on every successful page sign — parent may refetch counts. */
  onPageSettled?: (digest: string, processedSoFar: number) => void;
}

type Phase = "idle" | "fetching" | "signing" | "done" | "error";

const ROOT_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.4rem",
};

const BTN_BASE: React.CSSProperties = {
  background: "rgba(204, 112, 0, 0.12)",
  border: "1px solid rgba(204, 112, 0, 0.6)",
  color: "#cc7000",
  padding: "0.45rem 0.9rem",
  fontFamily: "monospace",
  fontSize: "0.82rem",
  cursor: "pointer",
};

const BTN_DISABLED: React.CSSProperties = {
  ...BTN_BASE,
  opacity: 0.45,
  cursor: "not-allowed",
};

const PROGRESS_STYLE: React.CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.75rem",
  color: "rgba(255, 255, 255, 0.7)",
};

const ERROR_STYLE: React.CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.75rem",
  color: "#e55555",
};

export default function DrainBatchButton({
  label,
  fetchIds,
  buildChunkTx,
  liveCount,
  disabledWhenZero,
  pageSize = PAGE_SIZE,
  onPageSettled,
}: DrainBatchButtonProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<{ page: number; pages: number; processed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isCountZero = disabledWhenZero && liveCount === 0;
  const isBusy = phase === "fetching" || phase === "signing";
  const disabled = isBusy || isCountZero;

  const onClick = useCallback(async () => {
    setError(null);
    setProgress(null);
    setPhase("fetching");
    try {
      const ids = await fetchIds();
      if (ids.length === 0) {
        setPhase("done");
        setProgress({ page: 0, pages: 0, processed: 0 });
        return;
      }
      const pages = Math.ceil(ids.length / pageSize);
      setPhase("signing");
      let processed = 0;
      for (let p = 0; p < pages; p++) {
        const chunk = ids.slice(p * pageSize, (p + 1) * pageSize);
        const tx = new Transaction();
        buildChunkTx(chunk, tx);
        const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
        const digest = result.$kind === "Transaction"
          ? result.Transaction.digest
          : result.FailedTransaction.digest;
        processed += chunk.length;
        setProgress({ page: p + 1, pages, processed });
        onPageSettled?.(digest, processed);
      }
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, [fetchIds, buildChunkTx, pageSize, onPageSettled]);

  let progressText: string;
  if (phase === "fetching") progressText = "Fetching row IDs…";
  else if (phase === "signing" && progress) {
    progressText = `Page ${progress.page}/${progress.pages}: ${progress.processed} processed`;
  } else if (phase === "done" && progress) {
    progressText = progress.processed === 0
      ? "✓ No rows to drain."
      : `✓ Done: ${progress.processed} processed (${progress.pages} page${progress.pages === 1 ? "" : "s"})`;
  } else if (phase === "idle" && typeof liveCount === "number") {
    progressText = liveCount === 0
      ? "0 rows live."
      : `${liveCount} row${liveCount === 1 ? "" : "s"} live.`;
  } else {
    progressText = "";
  }

  return (
    <div style={ROOT_STYLE}>
      <button
        style={disabled ? BTN_DISABLED : BTN_BASE}
        onClick={onClick}
        disabled={disabled}
        aria-disabled={disabled}
      >
        {phase === "fetching" ? "Fetching…" :
         phase === "signing" ? "Signing…" :
         phase === "done" ? `${label} ✓` :
         label}
      </button>
      {progressText && <div style={PROGRESS_STYLE}>{progressText}</div>}
      {error && <div style={ERROR_STYLE}>Error: {error}</div>}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
