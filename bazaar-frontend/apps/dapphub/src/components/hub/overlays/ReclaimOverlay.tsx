// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * ReclaimOverlay — "My Reclaims". After a state-preserving republish (V38), the
 * admin populates the ReclaimRegistry from the verified backup; this overlay shows
 * the records keyed to the connected wallet so the SSU owner / tribe leader can
 * re-materialise their SSU / tribe on the new packages.
 *
 * Ordering is TRIBE-FIRST (the chain aborts an Easy/Advanced SSU reclaim until its
 * tribe is reclaimed — useReclaimRecords sorts tribes ahead of their SSUs).
 *
 * Dormant on V37: gated by `reclaimEnabled()` at the call site (HubLanding only
 * surfaces the menu entry when a ReclaimRegistry exists), and self-guarded here.
 */

import { useConnection } from "@evefrontier/dapp-kit";
import { reclaimEnabled } from "@bazaar/shared/constants";
import { useReclaimRecords } from "@bazaar/shared/hooks/ceremony";
import { HUB } from "../hubStyle";
import { OverlayShell } from "../HubPrimitives";
import ReclaimRecordCard from "./ReclaimRecordCard";

export default function ReclaimOverlay({ onClose }: { onClose: () => void }) {
  const { walletAddress } = useConnection();
  const enabled = reclaimEnabled();
  const { records, tribeRecords, ssuRecords, isLoading, error, refetch } = useReclaimRecords(
    enabled ? walletAddress ?? null : null,
  );

  return (
    <OverlayShell title="MY RECLAIMS" width={920} onClose={onClose}>
      {!enabled ? (
        <div style={{ padding: "30px 8px", color: HUB.FG2, fontSize: 14, lineHeight: 1.6 }}>
          There is no active Update Ceremony. Reclaims become available only after a
          state-preserving republish, when the admin has populated the registry from a
          verified backup. Nothing to reclaim on the live version.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: HUB.FG2, lineHeight: 1.6, maxWidth: 620 }}>
              Re-materialise your SSUs and tribes on the new packages. <strong style={{ color: HUB.ORANGE }}>Tribes
              first</strong> — an SSU reclaim is blocked on-chain until its tribe is reclaimed. Each reclaim is
              signed by you (the owner / leader); legacy EVE is pulled in the same flow.
            </div>
            <button onClick={refetch} style={{ background: "transparent", border: `1px solid ${HUB.DIM}`, color: HUB.ORANGE, fontFamily: "inherit", fontSize: 12, padding: "5px 10px", cursor: "pointer" }}>↻ Refresh</button>
          </div>

          {isLoading && <div style={{ color: HUB.MUTED, fontSize: 14 }}>Loading your reclaim records…</div>}
          {error && <div style={{ color: HUB.RED, fontSize: 13 }}>Failed to load reclaim records: {error}</div>}
          {!isLoading && !error && records.length === 0 && (
            <div style={{ padding: "36px 20px", textAlign: "center", fontSize: 14, color: HUB.FG2 }}>
              No reclaim records are keyed to this wallet. If you expect some, confirm the admin has populated the
              registry and that you are connected with the original owner / leader wallet.
            </div>
          )}

          {tribeRecords.length > 0 && (
            <Section title={`Tribes (${tribeRecords.length})`}>
              {tribeRecords.map((r) => <ReclaimRecordCard key={`t-${r.subId}`} record={r} walletAddress={walletAddress ?? ""} />)}
            </Section>
          )}
          {ssuRecords.length > 0 && (
            <Section title={`SSUs (${ssuRecords.length})`}>
              {ssuRecords.map((r) => <ReclaimRecordCard key={`s-${r.subId}`} record={r} walletAddress={walletAddress ?? ""} />)}
            </Section>
          )}
        </>
      )}
    </OverlayShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: HUB.DIM, textTransform: "uppercase", marginBottom: 10 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
