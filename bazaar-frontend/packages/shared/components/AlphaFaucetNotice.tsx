// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// AlphaFaucetNotice.tsx — dismissable "Beta Notice" card shown on load when
// entering a bazaar / DappHub.
//
// Gas model: the Bazaar normally SPONSORS gas (packages/shared/gas/
// sponsorship.ts + the gas-sponsor Netlify Function), so most transactions are
// free and the player's wallet needs zero tokens. But if the sponsor wallet
// runs dry it falls back to user-paid gas, and a wallet with no tokens can't
// transact. So this card always appears on load to explain that and recommend
// grabbing a small 1-2 testnet-token buffer up front via the official CAPTCHA
// web faucet, as a safety net.
//
// The in-game EVE Frontier browser (CEF) CANNOT open external links, so the
// flow is copy-link-and-finish-in-desktop-Chrome: every link is a "Copy"
// button, not a navigation. The faucet only needs the user's wallet ADDRESS
// pasted in, so we also offer one-click "Copy my address".
//
// "×" hides it for the session; "Don't show again" persists via localStorage.

import { useState } from "react";
import { createPortal } from "react-dom";
import { useConnection } from "@evefrontier/dapp-kit";
import { FAUCET_URL, EVE_VAULT_EXTENSION_URL } from "@bazaar/shared/constants";
import { Z } from "@bazaar/shared/constants/zIndex";

const HIDE_FOREVER_KEY = "bazaar-alpha-faucet-notice-hidden";

function readHidden(): boolean {
  try { return localStorage.getItem(HIDE_FOREVER_KEY) === "1"; } catch { return false; }
}

const accent = "var(--accent, #cc7000)";

export default function AlphaFaucetNotice() {
  const { walletAddress } = useConnection();
  const [dismissed, setDismissed] = useState(false);
  const [hiddenForever, setHiddenForever] = useState(readHidden);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (dismissed || hiddenForever) return null;
  if (typeof document === "undefined") return null;

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(k => (k === key ? null : k)), 2000);
  }

  function hideForever() {
    try { localStorage.setItem(HIDE_FOREVER_KEY, "1"); } catch { /* ignore */ }
    setHiddenForever(true);
  }

  function CopyBtn({ k, value, label, disabled, title }: {
    k: string; value: string; label: string; disabled?: boolean; title?: string;
  }) {
    return (
      <button
        onClick={() => copy(k, value)}
        disabled={disabled}
        title={title ?? value}
        style={{
          flexShrink: 0,
          padding: "4px 9px",
          borderRadius: "4px",
          border: `1px solid ${accent}`,
          background: copiedKey === k ? accent : "transparent",
          color: copiedKey === k ? "#15120c" : accent,
          fontSize: "0.72rem",
          fontWeight: 600,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.45 : 1,
          whiteSpace: "nowrap",
        }}
      >
        {copiedKey === k ? "Copied!" : label}
      </button>
    );
  }

  const stepRow: React.CSSProperties = {
    display: "flex",
    gap: "8px",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "7px",
  };
  const stepText: React.CSSProperties = { flex: 1, color: "rgba(231,225,212,0.88)" };

  return createPortal(
    <div
      role="region"
      aria-label="Beta faucet notice"
      style={{
        position: "fixed",
        bottom: "16px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: Z.NOTICE,
        width: "min(470px, calc(100vw - 32px))",
        background: "rgba(15,12,8,0.96)",
        border: "1px solid rgba(204,112,0,0.5)",
        borderRadius: "8px",
        boxShadow: "0 0 24px rgba(204,112,0,0.18)",
        padding: "14px 16px",
        color: "#e7e1d4",
        fontSize: "0.84rem",
        lineHeight: 1.5,
        pointerEvents: "auto",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
        <strong style={{ color: accent, letterSpacing: "0.03em" }}>⚠ Beta Notice · testnet gas</strong>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          style={{ background: "transparent", border: "none", color: "rgba(231,225,212,0.55)", cursor: "pointer", fontSize: "1rem", lineHeight: 1, padding: "2px 4px" }}
        >
          ×
        </button>
      </div>

      <p style={{ margin: "0 0 8px" }}>
        For now the Bazaar usually <strong>covers your testnet token (gas) cost</strong>, so most
        transactions are free. If the Bazaar's sponsor wallet runs out of tokens it falls back to
        everyone paying their own gas, and a wallet with no tokens cannot make transactions.
      </p>
      <p style={{ margin: "0 0 10px" }}>
        As a safety net we recommend requesting <strong>1 or 2 testnet tokens</strong> to your EVE
        Frontier wallet (see the steps below). 1 or 2 usually lasts most of the cycle. The in-game
        browser can't open links, so copy what you need and finish in your{" "}
        <strong>desktop Chrome browser</strong>:
      </p>

      <div style={stepRow}>
        <span style={stepText}>
          <strong>1. (Optional)</strong> Install the EVE Frontier wallet Chrome extension and set it up.
        </span>
        <CopyBtn k="ext" value={EVE_VAULT_EXTENSION_URL} label="Copy link" title={EVE_VAULT_EXTENSION_URL} />
      </div>

      <div style={stepRow}>
        <span style={stepText}>
          <strong>2.</strong> Copy the Sui faucet link and open it in your desktop Chrome browser.
        </span>
        <CopyBtn k="faucet" value={FAUCET_URL} label="Copy link" title={FAUCET_URL} />
      </div>

      <div style={stepRow}>
        <span style={stepText}>
          <strong>3.</strong> On the faucet, choose <strong>Testnet</strong> and paste your wallet
          address (or connect your Frontier wallet via the extension).
        </span>
        <CopyBtn
          k="addr"
          value={walletAddress ?? ""}
          label={walletAddress ? "Copy address" : "Connect wallet"}
          disabled={!walletAddress}
          title={walletAddress ?? "Connect your wallet first"}
        />
      </div>

      <div style={{ ...stepRow, marginBottom: "10px" }}>
        <span style={stepText}>
          <strong>4.</strong> Click <strong>Request Tokens</strong> — done. Return in-game and trade.
        </span>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={hideForever}
          style={{ background: "transparent", border: "none", color: "rgba(231,225,212,0.45)", fontSize: "0.72rem", cursor: "pointer", whiteSpace: "nowrap" }}
        >
          Don't show again
        </button>
      </div>
    </div>,
    document.body,
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
