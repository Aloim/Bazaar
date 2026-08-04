// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// src/components/WithdrawalRequestCard.tsx
// Renders a single WithdrawalRequest with vote / execute / cancel actions.
//
// V15 rewrite:
//   - All calls target the real Move ABI in bazaar_economy::vault_withdrawal:
//     approve_request / deny_request (TribeAdminCap)
//     execute_withdrawal / cancel_request (TribeLeaderCap)
//     expire_request (permissionless)
//   - Status enum corrected to match Move:
//     0=PENDING, 1=APPROVED, 2=EXECUTED, 3=CANCELLED, 4=EXPIRED, 5=DENIED
//   - `executableAfterMs` is derived in useVaultWithdrawals (approvedAtMs +
//     24h WAIT_PERIOD_MS), not read from chain.
//   - `cancellations` field removed (does not exist Move-side; cancel is a
//     direct leader-only action, not a vote).
//   - `request.id` is a board-internal u64 index (NOT a Sui object ID).

import { useState, useEffect } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import { useCharacterNames } from "@bazaar/shared/hooks/useCharacterNames";
import type { VaultWithdrawalRequest } from "@bazaar/shared/hooks/useVaultWithdrawals";
import {
  buildApproveWithdrawal,
  buildDenyWithdrawal,
  buildCancelWithdrawal,
  buildExecuteWithdrawal,
  buildExpireWithdrawal,
} from "@bazaar/shared/tx/bazaareconomy/withdrawal-tx";
import { COIN_DECIMALS } from "@bazaar/shared/constants";

const STATUS_LABEL: Record<number, string> = {
  0: "PENDING",
  1: "WAITING",
  2: "EXECUTED",
  3: "CANCELLED",
  4: "EXPIRED",
  5: "DENIED",
};

const STATUS_COLOR: Record<number, string> = {
  0: "var(--color-info, #2196f3)",
  1: "var(--color-warning, #ff9800)",
  2: "var(--color-success, #4caf50)",
  3: "var(--muted-color, #888)",
  4: "var(--muted-color, #888)",
  5: "var(--color-danger, #f44336)",
};

interface Props {
  request:           VaultWithdrawalRequest;
  walletAddress:     string;
  /** TribeGovernance shared object ID — required by every Move fn. */
  tribeGovernanceId: string;
  /** WithdrawalBoard shared object ID — required by every Move fn. */
  boardId:           string;
  /** TribeVault shared object ID — needed for FinanceEvent reserve snapshot. */
  vaultId:           string;
  /** TribeTokenLedger shared object ID — needed for FinanceEvent circulation. */
  ledgerId:          string;
  /** ExchangeConfig shared object ID — needed for execute_withdrawal reserve check. */
  configId:          string;
  /** TribeLeaderCap (cancel / execute, plus expire if available). Null if not held. */
  leaderCapId:       string | null;
  /** TribeAdminCap (approve / deny). Null if not held. */
  adminCapId:        string | null;
  onActionDone:      () => void;
}

function formatEveMist(mist: number): string {
  return (mist / COIN_DECIMALS).toLocaleString(undefined, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 9,
  }) + " EVE";
}

function formatTimestamp(ms: number): string {
  if (!ms) return "-";
  return new Date(ms).toLocaleString();
}

function useCountdown(targetMs: number): string {
  const [remaining, setRemaining] = useState(() => targetMs - Date.now());

  useEffect(() => {
    if (remaining <= 0) return;
    const interval = setInterval(() => {
      const r = targetMs - Date.now();
      setRemaining(r);
      if (r <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [targetMs, remaining]);

  if (remaining <= 0) return "Ready";
  const hours   = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  return `${hours}h ${minutes}m ${seconds}s`;
}

export default function WithdrawalRequestCard({
  request, walletAddress,
  tribeGovernanceId, boardId, vaultId, ledgerId, configId,
  leaderCapId, adminCapId,
  onActionDone,
}: Props) {
  const [loading, setLoading] = useState("");

  const allAddresses = [
    request.requester,
    ...request.approvals,
    ...request.denials,
  ];
  const characterNames = useCharacterNames([...new Set(allAddresses)]);

  const countdown = useCountdown(request.executableAfterMs);

  const hasVoted = (
    request.approvals.includes(walletAddress) ||
    request.denials.includes(walletAddress)
  );
  const canExecute =
    request.status === 1 &&
    request.executableAfterMs > 0 &&
    Date.now() >= request.executableAfterMs;
  const isExpired =
    request.status === 0 &&
    request.expiresAtMs > 0 &&
    Date.now() >= request.expiresAtMs;

  const canVote   = !!adminCapId && request.status === 0;
  const canCancel = !!leaderCapId && (request.status === 0 || request.status === 1);
  const canFinish = !!leaderCapId && request.status === 1;

  async function handleVote(approve: boolean) {
    if (!adminCapId) return;
    const key = approve ? "approve" : "deny";
    setLoading(key);
    try {
      const tx = approve
        ? buildApproveWithdrawal({
            adminCapId, tribeGovernanceId, boardId, vaultId, ledgerId,
            requestId: request.id,
          })
        : buildDenyWithdrawal({
            adminCapId, tribeGovernanceId, boardId, vaultId, ledgerId,
            requestId: request.id,
          });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      onActionDone();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Transaction failed");
    } finally {
      setLoading("");
    }
  }

  async function handleCancel() {
    if (!leaderCapId) return;
    setLoading("cancel");
    try {
      const tx = buildCancelWithdrawal({
        leaderCapId, tribeGovernanceId, boardId, vaultId, ledgerId,
        requestId: request.id,
      });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      onActionDone();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Transaction failed");
    } finally {
      setLoading("");
    }
  }

  async function handleExecute() {
    if (!leaderCapId) return;
    setLoading("execute");
    try {
      const tx = buildExecuteWithdrawal({
        leaderCapId, tribeGovernanceId, boardId, vaultId, configId, ledgerId,
        requestId: request.id,
      });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      onActionDone();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Transaction failed");
    } finally {
      setLoading("");
    }
  }

  async function handleExpire() {
    setLoading("expire");
    try {
      const tx = buildExpireWithdrawal({
        tribeGovernanceId, boardId, vaultId, ledgerId, requestId: request.id,
      });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      onActionDone();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Transaction failed");
    } finally {
      setLoading("");
    }
  }

  const requesterName = characterNames.get(request.requester);

  function displayName(addr: string): string {
    return characterNames.get(addr) ?? addr.slice(0, 8) + "..." + addr.slice(-4);
  }

  return (
    <div className="action-card" style={{ marginBottom: "0.75rem", borderLeft: `3px solid ${STATUS_COLOR[request.status] ?? "#888"}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
        <span style={{ fontWeight: "bold" }}>
          {formatEveMist(request.amountMist)}
        </span>
        <span style={{
          fontSize: "0.75rem",
          fontWeight: "bold",
          color: STATUS_COLOR[request.status] ?? "#888",
          background: "rgba(0,0,0,0.2)",
          padding: "0.1rem 0.4rem",
          borderRadius: "3px",
        }}>
          {STATUS_LABEL[request.status] ?? `STATUS:${request.status}`}
        </span>
      </div>

      <p className="muted" style={{ fontSize: "0.8rem", marginBottom: "0.25rem" }}>
        Requested by: {requesterName ? (
          <span>{requesterName} <span className="muted">({request.requester.slice(0, 8)}...)</span></span>
        ) : (
          <span>{request.requester.slice(0, 12)}...</span>
        )}
      </p>

      {request.reason && (
        <p style={{ fontSize: "0.85rem", margin: "0.25rem 0 0.5rem", fontStyle: "italic" }}>
          "{request.reason}"
        </p>
      )}

      <div style={{ display: "flex", gap: "1.5rem", fontSize: "0.75rem", color: "var(--muted-color, #888)", marginBottom: "0.5rem" }}>
        <span>Created: {formatTimestamp(request.createdAtMs)}</span>
        <span>Expires: {formatTimestamp(request.expiresAtMs)}</span>
        {request.status === 1 && (
          <span>Executable: {formatTimestamp(request.executableAfterMs)}</span>
        )}
      </div>

      <div style={{ fontSize: "0.8rem", marginBottom: "0.5rem" }}>
        <span style={{ marginRight: "1rem" }}>
          Required approvals: {request.requiredApprovals}
        </span>
        <span style={{ color: "var(--color-success, #4caf50)", marginRight: "0.75rem" }}>
          Approved ({request.approvals.length}): {request.approvals.map(displayName).join(", ") || "—"}
        </span>
        {request.denials.length > 0 && (
          <span style={{ color: "var(--color-danger, #f44336)", marginRight: "0.75rem" }}>
            Denied ({request.denials.length}): {request.denials.map(displayName).join(", ")}
          </span>
        )}
      </div>

      {request.status === 1 && (
        <p style={{ fontSize: "0.8rem", marginBottom: "0.5rem" }}>
          {canExecute ? (
            <span style={{ color: "var(--color-success, #4caf50)", fontWeight: "bold" }}>
              Waiting period complete — execution available.
            </span>
          ) : (
            <span className="muted">
              Waiting period: {countdown} remaining
            </span>
          )}
        </p>
      )}

      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
        {canVote && !hasVoted && (
          <>
            <button className="btn btn--primary btn--sm" disabled={!!loading} onClick={() => handleVote(true)}>
              {loading === "approve" ? "Approving..." : "Approve"}
            </button>
            <button className="btn btn--danger btn--sm" disabled={!!loading} onClick={() => handleVote(false)}>
              {loading === "deny" ? "Denying..." : "Deny"}
            </button>
          </>
        )}
        {canVote && hasVoted && (
          <span className="muted" style={{ fontSize: "0.8rem", alignSelf: "center" }}>You have voted.</span>
        )}
        {canCancel && (
          <button className="btn btn--outline btn--sm" disabled={!!loading} onClick={handleCancel}>
            {loading === "cancel" ? "Cancelling..." : "Cancel Request"}
          </button>
        )}
        {canFinish && (
          <button
            className="btn btn--primary btn--sm"
            disabled={!!loading || !canExecute}
            title={!canExecute ? `Wait: ${countdown}` : "Execute withdrawal"}
            onClick={handleExecute}
          >
            {loading === "execute" ? "Executing..." : canExecute ? "Execute Withdrawal" : `Execute (${countdown})`}
          </button>
        )}
        {isExpired && (
          <button className="btn btn--ghost btn--sm" disabled={!!loading} onClick={handleExpire}>
            {loading === "expire" ? "Marking..." : "Mark Expired"}
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
