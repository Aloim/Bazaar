// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// SSU Users & Roles tab (V30 redesign).
//
// Source of truth is the per-SSU MemberRegistry (ssu_role per address, via
// useSSURoleList) — the previous implementation read ssu_admins/ssu_mods/etc.
// tables off SSUGovernance, which DO NOT exist on that struct, so the list was
// always empty. Sections are now one-per-role (Owner..Stranger) + Banned.
//
// Role changes use membership::set_ssu_role_gated: authority is the CALLER's own
// ssu_role (or Owner/SuperAdmin cap), so Admins and SuperAdmins can manage users.
// Bans still go through the cap-gated ssu_ban_as_* entries (Owner/SuperAdmin).

import { useState, useMemo } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { useCharacterNames } from "@bazaar/shared/hooks";
import { useSSURoleList } from "@bazaar/shared/hooks";
import { useSSUGovId } from "@bazaar/shared/hooks";
import { useSSUSharedObjects } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { useSSURoles } from "@bazaar/shared/hooks/bazaarcore/ssu-governance-hooks";
import { buildSetSSURoleGated } from "@bazaar/shared/tx/bazaarcore/ssu-governance-tx";
import { buildSSUBanAs, buildSSUUnbanAs } from "@bazaar/shared/tx/bazaarcore/ssu-ban-tx";
import { SSU_OBJECT_ID, ROLE_LABEL } from "@bazaar/shared/constants";
import { SSURoleSection } from "./SSURoleSection";
import { ManualActionsPopup } from "./ManualActionsPopup";
import {
  type SSUManageUsersTabProps, type SSURoleSection as SSURoleSectionType,
  resolveCapInfo, ROLE_SECTIONS,
} from "./ssu-roles";

export default function SSUManageUsersTab({
  ssuId, ssuOwner, localBanList,
  hasSSUOwnerCap, hasSSUSuperAdminCap, hasSSUAdminCap, hasSSUModCap,
  ssuOwnerCapId, ssuSuperAdminCapId, ssuAdminCapId, ssuModCapId,
  connectedAddress, onRefetch,
}: SSUManageUsersTabProps) {
  const [banTarget,        setBanTarget]        = useState("");
  const [banLoading,       setBanLoading]       = useState("");
  const [transferTarget,   setTransferTarget]   = useState("");
  const [transferLoading,  setTransferLoading]  = useState(false);
  const [showManualActions, setShowManualActions] = useState(false);

  const { data: ssuGovId } = useSSUGovId(SSU_OBJECT_ID);
  const { data: shared } = useSSUSharedObjects(ssuId || null);
  const memberRegistryId = shared?.memberRegistryId ?? "";

  // Real role data: per-address ssu_role from the MemberRegistry (polls).
  const { entries, refetch: refetchRoles } = useSSURoleList(ssuId || null);

  // The connected wallet's own ssu_role — part of its effective authority.
  const { data: callerRoles } = useSSURoles(connectedAddress ?? null, memberRegistryId || null);

  type SSUCapTier = "owner" | "super_admin" | "admin" | "mod";
  const capTier: SSUCapTier = hasSSUOwnerCap ? "owner" : hasSSUSuperAdminCap ? "super_admin" : hasSSUAdminCap ? "admin" : "mod";
  const resolvedCapId = ssuOwnerCapId ?? ssuSuperAdminCapId ?? ssuAdminCapId ?? ssuModCapId;

  const capInfo = useMemo(
    () => resolveCapInfo(hasSSUOwnerCap, ssuOwnerCapId, hasSSUSuperAdminCap, ssuSuperAdminCapId, hasSSUAdminCap, ssuAdminCapId, hasSSUModCap, ssuModCapId),
    [hasSSUOwnerCap, ssuOwnerCapId, hasSSUSuperAdminCap, ssuSuperAdminCapId, hasSSUAdminCap, ssuAdminCapId, hasSSUModCap, ssuModCapId],
  );

  // Effective SSU authority = max(owner cap → 7, super-admin cap → 6, own ssu_role).
  const actorAuthority = useMemo(
    () => Math.max(hasSSUOwnerCap ? 7 : 0, hasSSUSuperAdminCap ? 6 : 0, callerRoles?.ssuRole ?? 0),
    [hasSSUOwnerCap, hasSSUSuperAdminCap, callerRoles],
  );

  // Bans are cap-gated on-chain (only Owner/SuperAdmin caps exist).
  const canBan = hasSSUOwnerCap || hasSSUSuperAdminCap;

  // address → current ssu_role (Owner injected even if not yet seeded in registry).
  const roleByAddr = useMemo(() => {
    const m = new Map<string, number>();
    entries.forEach(e => m.set(e.address, e.role));
    if (ssuOwner && !m.has(ssuOwner)) m.set(ssuOwner, 7);
    return m;
  }, [entries, ssuOwner]);

  const bannedSet = useMemo(() => new Set(localBanList.keys()), [localBanList]);

  const allAddresses = useMemo(() => {
    const set = new Set<string>();
    if (ssuOwner) set.add(ssuOwner);
    roleByAddr.forEach((_, a) => set.add(a));
    localBanList.forEach((_, a) => set.add(a));
    if (connectedAddress) set.add(connectedAddress);
    return Array.from(set);
  }, [ssuOwner, roleByAddr, localBanList, connectedAddress]);

  const characterNames = useCharacterNames(allAddresses);

  // One section per role (highest first) + Banned. Banned users are shown only in
  // the Banned section (excluded from their role section to avoid duplication).
  const sections = useMemo<SSURoleSectionType[]>(() => {
    const byRole = new Map<number, string[]>();
    roleByAddr.forEach((role, addr) => {
      if (bannedSet.has(addr)) return;
      const arr = byRole.get(role) ?? [];
      arr.push(addr);
      byRole.set(role, arr);
    });
    const out: SSURoleSectionType[] = ROLE_SECTIONS.map(def => ({
      id: def.id,
      label: def.label,
      entries: (byRole.get(def.role) ?? []).map(addr => ({
        address: addr, sectionLabel: ROLE_LABEL[def.role] ?? "",
      })),
    }));
    out.push({
      id: "banned",
      label: "Banned",
      entries: Array.from(localBanList.keys()).map(a => ({ address: a, sectionLabel: "Banned" })),
    });
    return out;
  }, [roleByAddr, bannedSet, localBanList]);

  async function setRole(target: string, newRole: number) {
    if (!memberRegistryId) { alert("Member registry not resolved yet — please retry."); return; }
    try {
      const tx = buildSetSSURoleGated({ memberRegistryId, player: target, newRole });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setTimeout(() => { onRefetch(); refetchRoles(); }, 1500);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Role change failed.");
    }
  }

  async function banPlayer(address: string, durationMs: number) {
    if (!canBan || !address || !ssuGovId || !resolvedCapId) return;
    const expiresAtMs: number | "permanent" = durationMs === 0 ? "permanent" : Date.now() + durationMs;
    try {
      const tx = buildSSUBanAs({ capTier, capId: resolvedCapId, ssuGovId, target: address, expiresAtMs });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setTimeout(onRefetch, 1500);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Ban failed.");
    }
  }

  async function unbanPlayer(address: string) {
    if (!canBan || !ssuGovId || !resolvedCapId) return;
    try {
      const tx = buildSSUUnbanAs({ capTier, capId: resolvedCapId, ssuGovId, target: address });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setTimeout(onRefetch, 1500);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Unban failed.");
    }
  }

  async function transferOwnership() {
    if (!ssuOwnerCapId || !transferTarget.trim()) return;
    setTransferLoading(true);
    try {
      const tx = new Transaction();
      tx.transferObjects([tx.object(ssuOwnerCapId)], tx.pure.address(transferTarget.trim()));
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setTimeout(onRefetch, 1500);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Transfer failed.");
    } finally { setTransferLoading(false); }
  }

  const totalUsers = roleByAddr.size + localBanList.size;
  if (totalUsers === 0) {
    return <div className="panel__section"><p className="muted">No SSU users found yet. Users appear here once they register or are assigned a role.</p></div>;
  }

  return (
    <div className="panel__section manage-users">
      {(actorAuthority >= 5 || canBan) && (
        <div style={{ marginBottom: "1rem", display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn--ghost btn--sm" onClick={() => setShowManualActions(true)}>Manual Actions</button>
        </div>
      )}
      {sections.map(section => (
        <SSURoleSection
          key={section.id}
          section={section}
          characterNames={characterNames}
          connectedAddress={connectedAddress}
          localBanList={localBanList}
          roleByAddr={roleByAddr}
          actorAuthority={actorAuthority}
          canBan={canBan}
          banLoading={banLoading}
          onSetRole={setRole}
          onUnban={unbanPlayer}
          onBan={banPlayer}
          isBannedSection={section.id === "banned"}
          isOwnerSection={section.id === "owner"}
        />
      ))}
      {showManualActions && (
        <ManualActionsPopup
          memberRegistryId={memberRegistryId}
          actorAuthority={actorAuthority}
          canBan={canBan}
          hasSSUOwnerCap={hasSSUOwnerCap}
          ssuOwnerCapId={ssuOwnerCapId}
          banTarget={banTarget} setBanTarget={setBanTarget}
          banLoading={banLoading}
          transferTarget={transferTarget} setTransferTarget={setTransferTarget}
          transferLoading={transferLoading}
          onSetRole={setRole}
          onBanPlayer={banPlayer}
          onTransferOwnership={transferOwnership}
          onClose={() => setShowManualActions(false)}
        />
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
