// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * ReclaimRecordCard — one reclaim record (SSU_OWNER or TRIBE_LEADER) rendered as a
 * card with a decoded restore preview + a guided multi-PTB reclaim runner.
 *
 * The reclaim is multi-PTB because the shared objects created by the entry PTB are
 * only known after it executes (resolved from the tx effects via
 * resolveCreatedIdsBySuffix). The runner walks:
 *   SSU:   shell → (resolve gov/registry/cap) → restore
 *   TRIBE: reclaim_tribe → (resolve gov / ledger / vault / leader-cap) →
 *          [Advanced: mint balance pages] → [Advanced: vault EVE] → restore
 *
 * Lazy EVE drain (OLD::withdraw_legacy_* → coin → NEW::reclaim_*) is OPTIONAL and
 * OFF by default (a zero coin is deposited); enable it by supplying the OUTGOING
 * object ids — only meaningful once `outgoingDrainEnabled()` (CeremonyGate + OUTGOING
 * package ids set). This whole surface is dormant on V37 (gated by the overlay).
 *
 * Offline-untestable by nature; the V38 rehearsal ceremony is its validation gate.
 */

import { useState } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import { splitEveCoin } from "@bazaar/shared/hooks/useEveCoinSplitter";
import { resolveCreatedIdsBySuffix } from "@bazaar/shared/hooks/created-object-resolver";
import { CEREMONY_GATE_ID, COIN_DECIMALS, outgoingDrainEnabled } from "@bazaar/shared/constants";
import type { ReclaimRecordView } from "@bazaar/shared/hooks/ceremony";
import { buildReclaimSsuShell, buildReclaimSsuRestore } from "@bazaar/shared/tx/bazaarmission/reclaim-ssu-tx";
import {
  buildReclaimTribe,
  buildReclaimTribeMintPages,
  buildReclaimTribeVaultDeposit,
  buildReclaimTribeRestore,
} from "@bazaar/shared/tx/bazaareconomy/reclaim-tribe-tx";
import { Transaction } from "@mysten/sui/transactions";
import { HUB, HUB_MONO } from "../hubStyle";
import { PrimaryBtn, GhostBtn } from "../HubPrimitives";

const TYPE_LABEL = ["NoTribe", "Easy", "Advanced"];

async function signTx(tx: Transaction): Promise<string> {
  const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
  const digest = result.$kind === "Transaction" ? result.Transaction.digest : result.FailedTransaction.digest;
  if (result.$kind !== "Transaction") throw new Error(`Transaction failed (digest ${digest.slice(0, 10)}…)`);
  return digest;
}

const field: React.CSSProperties = {
  width: "100%", background: "rgba(8,6,4,0.85)", border: `1px solid ${HUB.DIM}`,
  color: HUB.FG, fontFamily: HUB_MONO, fontSize: 12, padding: "7px 10px", boxSizing: "border-box",
};
const lbl: React.CSSProperties = { fontSize: 11, color: HUB.FG2, letterSpacing: "0.04em" };
const kv: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12, color: HUB.FG2 };
const ok: React.CSSProperties = { color: HUB.GREEN, fontSize: 12 };
const err: React.CSSProperties = { color: HUB.RED, fontSize: 12 };

function Badge({ label }: { label: string }) {
  return (
    <span style={{ padding: "2px 8px", border: `1px solid ${HUB.DIM}`, background: "rgba(184,102,32,0.12)",
      color: HUB.ORANGE, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</span>
  );
}

function Step({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span style={{ color: done ? HUB.GREEN : HUB.MUTED, fontSize: 13 }}>{done ? "✓" : "▸"}</span>
      <span style={{ flex: 1 }}>{children}</span>
    </div>
  );
}

export default function ReclaimRecordCard({ record, walletAddress }: { record: ReclaimRecordView; walletAddress: string }) {
  const isTribe = !!record.tribe;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Shared step outputs.
  const [entryDigest, setEntryDigest] = useState<string | null>(null);
  const [resolved, setResolved] = useState<Record<string, string | null>>({});
  const [restoreDigest, setRestoreDigest] = useState<string | null>(null);
  const [mintDigests, setMintDigests] = useState<string[]>([]);

  // Operator inputs.
  const [ownerCapId, setOwnerCapId] = useState("");   // SSU: Frontier OwnerCap<StorageUnit>
  const [feeEve, setFeeEve] = useState("0");          // TRIBE: creation fee (EVE)
  const [quorum, setQuorum] = useState("1");          // TRIBE Advanced: multisig quorum

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  // ── SSU flow ────────────────────────────────────────────────────────────────
  const ssuShell = () => run(async () => {
    if (!record.ssu) return;
    if (!ownerCapId.trim()) throw new Error("Enter your Frontier OwnerCap (StorageUnit) object id.");
    const tx = buildReclaimSsuShell({ ownerCapId: ownerCapId.trim(), targetSsuId: record.ssu.originalSsuId });
    const digest = await signTx(tx);
    setEntryDigest(digest);
    const ids = await resolveCreatedIdsBySuffix(digest, [
      "ssu_governance::SSUGovernance", "membership::MemberRegistry", "membership::SSUOwnerCap",
    ]);
    setResolved(ids);
  });

  const ssuRestore = () => run(async () => {
    const gov = resolved["ssu_governance::SSUGovernance"];
    const reg = resolved["membership::MemberRegistry"];
    const cap = resolved["membership::SSUOwnerCap"];
    if (!gov || !reg || !cap) throw new Error("New SSU object ids not resolved — re-run the shell or paste them.");
    const tx = buildReclaimSsuRestore({
      ssuOwnerCapId: cap, ssuGovId: gov, memberRegistryId: reg,
      payloadBlob: record.payloadBlob, nowMs: Date.now(),
    });
    setRestoreDigest(await signTx(tx));
  });

  // ── TRIBE flow ──────────────────────────────────────────────────────────────
  const tribeCreate = () => run(async () => {
    if (!record.tribe) return;
    const tx = new Transaction();
    const feeMist = BigInt(Math.round(Number(feeEve || "0") * COIN_DECIMALS));
    const { coinArg: fee } = await splitEveCoin(walletAddress, feeMist, tx);
    buildReclaimTribe({
      feePaymentCoin: fee,
      originalTribeId: record.tribe.originalTribeId,
      initialRequiredApprovals: Math.max(1, Math.min(10, Number(quorum || "1"))),
    }, tx);
    const digest = await signTx(tx);
    setEntryDigest(digest);
    const suffixes = ["tribe_governance::TribeGovernance", "tribe_registry::TribeLeaderCap"];
    if (record.tribe.bazaarType === 2) suffixes.push("tribe_token_ledger::TribeTokenLedger", "tribe_vault::TribeVault");
    setResolved(await resolveCreatedIdsBySuffix(digest, suffixes));
  });

  const tribeMint = () => run(async () => {
    const cap = resolved["tribe_registry::TribeLeaderCap"];
    const ledger = resolved["tribe_token_ledger::TribeTokenLedger"];
    if (!cap || !ledger) throw new Error("New leader cap / ledger not resolved.");
    if (!CEREMONY_GATE_ID) throw new Error("CeremonyGate not set — mint-page is gated off.");
    const pages = buildReclaimTribeMintPages(record.tribe!.tokenBalances, { leaderCapId: cap, ledgerId: ledger });
    const digests: string[] = [];
    for (const p of pages) { digests.push(await signTx(p.tx)); setMintDigests([...digests]); }
  });

  const tribeRestore = () => run(async () => {
    const cap = resolved["tribe_registry::TribeLeaderCap"];
    const gov = resolved["tribe_governance::TribeGovernance"];
    if (!cap || !gov) throw new Error("New leader cap / governance not resolved.");
    const tx = buildReclaimTribeRestore({
      leaderCapId: cap, tribeGovId: gov, payloadBlob: record.payloadBlob, nowMs: Date.now(),
    });
    setRestoreDigest(await signTx(tx));
  });

  // ── Decoded preview ───────────────────────────────────────────────────────────
  const preview = isTribe ? (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={kv}><span>Type</span><span style={{ color: HUB.FG }}>{TYPE_LABEL[record.tribe!.bazaarType] ?? "?"}</span></div>
      <div style={kv}><span>Token</span><span style={{ color: HUB.FG }}>{record.tribe!.tokenSymbol || "—"} · {record.tribe!.tokenDecimals}d</span></div>
      <div style={kv}><span>Supply cap / total</span><span style={{ color: HUB.FG }}>{record.tribe!.tokenSupplyCap.toString()} / {record.tribe!.originalTotalSupply.toString()}</span></div>
      <div style={kv}><span>Token holders</span><span style={{ color: HUB.FG }}>{record.tribe!.tokenBalances.length}</span></div>
      <div style={kv}><span>Global bans</span><span style={{ color: HUB.FG }}>{record.tribe!.globalBans.length}</span></div>
    </div>
  ) : (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={kv}><span>Type</span><span style={{ color: HUB.FG }}>{TYPE_LABEL[record.ssu!.bazaarType] ?? "?"}</span></div>
      <div style={kv}><span>Tribe id</span><span style={{ color: HUB.FG }}>{record.ssu!.originalTribeId.toString()}</span></div>
      <div style={kv}><span>Members</span><span style={{ color: HUB.FG }}>{record.ssu!.members.length}</span></div>
      <div style={kv}><span>Local bans</span><span style={{ color: HUB.FG }}>{record.ssu!.localBanList.length}</span></div>
      <div style={kv}><span>Godot URL</span><span style={{ color: HUB.FG, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{record.ssu!.godotUrl || "—"}</span></div>
    </div>
  );

  return (
    <div style={{ border: `1px solid ${HUB.BORDER}`, background: "rgba(20,14,8,0.55)", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ color: HUB.ORANGE, fontWeight: 700, fontSize: 14, flex: 1, minWidth: 160 }}>{record.label}</span>
        <Badge label={isTribe ? "Tribe" : "SSU"} />
        <GhostBtn outlined small onClick={() => setOpen((o) => !o)}>{open ? "Hide" : "Reclaim"}</GhostBtn>
      </div>

      {preview}

      {open && (
        <div style={{ borderTop: `1px solid ${HUB.BORDER}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {isTribe ? (
            <>
              <Step done={!!entryDigest}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={lbl}>1 · Re-create the tribe (funds the creation fee)</span>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input style={{ ...field, width: 120 }} value={feeEve} onChange={(e) => setFeeEve(e.target.value)} placeholder="fee (EVE)" />
                    {record.tribe!.bazaarType === 2 && (
                      <input style={{ ...field, width: 110 }} value={quorum} onChange={(e) => setQuorum(e.target.value)} placeholder="quorum 1-10" />
                    )}
                    <PrimaryBtn small disabled={busy || !!entryDigest} onClick={tribeCreate}>Reclaim tribe</PrimaryBtn>
                  </div>
                </div>
              </Step>
              {record.tribe!.bazaarType === 2 && (
                <Step done={mintDigests.length > 0}>
                  <span style={lbl}>2 · Re-mint token balances ({record.tribe!.tokenBalances.length} holders)</span>{" "}
                  <PrimaryBtn small disabled={busy || !entryDigest} onClick={tribeMint}>Mint balances</PrimaryBtn>
                </Step>
              )}
              <Step done={!!restoreDigest}>
                <span style={lbl}>{record.tribe!.bazaarType === 2 ? "3" : "2"} · Restore config + bans + gov EVE</span>{" "}
                <PrimaryBtn small disabled={busy || !entryDigest} onClick={tribeRestore}>Restore</PrimaryBtn>
              </Step>
            </>
          ) : (
            <>
              <Step done={!!entryDigest}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={lbl}>1 · Re-establish ownership (Frontier OwnerCap of the StorageUnit)</span>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input style={{ ...field, flex: 1, minWidth: 220 }} value={ownerCapId} onChange={(e) => setOwnerCapId(e.target.value)} placeholder="0x… OwnerCap<StorageUnit> id" />
                    <PrimaryBtn small disabled={busy || !!entryDigest} onClick={ssuShell}>Reclaim SSU</PrimaryBtn>
                  </div>
                </div>
              </Step>
              <Step done={!!restoreDigest}>
                <span style={lbl}>2 · Restore roster + bans + config + EVE</span>{" "}
                <PrimaryBtn small disabled={busy || !entryDigest} onClick={ssuRestore}>Restore</PrimaryBtn>
              </Step>
            </>
          )}

          {entryDigest && <span style={ok}>✓ entry tx {entryDigest.slice(0, 12)}…</span>}
          {mintDigests.length > 0 && <span style={ok}>✓ minted {mintDigests.length} page(s)</span>}
          {restoreDigest && <span style={ok}>✓ restore tx {restoreDigest.slice(0, 12)}… — reclaim complete</span>}
          {!outgoingDrainEnabled() && (
            <span style={{ fontSize: 11, color: HUB.MUTED }}>
              Legacy EVE is deposited as a zero coin (lazy-drain inactive until the OUTGOING package ids +
              CeremonyGate are configured).
            </span>
          )}
          {error && <span style={err}>{error}</span>}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
