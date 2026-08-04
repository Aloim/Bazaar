// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BanControl — shared timed/permanent-ban form.
 *
 * ⚠ SHARED-SURFACE RULE: this control is mounted by BOTH governance Moderation
 * tabs — the per-SSU `SSUGovernancePanel/ModerationTab` and the tribe-wide
 * `TribeGovernancePanel/ModerationTab` (V35). Edit ban UX here so it lands on
 * both; never fork one surface.
 *
 * UX (user spec 2026-06-10):
 *   - Permanent-ban checkbox (default UNCHECKED).
 *   - Duration slider 1 day → 2 weeks, DISABLED while permaban is checked.
 *   - On Ban → "Banned {target} for {duration}" toast (success) via useToast().
 *
 * The parent owns the on-chain call: `onBan(expiresAtMs)` resolves the absolute
 * epoch-ms expiry, or the literal "permanent" sentinel (the ban TX builders map
 * "permanent" → u64::MAX). The parent's promise resolves on success / rejects on
 * failure; this control fires the success/error toast.
 */

import { useState } from "react";
import { useToast } from "@bazaar/shared/components/widgets/Toast";

// ── Duration model ──────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const MIN_BAN_DAYS = 1;
const MAX_BAN_DAYS = 14; // 2 weeks

/**
 * JS Date tops out at year 275760 (8.64e15 ms); the permanent-ban sentinel is
 * u64::MAX ms (~1.8e19). Any expiry at/above this threshold is "permanent" —
 * comfortably above every real ban date (a 2-week ban is ~1.8e12 ms).
 */
export const PERMANENT_BAN_THRESHOLD_MS = 8_640_000_000_000_000;

/** True if a stored ban expiry represents a permanent ban (u64::MAX sentinel). */
export function isPermanentBan(expiresAtMs: number): boolean {
  return expiresAtMs >= PERMANENT_BAN_THRESHOLD_MS;
}

/** Human label for a stored ban expiry, used by the Banned-Users list. */
export function formatBanExpiry(expiresAtMs: number): string {
  if (isPermanentBan(expiresAtMs)) return "Permanent";
  if (!expiresAtMs || expiresAtMs <= 0) return "—";
  return new Date(expiresAtMs).toLocaleString();
}

/** Phrase for the confirmation toast — "1 day" / "1 week" / "2 weeks" / "5 days". */
function durationLabel(days: number): string {
  if (days === 7) return "1 week";
  if (days === 14) return "2 weeks";
  if (days === 1) return "1 day";
  return `${days} days`;
}

// ── BanControl ────────────────────────────────────────────────────────────────

export interface BanControlProps {
  /** Display name or abbreviated address of the ban target — shown in the toast. */
  targetLabel: string;
  /**
   * Issue the ban. Receives the absolute epoch-ms expiry, or the "permanent"
   * sentinel. MUST resolve on success and reject on failure so the toast is
   * accurate. The parent does the TX build + execute + refetch.
   */
  onBan: (expiresAtMs: number | "permanent") => Promise<void>;
  /** Disable the whole control (e.g. no eligible cap / unresolved gov object). */
  disabled?: boolean;
}

export function BanControl({ targetLabel, onBan, disabled = false }: BanControlProps) {
  const toast = useToast();
  const [permaban, setPermaban] = useState(false);
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);

  async function handleBan() {
    if (disabled || busy) return;
    const expiresAtMs: number | "permanent" = permaban ? "permanent" : Date.now() + days * DAY_MS;
    const phrase = permaban ? "permanently" : `for ${durationLabel(days)}`;
    setBusy(true);
    try {
      await onBan(expiresAtMs);
      toast.success(`Banned ${targetLabel} ${phrase}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Ban failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-row" style={{ flexDirection: "column", gap: "0.6rem", marginTop: "0.5rem" }}>
      <label
        style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", cursor: "pointer" }}
      >
        <input
          type="checkbox"
          checked={permaban}
          onChange={e => setPermaban(e.target.checked)}
          disabled={disabled || busy}
        />
        <span>Permanent ban</span>
      </label>

      <label
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.25rem",
          fontSize: "0.8rem",
          opacity: permaban ? 0.45 : 1,
        }}
      >
        <span className="muted">
          Duration: <strong>{durationLabel(days)}</strong>
        </span>
        <input
          type="range"
          min={MIN_BAN_DAYS}
          max={MAX_BAN_DAYS}
          step={1}
          value={days}
          onChange={e => setDays(Number(e.target.value))}
          disabled={permaban || disabled || busy}
          style={{ width: "min(18rem, 100%)" }}
          aria-label="Ban duration in days"
        />
        <span className="muted" style={{ fontSize: "0.7rem", display: "flex", justifyContent: "space-between" }}>
          <span>1 day</span>
          <span>2 weeks</span>
        </span>
      </label>

      <div>
        <button
          className="btn btn--danger btn--sm"
          disabled={disabled || busy}
          onClick={handleBan}
        >
          {busy ? "Banning..." : permaban ? "Ban Permanently" : `Ban for ${durationLabel(days)}`}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
