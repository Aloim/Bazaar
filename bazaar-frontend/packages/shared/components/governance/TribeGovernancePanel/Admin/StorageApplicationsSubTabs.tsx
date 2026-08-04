// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Split from AdminTab.tsx to keep both files under the 500-LOC cap.
// Per FA-R6.6.4c §2 file-5: StorageLimitsTab wired (read-only); ApplicationsTab
// FULLY HIDDEN per OS-50 — operator uses TribeSettingsSection for tribe join
// applications instead. File named StorageApplicationsSubTabs to match the
// architect's original split boundary; final state is storage-only.

import { useSuiQuery } from "@bazaar/shared/hooks/useSuiQuery";
import {
  USER_STORAGE_REGISTRY_ID,
  ROLE_LABEL,
} from "@bazaar/shared/constants";

// ── StorageLimitsTab ──────────────────────────────────────────────────────────
// Bazar1 lines 936-1034. "Set Per-Role Volume Limit" mutating form HIDDEN per
// OS-46 — buildSetVolumeLimit has no live Move-side equivalent in the current
// tribe surface (the legacy inventory-tx.ts builder was retired in R5 arch
// cleanup; no consumer remains in shared/components). Display table retained
// read-only via live useSuiQuery(USER_STORAGE_REGISTRY_ID).

export function StorageLimitsTab() {
  const { data: storageObj, isLoading } = useSuiQuery<any>("getObject", {
    id: USER_STORAGE_REGISTRY_ID,
    options: { showContent: true },
  });

  const volumeLimits: number[] = (() => {
    const fields = (storageObj?.data?.content as any)?.fields ?? {};
    const raw    = fields.volume_limits;
    if (Array.isArray(raw) && raw.length >= 5) {
      return raw.slice(0, 5).map(Number);
    }
    return [0, 0, 0, 0, 0];
  })();

  return (
    <div>
      <div className="action-card">
        <h4>Current Volume Limits per Role</h4>
        <p className="muted" style={{ fontSize: "0.78rem" }}>
          0 = unlimited. Volume is measured in item volume units.
        </p>
        {isLoading ? (
          <p className="muted">Loading limits...</p>
        ) : (
          <table className="tax-grid">
            <thead>
              <tr>
                <th>Role</th>
                <th>Volume Limit</th>
              </tr>
            </thead>
            <tbody>
              {volumeLimits.map((limit, i) => (
                <tr key={i}>
                  <td>{ROLE_LABEL[i] ?? String(i)}</td>
                  <td>{limit === 0 ? "Unlimited" : limit.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}

// ── ApplicationsTab — FULLY HIDDEN per OS-50 ─────────────────────────────────
// Bazar1 lines 1585-1756. The DApp-level registration request queue (requester /
// ssuId / requestedAtMs) is DApp-governance territory, not tribe governance.
// Tribe join applications are managed via TribeSettingsSection which is already
// wired in the SuperAdmin tab. buildAcceptRequest* / buildRejectRequest* have no
// tribe-equivalent in our Move surface.
//
// OS-50: ApplicationsTab FULLY HIDDEN. Do NOT export an ApplicationsTab function
// here. Operator action: use TribeSettingsSection → Applications sub-tab for
// tribe-level join approvals.

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
