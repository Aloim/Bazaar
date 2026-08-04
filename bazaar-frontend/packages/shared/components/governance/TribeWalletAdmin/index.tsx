// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * TribeWalletAdminBlock — V20.
 *
 * Renders the Withdraw / Deposit / Logs button row plus the 3 modals.
 * Kept as a co-located block so TribeAssetsTab.tsx stays under the
 * 500-LOC file guard.
 */

import { useState } from "react";
import TribeWalletWithdrawModal from "./TribeWalletWithdrawModal";
import TribeWalletDepositModal  from "./TribeWalletDepositModal";
import TribeWalletLogsModal     from "./TribeWalletLogsModal";
import { TRIBE_TOKEN_DECIMALS } from "@bazaar/shared/utils/tribeToken";

interface Props {
  leaderCapId:        string | null;
  superAdminCapId:    string | null;
  tribeGovernanceId:  string | null;
  ledgerId:           string | null;
  tribeId:            number | null;
  walletBalance:      number;
  callerBalance:      number;
  tokenSymbol:        string;
  /** On-chain ledger decimals (V26+ default 2). */
  decimals?:          number;
  onSuccess:          () => void;
}

export default function TribeWalletAdminBlock({
  leaderCapId, superAdminCapId,
  tribeGovernanceId, ledgerId, tribeId,
  walletBalance, callerBalance, tokenSymbol,
  decimals = TRIBE_TOKEN_DECIMALS,
  onSuccess,
}: Props) {
  const [openModal, setOpenModal] = useState<"withdraw" | "deposit" | "logs" | null>(null);
  const hasLeaderOrSA = !!(leaderCapId || superAdminCapId);

  return (
    <>
      <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.65rem", flexWrap: "wrap" }}>
        <button
          className="btn btn--primary btn--sm"
          disabled={!hasLeaderOrSA || !tribeGovernanceId || !ledgerId}
          title={!hasLeaderOrSA ? "Requires TribeLeaderCap or TribeSuperAdminCap" : ""}
          onClick={() => setOpenModal("withdraw")}
        >
          Withdraw
        </button>
        <button
          className="btn btn--ghost btn--sm"
          disabled={!tribeGovernanceId || !ledgerId || callerBalance === 0}
          title={callerBalance === 0 ? "Your balance is 0" : ""}
          onClick={() => setOpenModal("deposit")}
        >
          Deposit
        </button>
        <button
          className="btn btn--ghost btn--sm"
          disabled={!tribeId}
          onClick={() => setOpenModal("logs")}
        >
          Logs
        </button>
      </div>

      {tribeGovernanceId && ledgerId && (
        <TribeWalletWithdrawModal
          open={openModal === "withdraw"}
          onClose={() => setOpenModal(null)}
          onSuccess={onSuccess}
          leaderCapId={leaderCapId}
          superAdminCapId={superAdminCapId}
          tribeGovernanceId={tribeGovernanceId}
          ledgerId={ledgerId}
          walletBalance={walletBalance}
          tokenSymbol={tokenSymbol}
          decimals={decimals}
        />
      )}
      {tribeGovernanceId && ledgerId && (
        <TribeWalletDepositModal
          open={openModal === "deposit"}
          onClose={() => setOpenModal(null)}
          onSuccess={onSuccess}
          tribeGovernanceId={tribeGovernanceId}
          ledgerId={ledgerId}
          callerBalance={callerBalance}
          tokenSymbol={tokenSymbol}
          decimals={decimals}
        />
      )}
      <TribeWalletLogsModal
        open={openModal === "logs"}
        onClose={() => setOpenModal(null)}
        tribeId={tribeId}
        tokenSymbol={tokenSymbol}
        decimals={decimals}
      />
    </>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
