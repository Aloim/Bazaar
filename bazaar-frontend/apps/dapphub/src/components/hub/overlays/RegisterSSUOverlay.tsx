// RegisterSSUOverlay.tsx — "Register Just for Me" (NoTribe SSU) overlay.
// New Station-Hub visual; wired to the live register_ssu_notribe TX flow
// (logic mirrors the original NoTribeRegistration window).

import { useState } from "react";
import { dAppKit, useConnection } from "@evefrontier/dapp-kit";
import { buildRegisterNoTribeSSU } from "@bazaar/shared/tx";
import { buildBazaarAppUrl } from "@bazaar/shared/constants";
import { useSSUStatus, useDAppFees } from "@bazaar/shared/hooks";
import { pickEveCoinId } from "@bazaar/shared/hooks/useEveCoinSplitter";
import { formatSui } from "@bazaar/shared/utils";
import { usePlayerCharacter } from "@bazaar/shared/hooks/usePlayerCharacter";
import { resolveSSUOwnerCap, isExtensionConfigFrozenError } from "@bazaar/shared/tx/bazaarcore/ssu-receiving-tx";
import { useSSUSharedObjects } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { planRebootstrap } from "@bazaar/shared/hooks/bazaarcore/rebind-helpers";
import { HUB, fieldLabel, inputBase } from "../hubStyle";
import { OverlayShell, PrimaryBtn, GhostBtn, FullCopyBtn } from "../HubPrimitives";

function isValidSuiId(id: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(id.trim());
}

export default function RegisterSSUOverlay({ onClose }: { onClose: () => void }) {
  const [ssu, setSsu] = useState("");
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [showConflict, setShowConflict] = useState(false);
  // Set when the SSU's world extension config was already frozen and we had to
  // register WITHOUT the bundled BazarAuth authorize — surfaced as a caveat.
  const [frozenSkipped, setFrozenSkipped] = useState(false);

  const { walletAddress } = useConnection();
  const { character } = usePlayerCharacter();
  const { data: ssuStatus } = useSSUStatus(ssu.trim() || null);
  const { data: fees } = useDAppFees();
  const feeMist = fees?.ssuRegistrationFee ?? 0;

  const trimmed = ssu.trim();
  const formatOk = isValidSuiId(trimmed);
  // null ⇒ never bootstrapped on this publish; non-null ⇒ re-registration —
  // the PTB must skip (same binding) or rebind (different binding) instead of
  // re-running bootstrap_ssu_objects (E_ALREADY_BOOTSTRAPPED).
  const { data: sharedObjects } = useSSUSharedObjects(formatOk ? trimmed : null);
  const showError = ssu.length > 0 && !formatOk;

  async function executeRegister() {
    setShowConflict(false);
    setError(null);
    setFrozenSkipped(false);
    setIsRegistering(true);
    if (!walletAddress) {
      setError("Wallet not connected. Please connect your wallet and try again.");
      setIsRegistering(false);
      return;
    }
    try {
      // V36 DH-10 anti-squat: registration must prove you own this SSU via its
      // StorageUnit OwnerCap, held by your character. Resolve it here and fail with a
      // precise message about WHICH piece is missing instead of the raw builder guard.
      if (!character?.characterId) {
        setError(
          "No EVE Frontier character found for the connected wallet. Connect the wallet whose " +
          "character owns this Storage Unit in-game, then try again.",
        );
        setIsRegistering(false);
        return;
      }
      const cap = await resolveSSUOwnerCap(character.characterId, trimmed);
      if (!cap) {
        // Distinguish "wrong SSU id" from "this character owns no SSU caps" so the
        // blocker is obvious. resolveSSUOwnerCap with no ssuId returns the first owned
        // cap if the character holds ANY. (The Move entry is the real anti-squat gate;
        // this FE step only finds the cap to pass in — so make WHY it failed explicit.)
        const anyCap = await resolveSSUOwnerCap(character.characterId);
        if (anyCap) {
          setError(
            `Your character owns Storage Unit(s), but none match the SSU id you entered ` +
            `(${trimmed.slice(0, 10)}…${trimmed.slice(-6)}). Paste the Sui object id of the Smart ` +
            `Storage Unit you own (it's the ?ssuId value in that SSU's Bazaar link).`,
          );
        } else {
          setError(
            `The connected wallet's character holds no Storage Unit OwnerCap, so there's nothing to ` +
            `register. Connect the wallet that owns this SSU in-game (a Smart Storage Unit, not a Field ` +
            `Storage). Connected character: ${character.characterId.slice(0, 10)}….`,
          );
        }
        setIsRegistering(false);
        return;
      }
      const authBundle: { characterId: string; ssuCapId: string; ssuCapVersion: string; ssuCapDigest: string } = {
        characterId: character.characterId,
        ssuCapId: cap.ssuCapId,
        ssuCapVersion: cap.ssuCapVersion,
        ssuCapDigest: cap.ssuCapDigest,
      };
      let eveCoinId: string | null = null;
      if (feeMist > 0) {
        eveCoinId = await pickEveCoinId(walletAddress, feeMist);
        if (!eveCoinId) {
          throw new Error(`Registration fee is ${formatSui(feeMist)} EVE — no single EVE coin in your wallet covers it.`);
        }
      }
      const plan = await planRebootstrap({
        ssuId: trimmed,
        shared: sharedObjects,
        targetBazaarType: 0,
        targetTribeId: 0,
      });
      // V36 DH-10: register verifies on-chain SSU ownership via the StorageUnit OwnerCap.
      // authBundle (resolved above) carries the character + cap coords; the DH-10 proof
      // (characterId + ssuOwnerCapRef) is passed independently of authBundle so it survives
      // the no-authorize retry below. On V36 a non-owner (no cap) makes the builder throw.
      const ssuOwnerCapRef = authBundle
        ? { ssuCapId: authBundle.ssuCapId, ssuCapVersion: authBundle.ssuCapVersion, ssuCapDigest: authBundle.ssuCapDigest }
        : undefined;
      // includeAuthorize=false drops the bundled world authorize_extension — used to
      // recover SSUs whose extension config is frozen (the authorize is redundant there).
      const runTx = async (includeAuthorize: boolean) => {
        const tx = buildRegisterNoTribeSSU(
          trimmed, walletAddress, includeAuthorize ? authBundle : undefined, feeMist, eveCoinId, plan,
          authBundle?.characterId, ssuOwnerCapRef,
        );
        const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
        if (result.$kind === "FailedTransaction") {
          throw new Error(result.FailedTransaction?.status?.error?.message || "Transaction failed. Check your wallet and try again.");
        }
      };
      try {
        await runTx(true);
      } catch (e) {
        // The SSU's world extension config is frozen → the bundled BazarAuth
        // authorize_extension aborts (EExtensionConfigFrozen) and rolls back the
        // whole PTB. Registration itself is fine; retry without the authorize step.
        if (isExtensionConfigFrozenError(e)) {
          setFrozenSkipped(true);
          await runTx(false);
        } else {
          throw e;
        }
      }
      setGeneratedUrl(buildBazaarAppUrl("notribe", trimmed));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Registration failed.");
    } finally {
      setIsRegistering(false);
    }
  }

  function handleRegister() {
    if (!formatOk) {
      setError("SSU ID must be 0x followed by exactly 64 hex characters.");
      return;
    }
    if (ssuStatus !== null && ssuStatus !== undefined) {
      setShowConflict(true);
      return;
    }
    void executeRegister();
  }

  return (
    <OverlayShell title={generatedUrl ? "SSU REGISTERED" : "REGISTER SSU — NOTRIBE"} width={960} onClose={onClose}>
      {generatedUrl ? (
        <>
          <div style={{ textAlign: "center", color: HUB.GREEN, fontSize: 16, letterSpacing: "0.02em", margin: "6px 0 22px" }}>
            SSU registered as standalone marketplace.
          </div>
          <div style={{ border: `1px solid ${HUB.DIM}`, padding: "22px 26px", display: "flex", flexDirection: "column", gap: 12, background: "rgba(20,14,8,0.45)" }}>
            <div style={{ fontSize: 13, color: HUB.FG2 }}>
              SSU: <span style={{ color: HUB.ORANGE, fontWeight: 700 }}>{trimmed.slice(0, 8)}…{trimmed.slice(-6)}</span>
            </div>
            <div style={{ fontSize: 12, color: HUB.FG2, letterSpacing: "0.04em" }}>MARKETPLACE LINK</div>
            <code style={{
              fontFamily: "inherit", fontSize: 13, color: HUB.FG,
              background: "rgba(8,6,4,0.7)", border: `1px solid ${HUB.BORDER}`, padding: "10px 12px",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{generatedUrl}</code>
            <FullCopyBtn label="Copy Link" onClick={() => navigator.clipboard?.writeText(generatedUrl)} />
            <div style={{ fontSize: 13, color: HUB.FG2, lineHeight: 1.6, marginTop: 4 }}>
              Visit this link immediately, then paste it into your SSU&apos;s dApp URL field. Share it with customers to
              access your standalone marketplace. No tribe affiliation, EVE currency, default tax rates.
            </div>
          </div>
          {frozenSkipped && (
            <div style={{ marginTop: 16, border: `1px solid ${HUB.DIM}`, background: "rgba(184,102,32,0.08)", padding: "12px 16px", fontSize: 12.5, color: HUB.FG2, lineHeight: 1.55 }}>
              Note: this SSU&apos;s extension config is <strong style={{ color: HUB.ORANGE }}>frozen</strong>, so the
              Bazaar extension authorization step was skipped. If it was authorized before being frozen, everything works.
              If shop creation later fails, the extension was never authorized — and because freezing is irreversible, that
              SSU can&apos;t run the Bazaar; use a different SSU.
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 22 }}>
            <PrimaryBtn onClick={onClose}>Done</PrimaryBtn>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 13, color: HUB.FG2, letterSpacing: "0.02em", lineHeight: 1.55, marginBottom: 22 }}>
            Register your SSU as a standalone marketplace (no tribe affiliation). Paste your SSU Smart Assembly ID below
            to generate your marketplace link.
          </div>

          <div style={{ marginBottom: 4 }}>
            <label style={fieldLabel}>SSU Smart Assembly ID</label>
            <input
              type="text"
              value={ssu}
              onChange={(e) => { setSsu(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleRegister(); }}
              placeholder="0x..."
              disabled={isRegistering}
              style={{ ...inputBase, borderColor: showError ? HUB.RED : HUB.DIM }}
            />
            {showError && (
              <div style={{ fontSize: 12, color: HUB.RED, letterSpacing: "0.02em", marginTop: 8 }}>
                SSU ID must start with 0x and contain exactly 64 hex characters.
              </div>
            )}
          </div>

          <div style={{ marginTop: 14, fontSize: 12, color: HUB.FG2, letterSpacing: "0.04em" }}>
            Registration fee: <span style={{ color: HUB.ORANGE, fontWeight: 700 }}>{feeMist > 0 ? `${formatSui(feeMist)} EVE` : "Free"}</span>
          </div>

          {showConflict && (
            <div style={{ marginTop: 14, border: `1px solid ${HUB.DIM}`, background: "rgba(184,102,32,0.08)", padding: "12px 16px", fontSize: 13, color: HUB.FG2, lineHeight: 1.55 }}>
              This SSU is already registered to {ssuStatus?.bazaarType ?? "another network"}. Registering here will make it
              part of NoTribe.
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                <GhostBtn onClick={() => setShowConflict(false)}>Cancel</GhostBtn>
                <PrimaryBtn small onClick={() => void executeRegister()}>Proceed anyway</PrimaryBtn>
              </div>
            </div>
          )}

          {error && <div style={{ marginTop: 14, fontSize: 13, color: HUB.RED }}>{error}</div>}

          {!showConflict && (
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 28 }}>
              <GhostBtn onClick={onClose}>Cancel</GhostBtn>
              <PrimaryBtn disabled={!formatOk || isRegistering} onClick={handleRegister}>
                {isRegistering ? "Registering…" : "Register"}
              </PrimaryBtn>
            </div>
          )}
        </>
      )}
    </OverlayShell>
  );
}
