// ApplicationOverlay.tsx — "Apply to a Tribe" overlay (application-required tribes).
// New Station-Hub visual; wired to the live apply_to_tribe escrow TX flow.

import { useState } from "react";
import { useConnection, dAppKit } from "@evefrontier/dapp-kit";
import { buildApplyToTribe } from "@bazaar/shared/tx";
import { useDAppFees } from "@bazaar/shared/hooks";
import { pickEveCoinId } from "@bazaar/shared/hooks/useEveCoinSplitter";
import { formatSui } from "@bazaar/shared/utils";
import { HUB, fieldLabel, counterStyle, inputBase } from "../hubStyle";
import { OverlayShell, PrimaryBtn, GhostBtn } from "../HubPrimitives";

interface Props { onClose: () => void; tribeId: string; tribeName: string; }

function isValidSuiId(id: string): boolean { return /^0x[0-9a-fA-F]{64}$/.test(id.trim()); }
function abbreviate(a: string): string { return a.length <= 12 ? a : `${a.slice(0, 6)}…${a.slice(-4)}`; }

export default function ApplicationOverlay({ onClose, tribeId, tribeName }: Props) {
  const { walletAddress } = useConnection();
  const { data: fees } = useDAppFees();
  const feeMist = fees?.tribeJoinFee ?? 0;
  const [ssu, setSsu] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    const trimmedSsu = ssu.trim();
    if (!isValidSuiId(trimmedSsu)) { setError("Invalid SSU ID. Expected 0x followed by exactly 64 hex characters."); return; }
    if (!message.trim()) { setError("Please provide a message for the tribe admins."); return; }
    if (message.length > 500) { setError("Message must be 500 characters or fewer."); return; }
    setError(null);
    setIsSubmitting(true);
    try {
      let eveCoinId: string | null = null;
      if (feeMist > 0) {
        eveCoinId = await pickEveCoinId(walletAddress ?? "", feeMist);
        if (!eveCoinId) throw new Error(`Join fee is ${formatSui(feeMist)} EVE — no single EVE coin in your wallet covers it.`);
      }
      const tx = buildApplyToTribe(trimmedSsu, tribeId, message.trim(), feeMist, eveCoinId);
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      if (result.$kind === "FailedTransaction") throw new Error("Transaction failed. Check your wallet and try again.");
      setSubmitted(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Application submission failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <OverlayShell title={submitted ? "APPLICATION SENT" : "APPLY TO TRIBE"} width={760} onClose={onClose} hideClose={submitted}>
      {submitted ? (
        <>
          <div style={{ textAlign: "center", color: HUB.GREEN, fontSize: 16, margin: "6px 0 18px" }}>Application submitted.</div>
          <div style={{ fontSize: 13, color: HUB.FG2, lineHeight: 1.6 }}>
            A tribe officer will review your application to <strong style={{ color: HUB.ORANGE }}>{tribeName}</strong>. Your SSU
            will appear in the tribe&apos;s network once accepted. {feeMist > 0 && "Your join fee is held in escrow and refunded if rejected."}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 22 }}><PrimaryBtn onClick={onClose}>Done</PrimaryBtn></div>
        </>
      ) : (
        <>
          <div style={{ border: `1px solid ${HUB.DIM}`, background: "rgba(184,102,32,0.06)", padding: "12px 16px", fontSize: 13, color: HUB.FG2, marginBottom: 18 }}>
            Applying to: <span style={{ color: HUB.ORANGE, fontWeight: 700 }}>{tribeName}</span>
            <span style={{ color: HUB.MUTED, fontSize: 11, marginLeft: 8 }}>({tribeId.slice(0, 8)}…)</span>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={fieldLabel}>Wallet Address (auto-filled)</label>
            <input type="text" value={walletAddress ? abbreviate(walletAddress) : "Not connected"} disabled style={{ ...inputBase, opacity: 0.6 }} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={fieldLabel}>SSU Smart Assembly ID</label>
            <input type="text" value={ssu} onChange={(e) => { setSsu(e.target.value); setError(null); }} placeholder="0x..." disabled={isSubmitting} style={inputBase} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={fieldLabel}>Message to Tribe Admins <span style={counterStyle}>({message.length}/500)</span></label>
            <textarea value={message} maxLength={500} rows={4} disabled={isSubmitting}
              onChange={(e) => { setMessage(e.target.value); setError(null); }}
              placeholder="Tell the tribe admins why you want to join..." style={{ ...inputBase, resize: "vertical", minHeight: 100, lineHeight: 1.55 }} />
          </div>

          <div style={{ fontSize: 12, color: HUB.FG2, letterSpacing: "0.04em" }}>
            Join fee: <span style={{ color: HUB.ORANGE, fontWeight: 700 }}>{feeMist > 0 ? `${formatSui(feeMist)} EVE` : "Free"}</span>
            {feeMist > 0 && <span style={{ color: HUB.MUTED, marginLeft: 8 }}>(held in escrow — refunded if rejected)</span>}
          </div>

          {error && <div style={{ marginTop: 14, fontSize: 13, color: HUB.RED }}>{error}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 22 }}>
            <GhostBtn onClick={onClose}>Cancel</GhostBtn>
            <PrimaryBtn disabled={isSubmitting || !ssu.trim() || !message.trim()} onClick={handleSubmit}>{isSubmitting ? "Submitting…" : "Submit Application"}</PrimaryBtn>
          </div>
        </>
      )}
    </OverlayShell>
  );
}
