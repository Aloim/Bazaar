// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * TribeAssetsTab — V16 full rewrite.
 *
 * Surfaces the **virtual tribe wallet** (TribeToken balance accumulated at
 * `object::id_address(tribe_gov)` from shop tax revenue) plus the new
 * mint/burn delayed-execution queue (`bazaar_economy::mint_burn_queue`).
 *
 * Replaces the V15 EVE-balance treasury display (that view now lives entirely
 * in the Reserve Vault tab). Per V16 design (`TribeWalletMintBurnQueuePlan.md`):
 *   - Tribe Wallet card (token symbol, current balance, mint-blocked banner)
 *   - 4-stat row absorbed from the retired CoinSubTab
 *   - Mint card + Burn card → fire `request_mint_*` / `request_burn_*` (queued)
 *   - Pending Requests list (with Execute / Reject controls after 24h wait)
 *   - Recent Activity (last few FinanceEvents for codes 0/1/11/12/13)
 *
 * Constitution-EXEMPT posture (V13+).
 * File limit: 500 lines | Article XIV.4.
 */

import { useState } from "react";
import { dAppKit, useConnection } from "@evefrontier/dapp-kit";
import { useTribeCaps } from "@bazaar/shared/hooks/useTribeCaps";
import { useTribeAssets } from "@bazaar/shared/hooks/useTribeAssets";
import { useTribeRegistry } from "@bazaar/shared/hooks/useTribeRegistry";
import {
  useTribeTokenLedger,
  useTribeTokenBalance,
  useLifetimeMintTotal,
  useLifetimeBurnTotal,
} from "@bazaar/shared/hooks/bazaareconomy/ledger-hooks";
import TribeWalletAdminBlock   from "./TribeWalletAdmin";
import { useTribeVault } from "@bazaar/shared/hooks/bazaareconomy/vault-hooks";
import { useExchangeConfig } from "@bazaar/shared/hooks/bazaareconomy/exchange-hooks";
import {
  useMintBurnQueue,
  MINT_BURN_STATUS_PENDING,
  MINT_BURN_STATUS_EXECUTED,
  MINT_BURN_STATUS_REJECTED,
  MINT_BURN_KIND_MINT,
} from "@bazaar/shared/hooks/useMintBurnQueue";
import { useFinanceEvents } from "@bazaar/shared/hooks/useFinanceEvents";
import {
  buildRequestMintAsLeader,
  buildRequestBurnAsLeader,
  buildExecuteRequestAsLeader,
  buildRejectRequestAsLeader,
} from "@bazaar/shared/tx/bazaareconomy/mint-burn-queue-tx";
import { formatFinanceEventLabel } from "@bazaar/shared/hooks/useFinanceEvents";
import type { Transaction } from "@mysten/sui/transactions";
import {
  formatTribeAmount,
  parseTribeAmountSafe,
  TRIBE_TOKEN_DECIMALS,
} from "@bazaar/shared/utils/tribeToken";

// ── Local helpers ─────────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
    </div>
  );
}

function formatRelative(ms: number, nowMs: number): string {
  if (!ms) return "—";
  const delta = ms - nowMs;
  const abs = Math.abs(delta);
  const min = Math.floor(abs / 60_000);
  const hr  = Math.floor(min / 60);
  if (abs < 60_000)  return delta >= 0 ? "now" : "just now";
  if (hr < 1)        return delta >= 0 ? `in ${min}m` : `${min}m ago`;
  const m = min - hr * 60;
  return delta >= 0 ? `in ${hr}h ${m}m` : `${hr}h ${m}m ago`;
}

// ── TribeAssetsTab ────────────────────────────────────────────────────────────

export default function TribeAssetsTab() {
  const { walletAddress } = useConnection();
  const { leaderCapId, leaderTribeIdx, superAdminCapId, superAdminTribeIdx } = useTribeCaps();

  // Gate on the TRIBE's bazaar type — NOT the app's SSU context. The previous
  // <AdvancedOnly>/<EasyOnly> wrappers resolved bazaar type from a BazaarFeatureRoot
  // SSU context that the DappHub Tribe Governance host does NOT provide, so this
  // whole tab rendered blank there. Resolving the type from the tribe registry
  // fixes DappHub while keeping in-game behaviour identical (the host SSU's type
  // equals its tribe's type for tribe-affiliated SSUs).
  const tribeIdx = leaderTribeIdx ?? superAdminTribeIdx ?? null;
  const assets = useTribeAssets(tribeIdx);
  const { tribes, loading: tribesLoading } = useTribeRegistry();
  const tribeType = tribeIdx !== null
    ? (tribes.find(t => t.idx === tribeIdx)?.bazaarType ?? null)
    : null;

  if (tribeType === null) {
    return (
      <div className="panel__section">
        <p className="muted">
          {tribesLoading
            ? "Resolving tribe…"
            : "No tribe leadership or SuperAdmin cap detected — tribe assets are unavailable."}
        </p>
      </div>
    );
  }

  // Easy (1): no virtual tribe wallet / token mint-burn.
  if (tribeType !== 2) {
    return (
      <div className="panel__section panel__section--notice">
        <p className="muted" style={{ lineHeight: "1.55", margin: 0 }}>
          Tribe Assets (TribeToken wallet + mint/burn queue) is an Advanced-tier
          feature. Easy bazaars route tax revenue directly to the tribe
          leader&apos;s wallet — no virtual tribe wallet, no token mint/burn.
        </p>
      </div>
    );
  }

  // Advanced (2)
  return (
    <AdvancedAssetsBody
      walletAddress={walletAddress ?? ""}
      leaderCapId={leaderCapId}
      superAdminCapId={superAdminCapId}
      leaderTribeIdx={tribeIdx}
      tribeGovId={assets.govId}
      vaultId={assets.vaultId}
      ledgerId={assets.tokenLedgerId}
      configId={assets.exchangeConfigId}
      queueId={assets.mintBurnQueueId}
    />
  );
}

// ── Advanced body ─────────────────────────────────────────────────────────────

interface AdvancedBodyProps {
  walletAddress:    string;
  leaderCapId:      string | null;
  superAdminCapId:  string | null;
  leaderTribeIdx:   number | null;
  tribeGovId:       string | null;
  vaultId:          string | null;
  ledgerId:         string | null;
  configId:         string | null;
  queueId:          string | null;
}

function AdvancedAssetsBody({
  walletAddress, leaderCapId, superAdminCapId, leaderTribeIdx,
  tribeGovId, vaultId, ledgerId, configId, queueId,
}: AdvancedBodyProps) {
  // ── Read-side hooks ─────────────────────────────────────────────────────
  const ledgerQuery = useTribeTokenLedger(ledgerId);
  const ledger      = ledgerQuery.data;
  const vaultQuery  = useTribeVault(vaultId);
  const vault       = vaultQuery.data;
  const configQuery = useExchangeConfig(configId);
  const config      = configQuery.data;

  // Tribe wallet balance = ledger balance at gov-object address.
  const walletBalQ  = useTribeTokenBalance(ledgerId, tribeGovId);
  const tribeWallet = walletBalQ.data?.balance ?? 0;

  // Caller's own balance (for Deposit modal max-button).
  const callerBalQ  = useTribeTokenBalance(ledgerId, walletAddress || null);
  const callerBal   = callerBalQ.data?.balance ?? 0;

  const lifetimeMint = useLifetimeMintTotal(leaderTribeIdx);
  const lifetimeBurn = useLifetimeBurnTotal(leaderTribeIdx);

  const queue = useMintBurnQueue(queueId);
  const finance = useFinanceEvents(leaderTribeIdx ?? -1);

  // ── Local form state ────────────────────────────────────────────────────
  const [mintAmount, setMintAmount] = useState("");
  const [burnAmount, setBurnAmount] = useState("");
  const [loading, setLoading]       = useState<string>("");
  const [msg, setMsg]               = useState<string>("");
  const [err, setErr]               = useState<string>("");


  // ── Derived ─────────────────────────────────────────────────────────────
  const canMintGate = vault && config ? vault.eveBalance > config.reserveMist : false;
  const ledgerOk    = ledger ? !ledger.isFrozen : false;
  const mintEnabled = canMintGate && ledgerOk;
  const sym         = ledger?.tokenSymbol || "TOKEN";
  const decimals    = ledger?.decimals ?? TRIBE_TOKEN_DECIMALS;
  const nowMs       = Date.now();

  // V26+ — mint/burn input parsing in scaled units. parseTribeAmountSafe
  // accepts display-token strings ("5", "1.50", "1,234.56") and returns a
  // bigint of scaled units that we then convert to Number for the u64 arg.
  const mintParsed = parseTribeAmountSafe(mintAmount, decimals);
  const mintScaled = mintParsed.ok ? mintParsed.value : 0n;
  const burnParsed = parseTribeAmountSafe(burnAmount, decimals);
  const burnScaled = burnParsed.ok ? burnParsed.value : 0n;

  const isBootstrapped = !!(ledger && vault && config && queueId);

  async function exec(label: string, tx: Transaction) {
    setLoading(label); setErr(""); setMsg("");
    try {
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setMsg(label.toUpperCase() + " request submitted.");
      window.dispatchEvent(new Event("bazar-soft-refresh"));
      queue.refetch();
      finance.refetch();
      if (label === "mint") setMintAmount("");
      if (label === "burn") setBurnAmount("");
      setTimeout(() => setMsg(""), 3000);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Transaction failed");
    } finally {
      setLoading("");
    }
  }

  // ── Pre-bootstrap notice (V17 wayfinding — Bootstrap moved to Owner tab) ──
  if (!isBootstrapped) {
    return (
      <div className="panel__section">
        <p className="muted" style={{ lineHeight: "1.55" }}>
          Tribe economy not yet initialized. Bootstrap your Tribe Vault first
          (<strong>Tribe Governance → Owner → Bootstrap Economy</strong> sub-tab);
          this panel will then surface your Tribe Wallet, mint/burn queue, and
          recent finance activity.
        </p>
      </div>
    );
  }

  const pending  = queue.requests.filter(r => r.status === MINT_BURN_STATUS_PENDING);
  const settled  = queue.requests.filter(r => r.status !== MINT_BURN_STATUS_PENDING).slice(0, 5);
  const recentFE = finance.events.filter(e => [0, 1, 11, 12, 13].includes(e.eventType)).slice(0, 6);

  return (
    <div className="panel__section">

      {/* Tribe Wallet card */}
      <div className="tribe-vault" style={{ marginBottom: "1rem" }}>
        <div className="tribe-vault__header">
          <span className="tribe-vault__label">Tribe Wallet ({ledger?.tokenName} / {sym})</span>
          {(queue.loading || ledgerQuery.isLoading) && (
            <span className="muted" style={{ fontSize: "0.75rem" }}>Loading…</span>
          )}
        </div>
        <div className="tribe-vault__balance">
          <span className="tribe-vault__amount">
            {formatTribeAmount(tribeWallet, { decimals })}
          </span>
          <span className="tribe-vault__currency">{sym}</span>
        </div>
        <p className="muted" style={{ fontSize: "0.78rem", margin: "0.35rem 0 0 0" }}>
          Tax revenue from shops on this tribe&apos;s SSUs accumulates here
          (virtual tribe wallet at <code>gov.id</code>). To redeem to EVE,
          burn tokens and add liquidity to the vault, then withdraw EVE via
          the Reserve Vault tab&apos;s multi-sig flow.
        </p>
        {/* V20 — Withdraw / Deposit / Logs */}
        <TribeWalletAdminBlock
          leaderCapId={leaderCapId}
          superAdminCapId={superAdminCapId}
          tribeGovernanceId={tribeGovId}
          ledgerId={ledgerId}
          tribeId={leaderTribeIdx}
          walletBalance={tribeWallet}
          callerBalance={callerBal}
          tokenSymbol={sym}
          decimals={decimals}
          onSuccess={() => { walletBalQ.refetch(); callerBalQ.refetch(); }}
        />
      </div>

      {/* 4-stat row absorbed from CoinSubTab */}
      <div className="stats-row" style={{ marginBottom: "1rem" }}>
        <Stat label="Circulating"   value={formatTribeAmount(ledger?.totalSupply ?? 0, { decimals })} />
        <Stat label="Lifetime Mint" value={formatTribeAmount(lifetimeMint, { decimals })} />
        <Stat label="Lifetime Burn" value={formatTribeAmount(lifetimeBurn, { decimals })} />
        <Stat label="Tribe Wallet"  value={`${formatTribeAmount(tribeWallet, { decimals })} ${sym}`} />
      </div>

      {/* Mint-blocked banner */}
      {!mintEnabled && (
        <div
          className="action-card"
          style={{ background: "rgba(200,40,40,0.10)", border: "1px solid rgba(220,60,60,0.3)", marginBottom: "0.75rem" }}
        >
          {ledger?.isFrozen ? (
            <p className="muted" style={{ margin: 0 }}>
              <strong>Minting blocked:</strong> the token ledger is frozen.
              A DApp administrator must unfreeze it before new mint requests can be submitted.
            </p>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              <strong>Minting blocked:</strong> vault balance ≤ reserve.
              Article XIII.4 requires the reserve to be funded before minting.
              Add liquidity in the Reserve Vault tab.
            </p>
          )}
        </div>
      )}

      {/* Success / error banner */}
      {msg && <div style={{ color: "#4ade80", padding: "0.35rem 0", fontWeight: "bold" }}>{msg}</div>}
      {err && <div style={{ color: "#f87171", padding: "0.35rem 0" }}>{err}</div>}

      {/* Mint Request card */}
      <div className="action-card" style={{ marginBottom: "0.75rem" }}>
        <h4>Request Mint — credits Tribe Wallet</h4>
        <p className="muted" style={{ fontSize: "0.78rem", marginBottom: "0.5rem" }}>
          Requested mint enters a 24-hour wait. Any TribeLeader or SuperAdmin
          can veto during the wait. After 24h, anyone with a leader/admin cap
          can execute; the tokens are credited to the tribe wallet at
          <code> object::id_address(tribe_gov)</code>.
        </p>
        <div className="form-row">
          <input
            className="input input--sm"
            type="text"
            inputMode="decimal"
            value={mintAmount}
            onChange={e => setMintAmount(e.target.value)}
            placeholder={`Amount to mint (${sym})`}
          />
          <button
            className="btn btn--primary btn--sm"
            disabled={
              !mintEnabled || !!loading || !leaderCapId ||
              !mintParsed.ok || mintScaled <= 0n
            }
            title={!mintParsed.ok && mintAmount ? `Invalid: ${mintParsed.reason}` : ""}
            onClick={() => {
              if (!leaderCapId || !tribeGovId || !queueId || !vaultId || !ledgerId || !configId) return;
              exec("mint", buildRequestMintAsLeader({
                leaderCapId, tribeGovernanceId: tribeGovId,
                queueId, vaultId, ledgerId, configId,
                amount: Number(mintScaled),
              }));
            }}
          >
            {loading === "mint" ? "…" : `Request Mint`}
          </button>
        </div>
      </div>

      {/* Burn Request card (always burns FROM tribe wallet) */}
      <div className="action-card" style={{ marginBottom: "0.75rem" }}>
        <h4>Request Burn — debits Tribe Wallet</h4>
        <p className="muted" style={{ fontSize: "0.78rem", marginBottom: "0.5rem" }}>
          Burn target is fixed to the tribe wallet (gov-object address).
          24-hour wait + single-rejection veto applies.
          Maximum: <strong>{formatTribeAmount(tribeWallet, { decimals })} {sym}</strong> (current wallet balance).
        </p>
        <div className="form-row">
          <input
            className="input input--sm"
            type="text"
            inputMode="decimal"
            value={burnAmount}
            onChange={e => setBurnAmount(e.target.value)}
            placeholder={`Amount to burn (${sym})`}
          />
          <button
            className="btn btn--danger btn--sm"
            disabled={
              !!loading || !leaderCapId ||
              !burnParsed.ok || burnScaled <= 0n ||
              burnScaled > BigInt(tribeWallet)
            }
            title={!burnParsed.ok && burnAmount ? `Invalid: ${burnParsed.reason}` : ""}
            onClick={() => {
              if (!leaderCapId || !tribeGovId || !queueId || !ledgerId || !vaultId) return;
              exec("burn", buildRequestBurnAsLeader({
                leaderCapId, tribeGovernanceId: tribeGovId,
                queueId, ledgerId, vaultId,
                amount: Number(burnScaled),
              }));
            }}
          >
            {loading === "burn" ? "…" : `Request Burn`}
          </button>
        </div>
      </div>

      {/* Pending Requests */}
      <h4 style={{ marginBottom: "0.5rem" }}>Pending Requests ({pending.length})</h4>
      {pending.length === 0 && (
        <p className="muted" style={{ fontSize: "0.82rem", marginBottom: "1rem" }}>
          No pending mint or burn requests.
        </p>
      )}
      {pending.map(r => {
        const ready = nowMs >= r.executableAfterMs;
        const kindLabel = r.kind === MINT_BURN_KIND_MINT ? "MINT" : "BURN";
        return (
          <div key={r.id} className="action-card" style={{ marginBottom: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
              <div>
                <strong>#{r.id} · {kindLabel}</strong> {formatTribeAmount(r.amount, { decimals })} {sym}
                <div className="muted" style={{ fontSize: "0.78rem" }}>
                  Proposed by <code>{r.proposer.slice(0, 8)}…{r.proposer.slice(-4)}</code> ·
                  {" "}executable {formatRelative(r.executableAfterMs, nowMs)}
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.35rem" }}>
                <button
                  className="btn btn--primary btn--sm"
                  disabled={!ready || !!loading || !leaderCapId}
                  title={ready ? "Execute now" : `Wait ${formatRelative(r.executableAfterMs, nowMs)}`}
                  onClick={() => {
                    if (!leaderCapId || !tribeGovId || !queueId || !ledgerId || !vaultId || !configId) return;
                    exec(`exec-${r.id}`, buildExecuteRequestAsLeader({
                      leaderCapId, tribeGovernanceId: tribeGovId,
                      queueId, ledgerId, vaultId, configId,
                      requestId: r.id,
                    }));
                  }}
                >
                  {loading === `exec-${r.id}` ? "…" : "Execute"}
                </button>
                <button
                  className="btn btn--ghost btn--sm"
                  disabled={!!loading || !leaderCapId}
                  onClick={() => {
                    if (!leaderCapId || !tribeGovId || !queueId || !vaultId || !ledgerId) return;
                    exec(`rej-${r.id}`, buildRejectRequestAsLeader({
                      leaderCapId, tribeGovernanceId: tribeGovId,
                      queueId, vaultId, ledgerId,
                      requestId: r.id,
                    }));
                  }}
                >
                  {loading === `rej-${r.id}` ? "…" : "Reject"}
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Settled (executed / rejected) */}
      {settled.length > 0 && (
        <details style={{ marginBottom: "1rem" }}>
          <summary style={{ cursor: "pointer", fontWeight: "bold", margin: "0.25rem 0" }}>
            Recent settled ({settled.length})
          </summary>
          {settled.map(r => {
            const kindLabel = r.kind === MINT_BURN_KIND_MINT ? "MINT" : "BURN";
            const statusLabel = r.status === MINT_BURN_STATUS_EXECUTED ? "EXECUTED"
                              : r.status === MINT_BURN_STATUS_REJECTED ? "REJECTED" : "UNKNOWN";
            return (
              <div key={r.id} style={{ padding: "0.35rem 0.5rem", fontSize: "0.85rem", display: "flex", justifyContent: "space-between" }}>
                <span>#{r.id} · {kindLabel} {formatTribeAmount(r.amount, { decimals })} {sym}</span>
                <span className="muted">{statusLabel}</span>
              </div>
            );
          })}
        </details>
      )}

      {/* Recent Activity (FinanceEvents 0/1/11/12/13) */}
      <h4 style={{ marginBottom: "0.5rem" }}>Recent Activity</h4>
      {recentFE.length === 0 && (
        <p className="muted" style={{ fontSize: "0.82rem" }}>
          No mint/burn activity recorded yet.
        </p>
      )}
      {recentFE.map(ev => (
        <div key={ev.id} style={{ padding: "0.25rem 0.5rem", fontSize: "0.85rem", display: "flex", justifyContent: "space-between" }}>
          <span>{formatFinanceEventLabel(ev.eventType, sym)}</span>
          <span className="muted">{formatTribeAmount(ev.amount, { decimals })}</span>
        </div>
      ))}

      {/* Address for reference */}
      <p className="muted" style={{ fontSize: "0.72rem", marginTop: "1rem" }}>
        Your address: <code>{walletAddress || "(not connected)"}</code>
      </p>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
