// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * UpdateCeremonyPlan v1 — top-level UpdateCeremonyTab.
 *
 * 7-step ceremony timeline (plan §10):
 *   Step 1 — Post Warning Announcement
 *   Step 2 — Confirm pre-snapshot drains (live counts + the trade-proposal
 *            batch button; per-SSU shop / pool / tribe drains documented as
 *            CLI-driven in v1, FE-driven in v1.1)
 *   Step 3 — Create Backup  (gated until all drain counts are zero)
 *   Step 4 — Publish incoming version (CLI — informational only)
 *   Step 5 — Populate ReclaimRegistry  (v2-only inert placeholder)
 *   Step 6 — Clear Warning Announcement
 *   Step 7 — Optional housekeeping (prune expired announcements)
 *
 * Mounted as the 7th tab under DAppManagementPanel.
 *
 * DappHub-EXEMPT: this file calls `dAppKit.signAndExecuteTransaction` directly
 * (no gated-wrapper hook — admin must operate during the Warning window).
 */

import { useCallback, useEffect, useState } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { SHARED_OBJECTS, DAPP_ANNOUNCEMENTS_ID, reclaimEnabled } from "@bazaar/shared/constants";
import { suiClient } from "@bazaar/shared/hooks/sui-client";
import {
  buildPostAnnouncement,
  buildClearAnnouncement,
  buildPruneAnnouncements,
} from "@bazaar/shared/tx/dapp_hub/ceremony-tx";
import { buildCancelTradeProposalsBatch } from "@bazaar/shared/tx/bazaarcore/admin-drain-tx";
import { useDAppAnnouncements } from "@bazaar/shared/hooks/announcements";
import type { Announcement } from "@bazaar/shared/types/announcement";
import {
  useActiveShopCountSummary,
  useActiveMissionCountSummary,
  useProposalCountSummary,
} from "@bazaar/shared/hooks/ceremony";
import CeremonyStepCard from "./CeremonyStepCard";
import DrainBatchButton from "./DrainBatchButton";
import Step2ForceCloseEverything from "./Step2ForceCloseEverything";
import CreateBackupButton from "./CreateBackupButton";
import BackupHistoryList from "./BackupHistoryList";
import PopulateBackupButton from "./PopulateBackupButton";

interface Props {
  ownerCapId: string | null;
}

const SECTION_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.6rem",
  fontFamily: "monospace",
  fontSize: "0.85rem",
};

const INPUT_STYLE: React.CSSProperties = {
  background: "rgba(0, 0, 0, 0.4)",
  border: "1px solid rgba(255, 255, 255, 0.15)",
  color: "#e8e8e8",
  fontFamily: "monospace",
  padding: "0.3rem 0.5rem",
  fontSize: "0.78rem",
  width: "100%",
  boxSizing: "border-box",
};

const TEXTAREA_STYLE: React.CSSProperties = {
  ...INPUT_STYLE,
  minHeight: "5rem",
  resize: "vertical",
  fontSize: "0.72rem",
};

const BTN_STYLE: React.CSSProperties = {
  background: "rgba(204, 112, 0, 0.15)",
  border: "1px solid rgba(204, 112, 0, 0.6)",
  color: "#cc7000",
  padding: "0.35rem 0.85rem",
  fontFamily: "monospace",
  fontSize: "0.78rem",
  cursor: "pointer",
  alignSelf: "flex-start",
};

const ERR_STYLE: React.CSSProperties = { color: "#e55555", fontSize: "0.75rem" };
const OK_STYLE: React.CSSProperties = { color: "#7fc97f", fontSize: "0.75rem" };

const ROW_STYLE: React.CSSProperties = { display: "flex", gap: "0.5rem", alignItems: "center" };

function shortDigest(d: string): string {
  return d ? `${d.slice(0, 10)}…` : "";
}

// ─── Step 1: post Warning ────────────────────────────────────────────────────

function Step1PostWarning({ ownerCapId, onPosted }: { ownerCapId: string; onPosted: () => void }) {
  const [title, setTitle] = useState("Update ceremony in progress");
  const [body, setBody] = useState(
    "Bazaar actions are temporarily disabled while admin runs the Update Ceremony backup + republish. Expected duration ~45 min.",
  );
  const [showUntilMinFromNow, setShowUntilMin] = useState<string>("60");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastDigest, setLastDigest] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const now = Date.now();
      const until = now + Number(showUntilMinFromNow || "0") * 60_000;
      const tx = buildPostAnnouncement({
        ownerCapId,
        tier: 1,
        title,
        body,
        showFromMs: now,
        showUntilMs: until,
      });
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      const digest = result.$kind === "Transaction"
        ? result.Transaction.digest
        : result.FailedTransaction.digest;
      setLastDigest(digest);
      onPosted();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }, [ownerCapId, title, body, showUntilMinFromNow, onPosted]);

  return (
    <div style={SECTION_STYLE}>
      <input style={INPUT_STYLE} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
      <textarea style={TEXTAREA_STYLE} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Body" />
      <div style={ROW_STYLE}>
        <span>Show for (minutes):</span>
        <input
          style={{ ...INPUT_STYLE, width: "6rem" }}
          value={showUntilMinFromNow}
          onChange={(e) => setShowUntilMin(e.target.value.replace(/[^0-9]/g, ""))}
        />
      </div>
      <button style={BTN_STYLE} onClick={submit} disabled={submitting || !title.trim()}>
        {submitting ? "Signing…" : "Post Warning announcement"}
      </button>
      {lastDigest && <span style={OK_STYLE}>✓ Posted ({shortDigest(lastDigest)})</span>}
      {error && <span style={ERR_STYLE}>Error: {error}</span>}
    </div>
  );
}

// ─── Step 2: drain confirmation ─────────────────────────────────────────────

function Step2Drains({ ownerCapId }: { ownerCapId: string }) {
  const shops = useActiveShopCountSummary();
  const missions = useActiveMissionCountSummary();
  const proposals = useProposalCountSummary();

  // Fetch all open trade-proposal IDs from the TradeRegistry.proposals table.
  const fetchProposalIds = useCallback(async (): Promise<string[]> => {
    const reg = await suiClient.getObject({
      id: SHARED_OBJECTS.TRADE_REGISTRY,
      options: { showContent: true },
    });
    const content = reg.data?.content as { fields?: Record<string, unknown> } | undefined;
    const proposalsField = content?.fields?.proposals as { fields?: { id?: { id?: string } } } | undefined;
    const tableUid = proposalsField?.fields?.id?.id;
    if (!tableUid) return [];
    const ids: string[] = [];
    let cursor: string | null = null;
    while (true) {
      const page: { data: Array<{ name: { value?: unknown } }>; nextCursor: string | null; hasNextPage: boolean } =
        await suiClient.getDynamicFields({ parentId: tableUid, cursor, limit: 200 });
      for (const df of page.data) {
        const v = df.name.value as string | undefined;
        if (v) ids.push(v);
      }
      if (!page.hasNextPage || !page.nextCursor) break;
      cursor = page.nextCursor;
    }
    return ids;
  }, []);

  const buildProposalChunkTx = useCallback(
    (ids: string[], tx: Transaction) =>
      buildCancelTradeProposalsBatch(
        { ownerCapId, proposalIds: ids },
        tx,
      ),
    [ownerCapId],
  );

  return (
    <div style={SECTION_STYLE}>
      <div style={{ opacity: 0.8 }}>
        Live counts (15s refresh):
        <ul style={{ margin: "0.3rem 0 0", paddingLeft: "1rem" }}>
          <li>
            Active shops (shops_by_ssu): <strong>{shops.count}{shops.atLeast ? "+" : ""}</strong>
            {shops.isLoading && " (loading…)"}
          </li>
          <li>
            Active missions (missions_by_ssu): <strong>{missions.count}{missions.atLeast ? "+" : ""}</strong>
            {missions.isLoading && " (loading…)"}
          </li>
          <li>
            Open trade proposals in TradeRegistry: <strong>{proposals.count}{proposals.atLeast ? "+" : ""}</strong>
            {proposals.isLoading && " (loading…)"}
          </li>
        </ul>
      </div>

      <DrainBatchButton
        label="Cancel all trade proposals (singleton)"
        fetchIds={fetchProposalIds}
        buildChunkTx={buildProposalChunkTx}
        liveCount={proposals.count}
        disabledWhenZero
        onPageSettled={() => proposals.refetch()}
      />

      <div style={{ fontSize: "0.72rem", opacity: 0.7, marginTop: "0.4rem" }}>
        V34 admin force-close (DAppOwnerCap): <code>close_all_shops_batch</code> with
        <code> allow_ssu_owner=true</code> closes EVERY shop incl. SSU-owner-owned
        (items → owner Player Locker), and <code>mission_admin_drain</code> +
        <code> mission_ledger_ops</code> force-cancel missions (collateral 100% → takers,
        reward → giver). The enumeration below groups the work per-(SSU,owner) and
        per-mission — each row is one PTB-shaped unit that resolves its own Character +
        shared objects, so you can drive every drain from here (the cascade runbook / Sui
        CLI is no longer required). Counts above are ACTIVE-only.
      </div>

      <Step2ForceCloseEverything ownerCapId={ownerCapId} />
    </div>
  );
}

// ─── Step 6: clear active warnings ──────────────────────────────────────────

function Step6ClearWarnings({
  ownerCapId,
  announcements,
  onCleared,
}: {
  ownerCapId: string;
  announcements: Announcement[];
  onCleared: () => void;
}) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeWarnings = announcements.filter((a) => a.tier === 1);
  const clear = useCallback(async (id: number) => {
    setBusyId(id);
    setError(null);
    try {
      const tx = buildClearAnnouncement({ ownerCapId, id });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      onCleared();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }, [ownerCapId, onCleared]);

  if (activeWarnings.length === 0) {
    return <div style={{ opacity: 0.6, fontSize: "0.75rem" }}>No Warning rows currently active.</div>;
  }
  return (
    <div style={SECTION_STYLE}>
      {activeWarnings.map((a) => (
        <div key={a.id} style={{ ...ROW_STYLE, alignItems: "flex-start", flexDirection: "column" }}>
          <div style={{ fontWeight: 600 }}>#{a.id} — {a.title}</div>
          <button
            style={BTN_STYLE}
            onClick={() => clear(a.id)}
            disabled={busyId === a.id}
          >
            {busyId === a.id ? "Signing…" : "Clear"}
          </button>
        </div>
      ))}
      {error && <span style={ERR_STYLE}>Error: {error}</span>}
    </div>
  );
}

// ─── Step 7: prune expired ──────────────────────────────────────────────────

function Step7Prune({ ownerCapId, onPruned }: { ownerCapId: string; onPruned: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastDigest, setLastDigest] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const tx = buildPruneAnnouncements({ ownerCapId });
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      const digest = result.$kind === "Transaction"
        ? result.Transaction.digest
        : result.FailedTransaction.digest;
      setLastDigest(digest);
      onPruned();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }, [ownerCapId, onPruned]);

  return (
    <div style={SECTION_STYLE}>
      <button style={BTN_STYLE} onClick={submit} disabled={submitting}>
        {submitting ? "Signing…" : "Prune expired announcements"}
      </button>
      {lastDigest && <span style={OK_STYLE}>✓ Pruned ({shortDigest(lastDigest)})</span>}
      {error && <span style={ERR_STYLE}>Error: {error}</span>}
    </div>
  );
}

// ─── Top-level orchestrator ─────────────────────────────────────────────────

export default function UpdateCeremonyTab({ ownerCapId }: Props) {
  const { announcements, refetch } = useDAppAnnouncements();
  const shops = useActiveShopCountSummary();
  const missions = useActiveMissionCountSummary();
  const proposals = useProposalCountSummary();

  // Drains-all-zero gate — ACTIVE shop + mission + proposal counts must all be
  // exactly zero (and not a capped lower bound). The active-only counts come
  // from the per-SSU vectors (shops_by_ssu / missions_by_ssu); the flat tables
  // retain inactive rows and would never reach zero.
  const drainAllZero =
    shops.count === 0 && !shops.atLeast &&
    missions.count === 0 && !missions.atLeast &&
    proposals.count === 0 && !proposals.atLeast;

  // Re-poll announcements after any local action.
  const [actionTick, setActionTick] = useState(0);
  const bumpAction = useCallback(() => {
    setActionTick((t) => t + 1);
    refetch();
  }, [refetch]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { /* deps marker for actionTick */ }, [actionTick]);

  if (!ownerCapId) {
    return (
      <div style={{ padding: "1rem", fontStyle: "italic", opacity: 0.7 }}>
        Connect with a DAppOwnerCap to drive the ceremony.
      </div>
    );
  }

  return (
    <div style={{ padding: "0.5rem 0.5rem 2rem", display: "flex", flexDirection: "column", gap: "0.4rem", flex: 1, minHeight: 0, overflowY: "auto" }}>
      <div style={{ opacity: 0.75, fontSize: "0.8rem", marginBottom: "0.4rem" }}>
        Update Ceremony — drives the 7-step timeline from `UpdateCeremonyPlan.md` §10.
        DappHub is EXEMPT from the Warning action-lock, so admin can run every
        step while bazaar apps are blocked.
      </div>

      <CeremonyStepCard step={1} title="Post Warning Announcement">
        <Step1PostWarning ownerCapId={ownerCapId} onPosted={bumpAction} />
      </CeremonyStepCard>

      <CeremonyStepCard step={2} title="Confirm pre-snapshot drains">
        <Step2Drains ownerCapId={ownerCapId} />
      </CeremonyStepCard>

      <CeremonyStepCard
        step={3}
        title="Create Backup"
        gatedNotice={drainAllZero ? null : "Disabled until all drains report zero rows (live counts above)."}
      >
        <CreateBackupButton
          ownerCapId={ownerCapId}
          enabled={drainAllZero}
          onAnchored={bumpAction}
        />
      </CeremonyStepCard>

      <CeremonyStepCard step={4} title="Publish incoming version (CLI)">
        <div style={{ fontSize: "0.78rem", opacity: 0.75 }}>
          Informational only — run <code>sui client upgrade</code> via the deployer wallet
          for the v1 outgoing-additive case. v2's incoming-version fresh publish runs
          <code> sui client publish</code> on the new package set.
        </div>
      </CeremonyStepCard>

      <CeremonyStepCard
        step={5}
        title="Populate ReclaimRegistry"
        inert={!reclaimEnabled()}
        gatedNotice={
          reclaimEnabled()
            ? null
            : "Dormant on this version — activates after the V38 fresh-publish cascade sets VITE_RECLAIM_REGISTRY_ID."
        }
      >
        <PopulateBackupButton ownerCapId={ownerCapId} />
      </CeremonyStepCard>

      <CeremonyStepCard step={6} title="Clear Warning Announcement">
        <Step6ClearWarnings
          ownerCapId={ownerCapId}
          announcements={announcements}
          onCleared={bumpAction}
        />
      </CeremonyStepCard>

      <CeremonyStepCard step={7} title="Optional housekeeping">
        <Step7Prune ownerCapId={ownerCapId} onPruned={bumpAction} />
      </CeremonyStepCard>

      <div style={{ marginTop: "1rem" }}>
        <BackupHistoryList />
      </div>

      {/* Anchor object configuration sanity check */}
      {!DAPP_ANNOUNCEMENTS_ID && (
        <div style={{ ...ERR_STYLE, marginTop: "0.5rem" }}>
          VITE_DAPP_ANNOUNCEMENTS_ID is empty — run init_v1_ceremony_objects
          + populate .env before announcement entries will work.
        </div>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
