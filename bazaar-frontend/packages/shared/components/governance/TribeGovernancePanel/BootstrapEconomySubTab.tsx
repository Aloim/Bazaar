// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BootstrapEconomySubTab
 *
 * Sub-tab of the Tribe Governance Owner tab. Houses the single-call atomic
 * bootstrap form for Advanced tribes.
 *
 * V19 → V23 timeline:
 *   - V19: Form field is "Initial EVE Deposit" (not "Initial Reserve"). The
 *     entered amount is split from the user's Coin<EVE> and deposited into
 *     the freshly-created TribeVault as part of the bootstrap PTB.
 *   - V19: 100,000 tribe tokens are minted automatically to the Tribe Wallet
 *     at bootstrap (one-shot genesis allocation, bypasses Article XIII.4).
 *   - V23: Reserve at bootstrap is 0 (was 1 EVE). The 1 EVE seed deposit is
 *     fully available as exchange liquidity immediately — no more "deposit 1
 *     extra EVE" friction. Exchange also auto-activates inside the bootstrap
 *     PTB, so the Exchange beacon is usable the moment the tribe is live.
 *
 * Behavior:
 *   - Visible to TribeLeaderCap holders only.
 *   - For Easy tribes, shows an "Easy tribes use a separate bootstrap" notice.
 *   - For Advanced tribes pre-bootstrap: read-only token name + symbol from
 *     the on-chain Tribe row, Initial EVE Deposit (≥ 1 EVE mandatory seed),
 *     required Approval quorum (default 2, min 1), and a Bootstrap button
 *     calling bazaar_economy::bootstrap_advanced_complete.
 *   - Post-bootstrap, shows a success summary linking to the Reserve Vault tab.
 */

import { useState } from "react";
import { Transaction } from "@mysten/sui/transactions";
import { dAppKit, useConnection } from "@evefrontier/dapp-kit";
import { useTribeCaps } from "@bazaar/shared/hooks/useTribeCaps";
import { useTribeRegistry } from "@bazaar/shared/hooks/useTribeRegistry";
import { useTribeAssets } from "@bazaar/shared/hooks/useTribeAssets";
import { splitEveCoin } from "@bazaar/shared/hooks/useEveCoinSplitter";
import { buildBootstrapAdvancedComplete } from "@bazaar/shared/tx/bazaareconomy/governance-tx";
import { COIN_DECIMALS, TRIBE_REGISTRY_ID, PACKAGE_IDS } from "@bazaar/shared/constants";
import { formatTribeAmount } from "@bazaar/shared/utils/tribeToken";
import { useToast } from "@bazaar/shared/components";

// V26+ — Move-side GENESIS_MINT_AMOUNT in scaled units (= 100,000.00 display
// tokens under decimals=2). Mirrors `economy_governance.move:64` so the copy
// stays in sync if the constant ever changes.
const GENESIS_MINT_SCALED = 10_000_000;

const BAZAAR_TYPE_EASY = 1;
const BAZAAR_TYPE_ADVANCED = 2;

export function BootstrapEconomySubTab() {
  const { walletAddress } = useConnection();
  const { leaderCapId, leaderTribeIdx } = useTribeCaps();
  const { tribes, refetch: refetchRegistry } = useTribeRegistry();
  const assets = useTribeAssets(leaderTribeIdx);
  const toast = useToast();

  // Resolve the current tribe row for token name/symbol + bazaar_type.
  const tribe = leaderTribeIdx !== null
    ? tribes.find(t => t.idx === leaderTribeIdx)
    : null;

  const [depositEve, setDepositEve] = useState("1");
  const [requiredApprovals, setRequiredApprovals] = useState("2");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ── Gate 1: TribeLeaderCap required ─────────────────────────────────────────
  if (!leaderCapId) {
    return (
      <div className="action-card">
        <h4>Bootstrap Economy</h4>
        <p className="muted" style={{ fontSize: "0.82rem" }}>
          Requires <strong>TribeLeaderCap</strong>. Only the tribe leader can
          bootstrap the economy.
        </p>
      </div>
    );
  }

  // Registry still loading.
  if (!tribe) {
    return (
      <div className="action-card">
        <h4>Bootstrap Economy</h4>
        <p className="muted" style={{ fontSize: "0.82rem" }}>Loading tribe data…</p>
      </div>
    );
  }

  // ── Gate 2: Easy tribes don't need (and can't run) this flow ────────────────
  if (tribe.bazaarType === BAZAAR_TYPE_EASY) {
    return (
      <div className="action-card">
        <h4>Bootstrap Economy</h4>
        <p className="muted" style={{ fontSize: "0.82rem" }}>
          This is an <strong>Easy</strong> tribe — it does not maintain its own
          token ledger, vault, or exchange. Easy tribes only need
          <em> bootstrap_tribe_governance</em>, which is run separately.
        </p>
      </div>
    );
  }

  // Gate 3: only Advanced from here onward. Anything else is malformed registry.
  if (tribe.bazaarType !== BAZAAR_TYPE_ADVANCED) {
    return (
      <div className="action-card">
        <h4>Bootstrap Economy</h4>
        <p style={{ color: "var(--color-danger, #f44336)", fontSize: "0.82rem" }}>
          Unsupported bazaar_type ({tribe.bazaarType}). Expected 1 (Easy) or 2 (Advanced).
        </p>
      </div>
    );
  }

  // ── Already bootstrapped — show success summary ──────────────────────────────
  if (assets.isFullyBootstrapped) {
    return (
      <div className="action-card">
        <h4>Bootstrap Economy</h4>
        <p style={{ color: "#4ade80", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
          ✓ Tribe economy is fully bootstrapped.
        </p>
        <p className="muted" style={{ fontSize: "0.78rem", marginBottom: "0.5rem" }}>
          Token: <strong>{tribe.tokenName ?? "—"}</strong> ({tribe.tokenSymbol ?? "—"})
        </p>
        <p className="muted" style={{ fontSize: "0.78rem" }}>
          Ongoing operations (deposits, withdrawals, mint/burn, exchange) live in
          the <strong>Reserve Vault</strong> tab and the SuperAdmin tabs.
        </p>
      </div>
    );
  }

  // ── Gate 4: token identity must be present on the Tribe row (V17 invariant) ──
  if (!tribe.tokenName || !tribe.tokenSymbol) {
    return (
      <div className="action-card">
        <h4>Bootstrap Economy</h4>
        <p style={{ color: "var(--color-danger, #f44336)", fontSize: "0.82rem" }}>
          This Advanced tribe was created without a token name/symbol. This
          should not be possible under V17 — please contact support.
        </p>
      </div>
    );
  }

  // ── Pre-bootstrap form ──────────────────────────────────────────────────────
  const depositEveNum = parseFloat(depositEve || "0");
  const approvalsNum = parseInt(requiredApprovals || "0", 10);
  const depositValid = Number.isFinite(depositEveNum) && depositEveNum >= 1;
  // Phase 6 W3 (AUD-ADV-06): bootstrap_advanced_complete forwards the quorum
  // UNBOUNDED (economy_governance.move:243) while the post-creation setter
  // enforces [MIN_QUORUM=1, MAX_QUORUM=10] (:537, :54-55). Clamp client-side —
  // a quorum above the admin count soft-locks the vault until re-set.
  const approvalsValid = Number.isFinite(approvalsNum) && approvalsNum >= 1 && approvalsNum <= 10;
  const walletReady = !!walletAddress;
  const canSubmit = depositValid && approvalsValid && walletReady && !loading;

  async function handleBootstrap() {
    if (!leaderCapId) return;
    if (!walletAddress) {
      setError("Connect your wallet before bootstrapping.");
      return;
    }
    if (!depositValid) {
      setError("Initial EVE Deposit must be at least 1 EVE.");
      return;
    }
    if (!approvalsValid) {
      setError("Required Approvals must be between 1 and 10 (on-chain quorum bounds).");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const depositMist = Math.floor(depositEveNum * COIN_DECIMALS);
      const tx = new Transaction();
      const { coinArg } = await splitEveCoin(walletAddress, BigInt(depositMist), tx);
      buildBootstrapAdvancedComplete(
        {
          leaderCapId,
          tribeRegistryId: TRIBE_REGISTRY_ID,
          packageId: PACKAGE_IDS.BAZAAR_CORE,
          initialDepositCoin: coinArg,
          initialRequiredApprovals: approvalsNum,
        },
        tx,
      );
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      // Refetch the registry so the next render sees the new gov/economy IDs.
      refetchRegistry();
      toast.success("Tribe economy bootstrapped successfully", {
        detail: `Token: ${tribe?.tokenName ?? "—"} (${tribe?.tokenSymbol ?? "—"}). ${formatTribeAmount(GENESIS_MINT_SCALED)} ${tribe?.tokenSymbol ?? ""} minted to your Tribe Wallet.`,
        duration: 7000,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Bootstrap transaction failed.";
      setError(msg);
      toast.error("Bootstrap failed", { detail: msg, duration: 9000 });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="action-card">
      <h4 style={{ marginBottom: "0.25rem" }}>Bootstrap Economy</h4>
      <p className="muted" style={{ fontSize: "0.82rem", marginBottom: "0.75rem" }}>
        This tribe's economy has not been initialized yet. As Tribe Leader, you
        can bootstrap it now — a single transaction creates the Tribe Governance,
        Widget Config, Token Ledger, Vault, Exchange Config, Withdrawal Board,
        and Mint/Burn Queue. Your <strong>Initial EVE Deposit</strong> (≥ 1 EVE
        mandatory) is seeded directly into the Tribe Vault and immediately
        backs the Exchange — the reserve starts at 0, so every EVE you seed
        is live AMM liquidity. <strong>{formatTribeAmount(GENESIS_MINT_SCALED)} {tribe.tokenSymbol}</strong> are
        minted to your Tribe Wallet automatically, and the Exchange beacon
        activates as part of the same transaction. Token name and symbol were
        set at tribe creation and cannot be changed.
      </p>

      <div className="form-row" style={{ marginBottom: "0.5rem" }}>
        <label style={{ fontSize: "0.82rem" }}>Token Name (locked)</label>
        <input
          className="input"
          value={tribe.tokenName}
          readOnly
          disabled
          style={{ opacity: 0.7, cursor: "not-allowed" }}
        />
      </div>

      <div className="form-row" style={{ marginBottom: "0.5rem" }}>
        <label style={{ fontSize: "0.82rem" }}>Token Symbol (locked)</label>
        <input
          className="input"
          value={tribe.tokenSymbol}
          readOnly
          disabled
          style={{ opacity: 0.7, cursor: "not-allowed" }}
        />
      </div>

      <div className="form-row" style={{ marginBottom: "0.5rem" }}>
        <label style={{ fontSize: "0.82rem" }}>
          Initial EVE Deposit <span style={{ color: "var(--color-danger, #f44336)" }}>*</span>
        </label>
        <input
          type="number"
          className="input"
          placeholder="1"
          min="1"
          step="0.001"
          value={depositEve}
          onChange={e => setDepositEve(e.target.value)}
        />
        <span className="muted" style={{ fontSize: "0.72rem" }}>
          Required — minimum 1 EVE. Deposited into the Tribe Vault and used as
          the Exchange's starting liquidity (reserve is 0 at bootstrap).
        </span>
      </div>

      <div className="form-row" style={{ marginBottom: "0.75rem" }}>
        <label style={{ fontSize: "0.82rem" }}>
          Required Withdrawal Approvals <span style={{ color: "var(--color-danger, #f44336)" }}>*</span>
        </label>
        <input
          type="number"
          className="input"
          min="1"
          max="10"
          step="1"
          value={requiredApprovals}
          onChange={e => setRequiredApprovals(e.target.value)}
        />
        <span className="muted" style={{ fontSize: "0.72rem" }}>
          Tribe Admin approvals needed to release a vault withdrawal request
          (1–10). Setting it above your admin count soft-locks the vault until
          a leader lowers it.
        </span>
      </div>

      {error && (
        <p style={{ color: "var(--color-danger, #f44336)", fontSize: "0.82rem", marginBottom: "0.5rem" }}>
          {error}
        </p>
      )}

      <button
        className="btn btn--primary btn--sm"
        disabled={!canSubmit}
        onClick={handleBootstrap}
      >
        {loading ? "Bootstrapping…" : "Bootstrap Economy"}
      </button>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
