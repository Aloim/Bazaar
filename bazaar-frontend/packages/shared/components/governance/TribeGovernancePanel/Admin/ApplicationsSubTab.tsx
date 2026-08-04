// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * ApplicationsSubTab — per-tribe pending join-application review.
 *
 * Restores the OS-50 "applications" sub-tab as a tribe-scoped component:
 *   - Only tribe leaders can accept/reject (leaderCapId gate).
 *   - Admin/SuperAdmin tier users see the table READ-ONLY for situational awareness.
 *   - Uses buildAcceptApplication / buildRejectApplication (frozen DappHub builders).
 *   - Filters by tribeIdx so each leader sees only their tribe's queue.
 *
 * OS-50a: Applications restored as per-tribe sub-tab — AdminTab.tsx integration.
 * R6.6.4c-audit — FA-Audit-Fixes-B §4.
 */

import { useState, useMemo } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import { useRegistrationRequests, RegistrationRequest } from "@bazaar/shared/hooks/useRegistrationRequests";
import { useTribeRegistry } from "@bazaar/shared/hooks/useTribeRegistry";
import { useCharacterNames } from "@bazaar/shared/hooks/useCharacterNames";
import {
  buildAcceptApplication,
  buildRejectApplication,
} from "@bazaar/shared/tx";
import { resolveBootstrappedSSU, planRebootstrap } from "@bazaar/shared/hooks/bazaarcore/rebind-helpers";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ApplicationsSubTabProps {
  /** TribeLeaderCap object ID from useTribeCaps().leaderCapId. Null if caller lacks one. */
  leaderCapId: string | null;
  /** Tribe index from useTribeCaps().leaderTribeIdx. Null if caller lacks a leader cap. */
  tribeIdx: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function abbr(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}

// ── ApplicationsSubTab ────────────────────────────────────────────────────────

export function ApplicationsSubTab({ leaderCapId, tribeIdx }: ApplicationsSubTabProps) {
  const { requests, isLoading, error, refetch } = useRegistrationRequests(
    tribeIdx ?? undefined,
  );

  // Resolve tribe bazaarType for bootstrap threading (OS-54 SA C2).
  const { tribes } = useTribeRegistry();
  const bazaarType: 1 | 2 =
    tribeIdx !== null ? ((tribes[tribeIdx]?.bazaarType ?? 1) as 1 | 2) : 1;

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError,   setActionError]   = useState<string | null>(null);

  // Collect all applicant addresses for character name resolution.
  const applicantAddrs = useMemo(
    () => requests.map(r => r.applicant),
    [requests],
  );
  const charNames = useCharacterNames(applicantAddrs);

  // Only show PENDING applications, sorted newest-first.
  const pendingApps = useMemo(
    () =>
      requests
        .filter(r => r.status === 0)
        .slice()
        .sort((a, b) => b.submittedAtMs - a.submittedAtMs),
    [requests],
  );

  const canAct = leaderCapId !== null && tribeIdx !== null;
  const isBusy = actionLoading !== null;

  // ── Handlers ───────────────────────────────────────────────────────────────

  // SA C2: applicant address sourced from r.applicant (on-chain TribeApplication.applicant),
  // NOT from dAppKit.account.address (that is the tribe leader, not the applicant).
  async function acceptApp(app: RegistrationRequest): Promise<void> {
    if (!canAct || isBusy || !leaderCapId) return;
    const key = `accept-${app.id}`;
    setActionLoading(key);
    setActionError(null);
    try {
      // Re-registered SSUs must not re-bootstrap (BootstrappedKey persists) —
      // resolve whether to bootstrap, skip, or rebind before building the PTB.
      const shared = await resolveBootstrappedSSU(app.ssuId);
      const plan = await planRebootstrap({
        ssuId: app.ssuId,
        shared,
        targetBazaarType: bazaarType,
        targetTribeId: app.tribeId,
      });
      const tx = buildAcceptApplication(
        leaderCapId,
        app.id,
        app.applicant,   // SA C2: r.applicant, NOT dAppKit.account.address
        app.ssuId,
        bazaarType,
        app.tribeId,
        plan,
      );
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      refetch();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Transaction failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function rejectApp(appId: number): Promise<void> {
    if (!canAct || isBusy || !leaderCapId) return;
    const key = `reject-${appId}`;
    setActionLoading(key);
    setActionError(null);
    try {
      const tx = buildRejectApplication(leaderCapId, appId);
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      refetch();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Transaction failed");
    } finally {
      setActionLoading(null);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "0.75rem",
        }}
      >
        <h4 style={{ margin: 0 }}>Pending Join Applications</h4>
        <button
          className="btn btn--sm btn--ghost"
          disabled={isLoading}
          onClick={() => refetch()}
        >
          {isLoading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* Read-only notice for non-leader callers */}
      {!canAct && (
        <p
          className="muted"
          style={{ fontSize: "0.78rem", marginBottom: "0.5rem" }}
        >
          Only the tribe leader can accept or reject applications.
        </p>
      )}

      {/* Inline action error */}
      {actionError && (
        <p className="error-text" style={{ marginBottom: "0.5rem" }}>
          {actionError}
        </p>
      )}

      <div className="action-card">
        {isLoading && (
          <p className="muted">Loading applications…</p>
        )}

        {!isLoading && error && (
          <p className="error-text">{error}</p>
        )}

        {!isLoading && !error && pendingApps.length === 0 && (
          <p className="muted">No pending join applications.</p>
        )}

        {!isLoading && !error && pendingApps.length > 0 && (
          <table className="table" style={{ fontSize: "0.78rem", width: "100%" }}>
            <thead>
              <tr>
                <th>Applicant</th>
                <th>SSU</th>
                <th>Message</th>
                <th>Submitted</th>
                {canAct && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {pendingApps.map(app => {
                const charName    = charNames.get(app.applicant);
                const displayName = charName
                  ? `${charName} (${abbr(app.applicant)})`
                  : abbr(app.applicant);
                const submittedStr =
                  app.submittedAtMs > 0
                    ? new Date(app.submittedAtMs).toLocaleDateString()
                    : "Unknown";
                const acceptKey = `accept-${app.id}`;
                const rejectKey = `reject-${app.id}`;

                return (
                  <tr key={app.id}>
                    <td>
                      <span title={app.applicant}>{displayName}</span>
                    </td>
                    <td>
                      <span title={app.ssuId} className="muted">
                        {abbr(app.ssuId)}
                      </span>
                    </td>
                    <td>
                      <span title={app.message.length > 80 ? app.message : undefined}>
                        {truncate(app.message, 80)}
                      </span>
                    </td>
                    <td className="muted">{submittedStr}</td>
                    {canAct && (
                      <td>
                        <div style={{ display: "flex", gap: "0.3rem" }}>
                          <button
                            className="btn btn--primary btn--sm"
                            disabled={isBusy}
                            onClick={() => acceptApp(app)}
                          >
                            {actionLoading === acceptKey ? "…" : "Accept"}
                          </button>
                          <button
                            className="btn btn--danger btn--sm"
                            disabled={isBusy}
                            onClick={() => rejectApp(app.id)}
                          >
                            {actionLoading === rejectKey ? "…" : "Reject"}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
