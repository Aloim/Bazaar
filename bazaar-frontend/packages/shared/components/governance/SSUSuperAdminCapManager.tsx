// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * SSUSuperAdminCapManager — Owner-only UI for issuing and revoking SSUSuperAdminCaps.
 *
 * Mounted inside the "Users & Roles" tab of each app's SSUGovernanceButton,
 * gated on caps.hasSSUOwnerCap === true.
 *
 * Grant flow: Owner enters recipient address → buildIssueSSUSuperAdminCap → sign.
 * Revoke flow: Owner enters target cap object ID → buildRevokeSSUSuperAdminCap → sign.
 *   Revoke is Owner-unilateral (ESC-01 reversal 2026-04-23). No cap-holder cooperation needed.
 * Roster view: deferred to FP1-23 (event indexing required). Empty state shown.
 *
 * Constitution XII.2 — Owner tier manages SuperAdmin tier cap lifecycle.
 * Constitution III.2 — Shared component; mounted by all 3 apps identically.
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { useState } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import {
  buildIssueSSUSuperAdminCap,
  buildRevokeSSUSuperAdminCap,
} from "../../tx/bazaarcore/ssu-governance-tx";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface SSUSuperAdminCapManagerProps {
  /** SSUOwnerCap object ID owned by the connected wallet. */
  ownerCapId: string;
  /** SSUGovernance shared object ID for this SSU. */
  ssuGovId: string;
}

// ── GrantSection ──────────────────────────────────────────────────────────────

function GrantSection({ ownerCapId, ssuGovId }: SSUSuperAdminCapManagerProps) {
  const [recipient, setRecipient] = useState("");
  const [loading, setLoading]     = useState(false);
  const [status, setStatus]       = useState<string | null>(null);

  async function handleGrant() {
    const addr = recipient.trim();
    if (!addr) { setStatus("Enter a recipient address."); return; }
    if (!addr.startsWith("0x")) { setStatus("Address must start with 0x."); return; }
    setLoading(true);
    setStatus(null);
    try {
      const tx = buildIssueSSUSuperAdminCap({ ownerCapId, ssuGovId, recipient: addr });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setStatus("SuperAdmin cap issued successfully.");
      setRecipient("");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel__section" style={{ marginTop: "1.25rem" }}>
      <h4 style={{ marginBottom: "0.5rem", color: "var(--accent)" }}>
        Grant SuperAdmin Cap
      </h4>
      <p className="muted" style={{ fontSize: "0.8rem", marginBottom: "0.75rem" }}>
        Issue an SSUSuperAdminCap to a wallet address. Move transfers the cap
        directly to the recipient — no counterparty action required.
      </p>
      <div className="panel__field">
        <label style={{ fontSize: "0.8rem" }}>Recipient Address</label>
        <input
          type="text"
          className="input"
          placeholder="0x..."
          value={recipient}
          onChange={e => setRecipient(e.target.value)}
          disabled={loading}
        />
      </div>
      <button
        className="btn btn--primary"
        onClick={handleGrant}
        disabled={loading || !recipient.trim()}
        style={{ marginTop: "0.5rem" }}
      >
        {loading ? "Issuing..." : "Grant SuperAdmin"}
      </button>
      {status && (
        <p
          className="muted"
          style={{
            marginTop: "0.5rem",
            fontSize: "0.8rem",
            color: status.startsWith("Error") ? "var(--error, #e55)" : "var(--success, #5e5)",
          }}
        >
          {status}
        </p>
      )}
    </div>
  );
}

// ── RevokeSection ─────────────────────────────────────────────────────────────

function RevokeSection({ ownerCapId, ssuGovId }: SSUSuperAdminCapManagerProps) {
  const [targetCapId, setTargetCapId] = useState("");
  const [loading, setLoading]         = useState(false);
  const [status, setStatus]           = useState<string | null>(null);

  async function handleRevoke() {
    const capId = targetCapId.trim();
    if (!capId) { setStatus("Enter the cap object ID to revoke."); return; }
    if (!capId.startsWith("0x")) { setStatus("Cap object ID must start with 0x."); return; }
    if (!confirm(`Revoke SSUSuperAdminCap ${capId.slice(0, 12)}...? This cannot be undone.`)) return;
    setLoading(true);
    setStatus(null);
    try {
      const tx = buildRevokeSSUSuperAdminCap({ ownerCapId, ssuGovId, targetCapId: capId });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setStatus("Cap revoked. It remains in the holder's wallet but is now invalid.");
      setTargetCapId("");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel__section" style={{ marginTop: "1.25rem" }}>
      <h4 style={{ marginBottom: "0.5rem", color: "var(--accent)" }}>
        Revoke SuperAdmin Cap
      </h4>
      <p className="muted" style={{ fontSize: "0.8rem", marginBottom: "0.75rem" }}>
        Owner-unilateral revoke by cap object ID. The cap is marked invalid in the
        governance table; no holder cooperation required. The cap object remains in
        the holder's wallet until they call destroy (GC).
      </p>
      <div className="panel__field">
        <label style={{ fontSize: "0.8rem" }}>Target Cap Object ID</label>
        <input
          type="text"
          className="input"
          placeholder="0x... (SSUSuperAdminCap object ID)"
          value={targetCapId}
          onChange={e => setTargetCapId(e.target.value)}
          disabled={loading}
        />
      </div>
      <button
        className="btn btn--danger"
        onClick={handleRevoke}
        disabled={loading || !targetCapId.trim()}
        style={{ marginTop: "0.5rem" }}
      >
        {loading ? "Revoking..." : "Revoke Cap"}
      </button>
      {status && (
        <p
          className="muted"
          style={{
            marginTop: "0.5rem",
            fontSize: "0.8rem",
            color: status.startsWith("Error") ? "var(--error, #e55)" : "var(--success, #5e5)",
          }}
        >
          {status}
        </p>
      )}
    </div>
  );
}

// ── RosterSection ─────────────────────────────────────────────────────────────

function RosterSection() {
  return (
    <div className="panel__section" style={{ marginTop: "1.25rem" }}>
      <h4 style={{ marginBottom: "0.5rem", color: "var(--accent)" }}>
        Current SuperAdmin Cap Holders
      </h4>
      <p className="muted" style={{ fontSize: "0.8rem" }}>
        Roster view requires event indexing (FP1-23 — deferred). Issue and
        revoke are functional above. Track active cap holders off-chain until
        FP1-23 lands.
      </p>
    </div>
  );
}

// ── SSUSuperAdminCapManager Main ──────────────────────────────────────────────

/**
 * Mounts inside the "Users & Roles" tab, gated on caps.hasSSUOwnerCap === true.
 * Props: ownerCapId (the SSUOwnerCap object ID), ssuGovId (SSUGovernance object ID).
 */
export default function SSUSuperAdminCapManager({
  ownerCapId,
  ssuGovId,
}: SSUSuperAdminCapManagerProps) {
  return (
    <div style={{ borderTop: "1px solid var(--border, rgba(255,255,255,0.1))", paddingTop: "1rem" }}>
      <h3 style={{ marginBottom: "0.25rem" }}>SuperAdmin Caps</h3>
      <p className="muted" style={{ fontSize: "0.8rem", marginBottom: "0.5rem" }}>
        Constitution XII.2 — Owner tier manages who holds SSUSuperAdminCap.
      </p>
      <GrantSection ownerCapId={ownerCapId} ssuGovId={ssuGovId} />
      <RevokeSection ownerCapId={ownerCapId} ssuGovId={ssuGovId} />
      <RosterSection />
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
