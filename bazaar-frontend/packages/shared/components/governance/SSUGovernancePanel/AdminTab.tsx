// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * AdminTab — SSU governance Admin tab.
 *
 * V37 (Announcement beacon rework): the old "Announcements" sub-tab (the
 * "Post Local Announcement" write card) was REMOVED from here. Writing SSU news
 * now lives in the in-world Announcement beacon window
 * (components/windows/AnnouncementNewsWindow.tsx), role-gated to SSU admin+ and
 * posting via the soft-check shared_widgets::create_announcement path. The SSU
 * Admin tab now contains only "Users & Roles".
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import SSUManageUsersTab from "@bazaar/shared/components/governance/SSUManageUsersTab";

// ── SSUAdminTab ───────────────────────────────────────────────────────────────

interface SSUAdminTabProps {
  ssuId: string;
  ssuOwner: string;
  ssuSuperAdmins: string[];
  ssuAdmins: string[];
  ssuMods: string[];
  localUsers: string[];
  localBanList: Map<string, number>;
  characterNames: Map<string, string>;
  hasSSUOwnerCap: boolean;
  hasSSUSuperAdminCap: boolean;
  hasSSUAdminCap: boolean;
  hasSSUModCap: boolean;
  ownerCapId?: string;
  superAdminCapId?: string;
  adminCapId?: string;
  ssuModCapId?: string;
  connectedAddress?: string;
  onRefetch: () => void;
}

export function SSUAdminTab({
  ssuId,
  ssuOwner, ssuSuperAdmins, ssuAdmins, ssuMods, localUsers, localBanList,
  hasSSUOwnerCap, hasSSUSuperAdminCap, hasSSUAdminCap, hasSSUModCap,
  characterNames,
  ownerCapId, superAdminCapId, adminCapId, ssuModCapId,
  connectedAddress,
  onRefetch,
}: SSUAdminTabProps) {
  return (
    <div className="panel__section">
      <SSUManageUsersTab
        ssuId={ssuId}
        ssuOwner={ssuOwner}
        ssuSuperAdmins={ssuSuperAdmins}
        ssuAdmins={ssuAdmins}
        ssuMods={ssuMods}
        localUsers={localUsers}
        localBanList={localBanList}
        hasSSUOwnerCap={hasSSUOwnerCap}
        hasSSUSuperAdminCap={hasSSUSuperAdminCap}
        hasSSUAdminCap={hasSSUAdminCap}
        hasSSUModCap={hasSSUModCap}
        ssuOwnerCapId={ownerCapId ?? null}
        ssuSuperAdminCapId={superAdminCapId ?? null}
        ssuAdminCapId={adminCapId ?? null}
        ssuModCapId={ssuModCapId ?? null}
        connectedAddress={connectedAddress}
        onRefetch={onRefetch}
      />
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
