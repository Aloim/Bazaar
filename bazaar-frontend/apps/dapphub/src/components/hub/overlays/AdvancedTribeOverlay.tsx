// AdvancedTribeOverlay.tsx — "Create an Advanced Tribe" 3-step wizard overlay.
// New Station-Hub visual; wired to the live create_advanced_tribe TX flow.

import { useState } from "react";
import { Transaction } from "@mysten/sui/transactions";
import { useConnection, dAppKit } from "@evefrontier/dapp-kit";
import { buildCreateAdvancedTribeAndBootstrap } from "@bazaar/shared/tx";
import { useDAppFees } from "@bazaar/shared/hooks";
import { splitEveCoin, pickEveCoinId } from "@bazaar/shared/hooks/useEveCoinSplitter";
import { COIN_DECIMALS } from "@bazaar/shared/constants";
import { formatSui } from "@bazaar/shared/utils";
import { HUB, fieldLabel, counterStyle, inputBase } from "../hubStyle";
import { OverlayShell, PrimaryBtn, GhostBtn, FullCopyBtn, StepDots } from "../HubPrimitives";

const NAME_MAX = 50, DESC_MAX = 200, TOKEN_NAME_MAX = 32, TOKEN_SYMBOL_MAX = 8;

interface FormData { name: string; description: string; tokenName: string; tokenSymbol: string; }

export default function AdvancedTribeOverlay({ onClose }: { onClose: () => void }) {
  const { walletAddress } = useConnection();
  const { data: fees } = useDAppFees();
  const feeMist = fees?.advancedTribeCreationFee ?? 0;
  const [step, setStep] = useState(0); // 0,1,2 wizard; 3 created
  const [data, setData] = useState<FormData>({ name: "", description: "", tokenName: "", tokenSymbol: "" });
  const [depositEve, setDepositEve] = useState("1");
  const [requiredApprovals, setRequiredApprovals] = useState("2");
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createdCapId, setCreatedCapId] = useState<string | null>(null);
  const set = (patch: Partial<FormData>) => { setData((d) => ({ ...d, ...patch })); setError(null); };

  const isCreated = step === 3;

  function validateStep(): string | null {
    if (step === 0) {
      const n = data.name.trim(), d = data.description.trim();
      if (!n) return "Tribe name is required.";
      if (n.length < 3) return "Tribe name must be at least 3 characters.";
      if (d.length === 0) return "Description is required.";
      if (d.length > DESC_MAX) return `Description cannot exceed ${DESC_MAX} characters.`;
    }
    if (step === 1) {
      const tn = data.tokenName.trim(), ts = data.tokenSymbol.trim();
      if (!tn) return "Token name is required.";
      if (!ts) return "Token symbol is required.";
      if (!/^[A-Z0-9]+$/.test(ts)) return "Symbol must be uppercase letters and numbers only.";
    }
    return null;
  }

  function next() {
    const err = validateStep();
    if (err) { setError(err); return; }
    setError(null);
    setStep((s) => s + 1);
  }

  async function handleCreate() {
    setError(null);
    // Advanced bootstrap requires a ≥1 EVE deposit (seeds the TribeVault = the
    // Exchange's EVE wallet / AMM liquidity) and ≥1 withdrawal-approval quorum.
    const depositEveNum = parseFloat(depositEve || "0");
    const approvalsNum = parseInt(requiredApprovals || "0", 10);
    if (!(Number.isFinite(depositEveNum) && depositEveNum >= 1)) {
      setError("Initial EVE Deposit must be at least 1 EVE.");
      return;
    }
    // Phase 6 W3 (AUD-ADV-06): Move forwards the quorum UNBOUNDED at bootstrap;
    // the setter enforces [1,10]. Clamp here — >10 soft-locks the vault.
    if (!(Number.isFinite(approvalsNum) && approvalsNum >= 1 && approvalsNum <= 10)) {
      setError("Required Approvals must be between 1 and 10.");
      return;
    }
    setIsCreating(true);
    try {
      const depositMist = Math.floor(depositEveNum * COIN_DECIMALS);
      // Creation fee comes from the largest EVE coin (pickEveCoinId) — which is also
      // splitEveCoin's primary source — so the fee-split and the deposit-split act on
      // the same coin without conflicting.
      let eveCoinId: string | null = null;
      if (feeMist > 0) {
        eveCoinId = await pickEveCoinId(walletAddress ?? "", feeMist);
        if (!eveCoinId) throw new Error(`Creation fee is ${formatSui(feeMist)} EVE — no single EVE coin in your wallet covers it.`);
      }
      const tx = new Transaction();
      const { coinArg: depositCoin } = await splitEveCoin(walletAddress ?? "", BigInt(depositMist), tx);
      buildCreateAdvancedTribeAndBootstrap({
        name: data.name.trim(),
        description: data.description.trim(),
        tokenName: data.tokenName.trim(),
        tokenSymbol: data.tokenSymbol.trim().toUpperCase(),
        joinPolicy: 0,
        senderAddress: walletAddress ?? "",
        governanceMode: 0,
        feeMist,
        eveCoinId,
        depositCoin,
        requiredApprovals: approvalsNum,
        tx,
      });
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      if (result.$kind === "FailedTransaction") throw new Error("Transaction failed. Check your wallet and try again.");
      const changes = (result as { objectChanges?: Array<{ type: string; objectType?: string; objectId?: string }> }).objectChanges;
      const cap = changes?.find((c) => c.type === "created" && typeof c.objectType === "string" && c.objectType.includes("TribeLeaderCap"));
      setCreatedCapId(cap?.objectId ?? null);
      setStep(3);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Tribe creation failed.");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <OverlayShell
      title={isCreated ? "TRIBE CREATED" : "⚠ EXPERIMENTAL · CREATE ADVANCED BAZAAR"}
      width={880}
      onClose={onClose}
      hideClose={isCreated}
    >
      {!isCreated && <StepDots step={step} total={3} />}

      {step === 0 && (
        <>
          <div style={{ fontSize: 13, color: HUB.FG2, marginBottom: 22 }}>Step 1 of 3: Define your tribe identity.</div>
          <div style={{ marginBottom: 18 }}>
            <label style={fieldLabel}>Tribe Name <span style={counterStyle}>({data.name.length}/{NAME_MAX})</span></label>
            <input type="text" maxLength={NAME_MAX} value={data.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Sovereign Exchange" style={inputBase} />
          </div>
          <div style={{ marginBottom: 4 }}>
            <label style={fieldLabel}>Description <span style={counterStyle}>({data.description.length}/{DESC_MAX})</span></label>
            <textarea maxLength={DESC_MAX} value={data.description} rows={4} onChange={(e) => set({ description: e.target.value })} placeholder="Describe your tribe and its marketplace..." style={{ ...inputBase, resize: "vertical", minHeight: 110, lineHeight: 1.55 }} />
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <div style={{ fontSize: 13, color: HUB.FG2, marginBottom: 22, lineHeight: 1.55 }}>
            Step 2 of 3: Configure your tribe&apos;s custom token. This token will be used as the marketplace currency.
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={fieldLabel}>Token Name <span style={counterStyle}>({data.tokenName.length}/{TOKEN_NAME_MAX})</span></label>
            <input type="text" maxLength={TOKEN_NAME_MAX} value={data.tokenName} onChange={(e) => set({ tokenName: e.target.value })} placeholder="e.g. Sovereign Coin" style={inputBase} />
          </div>
          <div>
            <label style={fieldLabel}>Token Symbol <span style={counterStyle}>({data.tokenSymbol.length}/{TOKEN_SYMBOL_MAX})</span></label>
            <input type="text" maxLength={TOKEN_SYMBOL_MAX} value={data.tokenSymbol}
              onChange={(e) => set({ tokenSymbol: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })}
              placeholder="E.G. SOV" style={{ ...inputBase, letterSpacing: "0.1em" }} />
            <div style={{ fontSize: 12, color: HUB.MUTED, marginTop: 8 }}>Uppercase letters and numbers only. This cannot be changed after creation.</div>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div style={{ fontSize: 13, color: HUB.FG2, marginBottom: 18 }}>Step 3 of 3: Review your tribe configuration.</div>
          <div style={{ border: `1px solid ${HUB.DIM}`, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16, background: "rgba(20,14,8,0.45)", marginBottom: 16 }}>
            {([["Tribe Name", data.name || "—", HUB.ORANGE], ["Description", data.description || "—", HUB.FG], ["Token", `${data.tokenName || "—"}${data.tokenSymbol ? ` (${data.tokenSymbol})` : ""}`, HUB.ORANGE]] as const).map(([k, v, color]) => (
              <div key={k} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, color: HUB.FG2 }}>{k}</span>
                <span style={{ fontSize: 16, fontWeight: 700, color }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={fieldLabel}>Initial EVE Deposit <span style={{ color: HUB.RED }}>*</span></label>
            <input type="number" min="1" step="0.001" value={depositEve}
              onChange={(e) => { setDepositEve(e.target.value); setError(null); }}
              placeholder="1" style={inputBase} />
            <div style={{ fontSize: 12, color: HUB.MUTED, marginTop: 8, lineHeight: 1.5 }}>
              Required — minimum 1 EVE. Seeds the Tribe Vault (your exchange&apos;s EVE wallet) and becomes the
              exchange&apos;s starting liquidity. Genesis tribe tokens are minted to your Tribe Wallet automatically.
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={fieldLabel}>Required Withdrawal Approvals <span style={{ color: HUB.RED }}>*</span></label>
            <input type="number" min="1" max="10" step="1" value={requiredApprovals}
              onChange={(e) => { setRequiredApprovals(e.target.value); setError(null); }}
              placeholder="2" style={inputBase} />
            <div style={{ fontSize: 12, color: HUB.MUTED, marginTop: 8 }}>
              Tribe Admin approvals needed to release a vault withdrawal request (1–10).
            </div>
          </div>

          <div style={{ marginBottom: 6, fontSize: 12, color: HUB.FG2, letterSpacing: "0.04em" }}>
            Creation fee: <span style={{ color: HUB.ORANGE, fontWeight: 700 }}>{feeMist > 0 ? `${formatSui(feeMist)} EVE` : "Free"}</span>
          </div>
          <div style={{ border: `1px solid ${HUB.DIM}`, background: "rgba(184,102,32,0.08)", padding: "14px 18px", fontSize: 13, lineHeight: 1.55, color: HUB.FG2 }}>
            <span style={{ color: HUB.ORANGE, fontWeight: 700 }}>Note:</span> This one transaction creates your tribe AND
            bootstraps its economy (token ledger, vault, exchange) using your EVE deposit — no SSU required. This action
            cannot be undone.
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <div style={{ textAlign: "center", color: HUB.GREEN, fontSize: 16, margin: "6px 0 22px" }}>Your Advanced Bazaar tribe has been created!</div>
          <div style={{ border: `1px solid ${HUB.DIM}`, padding: "22px 26px", display: "flex", flexDirection: "column", gap: 14, background: "rgba(20,14,8,0.45)" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: HUB.FG }}>{data.name.trim() || "Unnamed Tribe"}</div>
            <div style={{ fontSize: 13, color: HUB.FG2 }}>{data.description.trim() || "—"}</div>
            <div style={{ fontSize: 13, color: HUB.FG2 }}>Token: <span style={{ color: HUB.ORANGE, fontWeight: 700 }}>{data.tokenName.trim()}{data.tokenSymbol ? ` (${data.tokenSymbol})` : ""}</span></div>
            <div style={{ fontSize: 13, color: HUB.FG2 }}>TribeLeaderCap ID: <span style={{ color: HUB.ORANGE, wordBreak: "break-all" }}>{createdCapId ?? "Unknown — check your wallet for the TribeLeaderCap"}</span></div>
            {createdCapId && <FullCopyBtn label="Copy ID" onClick={() => navigator.clipboard?.writeText(createdCapId)} />}
            <div style={{ fontSize: 13, color: HUB.FG2, lineHeight: 1.6, marginTop: 4 }}>
              Your token economy is live — vault, exchange and token ledger are bootstrapped, no SSU required. Manage your
              tribe any time from <span style={{ color: HUB.ORANGE, fontWeight: 700 }}>My Tribe Governance</span> (top-right of the hub).
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 22 }}>
            <PrimaryBtn onClick={onClose}>Done</PrimaryBtn>
          </div>
        </>
      )}

      {error && !isCreated && <div style={{ marginTop: 14, fontSize: 13, color: HUB.RED }}>{error}</div>}

      {!isCreated && (
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 24 }}>
          {step > 0 && <GhostBtn onClick={() => { setError(null); setStep((s) => s - 1); }}>Back</GhostBtn>}
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          {step < 2 && <PrimaryBtn onClick={next}>Next</PrimaryBtn>}
          {step === 2 && <PrimaryBtn disabled={isCreating} onClick={handleCreate}>{isCreating ? "Creating…" : "Create Tribe"}</PrimaryBtn>}
        </div>
      )}
    </OverlayShell>
  );
}
