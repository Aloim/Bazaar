// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * AdvancedSSUWalletPanel — Advanced bazaar Tribe-Token tax wallet view.
 *
 * Renders the SSU's tribe-token tax credit balance + V26 Withdraw / Deposit
 * controls. Withdraw moves credits from the SSU row to a player; Deposit
 * moves caller balance into the SSU row. SSUOwnerCap-gated on withdraw.
 *
 * Resolution chain:
 *   ssuGovId → SSUGovernance.tribeId → tribe economy { ledgerId } →
 *   tribe_token_ledger::balance_of(ssuId) (SSU row) +
 *   tribe_token_ledger::balance_of(walletAddress) (caller row).
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { useState } from "react";
import { useConnection } from "@evefrontier/dapp-kit";
import { useSSUGovernanceConfig } from "@bazaar/shared/hooks";
import { useTribeEconomyObjects } from "@bazaar/shared/hooks/bazaareconomy/economy-resolution-hooks";
import { useTribeTokenBalance } from "@bazaar/shared/hooks/bazaareconomy/ledger-hooks";
import { useTribeTokenSymbol } from "@bazaar/shared/hooks/bazaareconomy/useTribeTokenSymbol";
import { useTribeExchange } from "@bazaar/shared/hooks/useTribeExchange";
import { formatTribeAmount } from "@bazaar/shared/utils/tribeToken";
import SSUCreditAdmin from "./SSUCreditAdmin";
import SSUCreditRedeemModal from "./SSUCreditRedeemModal";
import { InitSSUEconomyButton } from "./InitSSUEconomyButton";
import { useTribeGovId } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";

interface AdvancedSSUWalletPanelProps {
  ssuId: string;
  ssuGovId: string;
  hasOwnerCap: boolean;
  /** SSUOwnerCap object ID — required for V26 Withdraw (transfer_ssu_credit_to_player). */
  ssuOwnerCapId: string | null;
}

export function AdvancedSSUWalletPanel({
  ssuId, ssuGovId, hasOwnerCap, ssuOwnerCapId,
}: AdvancedSSUWalletPanelProps) {
  const { walletAddress } = useConnection();
  const { data: govConfig } = useSSUGovernanceConfig(ssuGovId || null);
  const tribeIdNum = govConfig?.tribeId ?? null;
  const tribeIdStr = tribeIdNum != null && tribeIdNum > 0 ? String(tribeIdNum) : null;
  const { data: economyIds, isLoading: econLoading } = useTribeEconomyObjects(tribeIdStr);
  const { data: tribeGovId } = useTribeGovId(tribeIdStr);
  const ledgerId = economyIds?.ledgerId ?? null;
  const vaultId  = economyIds?.vaultId ?? null;
  const configId = economyIds?.configId ?? null;
  const { data: balanceRow, isLoading: balLoading, refetch: refetchSSU } =
    useTribeTokenBalance(ledgerId, ssuId || null);
  const { data: callerRow, refetch: refetchCaller } =
    useTribeTokenBalance(ledgerId, walletAddress ?? null);
  const { symbol: resolvedSymbol } = useTribeTokenSymbol(tribeIdNum);
  // Pool reads for the redeem quote (Phase 6 W6 — legacy rate + V28 comparison).
  const pool = useTribeExchange(
    configId ?? "", vaultId ?? "", ledgerId ?? "", tribeGovId ?? "",
  );
  const [showRedeem, setShowRedeem] = useState(false);
  const tokenSymbol = resolvedSymbol || "Tribe Tokens";
  const loading = econLoading || balLoading;
  const balance = balanceRow?.balance ?? 0;
  const decimals = balanceRow?.decimals ?? 2;
  const callerBalance = callerRow?.balance ?? 0;
  const redeemReady = !!(ssuOwnerCapId && ledgerId && vaultId && configId);

  return (
    <div className="panel__section">
      <div className="action-card">
        <h4>SSU Tax Wallet — {tokenSymbol}</h4>
        <div style={{ marginTop: "0.5rem" }}>
          <span className="muted" style={{ fontSize: "0.75rem", display: "block" }}>
            Accumulated tax credits
          </span>
          <span
            style={{
              fontSize: "1.4rem",
              fontFamily: "var(--font-display)",
              color: "var(--accent2)",
            }}
          >
            {loading ? "…" : formatTribeAmount(balance, { decimals })} {tokenSymbol}
          </span>
        </div>
      </div>

      {hasOwnerCap && ssuOwnerCapId && (
        <InitSSUEconomyButton
          ssuId={ssuId}
          ssuGovId={ssuGovId}
          ssuOwnerCapId={ssuOwnerCapId}
          tribeGovId={tribeGovId ?? null}
          ledgerId={ledgerId}
          tokenSymbol={tokenSymbol}
          onSuccess={() => { refetchSSU(); refetchCaller(); }}
        />
      )}

      <div className="action-card" style={{ marginTop: "1rem" }}>
        <h4>Withdraw / Deposit</h4>
        {!hasOwnerCap && (
          <p className="muted" style={{ fontSize: "0.75rem", margin: "0.25rem 0 0.5rem 0" }}>
            SSU Owner cap required to withdraw. Deposit is permissionless.
          </p>
        )}
        {ledgerId ? (
          <SSUCreditAdmin
            ssuGovId={ssuGovId}
            ssuOwnerCapId={hasOwnerCap ? ssuOwnerCapId : null}
            ledgerId={ledgerId}
            ssuBalance={balance}
            callerBalance={callerBalance}
            tokenSymbol={tokenSymbol}
            decimals={decimals}
            onSuccess={() => { refetchSSU(); refetchCaller(); }}
          />
        ) : (
          <p className="muted" style={{ fontSize: "0.75rem" }}>
            Tribe economy not yet bootstrapped for this SSU.
          </p>
        )}
      </div>

      {/* Phase 6 W6 (AUD-ADV-19 / LEAD-03): EVE redemption of SSU tax credits —
          first consumer of buildWithdrawSSUTaxCredits. Owner-cap-gated on-chain;
          the button merely mirrors that gate. */}
      <div className="action-card" style={{ marginTop: "1rem" }}>
        <h4>Redeem for EVE</h4>
        <p className="muted" style={{ fontSize: "0.75rem", margin: "0.25rem 0 0.5rem 0" }}>
          Burn SSU tax credits and receive EVE from the Tribe Vault at the
          ledger rate. Rates differ from Exchange swaps — the modal shows both.
        </p>
        <button
          className="btn btn--primary btn--sm"
          disabled={!hasOwnerCap || !redeemReady || balance === 0}
          title={
            !hasOwnerCap ? "SSU Owner cap required"
            : !redeemReady ? "Tribe economy objects not resolved yet"
            : balance === 0 ? "SSU tax row is empty" : ""
          }
          onClick={() => setShowRedeem(true)}
        >
          Redeem for EVE
        </button>
      </div>

      {showRedeem && redeemReady && (
        <SSUCreditRedeemModal
          ssuGovId={ssuGovId}
          ssuOwnerCapId={ssuOwnerCapId!}
          ledgerId={ledgerId!}
          vaultId={vaultId!}
          configId={configId!}
          ssuBalance={balance}
          vaultEveBalance={pool.eveBalance}
          reserveMist={pool.reserveMist}
          totalSupply={pool.totalSupply}
          tribeWalletBalance={pool.tribeWalletBalance}
          tokenSymbol={tokenSymbol}
          decimals={decimals}
          onClose={() => setShowRedeem(false)}
          onSuccess={() => {
            setShowRedeem(false);
            refetchSSU();
            refetchCaller();
            pool.refetch();
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
