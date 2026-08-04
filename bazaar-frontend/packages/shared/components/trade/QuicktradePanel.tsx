// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// 500-LINE GUARD: this file is at 500 LOC (Article XIV.4 cap = 500 inclusive).
// Any change adding net lines MUST split before commit. See R2.2 § 6 split strategies.

// Original location: Bazar1/dapp/frontend/src/components/QuicktradePanel.tsx

import { useState, useEffect, useMemo, useCallback } from "react";
import { useGatedTransaction } from "@bazaar/shared/hooks/announcements";
import { useOwnedInventory } from "@bazaar/shared/hooks";
import { useItemTypes } from "@bazaar/shared/hooks";
import { usePlayerCharacter } from "@bazaar/shared/hooks";
import { useQuicktradeVault } from "@bazaar/shared/hooks";
import { resolveSSUOwnerCap } from "@bazaar/shared/tx";
import { buildBasketDeposit, buildBasketWithdraw } from "@bazaar/shared/tx/bazaarcore/quicktrade-basket-tx";
import { useSSUGovId } from "@bazaar/shared/hooks";
import { useSSUSharedObjects } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import {
  SSU_OBJECT_ID,
  PACKAGE_ID,
  QUICKTRADE_VAULT_ID as QUICKTRADE_VAULT_ID_FALLBACK,
} from "@bazaar/shared/constants";
import { useQuicktradeVaultId } from "@bazaar/shared/hooks/bazaarcore/useQuicktradeVaultId";
import {
  panelStyle,
  headerStyle,
  titleStyle,
  warningStyle,
  sectionStyle,
  sectionTitleStyle,
  dividerStyle,
  itemRowStyle,
  inputStyle,
  mutedStyle,
  statusStyle,
} from "./QuicktradePanel.styles";

// ── SSU owner cap state shape ─────────────────────────────────────────────────

interface SsuOwnerCapState {
  isSsuOwner:    boolean;
  ssuCapId:      string;
  ssuCapVersion: string;
  ssuCapDigest:  string;
}

// ── Component props ───────────────────────────────────────────────────────────

interface Props {
  onClose?: () => void;
}

// ── QuicktradePanel ───────────────────────────────────────────────────────────

export default function QuicktradePanel({ onClose }: Props) {
  const { signGated } = useGatedTransaction();
  // ── Data hooks ──────────────────────────────────────────────────────────────
  const { items: lockerItems, isLoading: lockerLoading, error: lockerError, refetch: refetchLocker } = useOwnedInventory();
  const { character, resolveCapRef } = usePlayerCharacter();
  const { data: ssuGovId } = useSSUGovId(SSU_OBJECT_ID);
  const { data: _resolvedVaultId } = useQuicktradeVaultId(ssuGovId ?? null);
  // V9: only fall back to env-var vault when there is NO URL ?ssuId= (operator/legacy override). With a URL ssuId, mixing governance from SSU A with vault from SSU B causes ssu_governance abort 12.
  const quicktradeVaultId = _resolvedVaultId ?? (SSU_OBJECT_ID ? "" : QUICKTRADE_VAULT_ID_FALLBACK);
  const { vaultLedger, loading: vaultLoading, refetch: refetchVault } = useQuicktradeVault(quicktradeVaultId || undefined);
  const { data: shared } = useSSUSharedObjects(SSU_OBJECT_ID || null);
  const memberRegistryId = shared?.memberRegistryId ?? "";

  // ── SSU owner cap resolution ─────────────────────────────────────────────
  const [ownerCapState, setOwnerCapState] = useState<SsuOwnerCapState>({
    isSsuOwner:    false,
    ssuCapId:      "",
    ssuCapVersion: "",
    ssuCapDigest:  "",
  });

  useEffect(() => {
    if (!character) {
      setOwnerCapState({ isSsuOwner: false, ssuCapId: "", ssuCapVersion: "", ssuCapDigest: "" });
      return;
    }
    let aborted = false;
    resolveSSUOwnerCap(character.characterId, SSU_OBJECT_ID)
      .then(cap => {
        if (!aborted) {
          if (cap) {
            setOwnerCapState({
              isSsuOwner:    true,
              ssuCapId:      cap.ssuCapId,
              ssuCapVersion: cap.ssuCapVersion,
              ssuCapDigest:  cap.ssuCapDigest,
            });
          } else {
            setOwnerCapState({ isSsuOwner: false, ssuCapId: "", ssuCapVersion: "", ssuCapDigest: "" });
          }
        }
      })
      .catch(() => {
        if (!aborted) setOwnerCapState({ isSsuOwner: false, ssuCapId: "", ssuCapVersion: "", ssuCapDigest: "" });
      });
    return () => { aborted = true; };
  }, [character]);

  // ── Vault contents derived from on-chain ledger ──────────────────────────
  const vaultItemsVisible = useMemo(() => {
    return Array.from(vaultLedger.entries())
      .map(([typeId, quantity]) => ({ typeId, quantity }))
      .filter(entry => entry.quantity > 0);
  }, [vaultLedger]);

  // ── Item name resolution ─────────────────────────────────────────────────
  const allTypeIds = useMemo(() => {
    const ids = new Set<number>();
    for (const item of lockerItems) ids.add(item.typeId);
    for (const entry of vaultItemsVisible) ids.add(entry.typeId);
    return Array.from(ids);
  }, [lockerItems, vaultItemsVisible]);

  const typeInfo = useItemTypes(allTypeIds);

  function itemName(typeId: number): string {
    return typeInfo.get(typeId)?.name ?? `#${typeId}`;
  }

  // ── Amount input state ───────────────────────────────────────────────────
  const [depositAmounts,  setDepositAmounts]  = useState<Map<number, number>>(new Map());
  const [withdrawAmounts, setWithdrawAmounts] = useState<Map<number, number>>(new Map());

  function getDepositAmount(typeId: number, maxQty: number): number {
    return Math.min(depositAmounts.get(typeId) ?? 1, maxQty);
  }

  function getWithdrawAmount(typeId: number, maxQty: number): number {
    return Math.min(withdrawAmounts.get(typeId) ?? 1, maxQty);
  }

  function setDepositAmount(typeId: number, value: number) {
    setDepositAmounts(prev => {
      const next = new Map(prev);
      next.set(typeId, value);
      return next;
    });
  }

  function setWithdrawAmount(typeId: number, value: number) {
    setWithdrawAmounts(prev => {
      const next = new Map(prev);
      next.set(typeId, value);
      return next;
    });
  }

  // ── Transaction state ────────────────────────────────────────────────────
  const [depositingTypeId,  setDepositingTypeId]  = useState<number | null>(null);
  const [withdrawingTypeId, setWithdrawingTypeId] = useState<number | null>(null);
  const [statusMsg,         setStatusMsg]         = useState<{ ok: boolean; text: string } | null>(null);

  function showStatus(ok: boolean, text: string) {
    setStatusMsg({ ok, text });
    setTimeout(() => setStatusMsg(null), 4000);
  }

  const refetchAll = useCallback(() => {
    refetchLocker();
    refetchVault();
  }, [refetchLocker, refetchVault]);

  // ── Deposit: locker tier → Open Storage (basket) ─────────────────────────
  // Tier dispatch: SSU owner pulls from Main Storage; non-owner member pulls
  // from Player Locker. Both deposit into Open Storage with BazarAuth gating
  // and bump per-typeId counters on vault.id (dynamic fields).
  async function handleDeposit(typeId: number, maxQty: number) {
    if (!quicktradeVaultId) { showStatus(false, "Quicktrade Vault not configured for this SSU — contact the bazaar owner"); return; }
    if (!ssuGovId) { showStatus(false, "SSU governance not loaded"); return; }
    if (!character) { showStatus(false, "Resolving character — please wait"); return; }
    if (!memberRegistryId) { showStatus(false, "Resolving member registry — please wait"); return; }
    const qty = getDepositAmount(typeId, maxQty);
    if (qty <= 0 || qty > maxQty) { showStatus(false, "Invalid quantity"); return; }
    setDepositingTypeId(typeId);
    try {
      // Re-resolve the relevant cap immediately before each TX — the borrow/return cycle
      // in every deposit increments the cap object's on-chain version, so using a cached
      // version from a previous TX causes "provided version doesn't match" on the next one.
      let ssuOwnerCapRef: { ssuCapId: string; ssuCapVersion: string; ssuCapDigest: string } | undefined;
      let charCapRef: { charCapId: string; charCapVersion: string; charCapDigest: string } | undefined;
      if (ownerCapState.isSsuOwner) {
        const freshCap = await resolveSSUOwnerCap(character.characterId, SSU_OBJECT_ID);
        if (!freshCap) { showStatus(false, "Could not resolve SSU owner cap — please retry"); return; }
        ssuOwnerCapRef = freshCap;
      } else {
        const fresh = await resolveCapRef();
        charCapRef = { charCapId: character.ownerCapId, charCapVersion: fresh.ownerCapVersion, charCapDigest: fresh.ownerCapDigest };
      }
      const tx = buildBasketDeposit({
        quicktradeVaultId,
        ssuGovId,
        ssuId:            SSU_OBJECT_ID,
        characterId:      character.characterId,
        memberRegistryId,
        items:            [{ typeId, quantity: qty }],
        ssuOwnerCapRef,
        charCapRef,
      });
      await signGated(tx);
      refetchAll();
      showStatus(true, "Deposited successfully");
    } catch (e: any) { showStatus(false, e?.message ?? "Transaction failed"); }
    finally { setDepositingTypeId(null); }
  }

  // ── Withdraw: Open Storage (basket) → locker tier ────────────────────────
  async function handleWithdraw(typeId: number, maxQty: number) {
    if (!quicktradeVaultId) { showStatus(false, "Quicktrade Vault not configured for this SSU — contact the bazaar owner"); return; }
    if (!ssuGovId) { showStatus(false, "SSU governance not loaded"); return; }
    if (!character) { showStatus(false, "Resolving character — please wait"); return; }
    if (!memberRegistryId) { showStatus(false, "Resolving member registry — please wait"); return; }
    const qty = getWithdrawAmount(typeId, maxQty);
    if (qty <= 0 || qty > maxQty) { showStatus(false, "Invalid quantity"); return; }
    setWithdrawingTypeId(typeId);
    try {
      // Re-resolve SSU owner cap fresh — same version-staleness reason as handleDeposit.
      let ssuOwnerCapRef: { ssuCapId: string; ssuCapVersion: string; ssuCapDigest: string } | undefined;
      if (ownerCapState.isSsuOwner) {
        const freshCap = await resolveSSUOwnerCap(character.characterId, SSU_OBJECT_ID);
        if (!freshCap) { showStatus(false, "Could not resolve SSU owner cap — please retry"); return; }
        ssuOwnerCapRef = freshCap;
      }
      const tx = buildBasketWithdraw({
        quicktradeVaultId,
        ssuGovId,
        ssuId:            SSU_OBJECT_ID,
        characterId:      character.characterId,
        memberRegistryId,
        typeId,
        quantity:         qty,
        // Owner withdraws into Main Storage; member into Player Locker.
        ssuOwnerCapRef,
      });
      await signGated(tx);
      refetchAll();
      showStatus(true, "Withdrawn successfully");
    } catch (e: any) { showStatus(false, e?.message ?? "Transaction failed"); }
    finally { setWithdrawingTypeId(null); }
  }

  // ── Derived state ─────────────────────────────────────────────────────────
  const isLoading = lockerLoading || vaultLoading;
  const anyError  = lockerError;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <h2 style={titleStyle}>Quicktrade Vault</h2>
        {onClose && (
          <button
            className="btn btn--ghost btn--sm"
            onClick={onClose}
            aria-label="Close Quicktrade Vault panel"
          >
            X
          </button>
        )}
      </div>
      <div style={warningStyle}>
        Items in the Quicktrade Vault are shared. Anyone with access can withdraw them. Use at your own risk.
      </div>
      {!quicktradeVaultId && (
        <div style={{ ...warningStyle, background: "rgba(200,40,40,0.12)", border: "1px solid rgba(200,40,40,0.3)", color: "#e07070" }}>
          Quicktrade Vault is not yet configured for this SSU. Deposits and withdrawals are disabled.
        </div>
      )}
      {statusMsg && (
        <div
          style={{
            ...statusStyle,
            background: statusMsg.ok ? "rgba(0,160,80,0.15)" : "rgba(200,40,40,0.15)",
            border:     `1px solid ${statusMsg.ok ? "rgba(0,160,80,0.4)" : "rgba(200,40,40,0.4)"}`,
            color:      statusMsg.ok ? "#60c080" : "#e07070",
          }}
        >
          {statusMsg.text}
        </div>
      )}
      {anyError && (
        <div style={{ ...statusStyle, background: "rgba(200,40,40,0.1)", border: "1px solid rgba(200,40,40,0.3)", color: "#e07070", margin: "8px 16px" }}>
          {anyError}
        </div>
      )}
      {isLoading && (
        <div style={{ ...sectionStyle }}>
          <p style={mutedStyle}>Loading inventory...</p>
        </div>
      )}
      {!isLoading && (
        <>
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>My Locker</div>
            {lockerItems.length === 0 && (
              <p style={mutedStyle}>Your locker is empty.</p>
            )}
            {lockerItems.map(item => {
              const available = Math.max(0, item.quantity - item.lockedQuantity);
              if (available <= 0) return null;
              const name    = itemName(item.typeId);
              const amount  = getDepositAmount(item.typeId, available);
              const busy    = depositingTypeId === item.typeId;
              return (
                <div key={item.typeId} style={itemRowStyle}>
                  <div>
                    <span style={{ color: "#e0e0e0", fontSize: "0.85rem" }}>{name}</span>
                    <span style={{ color: "#888", fontSize: "0.75rem", marginLeft: "8px" }}>x{available}</span>
                    {item.lockedQuantity > 0 && (
                      <span style={{ color: "#c8a060", fontSize: "0.72rem", marginLeft: "6px" }}>({item.lockedQuantity} locked)</span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                    <input type="number" min={1} max={available} value={amount} style={inputStyle}
                      onChange={e => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) setDepositAmount(item.typeId, Math.max(1, Math.min(v, available))); }} />
                    <button className="btn btn--primary btn--sm" onClick={() => handleDeposit(item.typeId, available)} disabled={busy || amount <= 0}>
                      {busy ? "..." : "Deposit"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={dividerStyle} />
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Vault Contents</div>
            {vaultItemsVisible.length === 0 && (
              <p style={mutedStyle}>No items in the Quicktrade Vault.</p>
            )}
            {vaultItemsVisible.map(entry => {
              const name   = itemName(entry.typeId);
              const maxQty = entry.quantity;
              const amount = getWithdrawAmount(entry.typeId, maxQty);
              const busy   = withdrawingTypeId === entry.typeId;
              return (
                <div key={entry.typeId} style={itemRowStyle}>
                  <div>
                    <span style={{ color: "#e0e0e0", fontSize: "0.85rem" }}>{name}</span>
                    <span style={{ color: "#888", fontSize: "0.75rem", marginLeft: "8px" }}>x{maxQty}</span>
                  </div>
                  <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                    <input type="number" min={1} max={maxQty} value={amount} style={inputStyle}
                      onChange={e => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) setWithdrawAmount(entry.typeId, Math.max(1, Math.min(v, maxQty))); }} />
                    <button className="btn btn--primary btn--sm" onClick={() => handleWithdraw(entry.typeId, maxQty)} disabled={busy || amount <= 0}>
                      {busy ? "..." : "Withdraw"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
