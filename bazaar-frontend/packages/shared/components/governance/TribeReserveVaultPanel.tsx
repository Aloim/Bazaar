// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// src/components/TribeReserveVaultPanel.tsx
// Panel for managing the Tribe Reserve Vault (EVE multi-sig withdrawal).
// Accessed from GlobalGovernancePanel SuperAdmin tab (vault sub-tab).
//
// V15 rewrite:
//   - All withdrawal calls go through new bazaar_economy::vault_withdrawal Move ABI
//     (request_withdrawal / approve_request / deny_request / execute_withdrawal /
//     cancel_request / expire_request). Legacy `_as_leader` / `_as_super_admin`
//     fictional variants from the Bazar1 port are gone.
//   - Status filter classifies 0=PENDING (open), 1=APPROVED (waiting),
//     [2,3,4,5]=completed (EXECUTED, CANCELLED, EXPIRED, DENIED).
//   - useVaultWithdrawals now takes boardId (resolved via useTribeAssets).
//   - Deposit section (TribeLeaderCap-gated) opens DepositModal — replaces the
//     stub "Manual deposits are not supported" copy.

import { useState } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import { useTribeVault } from "@bazaar/shared/hooks/bazaareconomy/vault-hooks";
import { useTribeTokenLedger } from "@bazaar/shared/hooks/bazaareconomy/ledger-hooks";
import { useVaultWithdrawals } from "@bazaar/shared/hooks/useVaultWithdrawals";
import { useTribeCaps } from "@bazaar/shared/hooks/useTribeCaps";
import { useTribeAssets } from "@bazaar/shared/hooks/useTribeAssets";
import { useTribeRegistry } from "@bazaar/shared/hooks/useTribeRegistry";
import WithdrawalRequestCard from "@bazaar/shared/components/inventory/WithdrawalRequestCard";
import DepositModal from "@bazaar/shared/components/inventory/DepositModal";
import { buildRequestWithdrawal } from "@bazaar/shared/tx/bazaareconomy/withdrawal-tx";
import type { VaultWithdrawalRequest } from "@bazaar/shared/hooks/useVaultWithdrawals";
import { COIN_DECIMALS } from "@bazaar/shared/constants";
import { formatTribeAmount, TRIBE_TOKEN_DECIMALS } from "@bazaar/shared/utils/tribeToken";

function formatEveMist(mist: number): string {
  return (mist / COIN_DECIMALS).toLocaleString(undefined, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 9,
  });
}

type RequestTab = "open" | "approved" | "completed";

interface Props {
  walletId:      string;
  tribeIdx:      number;
  tribeName:     string;
  walletAddress: string;
}

export default function TribeReserveVaultPanel({
  walletId, tribeIdx, tribeName, walletAddress,
}: Props) {
  void walletId; // V16: legacy fictional TribeWallet ID — vault stats now resolve from useTribeAssets
  const assets  = useTribeAssets(tribeIdx);

  // Gate on the TRIBE's bazaar type — the previous <AdvancedOnly> wrapper resolved
  // the type from an SSU BazaarFeatureRoot context that the DappHub host does not
  // provide, so the Reserve Vault rendered blank in DappHub Tribe Governance.
  const { tribes } = useTribeRegistry();
  const tribeType = tribes.find(t => t.idx === tribeIdx)?.bazaarType ?? null;
  const boardId       = assets.withdrawalBoardId;
  const vaultId       = assets.vaultId;
  const ledgerId      = assets.tokenLedgerId;
  const configId      = assets.exchangeConfigId;
  const tribeGovId    = assets.govId;
  const isEconomyBootstrapped = !!(vaultId && ledgerId);

  // V16: replaced dead useTribeWallet with the canonical V15 hooks.
  // useTribeWallet read fictional TribeWallet fields (tax_balance_baz, token_supply,
  // token_burned, eve_only) on a struct that never existed; the panel silently
  // showed zeros. Now: vault.eveBalance + ledger.totalSupply are the real V15 surface.
  const { data: vault,  isLoading: vaultLoading,  error: vaultError,  refetch: refetchVault }  = useTribeVault(vaultId);
  const { data: ledger, isLoading: ledgerLoading, error: ledgerError, refetch: refetchLedger } = useTribeTokenLedger(ledgerId);
  const wallet = {
    eveTaxBalance: vault?.eveBalance ?? 0,
    tokenSupply:   ledger?.totalSupply ?? 0,
    tokenBurned:   0,  // V16: circulation == totalSupply; lifetime-burn is event-derived elsewhere
    eveOnly:       !ledger,  // when no ledger exists, hide token-related stats
    loading:       vaultLoading || ledgerLoading,
    error:         vaultError?.message ?? ledgerError?.message ?? null,
    refetch:       () => { refetchVault(); refetchLedger(); },
  };
  // V26+ — read decimals from on-chain ledger; fall back to FE default 2 when
  // ledger hasn't loaded yet. Used by the circulation + backing-rate stat cells.
  const tokenDecimals = ledger?.decimals ?? TRIBE_TOKEN_DECIMALS;

  const { requests, loading: reqLoading, error: reqError, refetch: refetchRequests } =
    useVaultWithdrawals(boardId);

  const {
    leaderCapId, leaderTribeIdx,
    adminCapId,  adminTribeIdx,
  } = useTribeCaps();

  // V15: only TribeLeader can create requests on-chain. SuperAdmin variant
  // existed historically in the Bazar1 port but the corresponding Move fn
  // never existed — it was a phantom builder. Restrict to TribeLeader here.
  const effectiveLeaderCap = (leaderCapId && leaderTribeIdx === tribeIdx) ? leaderCapId : null;
  const effectiveAdminCap  = (adminCapId  && adminTribeIdx  === tribeIdx) ? adminCapId  : null;
  const canRequest = !!effectiveLeaderCap;

  // Withdrawal request form state
  const [withdrawAmountEve, setWithdrawAmountEve] = useState("");
  const [withdrawReason, setWithdrawReason] = useState("");
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestError, setRequestError] = useState("");

  // Deposit modal toggle
  const [showDeposit, setShowDeposit] = useState(false);

  // V17: bootstrap form moved to Tribe Governance Panel → Owner tab → Bootstrap
  // Economy sub-tab. Wayfinding panel below surfaces this when the economy is
  // not yet initialized.

  // Request tabs
  const [reqTab, setReqTab] = useState<RequestTab>("open");

  const vaultBalanceMist = wallet.eveTaxBalance ?? 0;

  // V15 status classification — matches Move const layout in vault_withdrawal.move:24-29.
  const openRequests      = requests.filter(r => r.status === 0);
  const approvedRequests  = requests.filter(r => r.status === 1);
  const completedRequests = requests.filter(r => [2, 3, 4, 5].includes(r.status));

  const withdrawAmountMist = Math.floor(parseFloat(withdrawAmountEve || "0") * COIN_DECIMALS);

  // Deposit needs only vault + ledger (+ tribe gov + leader cap). The withdrawal
  // board is a separate listing object only needed for request/approve/execute.
  const depositReady    = !!(vaultId && ledgerId);
  // Request-withdrawal additionally needs the board (it's the Move-side arg
  // through which the request is stored as a dynamic field).
  const requestReady    = !!(boardId && vaultId && ledgerId);

  async function handleCreateRequest() {
    if (!canRequest || withdrawAmountMist <= 0 || !withdrawReason.trim()) return;
    if (!effectiveLeaderCap || !tribeGovId || !boardId || !vaultId || !ledgerId) {
      setRequestError("Tribe economy not fully bootstrapped — try again shortly.");
      return;
    }
    setRequestLoading(true);
    setRequestError("");
    try {
      const tx = buildRequestWithdrawal({
        leaderCapId: effectiveLeaderCap,
        tribeGovernanceId: tribeGovId,
        boardId,
        vaultId,
        ledgerId,
        amountMist: withdrawAmountMist,
        reason: withdrawReason.trim(),
      });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setWithdrawAmountEve("");
      setWithdrawReason("");
      refetchRequests();
    } catch (e: unknown) {
      setRequestError(e instanceof Error ? e.message : "Transaction failed");
    } finally {
      setRequestLoading(false);
    }
  }

  const reqTabConfig: { key: RequestTab; label: string; items: VaultWithdrawalRequest[] }[] = [
    { key: "open",      label: `Open (${openRequests.length})`,           items: openRequests },
    { key: "approved",  label: `Approved / Waiting (${approvedRequests.length})`, items: approvedRequests },
    { key: "completed", label: `Completed (${completedRequests.length})`, items: completedRequests },
  ];

  const content = (() => {
  return (
    <div>
      <h3 style={{ marginBottom: "0.25rem" }}>Tribe Reserve Vault</h3>
      <p className="muted" style={{ fontSize: "0.82rem", marginBottom: "1rem" }}>
        The tribe reserve vault holds EVE (SUI) accumulated from shop taxes
        and tribe leader deposits. Withdrawals require multi-sig approval
        from Tribe Admins, followed by a 24-hour waiting period before
        execution.
      </p>

      {/* Tribe name banner */}
      <div style={{
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "4px",
        padding: "0.5rem 0.75rem",
        marginBottom: "1rem",
        fontSize: "0.85rem",
      }}>
        Tribe: <strong>{tribeName}</strong>
      </div>

      {/* Stats box */}
      <div className="action-card" style={{ marginBottom: "1rem" }}>
        <h4 style={{ marginBottom: "0.5rem" }}>Vault Stats</h4>
        <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
          <div>
            <div className="muted" style={{ fontSize: "0.75rem" }}>Vault Balance</div>
            <div style={{ fontWeight: "bold", fontFamily: "var(--font-mono, monospace)" }}>
              {wallet.loading ? "Loading..." : formatEveMist(vaultBalanceMist)} EVE
            </div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: "0.75rem" }}>TribeTokens in Circulation</div>
            <div style={{ fontWeight: "bold", fontFamily: "var(--font-mono, monospace)" }}>
              {wallet.loading ? "..." : formatTribeAmount(wallet.tokenSupply - wallet.tokenBurned, { decimals: tokenDecimals })}
            </div>
          </div>
          {!wallet.eveOnly && wallet.tokenSupply > wallet.tokenBurned && vaultBalanceMist > 0 && (
            <div>
              <div className="muted" style={{ fontSize: "0.75rem" }}>Backing Rate</div>
              <div style={{ fontWeight: "bold", fontFamily: "var(--font-mono, monospace)" }}>
                {/* V26+ — vaultBalanceMist / scaled_supply / COIN_DECIMALS = EVE per scaled unit.
                    Multiply by 10^decimals to convert to "EVE per display token". */}
                {(
                  vaultBalanceMist
                    / (wallet.tokenSupply - wallet.tokenBurned)
                    / COIN_DECIMALS
                    * Math.pow(10, tokenDecimals)
                ).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 9 })} EVE / token
              </div>
            </div>
          )}
        </div>
        {wallet.error && (
          <p style={{ color: "var(--color-danger, #f44336)", fontSize: "0.8rem", marginTop: "0.5rem" }}>
            Wallet error: {wallet.error}
          </p>
        )}
      </div>

      {/* V17: Bootstrap form RELOCATED to Tribe Governance Panel → Owner tab →
          Bootstrap Economy sub-tab. The Reserve Vault now only hosts deposit /
          withdrawal flows that depend on an already-bootstrapped economy. */}
      {effectiveLeaderCap && !isEconomyBootstrapped && (
        <div className="action-card" style={{ marginBottom: "1rem" }}>
          <h4 style={{ marginBottom: "0.25rem" }}>Bootstrap Required</h4>
          <p className="muted" style={{ fontSize: "0.82rem" }}>
            This tribe's economy has not been initialized yet. Open{" "}
            <strong>Tribe Governance → Owner → Bootstrap Economy</strong> to
            create the token ledger, vault, exchange config, withdrawal board,
            and mint/burn queue in one atomic transaction. Deposit and
            withdrawal flows below unlock after bootstrap.
          </p>
        </div>
      )}

      {/* Vault deposit section (TribeLeaderCap only; only after economy is bootstrapped) */}
      {effectiveLeaderCap && isEconomyBootstrapped && (
        <div className="action-card" style={{ marginBottom: "1rem" }}>
          <h4 style={{ marginBottom: "0.25rem" }}>Vault Funding</h4>
          <p className="muted" style={{ fontSize: "0.82rem", marginBottom: "0.5rem" }}>
            EVE enters the vault automatically from a portion of tribe shop
            tax revenue. As Tribe Leader, you can also top up the vault
            directly — additional EVE deepens the Exchange's available
            liquidity and raises sell-side payouts for token holders.
          </p>
          <button
            className="btn btn--primary btn--sm"
            onClick={() => setShowDeposit(true)}
            disabled={!depositReady || !tribeGovId}
          >
            Deposit EVE
          </button>
        </div>
      )}

      {/* Request withdrawal section — only after economy is bootstrapped */}
      {canRequest && isEconomyBootstrapped && (
        <div className="action-card" style={{ marginBottom: "1rem" }}>
          <h4 style={{ marginBottom: "0.75rem" }}>Request Withdrawal</h4>
          <p className="muted" style={{ fontSize: "0.82rem", marginBottom: "0.75rem" }}>
            Creates a multi-sig withdrawal request. Tribe Admins must
            approve via the per-request card below; once quorum is met,
            the request enters a 24h waiting period before it can be
            executed.
          </p>

          <div className="form-row" style={{ marginBottom: "0.5rem" }}>
            <label style={{ fontSize: "0.82rem" }}>Amount (EVE)</label>
            <input
              type="number"
              className="input"
              placeholder="0.000"
              min="0"
              step="0.001"
              value={withdrawAmountEve}
              onChange={e => setWithdrawAmountEve(e.target.value)}
            />
          </div>

          <div className="form-row" style={{ marginBottom: "0.75rem" }}>
            <label style={{ fontSize: "0.82rem" }}>Reason</label>
            <textarea
              className="input"
              placeholder="Explain the purpose of this withdrawal..."
              rows={3}
              style={{ resize: "vertical", fontFamily: "inherit" }}
              value={withdrawReason}
              onChange={e => setWithdrawReason(e.target.value)}
              maxLength={200}
            />
            <span className="muted" style={{ fontSize: "0.75rem" }}>{withdrawReason.length}/200</span>
          </div>

          {requestError && (
            <p style={{ color: "var(--color-danger, #f44336)", fontSize: "0.82rem", marginBottom: "0.5rem" }}>
              {requestError}
            </p>
          )}

          <button
            className="btn btn--primary btn--sm"
            disabled={
              requestLoading || withdrawAmountMist <= 0 || !withdrawReason.trim() || !requestReady
            }
            onClick={handleCreateRequest}
          >
            {requestLoading ? "Submitting..." : "Submit Withdrawal Request"}
          </button>
        </div>
      )}

      {!canRequest && !effectiveAdminCap && (
        <div className="action-card" style={{ marginBottom: "1rem" }}>
          <p className="muted" style={{ fontSize: "0.82rem" }}>
            You do not hold a TribeLeaderCap or TribeAdminCap for tribe
            #{tribeIdx}. Vault actions require one of these caps.
          </p>
        </div>
      )}

      {/* Requests tabs */}
      <div>
        <h4 style={{ marginBottom: "0.5rem" }}>Withdrawal Requests</h4>
        <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
          {reqTabConfig.map(t => (
            <button
              key={t.key}
              className={`btn btn--sm ${reqTab === t.key ? "btn--primary" : "btn--ghost"}`}
              onClick={() => setReqTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {reqLoading && <p className="muted">Loading requests...</p>}
        {reqError && <p style={{ color: "var(--color-danger, #f44336)" }}>{reqError}</p>}

        {!reqLoading && !reqError && (
          <>
            {reqTabConfig.find(t => t.key === reqTab)?.items.length === 0 && (
              <p className="muted" style={{ fontSize: "0.85rem" }}>No requests in this category.</p>
            )}
            {reqTabConfig.find(t => t.key === reqTab)?.items.map(req => (
              <WithdrawalRequestCard
                key={req.id}
                request={req}
                walletAddress={walletAddress}
                tribeGovernanceId={tribeGovId ?? ""}
                boardId={boardId ?? ""}
                vaultId={vaultId ?? ""}
                ledgerId={ledgerId ?? ""}
                configId={configId ?? ""}
                leaderCapId={effectiveLeaderCap}
                adminCapId={effectiveAdminCap}
                onActionDone={refetchRequests}
              />
            ))}
          </>
        )}
      </div>

      {showDeposit && effectiveLeaderCap && tribeGovId && vaultId && ledgerId && (
        <DepositModal
          onClose={() => setShowDeposit(false)}
          onSuccess={() => { setShowDeposit(false); wallet.refetch?.(); refetchRequests(); }}
          leaderCapId={effectiveLeaderCap}
          tribeGovernanceId={tribeGovId}
          vaultId={vaultId}
          ledgerId={ledgerId}
        />
      )}
    </div>
  );
  })();

  // Easy (1): tax routes to the leader's wallet — no multi-sig EVE reserve vault.
  if (tribeType === 1) {
    return (
      <div className="panel__section panel__section--notice">
        <p className="muted" style={{ lineHeight: "1.55", margin: 0 }}>
          The Reserve Vault is an Advanced-tier feature. Easy bazaars route tax
          revenue directly to the tribe leader&apos;s wallet — there is no
          multi-sig EVE reserve vault to manage.
        </p>
      </div>
    );
  }

  // Advanced (2) — and while the tribe type is still resolving (null), show the
  // vault content (it surfaces its own loading/bootstrap states).
  return content;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
