// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * TribeRolesSubTab — tribe-level role granting (Phase 6 W4, AUD-ET-21).
 *
 * First UI consumer of buildGrantTribeRole (the builder was dead since R6 —
 * and dead-TARGETED until the Phase-6 module fix). Grant chain mirrors the
 * Move cap hierarchy (tribe_governance_caps.move:62-121):
 *   TribeLeaderCap      → grants Super Admin
 *   TribeSuperAdminCap  → grants Admin
 *   TribeAdminCap       → grants Mod
 * Every grant is on-chain cap-gated (E_WRONG_TRIBE identity assert + tribe
 * active + Easy/Advanced) — this surface only ENABLES options for caps the
 * wallet actually holds; holding none renders read-only guidance (A4:
 * UI-hiding is not authorization, and authorization is not UI).
 *
 * Revocation lives in the sibling Cap Revocation sub-tab. SSU-member roles
 * (membership::set_role) are SSU-scoped and stay in the SSU panel.
 */

import { useState } from "react";
import { dAppKit, useConnection } from "@evefrontier/dapp-kit";
import { useTribeCaps } from "@bazaar/shared/hooks/useTribeCaps";
import { buildGrantTribeRole } from "@bazaar/shared/tx/bazaarcore/tribe-governance-tx";
import AddressInput from "@bazaar/shared/components/AddressInput";
import { useToast } from "@bazaar/shared/components";

type RoleLevel = "super_admin" | "admin" | "mod";

interface TribeRolesSubTabProps {
  tribeGovId: string;
}

const ROLE_META: Array<{
  level: RoleLevel;
  label: string;
  grantedBy: string;
  powers: string;
}> = [
  {
    level: "super_admin",
    label: "Super Admin",
    grantedBy: "Tribe Leader",
    powers: "tax withdrawal, cap revocation, tribe settings, all admin powers",
  },
  {
    level: "admin",
    label: "Admin",
    grantedBy: "Super Admin",
    powers: "bans, store visibility, applications, all mod powers",
  },
  {
    level: "mod",
    label: "Mod",
    grantedBy: "Admin",
    powers: "shop moderation on tribe SSUs",
  },
];

export function TribeRolesSubTab({ tribeGovId }: TribeRolesSubTabProps) {
  const { walletAddress } = useConnection();
  const { leaderCapId, superAdminCapId, adminCapId } = useTribeCaps();
  const toast = useToast();

  const [role, setRole] = useState<RoleLevel | null>(null);
  const [recipient, setRecipient] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // The cap that authorizes each grant level — null when not held.
  const capForRole: Record<RoleLevel, string | null> = {
    super_admin: leaderCapId,
    admin:       superAdminCapId,
    mod:         adminCapId,
  };
  const grantableRoles = ROLE_META.filter(r => !!capForRole[r.level]);
  const activeRole = role ?? grantableRoles[0]?.level ?? null;

  const recipientValid = recipient.trim().startsWith("0x") && recipient.trim().length >= 10;
  const selfTarget = !!walletAddress && recipient.trim() === walletAddress;
  const canGrant =
    !!tribeGovId && !!activeRole && !!capForRole[activeRole] &&
    recipientValid && !busy;

  async function handleGrant() {
    if (!activeRole || !canGrant) return;
    const capId = capForRole[activeRole];
    if (!capId) return;
    setBusy(true);
    setError("");
    try {
      const tx = buildGrantTribeRole({
        capId,
        tribeGovId,
        recipient: recipient.trim(),
        roleLevel: activeRole,
      });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      const meta = ROLE_META.find(r => r.level === activeRole);
      toast.success(`${meta?.label ?? activeRole} cap granted`, {
        detail: `Cap transferred to ${recipient.trim().slice(0, 10)}… — the holder can use it immediately.`,
        duration: 7000,
      });
      setRecipient("");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Grant transaction failed.";
      setError(msg);
      toast.error("Grant failed", { detail: msg, duration: 9000 });
    } finally {
      setBusy(false);
    }
  }

  if (!tribeGovId) {
    return (
      <div className="action-card">
        <h4>Tribe Roles</h4>
        <p className="muted" style={{ fontSize: "0.82rem" }}>
          Tribe governance is not bootstrapped yet — activate governance first
          (Owner tab).
        </p>
      </div>
    );
  }

  return (
    <div className="action-card">
      <h4 style={{ marginBottom: "0.25rem" }}>Tribe Roles</h4>
      <p className="muted" style={{ fontSize: "0.82rem", marginBottom: "0.75rem" }}>
        Grant tribe-level capability objects. Each tier grants the one below it:
        Leader → Super Admin → Admin → Mod. The cap is transferred to the
        recipient&apos;s wallet and is enforced on-chain — revoke later via the{" "}
        <strong>Cap Revocation</strong> sub-tab.
      </p>

      {grantableRoles.length === 0 ? (
        <p className="muted" style={{ fontSize: "0.82rem" }}>
          No granting cap detected. Granting requires a TribeLeaderCap (→ Super
          Admin), TribeSuperAdminCap (→ Admin), or TribeAdminCap (→ Mod) in the
          connected wallet.
        </p>
      ) : (
        <>
          <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", marginBottom: "0.6rem" }}>
            {ROLE_META.map(r => {
              const held = !!capForRole[r.level];
              return (
                <button
                  key={r.level}
                  className={`btn btn--sm ${activeRole === r.level ? "btn--primary" : "btn--ghost"}`}
                  disabled={!held}
                  title={held ? r.powers : `Requires a ${r.grantedBy} cap`}
                  onClick={() => setRole(r.level)}
                >
                  {r.label}
                </button>
              );
            })}
          </div>

          {activeRole && (
            <p className="muted" style={{ fontSize: "0.74rem", marginBottom: "0.6rem" }}>
              {ROLE_META.find(r => r.level === activeRole)?.label}: grants{" "}
              {ROLE_META.find(r => r.level === activeRole)?.powers}.
            </p>
          )}

          <div className="form-row" style={{ gap: "0.5rem" }}>
            <AddressInput
              value={recipient}
              onChange={setRecipient}
              placeholder="Recipient 0x… (or search by name)"
            />
            <button
              className="btn btn--primary btn--sm"
              disabled={!canGrant}
              onClick={handleGrant}
            >
              {busy ? "Granting…" : "Grant"}
            </button>
          </div>
          {selfTarget && (
            <p style={{ color: "var(--color-warn, #f5a623)", fontSize: "0.74rem", marginTop: "0.4rem" }}>
              Recipient is your own wallet — you already hold a higher tier.
            </p>
          )}
          {error && (
            <p style={{ color: "var(--color-danger, #f44336)", fontSize: "0.8rem", marginTop: "0.4rem" }}>
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
