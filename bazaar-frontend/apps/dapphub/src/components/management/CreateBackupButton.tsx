// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * UpdateCeremonyPlan v1 — CreateBackupButton (manual-CID flow).
 *
 * Per user direction 2026-05-19, the v1 backup-anchor flow is admin-driven:
 *   1. Admin pastes the snapshot JSON into the textarea.
 *   2. FE computes a live SHA-256 (Web Crypto SubtleCrypto.digest).
 *   3. Admin downloads the JSON via the Download button + uploads it to
 *      Pinata / IPFS Desktop / their own pinning service externally.
 *   4. Admin pastes the resulting IPFS CID + checkpoint + schema version
 *      + note back into the form.
 *   5. On Submit, FE builds + signs `post_anchor` via dAppKit.
 *
 * Zero external dependencies (no @pinata/sdk). The admin's IPFS pinning
 * workflow stays out-of-band, which mirrors how the rest of the plan
 * (Sui CLI publish, Phase D populate via deployer wallet) is admin-driven.
 *
 * Disabled until `drainAllZero` is true (Step 3 gate per plan §13 R-01).
 */

import { useCallback, useEffect, useState } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import { buildPostAnchor } from "@bazaar/shared/tx/dapp_hub/ceremony-tx";
import { generateSnapshot } from "@bazaar/shared/ceremony";
import type { SnapshotSummary } from "@bazaar/shared/ceremony";

export interface CreateBackupButtonProps {
  ownerCapId: string | null;
  /** When false, the form renders but the Sign button is disabled with a
   *  notice. Per plan §13 R-01 the admin can't anchor until drains are zero. */
  enabled: boolean;
  /** Called after a successful sign — parent typically triggers
   *  useAnchorRegistry.refetch(). */
  onAnchored?: (digest: string) => void;
}

const ROOT_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.55rem",
  fontFamily: "monospace",
  fontSize: "0.8rem",
};

const ROW_STYLE: React.CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  alignItems: "center",
};

const LABEL_STYLE: React.CSSProperties = {
  minWidth: "9rem",
  color: "rgba(255, 255, 255, 0.7)",
};

const INPUT_STYLE: React.CSSProperties = {
  flex: 1,
  background: "rgba(0, 0, 0, 0.4)",
  border: "1px solid rgba(255, 255, 255, 0.15)",
  color: "#e8e8e8",
  fontFamily: "monospace",
  padding: "0.3rem 0.5rem",
  fontSize: "0.78rem",
};

const TEXTAREA_STYLE: React.CSSProperties = {
  ...INPUT_STYLE,
  minHeight: "8rem",
  resize: "vertical",
  fontSize: "0.72rem",
};

const HASH_STYLE: React.CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.7rem",
  wordBreak: "break-all",
  opacity: 0.75,
};

const BTN_STYLE: React.CSSProperties = {
  background: "rgba(204, 112, 0, 0.15)",
  border: "1px solid rgba(204, 112, 0, 0.6)",
  color: "#cc7000",
  padding: "0.45rem 1rem",
  fontFamily: "monospace",
  fontSize: "0.82rem",
  cursor: "pointer",
};

const BTN_DISABLED: React.CSSProperties = { ...BTN_STYLE, opacity: 0.45, cursor: "not-allowed" };

const ERROR_STYLE: React.CSSProperties = {
  color: "#e55555",
  fontSize: "0.75rem",
};

const SUCCESS_STYLE: React.CSSProperties = {
  color: "#7fc97f",
  fontSize: "0.75rem",
};

async function sha256(text: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return new Uint8Array(buf);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function CreateBackupButton({
  ownerCapId,
  enabled,
  onAnchored,
}: CreateBackupButtonProps) {
  const [snapshotJson, setSnapshotJson] = useState<string>("");
  const [hash, setHash] = useState<Uint8Array>(new Uint8Array());
  const [hashing, setHashing] = useState(false);
  const [checkpoint, setCheckpoint] = useState<string>("");
  const [schemaVersion, setSchemaVersion] = useState<string>("v1.0");
  const [ipfsCid, setIpfsCid] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastDigest, setLastDigest] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SnapshotSummary | null>(null);

  // Walk live chain state → fill the snapshot JSON + checkpoint automatically.
  const generate = useCallback(async () => {
    setGenerating(true);
    setGenError(null);
    setSummary(null);
    try {
      const { snapshot, summary: sum } = await generateSnapshot();
      setSnapshotJson(JSON.stringify(snapshot, null, 2));
      setCheckpoint(snapshot.outgoingCheckpoint || "");
      setSummary(sum);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }, []);

  // Recompute hash whenever the snapshot text changes.
  useEffect(() => {
    let cancelled = false;
    if (!snapshotJson) {
      setHash(new Uint8Array());
      return;
    }
    setHashing(true);
    sha256(snapshotJson)
      .then((h) => {
        if (!cancelled) setHash(h);
      })
      .finally(() => {
        if (!cancelled) setHashing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [snapshotJson]);

  const downloadSnapshot = useCallback(() => {
    const blob = new Blob([snapshotJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bazaar-backup-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [snapshotJson]);

  const canSubmit =
    enabled &&
    !!ownerCapId &&
    snapshotJson.length > 0 &&
    hash.length === 32 &&
    /^\d+$/.test(checkpoint) &&
    BigInt(checkpoint || "0") > 0n &&
    schemaVersion.trim().length > 0 &&
    ipfsCid.trim().length > 0;

  const onSubmit = useCallback(async () => {
    if (!canSubmit || !ownerCapId) return;
    setSubmitting(true);
    setError(null);
    try {
      const tx = buildPostAnchor({
        ownerCapId,
        checkpoint: BigInt(checkpoint),
        hash,
        schemaVersion: schemaVersion.trim(),
        ipfsCid: ipfsCid.trim(),
        note: note,
      });
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      const digest = result.$kind === "Transaction"
        ? result.Transaction.digest
        : result.FailedTransaction.digest;
      setLastDigest(digest);
      onAnchored?.(digest);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, ownerCapId, checkpoint, hash, schemaVersion, ipfsCid, note, onAnchored]);

  const submitDisabled = !canSubmit || submitting;
  const hashHex = hash.length ? toHex(hash) : "";

  // Plain-language reason the Create Backup button is disabled (UX: the user hit this).
  let disabledReason = "";
  if (!submitting && !canSubmit) {
    if (!enabled) disabledReason = "all drains must report zero first (Step 2)";
    else if (!snapshotJson) disabledReason = "Generate snapshot from chain (or paste JSON) above";
    else if (hash.length !== 32) disabledReason = "computing snapshot hash…";
    else if (!/^\d+$/.test(checkpoint) || BigInt(checkpoint || "0") <= 0n) disabledReason = "set a checkpoint number";
    else if (!ipfsCid.trim()) disabledReason = "download + upload the JSON to IPFS, then paste the CID";
    else disabledReason = "fill all fields above";
  }

  return (
    <div style={ROOT_STYLE}>
      {!enabled && (
        <div style={{ color: "rgba(255, 215, 0, 0.85)", fontSize: "0.75rem" }}>
          Disabled until all drains report zero rows (Step 3 gate).
        </div>
      )}

      <div style={{ ...ROW_STYLE, flexWrap: "wrap" }}>
        <button style={generating ? BTN_DISABLED : BTN_STYLE} onClick={generate} disabled={generating}>
          {generating ? "Reading chain…" : "Generate snapshot from chain"}
        </button>
        <span style={{ fontSize: "0.72rem", opacity: 0.7 }}>
          Walks live state → fills the JSON + checkpoint below. Run during the Warning window.
        </span>
      </div>
      {genError && <span style={ERROR_STYLE}>Generate failed: {genError}</span>}
      {summary && (
        <div
          style={{
            fontSize: "0.72rem",
            border: "1px solid rgba(255,255,255,0.12)",
            padding: "0.4rem 0.6rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.15rem",
          }}
        >
          <span>
            Coverage: <strong>{summary.tribes}</strong> tribes · <strong>{summary.ssus}</strong> SSUs ·{" "}
            <strong>{summary.members}</strong> members · <strong>{summary.tokenHolders}</strong> token holders ·{" "}
            <strong>{summary.announcements}</strong> news · <strong>{summary.guestbookEntries}</strong> guestbook
          </span>
          <span>Total EVE captured: <strong>{summary.totalEveMist}</strong> mist</span>
          {summary.warnings.length > 0 && (
            <span style={{ color: "rgba(255, 215, 0, 0.85)" }}>
              ⚠ {summary.warnings.length} warning(s) — snapshot may have GAPS:
              <ul style={{ margin: "0.2rem 0 0", paddingLeft: "1rem" }}>
                {summary.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </span>
          )}
        </div>
      )}

      <div style={ROW_STYLE}>
        <span style={LABEL_STYLE}>Snapshot JSON</span>
      </div>
      <textarea
        style={TEXTAREA_STYLE}
        value={snapshotJson}
        onChange={(e) => setSnapshotJson(e.target.value)}
        placeholder='{ "shops": [...], "tribes": [...], "members": [...], ... }'
      />

      <div style={ROW_STYLE}>
        <span style={LABEL_STYLE}>SHA-256</span>
        <span style={HASH_STYLE}>
          {hashing ? "computing…" : (hashHex || "(empty)")}
        </span>
      </div>

      <div style={ROW_STYLE}>
        <button style={BTN_STYLE} onClick={downloadSnapshot} disabled={!snapshotJson}>
          Download snapshot JSON
        </button>
        <span style={{ fontSize: "0.72rem", opacity: 0.7 }}>
          → Upload externally to Pinata / IPFS Desktop, paste the CID below.
        </span>
      </div>

      <div style={ROW_STYLE}>
        <span style={LABEL_STYLE}>Checkpoint</span>
        <input
          style={INPUT_STYLE}
          value={checkpoint}
          onChange={(e) => setCheckpoint(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="Sui checkpoint number (e.g. 123456789)"
        />
      </div>

      <div style={ROW_STYLE}>
        <span style={LABEL_STYLE}>Schema version</span>
        <input
          style={INPUT_STYLE}
          value={schemaVersion}
          onChange={(e) => setSchemaVersion(e.target.value)}
        />
      </div>

      <div style={ROW_STYLE}>
        <span style={LABEL_STYLE}>IPFS CID</span>
        <input
          style={INPUT_STYLE}
          value={ipfsCid}
          onChange={(e) => setIpfsCid(e.target.value)}
          placeholder="Qm… or bafy…"
        />
      </div>

      <div style={ROW_STYLE}>
        <span style={LABEL_STYLE}>Note</span>
        <input
          style={INPUT_STYLE}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="(optional) human-readable label"
        />
      </div>

      <div style={ROW_STYLE}>
        <button
          style={submitDisabled ? BTN_DISABLED : BTN_STYLE}
          onClick={onSubmit}
          disabled={submitDisabled}
        >
          {submitting ? "Signing…" : "Create Backup (anchor snapshot)"}
        </button>
        {disabledReason && (
          <span style={{ fontSize: "0.72rem", opacity: 0.7 }}>← {disabledReason}</span>
        )}
        {lastDigest && (
          <span style={SUCCESS_STYLE}>✓ Anchored. Digest: {lastDigest.slice(0, 10)}…</span>
        )}
        {error && <span style={ERROR_STYLE}>Error: {error}</span>}
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
