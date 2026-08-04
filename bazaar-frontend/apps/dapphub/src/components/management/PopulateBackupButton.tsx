// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * Update Ceremony V2 — Phase 2 (Slice 4): Populate ReclaimRegistry admin tool.
 *
 * Step 5 of the ceremony, post-V38-publish: read a verified pre-publish backup,
 * BCS-encode one record per SSU + per tribe, and batch them through
 * `dapp_hub::reclaim_registry::populate_reclaim_registry` (paged, DAppOwnerCap).
 *
 * Flow: pick the anchored backup → load + verify the snapshot JSON (SHA-256 must
 * match the on-chain anchor row) → review the derived records (+ any gaps) →
 * populate in pages → count-verify.
 *
 * SHIPS DORMANT on V37: when `reclaimEnabled()` is false (empty
 * `VITE_RECLAIM_REGISTRY_ID`) this renders an inert notice and builds NO PTB.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import { reclaimEnabled, RECLAIM_REGISTRY_ID } from "@bazaar/shared/constants";
import { useAnchorRegistry } from "@bazaar/shared/hooks/ceremony";
import type { AnchorRow } from "@bazaar/shared/hooks/ceremony";
import {
  loadSnapshotJson,
  verifyAgainstAnchorHash,
  deriveSnapshotGaps,
  toHex,
} from "@bazaar/shared/ceremony/reclaim/deserializer";
import type { LoadedSnapshot } from "@bazaar/shared/ceremony/reclaim/deserializer";
import { snapshotToReclaimRecords } from "@bazaar/shared/ceremony/reclaim/payloads";
import type { SnapshotRecordsResult } from "@bazaar/shared/ceremony/reclaim/payloads";
import {
  buildPopulateReclaimRegistryPages,
  RECLAIM_POPULATE_PAGE_SIZE,
} from "@bazaar/shared/tx/dapp_hub/ceremony-populate-tx";

interface Props {
  ownerCapId: string | null;
}

const ROOT: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: "0.55rem",
  fontFamily: "monospace", fontSize: "0.8rem",
};
const ROW: React.CSSProperties = { display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" };
const LABEL: React.CSSProperties = { minWidth: "9rem", color: "rgba(255,255,255,0.7)" };
const INPUT: React.CSSProperties = {
  flex: 1, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.15)",
  color: "#e8e8e8", fontFamily: "monospace", padding: "0.3rem 0.5rem", fontSize: "0.78rem",
};
const TEXTAREA: React.CSSProperties = { ...INPUT, minHeight: "7rem", resize: "vertical", fontSize: "0.72rem" };
const BTN: React.CSSProperties = {
  background: "rgba(204,112,0,0.15)", border: "1px solid rgba(204,112,0,0.6)",
  color: "#cc7000", padding: "0.45rem 1rem", fontFamily: "monospace", fontSize: "0.82rem", cursor: "pointer",
};
const BTN_OFF: React.CSSProperties = { ...BTN, opacity: 0.45, cursor: "not-allowed" };
const ERR: React.CSSProperties = { color: "#e55555", fontSize: "0.75rem" };
const OK: React.CSSProperties = { color: "#7fc97f", fontSize: "0.75rem" };
const WARN: React.CSSProperties = { color: "rgba(255,215,0,0.85)", fontSize: "0.74rem" };
const MUTED: React.CSSProperties = { fontSize: "0.72rem", opacity: 0.7 };
const HASH: React.CSSProperties = { fontFamily: "monospace", fontSize: "0.68rem", wordBreak: "break-all", opacity: 0.8 };

const NOTE: React.CSSProperties = { marginTop: "0.4rem", fontSize: "0.72rem", fontStyle: "italic", opacity: 0.6 };

interface PageStatus { index: number; rows: number; digest?: string; error?: string }

export default function PopulateBackupButton({ ownerCapId }: Props) {
  // ── Dormant on V37 (no ReclaimRegistry object) ─────────────────────────────
  if (!reclaimEnabled()) {
    return (
      <div>
        <button style={BTN_OFF} disabled aria-disabled="true">
          Populate ReclaimRegistry (inactive)
        </button>
        <div style={NOTE}>
          Activates only after the V38 fresh-publish cascade creates the
          ReclaimRegistry and sets <code>VITE_RECLAIM_REGISTRY_ID</code>. On the
          current live version there is no registry to populate — this step is dormant.
        </div>
      </div>
    );
  }
  return <PopulateTool ownerCapId={ownerCapId} />;
}

function PopulateTool({ ownerCapId }: Props) {
  const { anchors, isLoading, error: anchorError, refetch } = useAnchorRegistry();
  const [anchorId, setAnchorId] = useState<number | "">("");
  const [rawJson, setRawJson] = useState("");
  const [loaded, setLoaded] = useState<LoadedSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [records, setRecords] = useState<SnapshotRecordsResult | null>(null);
  const [gaps, setGaps] = useState<string[]>([]);
  const [ackGaps, setAckGaps] = useState(false);
  const [populating, setPopulating] = useState(false);
  const [pages, setPages] = useState<PageStatus[]>([]);
  const [runError, setRunError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedAnchor = useMemo<AnchorRow | null>(
    () => anchors.find((a) => a.id === anchorId) ?? null,
    [anchors, anchorId],
  );
  const verified = !!(loaded && selectedAnchor && verifyAgainstAnchorHash(loaded, selectedAnchor.hash));

  const resetDerived = () => {
    setLoaded(null); setRecords(null); setGaps([]); setAckGaps(false);
    setPages([]); setRunError(null); setDone(false);
  };

  const onPickFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    resetDerived();
    try {
      const text = await file.text();
      setRawJson(text);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const loadAndVerify = useCallback(async () => {
    resetDerived();
    setLoadError(null);
    try {
      const ld = await loadSnapshotJson(rawJson);
      setLoaded(ld);
      setRecords(snapshotToReclaimRecords(ld.snapshot));
      setGaps(deriveSnapshotGaps(ld.snapshot));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, [rawJson]);

  const canPopulate =
    !!ownerCapId && verified && !!records && records.records.length > 0 &&
    (gaps.length === 0 || ackGaps) && !populating;

  const populate = useCallback(async () => {
    if (!canPopulate || !ownerCapId || !records || selectedAnchor == null) return;
    setPopulating(true); setRunError(null); setDone(false);
    const built = buildPopulateReclaimRegistryPages(records.records, {
      ownerCapId,
      backupAnchorId: selectedAnchor.id,
      reclaimRegistryId: RECLAIM_REGISTRY_ID,
    });
    setPages(built.map((p) => ({ index: p.index, rows: p.rows.length })));
    try {
      for (const page of built) {
        const result = await dAppKit.signAndExecuteTransaction({ transaction: page.tx });
        const digest = result.$kind === "Transaction"
          ? result.Transaction.digest
          : result.FailedTransaction.digest;
        setPages((prev) => prev.map((p) => (p.index === page.index ? { ...p, digest } : p)));
        if (result.$kind !== "Transaction") {
          throw new Error(`Page ${page.index + 1} failed (digest ${digest.slice(0, 10)}…)`);
        }
      }
      setDone(true);
      refetch();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
      setPages((prev) => prev.map((p) => (p.digest ? p : { ...p, error: "not signed / aborted" })));
    } finally {
      setPopulating(false);
    }
  }, [canPopulate, ownerCapId, records, selectedAnchor, refetch]);

  const totalRecords = records?.records.length ?? 0;
  const pageCount = Math.ceil(totalRecords / RECLAIM_POPULATE_PAGE_SIZE);
  const signedPages = pages.filter((p) => p.digest && !p.error).length;

  let disabledReason = "";
  if (!populating && !canPopulate) {
    if (!ownerCapId) disabledReason = "connect with the DAppOwnerCap";
    else if (!loaded) disabledReason = "load + verify a snapshot JSON";
    else if (!verified) disabledReason = "snapshot hash does not match the selected anchor";
    else if (totalRecords === 0) disabledReason = "snapshot yields no records";
    else if (gaps.length > 0 && !ackGaps) disabledReason = "acknowledge the gaps to proceed";
  }

  return (
    <div style={ROOT}>
      {/* 1 — pick the anchored backup */}
      <div style={ROW}>
        <span style={LABEL}>Anchored backup</span>
        <select
          style={{ ...INPUT, flex: 1 }}
          value={anchorId === "" ? "" : String(anchorId)}
          onChange={(e) => { setAnchorId(e.target.value === "" ? "" : Number(e.target.value)); resetDerived(); }}
        >
          <option value="">— select a backup anchor —</option>
          {anchors.map((a) => (
            <option key={a.id} value={a.id}>
              #{a.id} · cp {a.checkpoint} · {a.schemaVersion || "?"} · {a.note || a.ipfsCid.slice(0, 10) || "(no note)"}
            </option>
          ))}
        </select>
        <button style={{ ...BTN, padding: "0.3rem 0.6rem", fontSize: "0.72rem" }} onClick={refetch}>↻</button>
      </div>
      {isLoading && <span style={MUTED}>loading anchors…</span>}
      {anchorError && <span style={ERR}>Anchor load error: {anchorError}</span>}
      {selectedAnchor && (
        <div style={HASH}>anchor hash: {toHex(selectedAnchor.hash) || "(none)"}</div>
      )}

      {/* 2 — load the snapshot JSON (the SAME file anchored at backup time) */}
      <div style={ROW}>
        <span style={LABEL}>Snapshot JSON</span>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={(e) => onPickFile(e.target.files?.[0])}
        />
        <button style={{ ...BTN, padding: "0.3rem 0.7rem", fontSize: "0.74rem" }} onClick={() => fileRef.current?.click()}>
          Upload file
        </button>
        <span style={MUTED}>Must be the exact file you anchored (hash must match).</span>
      </div>
      <textarea
        style={TEXTAREA}
        value={rawJson}
        onChange={(e) => { setRawJson(e.target.value); resetDerived(); }}
        placeholder='Paste or upload the backup JSON ({ "schemaVersion": "v2.0", ... })'
      />
      <div style={ROW}>
        <button style={rawJson ? BTN : BTN_OFF} onClick={loadAndVerify} disabled={!rawJson}>
          Load + verify
        </button>
        {loaded && (
          <span style={verified ? OK : ERR}>
            {verified ? "✓ hash matches the selected anchor" : "✗ hash MISMATCH (wrong file or anchor)"}
          </span>
        )}
      </div>
      {loadError && <span style={ERR}>Load error: {loadError}</span>}
      {loaded && <div style={HASH}>computed hash: {loaded.hashHex}</div>}

      {/* 3 — review derived records + gaps */}
      {records && (
        <div style={{ ...ROW, flexDirection: "column", alignItems: "flex-start", gap: "0.2rem", border: "1px solid rgba(255,255,255,0.12)", padding: "0.4rem 0.6rem" }}>
          <span>
            Records: <strong>{records.tribeCount}</strong> tribe + <strong>{records.ssuCount}</strong> SSU
            {" "}= <strong>{totalRecords}</strong> across <strong>{pageCount}</strong> page(s) of ≤{RECLAIM_POPULATE_PAGE_SIZE}.
          </span>
          {records.skipped.length > 0 && (
            <span style={WARN}>
              ⚠ {records.skipped.length} row(s) skipped:
              <ul style={{ margin: "0.2rem 0 0", paddingLeft: "1rem" }}>
                {records.skipped.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </span>
          )}
        </div>
      )}
      {gaps.length > 0 && (
        <div style={{ ...WARN, border: "1px solid rgba(255,215,0,0.3)", padding: "0.4rem 0.6rem" }}>
          ⚠ {gaps.length} completeness gap(s) — the restore would be PARTIAL:
          <ul style={{ margin: "0.2rem 0 0.3rem", paddingLeft: "1rem" }}>
            {gaps.map((g, i) => <li key={i}>{g}</li>)}
          </ul>
          <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={ackGaps} onChange={(e) => setAckGaps(e.target.checked)} />
            Populate anyway (I accept the gaps).
          </label>
        </div>
      )}

      {/* 4 — populate */}
      <div style={ROW}>
        <button style={canPopulate ? BTN : BTN_OFF} onClick={populate} disabled={!canPopulate}>
          {populating
            ? `Signing page ${signedPages + 1}/${pageCount}…`
            : `Populate ReclaimRegistry (${totalRecords} records, ${pageCount} page${pageCount === 1 ? "" : "s"})`}
        </button>
        {disabledReason && <span style={MUTED}>← {disabledReason}</span>}
      </div>

      {/* 5 — progress + count-verify */}
      {pages.length > 0 && (
        <div style={{ ...HASH, opacity: 1, display: "flex", flexDirection: "column", gap: "0.15rem" }}>
          {pages.map((p) => (
            <span key={p.index} style={p.error ? ERR : p.digest ? OK : MUTED}>
              page {p.index + 1} · {p.rows} rows · {p.digest ? `✓ ${p.digest.slice(0, 10)}…` : p.error ? `✗ ${p.error}` : "pending"}
            </span>
          ))}
        </div>
      )}
      {runError && <span style={ERR}>Error: {runError}</span>}
      {done && (
        <span style={signedPages === pageCount ? OK : ERR}>
          {signedPages === pageCount
            ? `✓ Populated ${totalRecords} records across ${pageCount} page(s). Re-run is idempotent (consumed-key safe).`
            : `MISMATCH: ${signedPages}/${pageCount} pages signed — re-run to complete (idempotent).`}
        </span>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
