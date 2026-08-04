// StandardTribeOverlay.tsx — "Create a Bazaar Tribe" (Easy tribe) overlay.
// New Station-Hub visual; wired to the live create_easy_tribe TX flow.

import { useState } from "react";
import { useConnection, dAppKit } from "@evefrontier/dapp-kit";
import { buildCreateEasyTribeAndBootstrap } from "@bazaar/shared/tx";
import { useDAppFees } from "@bazaar/shared/hooks";
import { pickEveCoinId } from "@bazaar/shared/hooks/useEveCoinSplitter";
import { formatSui } from "@bazaar/shared/utils";
import { HUB, fieldLabel, counterStyle, inputBase } from "../hubStyle";
import { OverlayShell, PrimaryBtn, GhostBtn, FullCopyBtn } from "../HubPrimitives";

const NAME_MAX = 50;
const DESC_MAX = 200;

export default function StandardTribeOverlay({ onClose }: { onClose: () => void }) {
  const { walletAddress } = useConnection();
  const { data: fees } = useDAppFees();
  const feeMist = fees?.easyTribeCreationFee ?? 0;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [createdCapId, setCreatedCapId] = useState<string | null>(null);

  function validate(): string | null {
    const n = name.trim();
    const d = description.trim();
    if (!n) return "Tribe name is required.";
    if (n.length < 3) return "Tribe name must be at least 3 characters.";
    if (n.length > NAME_MAX) return `Tribe name cannot exceed ${NAME_MAX} characters.`;
    if (!d) return "Description is required.";
    if (d.length > DESC_MAX) return `Description cannot exceed ${DESC_MAX} characters.`;
    return null;
  }

  async function handleCreate() {
    const err = validate();
    if (err) { setError(err); return; }
    setError(null);
    setIsCreating(true);
    try {
      let eveCoinId: string | null = null;
      if (feeMist > 0) {
        eveCoinId = await pickEveCoinId(walletAddress ?? "", feeMist);
        if (!eveCoinId) throw new Error(`Creation fee is ${formatSui(feeMist)} EVE — no single EVE coin in your wallet covers it.`);
      }
      const tx = buildCreateEasyTribeAndBootstrap(name.trim(), description.trim(), 0, walletAddress ?? "", 0, feeMist, eveCoinId);
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      if (result.$kind === "FailedTransaction") throw new Error("Transaction failed. Check your wallet and try again.");
      const changes = (result as { objectChanges?: Array<{ type: string; objectType?: string; objectId?: string }> }).objectChanges;
      const cap = changes?.find((c) => c.type === "created" && typeof c.objectType === "string" && c.objectType.includes("TribeLeaderCap"));
      setCreatedCapId(cap?.objectId ?? null);
      setCreated(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Tribe creation failed.");
    } finally {
      setIsCreating(false);
    }
  }

  const canCreate = name.trim().length > 0 && description.trim().length > 0;

  return (
    <OverlayShell title={created ? "TRIBE CREATED" : "CREATE STANDARD BAZAAR"} width={880} onClose={onClose} hideClose={created}>
      {created ? (
        <>
          <div style={{ textAlign: "center", color: HUB.GREEN, fontSize: 16, letterSpacing: "0.02em", margin: "6px 0 22px" }}>
            Your Standard Bazaar tribe has been created!
          </div>
          <div style={{ border: `1px solid ${HUB.DIM}`, padding: "22px 26px", display: "flex", flexDirection: "column", gap: 12, background: "rgba(20,14,8,0.45)" }}>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "0.02em", color: HUB.FG }}>{name.trim() || "Unnamed Tribe"}</div>
            <div style={{ fontSize: 13, color: HUB.FG2 }}>{description.trim() || "—"}</div>
            <div style={{ fontSize: 13, color: HUB.FG2 }}>Currency: <span style={{ color: HUB.ORANGE, fontWeight: 700 }}>EVE (standard)</span></div>
            <div style={{ fontSize: 13, color: HUB.FG2 }}>Tax Rate: <span style={{ color: HUB.ORANGE, fontWeight: 700 }}>Default</span></div>
            {createdCapId ? (
              <>
                <div style={{ fontSize: 13, color: HUB.FG2 }}>
                  TribeLeaderCap ID: <span style={{ color: HUB.ORANGE, wordBreak: "break-all" }}>{createdCapId}</span>
                </div>
                <FullCopyBtn label="Copy ID" onClick={() => navigator.clipboard?.writeText(createdCapId)} />
              </>
            ) : (
              <div style={{ fontSize: 13, color: HUB.FG2 }}>
                Your TribeLeaderCap has been transferred to your wallet. Check your owned objects to find it.
              </div>
            )}
            <div style={{ fontSize: 13, color: HUB.FG2, lineHeight: 1.6, marginTop: 4 }}>
              Your tribe governance is live — no SSU required. Manage it any time from
              <span style={{ color: HUB.ORANGE, fontWeight: 700 }}> My Tribe Governance</span> (top-right of the hub).
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 22 }}>
            <PrimaryBtn onClick={onClose}>Done</PrimaryBtn>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 13, color: HUB.FG2, letterSpacing: "0.02em", lineHeight: 1.55, marginBottom: 22 }}>
            Quick setup with sensible defaults. Your tribe will use the standard EVE currency and default tax rates. You can
            customize later.
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={fieldLabel}>Tribe Name <span style={counterStyle}>({name.length}/{NAME_MAX})</span></label>
            <input type="text" maxLength={NAME_MAX} value={name} disabled={isCreating}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              placeholder="e.g. Frontier Traders Guild" style={inputBase} />
          </div>

          <div style={{ marginBottom: 4 }}>
            <label style={fieldLabel}>Description <span style={counterStyle}>({description.length}/{DESC_MAX})</span></label>
            <textarea maxLength={DESC_MAX} value={description} rows={4} disabled={isCreating}
              onChange={(e) => { setDescription(e.target.value); setError(null); }}
              placeholder="Describe your tribe and marketplace..."
              style={{ ...inputBase, resize: "vertical", minHeight: 110, lineHeight: 1.55 }} />
          </div>

          <div style={{ marginTop: 14, fontSize: 12, color: HUB.FG2, letterSpacing: "0.04em" }}>
            Creation fee: <span style={{ color: HUB.ORANGE, fontWeight: 700 }}>{feeMist > 0 ? `${formatSui(feeMist)} EVE` : "Free"}</span>
          </div>

          {error && <div style={{ marginTop: 14, fontSize: 13, color: HUB.RED }}>{error}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 22 }}>
            <GhostBtn onClick={onClose}>Cancel</GhostBtn>
            <PrimaryBtn disabled={!canCreate || isCreating} onClick={handleCreate}>{isCreating ? "Creating…" : "Create Tribe"}</PrimaryBtn>
          </div>
        </>
      )}
    </OverlayShell>
  );
}
