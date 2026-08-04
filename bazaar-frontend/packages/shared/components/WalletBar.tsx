// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useConnection, abbreviateAddress } from "@evefrontier/dapp-kit";
import { useRoles } from "@bazaar/shared/hooks/useRoles";
import { useClaimBoxContext } from "@bazaar/shared/contexts/ClaimBoxContext";
import { useBalances } from "@bazaar/shared/hooks/useBalances";
import { useTribeTokenBalanceManual } from "@bazaar/shared/hooks/useTribeTokenBalance";
import { COIN_DECIMALS, SSU_OBJECT_ID } from "@bazaar/shared/constants";
import { formatTribeAmount } from "@bazaar/shared/utils/tribeToken";

/** Derive a single display-label from role flags. Priority: Owner > Admin > Moderator > Member > Stranger */
function deriveRoleLabel(roles: { isOwner: boolean; isAdmin: boolean; isModerator: boolean; isMember: boolean }): string {
  if (roles.isOwner)     return "Owner";
  if (roles.isAdmin)     return "Admin";
  if (roles.isModerator) return "Moderator";
  if (roles.isMember)    return "Member";
  return "Stranger";
}

export default function WalletBar() {
  const { isConnected, walletAddress, handleConnect } = useConnection();
  const roles = useRoles(SSU_OBJECT_ID || null);
  const { isClaimable } = useClaimBoxContext();

  const { eveBalance } = useBalances();
  const eveAmt = eveBalance / COIN_DECIMALS;

  // Issue 3 (OS-59): suppress false "Stranger" flash while roles are loading.
  // roles.isLoading is true while the initial MemberRegistry RPC is in-flight.
  const roleLabel = roles.isLoading ? "..." : deriveRoleLabel(roles);
  // CSS class uses "loading" during loading to avoid invalid CSS class names.
  const roleCss   = roles.isLoading ? "loading" : roleLabel.toLowerCase();

  const { balances: tribeTokenBalances } = useTribeTokenBalanceManual(walletAddress ?? "");

  // Filter to non-zero tribe token balances for display
  const nonZeroTribeTokens = tribeTokenBalances.filter(b => b.value > 0);

  return (
    <div className="wallet-bar">
      <div className="wallet-bar__left">
        {isConnected && walletAddress ? (
          <>
            <span className="wallet-bar__address">{abbreviateAddress(walletAddress)}</span>
            <span className={`badge badge--role badge--role-${roleCss}`}>{roleLabel}</span>
            {isClaimable && (
              <span className="badge badge--setup-mode" title="The dApp has not been claimed yet">
                Unclaimed
              </span>
            )}
          </>
        ) : (
          <span className="wallet-bar__address">Not connected</span>
        )}
      </div>

      <div className="wallet-bar__balances">
        <span className="balance">
          <span className="balance__amount">{eveAmt.toFixed(2)}</span>
          <span className="balance__label">EVE</span>
        </span>
        {nonZeroTribeTokens.map(b => (
          <span key={`tribe-token-${b.tribeIdx}`} className="balance">
            {/* V26+ tribe tokens use the on-chain decimals (default 2). The legacy
                `b.value / COIN_DECIMALS` divisor was an EVE-side leftover that
                always rendered as 0.00 — fixed here via the scaled-unit formatter. */}
            <span className="balance__amount">{formatTribeAmount(b.value)}</span>
            <span
              className="balance__label"
              style={{ color: "rgba(218, 165, 32, 0.9)" }}
              title={`Tribe #${b.tribeIdx} token`}
            >
              {b.tokenSymbol || `T${b.tribeIdx}`}
            </span>
          </span>
        ))}
      </div>

      <div className="wallet-bar__right">
        <button
          className="btn btn--ghost btn--sm btn--refresh"
          onClick={() => window.dispatchEvent(new Event("bazar-soft-refresh"))}
          title="Refresh all data"
        >
          &#x21BB;
        </button>
        {!isConnected && (
          <button className="btn btn--primary" onClick={handleConnect}>Connect Wallet</button>
        )}
      </div>


    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
