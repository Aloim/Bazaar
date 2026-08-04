// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * UpdateCeremonyPlan v1 — anchor history table.
 *
 * Renders `useAnchorRegistry().anchors` (newest first). Each row shows:
 *   id, checkpoint, schema_version, ipfs_cid (clickable → ipfs.io gateway),
 *   posted-at, posted-by (short), first 8 bytes of hash.
 *
 * Used inside `<UpdateCeremonyTab />` to give the admin an at-a-glance
 * audit trail of every backup ever anchored.
 */

import { useMemo } from "react";
import { useAnchorRegistry } from "@bazaar/shared/hooks/ceremony";
import type { AnchorRow } from "@bazaar/shared/hooks/ceremony";

const ROOT_STYLE: React.CSSProperties = {
  border: "1px solid rgba(255, 255, 255, 0.08)",
  background: "rgba(255, 255, 255, 0.02)",
  padding: "0.6rem",
  fontFamily: "monospace",
  fontSize: "0.78rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.4rem",
};

const TABLE_STYLE: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const HEAD_CELL_STYLE: React.CSSProperties = {
  borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
  padding: "0.3rem 0.5rem",
  textAlign: "left",
  fontSize: "0.7rem",
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "rgba(255, 255, 255, 0.55)",
};

const CELL_STYLE: React.CSSProperties = {
  borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
  padding: "0.3rem 0.5rem",
  verticalAlign: "top",
};

const EMPTY_STYLE: React.CSSProperties = {
  padding: "0.5rem",
  color: "rgba(255, 255, 255, 0.4)",
  fontStyle: "italic",
};

const LINK_STYLE: React.CSSProperties = {
  color: "var(--accent, #cc7000)",
  textDecoration: "underline",
};

const REFRESH_BTN: React.CSSProperties = {
  marginLeft: "auto",
  background: "transparent",
  border: "1px solid rgba(255, 255, 255, 0.2)",
  color: "rgba(255, 255, 255, 0.7)",
  padding: "0.2rem 0.6rem",
  fontFamily: "monospace",
  fontSize: "0.7rem",
  cursor: "pointer",
};

function shortAddr(a: string): string {
  if (!a || a.length < 10) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function hashPreview(h: Uint8Array): string {
  if (!h.length) return "—";
  const arr = Array.from(h.slice(0, 4));
  const hex = arr.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex}…`;
}

function formatTime(ms: number): string {
  if (!ms) return "—";
  try {
    const d = new Date(ms);
    return `${d.toISOString().slice(0, 16).replace("T", " ")}Z`;
  } catch {
    return "—";
  }
}

export default function BackupHistoryList() {
  const { anchors, isLoading, error, refetch } = useAnchorRegistry();
  const rows = useMemo<AnchorRow[]>(() => anchors, [anchors]);

  return (
    <div style={ROOT_STYLE}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <span style={{ fontWeight: 600 }}>Backup history</span>
        {isLoading && <span style={{ marginLeft: "0.5rem", opacity: 0.55 }}>(loading…)</span>}
        <button style={REFRESH_BTN} onClick={refetch}>Refresh</button>
      </div>
      {error && (
        <div style={{ color: "#e55555" }}>Error: {error}</div>
      )}
      {rows.length === 0 ? (
        <div style={EMPTY_STYLE}>
          No backups anchored yet. Create one in Step 3.
        </div>
      ) : (
        <table style={TABLE_STYLE}>
          <thead>
            <tr>
              <th style={HEAD_CELL_STYLE}>ID</th>
              <th style={HEAD_CELL_STYLE}>Checkpoint</th>
              <th style={HEAD_CELL_STYLE}>Schema</th>
              <th style={HEAD_CELL_STYLE}>IPFS CID</th>
              <th style={HEAD_CELL_STYLE}>Hash</th>
              <th style={HEAD_CELL_STYLE}>Posted at</th>
              <th style={HEAD_CELL_STYLE}>By</th>
              <th style={HEAD_CELL_STYLE}>Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td style={CELL_STYLE}>{a.id}</td>
                <td style={CELL_STYLE}>{a.checkpoint}</td>
                <td style={CELL_STYLE}>{a.schemaVersion || "—"}</td>
                <td style={CELL_STYLE}>
                  {a.ipfsCid ? (
                    <a
                      style={LINK_STYLE}
                      href={`https://ipfs.io/ipfs/${a.ipfsCid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {a.ipfsCid.slice(0, 12)}…
                    </a>
                  ) : "—"}
                </td>
                <td style={CELL_STYLE}>{hashPreview(a.hash)}</td>
                <td style={CELL_STYLE}>{formatTime(a.postedAtMs)}</td>
                <td style={CELL_STYLE} title={a.postedBy}>{shortAddr(a.postedBy)}</td>
                <td style={CELL_STYLE}>{a.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
