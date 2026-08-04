// WalletBar.tsx — Top bar showing wallet connection status and connect button.
// Follows the Bazar1 WalletBar layout pattern but simplified for DappHub
// (no role badges or balances — those belong to the per-SSU apps).

import { useConnection } from "@evefrontier/dapp-kit";

function abbreviateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function WalletBar() {
  const { isConnected, walletAddress, handleConnect } = useConnection();

  return (
    <div className="wallet-bar">
      <div className="wallet-bar__left">
        {isConnected && walletAddress ? (
          <span className="wallet-bar__address">
            {abbreviateAddress(walletAddress)}
          </span>
        ) : (
          <span className="wallet-bar__address">Not connected</span>
        )}
      </div>

      <div style={{
        fontFamily: "var(--font-display)",
        fontSize: "0.9rem",
        color: "var(--accent)",
        letterSpacing: "0.15em",
        textTransform: "uppercase",
      }}>
        BAZAAR
      </div>

      <div className="wallet-bar__right">
        {!isConnected && (
          <button className="btn btn--primary" onClick={handleConnect}>
            Connect Wallet
          </button>
        )}
      </div>
    </div>
  );
}
