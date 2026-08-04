// JoinTribeOverlay.tsx — "Register to a Tribe" overlay.
// New Station-Hub visual; wired to live useTribes + register_and_join_open_tribe.
// Application-required tribes route to the Application overlay via onApply.

import { useState, useMemo } from "react";
import { dAppKit, useConnection } from "@evefrontier/dapp-kit";
import { useQueryClient } from "@tanstack/react-query";
import type { TribeSummary } from "@bazaar/shared/types";
import { useTribes, useSSUStatus, useDAppFees } from "@bazaar/shared/hooks";
import { usePlayerCharacter } from "@bazaar/shared/hooks/usePlayerCharacter";
import { pickEveCoinId } from "@bazaar/shared/hooks/useEveCoinSplitter";
import { buildRegisterAndJoinOpenTribe } from "@bazaar/shared/tx";
import { resolveSSUOwnerCap, isExtensionConfigFrozenError } from "@bazaar/shared/tx/bazaarcore/ssu-receiving-tx";
import { buildBazaarAppUrl } from "@bazaar/shared/constants";
import { formatSui } from "@bazaar/shared/utils";
import { useSSUSharedObjects } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { planRebootstrap } from "@bazaar/shared/hooks/bazaarcore/rebind-helpers";
import { HUB, fieldLabel, inputBase } from "../hubStyle";
import { OverlayShell, PrimaryBtn, GhostBtn, FullCopyBtn } from "../HubPrimitives";

interface Props {
  onClose: () => void;
  onApply: (tribeId: string, tribeName: string) => void;
}

function isValidSuiId(id: string): boolean { return /^0x[0-9a-fA-F]{64}$/.test(id.trim()); }

export default function JoinTribeOverlay({ onClose, onApply }: Props) {
  const { data: tribes = [], isLoading } = useTribes();
  const { walletAddress } = useConnection();
  const { character } = usePlayerCharacter();
  const queryClient = useQueryClient();
  const [ssu, setSsu] = useState("");
  const [q, setQ] = useState("");
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const [success, setSuccess] = useState<TribeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Registered without the bundled BazarAuth authorize because the SSU's world
  // extension config was already frozen — surfaced as a caveat on success.
  const [frozenSkipped, setFrozenSkipped] = useState(false);

  const { data: ssuStatus } = useSSUStatus(ssu.trim() || null);
  const { data: fees } = useDAppFees();
  const feeMist = fees?.tribeJoinFee ?? 0;
  const ssuOk = isValidSuiId(ssu);
  // Re-registration probe: non-null ⇒ this SSU is already bootstrapped and the
  // PTB must skip or rebind instead of re-running bootstrap (E_ALREADY_BOOTSTRAPPED).
  const { data: sharedObjects } = useSSUSharedObjects(ssuOk ? ssu.trim() : null);

  const filtered = useMemo(() => {
    if (!q.trim()) return tribes;
    const s = q.trim().toLowerCase();
    return tribes.filter((t) => t.name.toLowerCase().includes(s) || t.description.toLowerCase().includes(s));
  }, [tribes, q]);

  function friendlyError(raw: string): string {
    if (/E_SSU_ALREADY_REGISTERED|abort.*\b2\b.*ssu_registry/i.test(raw)) return "This SSU is already registered. Deregister it first (My Registered SSUs → Unregister), then try again.";
    if (/E_TRIBE_INACTIVE|abort.*\b3\b.*registration_helpers/i.test(raw)) return "This tribe is no longer active.";
    if (/E_APPLICATION_REQUIRED|abort.*\b11\b.*registration_helpers/i.test(raw)) return "This tribe requires an application — use the Apply flow instead.";
    if (/E_SSU_ALREADY_IN_TRIBE|abort.*\b7\b.*registration_helpers/i.test(raw)) return "This SSU is already a member of this tribe.";
    if (/E_ACTIVE_SHOPS_PRESENT|abort.*\b4\b.*ssu_rebind/i.test(raw)) return "This SSU still has active stalls from its previous setup. Close them first (Market & Missions → My Stalls), then retry.";
    if (/E_ALREADY_BOOTSTRAPPED|abort.*\b3\b.*ssu_bootstrap/i.test(raw)) return "This SSU was set up before and cannot be re-initialised. Refresh the page and try again — the app will route the registration correctly.";
    return raw;
  }

  async function executeRegister(tribe: TribeSummary) {
    setError(null);
    setFrozenSkipped(false);
    if (!walletAddress) { setError("Wallet not connected."); return; }
    if (tribe.bazaarType !== "easy" && tribe.bazaarType !== "advanced") { setError("Tribe has an unsupported bazaar type."); return; }
    setRegisteringId(tribe.id);
    try {
      const bazaarType: 1 | 2 = tribe.bazaarType === "easy" ? 1 : 2;
      const trimmedSsu = ssu.trim();
      let authBundle: { characterId: string; ssuCapId: string; ssuCapVersion: string; ssuCapDigest: string } | undefined;
      if (character?.characterId) {
        const cap = await resolveSSUOwnerCap(character.characterId, trimmedSsu);
        if (cap) authBundle = { characterId: character.characterId, ssuCapId: cap.ssuCapId, ssuCapVersion: cap.ssuCapVersion, ssuCapDigest: cap.ssuCapDigest };
      }
      let eveCoinId: string | null = null;
      if (feeMist > 0) {
        eveCoinId = await pickEveCoinId(walletAddress, feeMist);
        if (!eveCoinId) throw new Error(`Tribe-join fee is ${formatSui(feeMist)} EVE — no single EVE coin in your wallet covers it.`);
      }
      const plan = await planRebootstrap({
        ssuId: trimmedSsu,
        shared: sharedObjects,
        targetBazaarType: bazaarType,
        targetTribeId: tribe.id,
      });
      // V36 DH-10: register_and_join_open_tribe verifies on-chain SSU ownership via the
      // StorageUnit OwnerCap. The DH-10 proof (characterId + ssuOwnerCapRef) is passed
      // independently of authBundle so it survives the no-authorize retry below.
      const ssuOwnerCapRef = authBundle
        ? { ssuCapId: authBundle.ssuCapId, ssuCapVersion: authBundle.ssuCapVersion, ssuCapDigest: authBundle.ssuCapDigest }
        : undefined;
      // includeAuthorize=false drops the bundled world authorize_extension — used to
      // recover SSUs whose extension config is frozen (the authorize is redundant there).
      const runTx = async (includeAuthorize: boolean) => {
        const tx = buildRegisterAndJoinOpenTribe(
          trimmedSsu, tribe.id, bazaarType, walletAddress, includeAuthorize ? authBundle : undefined, plan,
          feeMist, eveCoinId, authBundle?.characterId, ssuOwnerCapRef,
        );
        const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
        if (result.$kind === "FailedTransaction") throw new Error(result.FailedTransaction?.status?.error?.message || "Transaction failed.");
      };
      try {
        await runTx(true);
      } catch (e) {
        // Frozen extension config → the bundled authorize_extension aborts and rolls
        // back the PTB. Registration is fine on its own; retry without the authorize.
        if (isExtensionConfigFrozenError(e)) {
          setFrozenSkipped(true);
          await runTx(false);
        } else {
          throw e;
        }
      }
      queryClient.invalidateQueries({ queryKey: ["tribes"] });
      queryClient.invalidateQueries({ queryKey: ["ssu-status", ssu.trim()] });
      queryClient.invalidateQueries({ queryKey: ["my-ssus", walletAddress] });
      queryClient.invalidateQueries({ queryKey: ["all-ssus"] });
      setSuccess(tribe);
    } catch (e: unknown) {
      setError(friendlyError(e instanceof Error ? e.message : "Registration failed."));
    } finally {
      setRegisteringId(null);
    }
  }

  function handleRegister(tribe: TribeSummary) {
    if (!ssuOk) { setError("Enter a valid SSU Smart Assembly ID (0x + 64 hex) first."); return; }
    if (ssuStatus !== null && ssuStatus !== undefined) {
      setError(`This SSU is already registered to ${ssuStatus.bazaarType ?? "another network"}. Deregister it first, then try again.`);
      return;
    }
    void executeRegister(tribe);
  }

  if (success) {
    const url = buildBazaarAppUrl(success.bazaarType === "easy" ? "easy" : "advanced", ssu.trim());
    return (
      <OverlayShell title="SSU REGISTERED" width={760} onClose={onClose} hideClose>
        <div style={{ textAlign: "center", color: HUB.GREEN, fontSize: 16, margin: "6px 0 22px" }}>SSU registered to tribe.</div>
        <div style={{ border: `1px solid ${HUB.DIM}`, padding: "22px 26px", display: "flex", flexDirection: "column", gap: 12, background: "rgba(20,14,8,0.45)" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: HUB.FG }}>{success.name}</div>
          <div style={{ fontSize: 13, color: HUB.FG2 }}>SSU: <span style={{ color: HUB.ORANGE }}>{ssu.slice(0, 8)}…{ssu.slice(-6)}</span></div>
          <code style={{ fontFamily: "inherit", fontSize: 13, color: HUB.FG, background: "rgba(8,6,4,0.7)", border: `1px solid ${HUB.BORDER}`, padding: "10px 12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{url}</code>
          <FullCopyBtn label="Copy URL" onClick={() => navigator.clipboard?.writeText(url)} />
          <div style={{ fontSize: 13, color: HUB.FG2, lineHeight: 1.6 }}>Your SSU is now part of the tribe marketplace. Storefronts will sync on the next block.</div>
        </div>
        {frozenSkipped && (
          <div style={{ marginTop: 16, border: `1px solid ${HUB.DIM}`, background: "rgba(184,102,32,0.08)", padding: "12px 16px", fontSize: 12.5, color: HUB.FG2, lineHeight: 1.55 }}>
            Note: this SSU&apos;s extension config is <strong style={{ color: HUB.ORANGE }}>frozen</strong>, so the
            Bazaar extension authorization step was skipped. If it was authorized before being frozen, everything works.
            If shop creation later fails, the extension was never authorized — and because freezing is irreversible, that
            SSU can&apos;t run the Bazaar; use a different SSU.
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 22 }}><PrimaryBtn onClick={onClose}>Done</PrimaryBtn></div>
      </OverlayShell>
    );
  }

  return (
    <OverlayShell title="JOIN A TRIBE" width={960} onClose={onClose}>
      <div style={{ fontSize: 13, color: HUB.FG2, lineHeight: 1.55, marginBottom: 18 }}>
        Search for a tribe to register your SSU with. Open tribes allow direct registration; others require an application.
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={fieldLabel}>Your SSU Smart Assembly ID</label>
        <input type="text" value={ssu} onChange={(e) => { setSsu(e.target.value); setError(null); }} placeholder="0x... (required to register)"
          style={{ ...inputBase, borderColor: ssu.length > 0 && !ssuOk ? HUB.RED : HUB.DIM }} />
      </div>

      <div style={{ marginBottom: 14 }}>
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tribes by name or description..." style={inputBase} />
      </div>

      {error && <div style={{ marginBottom: 12, fontSize: 13, color: HUB.RED }}>{error}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", maxHeight: 380, paddingRight: 4, marginBottom: 6 }}>
        {isLoading ? (
          <div style={{ padding: "18px 4px", color: HUB.MUTED, fontSize: 14 }}>Loading tribes…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "18px 4px", color: HUB.MUTED, fontSize: 14 }}>No tribes available.</div>
        ) : (
          filtered.map((tribe) => {
            const open = tribe.joinPolicy === "open";
            return (
              <div key={tribe.id} style={{ border: `1px solid ${HUB.BORDER}`, background: "rgba(20,14,8,0.45)", padding: "16px 18px", display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ color: HUB.FG, fontWeight: 700, fontSize: 15 }}>{tribe.name}</span>
                    <span style={{ padding: "2px 8px", border: `1px solid ${open ? HUB.GREEN : HUB.DIM}`, color: open ? HUB.GREEN : HUB.DIM, background: open ? "rgba(58,210,120,0.10)" : "transparent", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em" }}>{open ? "OPEN" : "APPLY"}</span>
                    <span style={{ padding: "2px 8px", border: `1px solid ${HUB.BORDER}`, color: HUB.MUTED, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>{tribe.bazaarType}</span>
                  </div>
                  <div style={{ fontSize: 12, color: HUB.FG2, lineHeight: 1.5 }}>{tribe.description}</div>
                  <div style={{ display: "flex", gap: 18, fontSize: 11, color: HUB.MUTED, letterSpacing: "0.06em", fontWeight: 700, marginTop: 2 }}>
                    <span>{tribe.memberCount} MEMBERS</span><span style={{ opacity: 0.5 }}>│</span><span>{tribe.ssuCount} SSUs</span>
                  </div>
                </div>
                <div>
                  {open
                    ? <PrimaryBtn small disabled={!ssuOk || registeringId === tribe.id} onClick={() => handleRegister(tribe)}>{registeringId === tribe.id ? "Registering…" : "Register"}</PrimaryBtn>
                    : <GhostBtn small outlined onClick={() => onApply(tribe.id, tribe.name)}>Apply ▸</GhostBtn>}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, fontSize: 11, letterSpacing: "0.12em", color: HUB.MUTED, fontWeight: 700 }}>
        <span>{filtered.length} OF {tribes.length} TRIBES</span>
        <span>{ssuOk ? <span style={{ color: HUB.GREEN }}>● SSU READY</span> : "ENTER SSU TO REGISTER"}</span>
      </div>
    </OverlayShell>
  );
}
