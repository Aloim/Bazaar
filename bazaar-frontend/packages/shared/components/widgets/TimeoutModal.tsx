// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState } from "react";
import { abbreviateAddress, dAppKit } from "@evefrontier/dapp-kit";
import { buildSSUBanAs } from "@bazaar/shared/tx/bazaarcore/ssu-ban-tx";
import type { SSUCapTier } from "@bazaar/shared/tx/bazaarcore/ssu-ban-tx";

// ── TimeoutModal ──────────────────────────────────────────────────────────────

export interface TimeoutModalProps {
  address:   string;
  capTier:   SSUCapTier;
  capId:     string;
  ssuGovId:  string;
  onConfirm: () => void;
  onClose:   () => void;
}

// ── DurationField (internal helper) ──────────────────────────────────────────

interface DurationFieldProps {
  label:    string;
  value:    number;
  onChange: (v: number) => void;
}

function DurationField({ label, value, onChange }: DurationFieldProps) {
  return (
    <div className="form-group timeout-picker__field">
      <label className="form-label">{label}</label>
      <input
        type="number"
        className="input input--xs"
        min={0}
        value={value}
        onChange={e => onChange(Math.max(0, Number(e.target.value)))}
      />
    </div>
  );
}

export default function TimeoutModal({ address, capTier, capId, ssuGovId, onConfirm, onClose }: TimeoutModalProps) {
  const [weeks,   setWeeks]   = useState(0);
  const [days,    setDays]    = useState(0);
  const [hours,   setHours]   = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [loading, setLoading] = useState(false);

  const totalMs =
    weeks   * 7 * 24 * 60 * 60 * 1000 +
    days        * 24 * 60 * 60 * 1000 +
    hours            * 60 * 60 * 1000 +
    minutes               * 60 * 1000;

  const isKick = totalMs === 0;

  function durationLabel(): string {
    if (isKick) return "Session kick (immediate)";
    const parts: string[] = [];
    if (weeks   > 0) parts.push(`${weeks}w`);
    if (days    > 0) parts.push(`${days}d`);
    if (hours   > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    return parts.join(" ");
  }

  async function handleConfirm() {
    setLoading(true);
    try {
      const tx = buildSSUBanAs({ capTier, capId, ssuGovId, target: address, expiresAtMs: isKick ? "permanent" : Date.now() + totalMs });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      onConfirm();
    } catch (e: any) {
      alert(e?.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--warn" onClick={e => e.stopPropagation()}>
        <div className="modal__header">
          <h3>Timeout User</h3>
        </div>

        <div className="ban-modal__target">
          <span className="muted" style={{ fontSize: "0.78rem" }}>Target:</span>
          <code className="ban-modal__addr">{abbreviateAddress(address)}</code>
        </div>

        <div className="ban-modal__warning">
          This user will be temporarily banned for the duration specified.
          All their active shops will be closed and escrowed items/funds returned.
        </div>

        <div className="timeout-picker">
          <div className="timeout-picker__row">
            <DurationField label="Weeks"   value={weeks}   onChange={setWeeks} />
            <DurationField label="Days"    value={days}    onChange={setDays} />
            <DurationField label="Hours"   value={hours}   onChange={setHours} />
            <DurationField label="Minutes" value={minutes} onChange={setMinutes} />
          </div>
          <p className="muted timeout-picker__note">
            Setting all values to 0 will kick the user from their current session.
          </p>
          <div className="timeout-picker__total">
            Duration: <strong>{durationLabel()}</strong>
          </div>
        </div>

        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="btn btn--danger"
            disabled={!capId || loading}
            onClick={handleConfirm}
          >
            {loading ? "Applying..." : "Apply Timeout"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
