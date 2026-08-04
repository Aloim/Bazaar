// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// src/components/TribeRegistrationForm.tsx
// Multi-step wizard for self-service tribe registration.
// Step 1: Tribe name + description
// Step 2: Currency choice (EVE-Only vs custom TribeToken) + Advanced bootstrap
//         inputs (≥1 EVE vault seed, withdrawal quorum 1-10)
//
// Phase 6 W1 (LEAD-09 path-close): this form was the LAST caller of the legacy
// non-bundled builders — every tribe it created was governance-less (no
// TribeGovernance object; panel unusable until healed). It now uses the same
// single-PTB create+bootstrap builders as the hub overlays, so creation leaves
// nothing dormant. The Activate-Governance healing card covers tribes created
// before this fix.

import { useState } from "react";
import { Transaction } from "@mysten/sui/transactions";
import { dAppKit, useConnection } from "@evefrontier/dapp-kit";
import {
  buildCreateEasyTribeAndBootstrap,
  buildCreateAdvancedTribeAndBootstrap,
} from "@bazaar/shared/tx";
import { useDAppFees } from "@bazaar/shared/hooks";
import { splitEveCoin, pickEveCoinId } from "@bazaar/shared/hooks/useEveCoinSplitter";
import { COIN_DECIMALS } from "@bazaar/shared/constants";
import { formatSui } from "@bazaar/shared/utils";

type WizardStep = 1 | 2;
type SubmitStatus = "idle" | "signing" | "confirming" | "done" | "error";
type CurrencyMode = "eve-only" | "custom";

interface Props {
  onBack: () => void;
  onSuccess?: () => void;
}

export default function TribeRegistrationForm({ onBack, onSuccess }: Props) {
  const { walletAddress } = useConnection();
  const { data: fees } = useDAppFees();

  const [step, setStep] = useState<WizardStep>(1);

  // Step 1 fields
  const [tribeName, setTribeName] = useState("");
  const [tribeDescription, setTribeDescription] = useState("");

  // Step 2 fields
  const [currencyMode, setCurrencyMode] = useState<CurrencyMode>("eve-only");
  // V17: currencyName + currencyTicker now flow into create_advanced_tribe and
  // are persisted on the Tribe row. They surface read-only at bootstrap time
  // (Owner tab → Bootstrap Economy sub-tab) — no more double entry.
  const [currencyName, setCurrencyName] = useState("");
  const [currencyTicker, setCurrencyTicker] = useState("");
  // Advanced bootstrap inputs (Phase 6 W1): the single-PTB create+bootstrap
  // needs the ≥1 EVE vault seed and the withdrawal quorum up front.
  const [depositEve, setDepositEve] = useState("1");
  const [requiredApprovals, setRequiredApprovals] = useState("2");

  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const isEasy = currencyMode === "eve-only";
  const feeMist = (isEasy ? fees?.easyTribeCreationFee : fees?.advancedTribeCreationFee) ?? 0;

  // Validation
  const step1Valid = tribeName.trim().length >= 2 && tribeName.trim().length <= 64;
  const depositEveNum = parseFloat(depositEve || "0");
  const approvalsNum = parseInt(requiredApprovals || "0", 10);
  const depositValid = Number.isFinite(depositEveNum) && depositEveNum >= 1;
  // Phase 6 W3 (AUD-ADV-06): Move forwards the quorum UNBOUNDED at bootstrap;
  // the setter enforces [1,10]. Clamp here — >10 soft-locks the vault.
  const approvalsValid = Number.isFinite(approvalsNum) && approvalsNum >= 1 && approvalsNum <= 10;
  const step2Valid =
    isEasy ||
    (currencyName.trim().length >= 1 &&
      currencyTicker.trim().length >= 1 &&
      currencyTicker.trim().length <= 8 &&
      depositValid &&
      approvalsValid);

  async function handleSubmit() {
    if (!walletAddress) return;
    setSubmitStatus("signing");
    setErrorMsg("");
    try {
      // Phase 6 W1: bundled create+bootstrap (mirrors the hub overlays) — the
      // tribe is governable the moment the TX lands; nothing dormant.
      let tx: Transaction;
      if (isEasy) {
        tx = buildCreateEasyTribeAndBootstrap(
          tribeName.trim(), tribeDescription.trim(), 0, walletAddress!, 0, feeMist,
          feeMist > 0 ? await pickEveCoinId(walletAddress!, feeMist) : null,
        );
      } else {
        // Creation fee comes from the largest EVE coin (pickEveCoinId) — also
        // splitEveCoin's primary source, so the two splits don't conflict.
        let eveCoinId: string | null = null;
        if (feeMist > 0) {
          eveCoinId = await pickEveCoinId(walletAddress!, feeMist);
          if (!eveCoinId) throw new Error(`Creation fee is ${formatSui(feeMist)} EVE — no single EVE coin in your wallet covers it.`);
        }
        const depositMist = Math.floor(depositEveNum * COIN_DECIMALS);
        tx = new Transaction();
        const { coinArg: depositCoin } = await splitEveCoin(walletAddress!, BigInt(depositMist), tx);
        buildCreateAdvancedTribeAndBootstrap({
          name: tribeName.trim(),
          description: tribeDescription.trim(),
          tokenName: currencyName.trim(),
          tokenSymbol: currencyTicker.trim().toUpperCase(),
          joinPolicy: 0,
          senderAddress: walletAddress!,
          governanceMode: 0,
          feeMist,
          eveCoinId,
          depositCoin,
          requiredApprovals: approvalsNum,
          tx,
        });
      }
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setSubmitStatus("confirming");
      setTimeout(() => {
        setSubmitStatus("done");
        onSuccess?.();
      }, 3000);
    } catch (err: unknown) {
      setSubmitStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Transaction failed");
    }
  }

  if (submitStatus === "done") {
    return (
      <div className="panel" style={panelStyle}>
        <div className="panel__header">
          <button className="btn btn--ghost btn--sm" onClick={onBack}>Back</button>
          <h2>Tribe Registered</h2>
        </div>
        <div className="panel__section" style={{ textAlign: "center", padding: "2rem" }}>
          <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>
            Tribe Created!
          </div>
          <p style={{ color: "var(--color-success, #4caf50)", marginBottom: "0.5rem" }}>
            Your tribe "{tribeName}" has been registered on-chain.
          </p>
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            Your TribeLeaderCap has been transferred to your wallet and tribe
            governance is bootstrapped — manage everything from My Tribe
            Governance, no SSU required.
          </p>
          <button
            className="btn btn--primary"
            onClick={onBack}
            style={{ marginTop: "1.5rem" }}
          >
            Return to Portal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel" style={panelStyle}>
      <div className="panel__header">
        <button className="btn btn--ghost btn--sm" onClick={onBack}>Back</button>
        <h2>Register a Tribe</h2>
        <span className="muted" style={{ fontSize: "0.75rem", marginLeft: "auto" }}>
          Step {step} of 2
        </span>
      </div>

      {/* Step indicator */}
      <div style={stepIndicatorStyle}>
        <div style={stepDotStyle(step >= 1)}>1</div>
        <div style={stepLineStyle} />
        <div style={stepDotStyle(step >= 2)}>2</div>
      </div>

      {/* Step 1: Tribe Identity */}
      {step === 1 && (
        <div className="panel__section">
          <div style={fieldGroupStyle}>
            <label style={labelStyle}>Tribe Name *</label>
            <input
              className="input"
              type="text"
              value={tribeName}
              onChange={e => setTribeName(e.target.value)}
              placeholder="Enter tribe name (2-64 characters)"
              maxLength={64}
              style={inputStyle}
            />
            <span className="muted" style={{ fontSize: "0.75rem" }}>
              {tribeName.length}/64 characters
            </span>
          </div>
          <div style={fieldGroupStyle}>
            <label style={labelStyle}>Description</label>
            <textarea
              className="input"
              value={tribeDescription}
              onChange={e => setTribeDescription(e.target.value)}
              placeholder="Describe your tribe (optional)"
              maxLength={256}
              rows={3}
              style={{ ...inputStyle, resize: "vertical", minHeight: "4rem" }}
            />
            <span className="muted" style={{ fontSize: "0.75rem" }}>
              {tribeDescription.length}/256 characters
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
            <button
              className="btn btn--primary"
              onClick={() => setStep(2)}
              disabled={!step1Valid}
            >
              Next: Currency Setup
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Currency Choice */}
      {step === 2 && (
        <div className="panel__section">
          <div style={fieldGroupStyle}>
            <label style={labelStyle}>Currency Type *</label>
            <div style={radioGroupStyle}>
              <label style={radioLabelStyle}>
                <input
                  type="radio"
                  name="currencyMode"
                  value="eve-only"
                  checked={currencyMode === "eve-only"}
                  onChange={() => setCurrencyMode("eve-only")}
                />
                <span>
                  <strong>EVE-Only</strong>
                  <span className="muted" style={{ display: "block", fontSize: "0.75rem", color: "var(--accent)", marginBottom: "0.25rem" }}>
                    Recommended for solo players or small groups
                  </span>
                  <span className="muted" style={{ display: "block", fontSize: "0.8rem" }}>
                    All shops trade in Frontier's EVE coin. Easier to manage —
                    no coin minting, burning, or circulation management needed.
                    A custom dApp tax is applied on each shop transaction.
                  </span>
                </span>
              </label>
              <label style={radioLabelStyle}>
                <input
                  type="radio"
                  name="currencyMode"
                  value="custom"
                  checked={currencyMode === "custom"}
                  onChange={() => setCurrencyMode("custom")}
                />
                <span>
                  <strong>Create Custom Currency</strong>
                  <span className="muted" style={{ display: "block", fontSize: "0.75rem", color: "var(--accent)", marginBottom: "0.25rem" }}>
                    Advanced: For medium-sized to large tribes
                  </span>
                  <span className="muted" style={{ display: "block", fontSize: "0.8rem" }}>
                    Your tribe gets its own custom currency (TribeToken). Members trade
                    using your token, and you manage minting, burning, and circulation.
                    A small maintenance fee (~1% on average) in EVE is applied on each
                    exchange between EVE and your TribeToken.
                  </span>
                </span>
              </label>
            </div>
          </div>

          {currencyMode === "custom" && (
            <>
              <div style={fieldGroupStyle}>
                <label style={labelStyle}>Currency Name *</label>
                <input
                  className="input"
                  type="text"
                  value={currencyName}
                  onChange={e => setCurrencyName(e.target.value)}
                  placeholder="e.g. Iron Gold"
                  maxLength={32}
                  style={inputStyle}
                />
              </div>
              <div style={fieldGroupStyle}>
                <label style={labelStyle}>Ticker Symbol * (1-8 characters)</label>
                <input
                  className="input"
                  type="text"
                  value={currencyTicker}
                  onChange={e => setCurrencyTicker(e.target.value.toUpperCase())}
                  placeholder="e.g. IGOLD"
                  maxLength={8}
                  style={{ ...inputStyle, maxWidth: "12rem" }}
                />
              </div>
              <div style={fieldGroupStyle}>
                <label style={labelStyle}>Initial EVE Deposit * (min 1 EVE)</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  step="0.001"
                  value={depositEve}
                  onChange={e => setDepositEve(e.target.value)}
                  style={{ ...inputStyle, maxWidth: "12rem" }}
                />
                <span className="muted" style={{ fontSize: "0.75rem" }}>
                  Seeds the Tribe Vault — your exchange&apos;s starting EVE
                  liquidity. Genesis tribe tokens are minted to your Tribe
                  Wallet automatically.
                </span>
              </div>
              <div style={fieldGroupStyle}>
                <label style={labelStyle}>Required Withdrawal Approvals * (1-10)</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={10}
                  step={1}
                  value={requiredApprovals}
                  onChange={e => setRequiredApprovals(e.target.value)}
                  style={{ ...inputStyle, maxWidth: "12rem" }}
                />
                <span className="muted" style={{ fontSize: "0.75rem" }}>
                  Tribe Admin approvals needed to release a vault withdrawal
                  (setting it above your admin count locks the vault until
                  lowered).
                </span>
              </div>
            </>
          )}

          {submitStatus === "error" && (
            <p style={{ color: "var(--color-error, #f44336)", fontSize: "0.85rem", marginTop: "0.5rem" }}>
              {errorMsg}
            </p>
          )}

          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "1rem" }}>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => setStep(1)}
              disabled={submitStatus === "signing" || submitStatus === "confirming"}
            >
              Back
            </button>
            <button
              className="btn btn--primary"
              onClick={handleSubmit}
              disabled={!step2Valid || submitStatus === "signing" || submitStatus === "confirming" || !walletAddress}
            >
              {submitStatus === "signing"
                ? "Signing..."
                : submitStatus === "confirming"
                ? "Confirming..."
                : feeMist > 0
                ? `Register Tribe (${formatSui(feeMist)} EVE)`
                : "Register Tribe (Free)"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Inline style constants ─────────────────────────────────────────────────────

import React from "react";

const panelStyle: React.CSSProperties = {
  maxWidth: 560,
  background: "var(--surface)",
};

const stepIndicatorStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 0,
  padding: "0.75rem 1rem",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
};

function stepDotStyle(active: boolean): React.CSSProperties {
  return {
    width: 28,
    height: 28,
    borderRadius: "50%",
    background: active ? "var(--accent, #cc7000)" : "rgba(255,255,255,0.1)",
    color: active ? "#000" : "#666",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "0.8rem",
    fontWeight: 700,
    transition: "background 0.2s",
  };
}

const stepLineStyle: React.CSSProperties = {
  flex: 1,
  maxWidth: 80,
  height: 2,
  background: "rgba(255,255,255,0.1)",
};

const fieldGroupStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
  marginBottom: "1rem",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.8rem",
  color: "#aaa",
  fontFamily: "var(--font)",
  letterSpacing: "0.06em",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
};

const radioGroupStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
};

const radioLabelStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.75rem",
  alignItems: "flex-start",
  cursor: "pointer",
  padding: "0.75rem",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 4,
};

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
