// TaxesFeesTab.tsx — Configure DApp-level tax rate (global_dapp_tax_bps) +
// the four registration/creation fees (V31: GovernanceConfig fee fields) +
// Phase 5 per-type rates (V36: gated by DAPPTAX_PERTYPE_ENABLED).

import { useState } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import { useDAppTaxConfig, useDAppFees, useMultiplayerRelayUrl } from "@bazaar/shared/hooks";
import { buildSetGlobalDAppTaxRate, buildSetRegistrationFees, buildSetMultiplayerRelayUrl, buildSetDappMissionFee } from "@bazaar/shared/tx";
import { buildSetNotribeDappTax, buildSetEasyDappTax, buildSetAdvancedExchangeDappTax } from "@bazaar/shared/tx/dapp_hub/dapp-tax-tx";
import { normalizeRelayUrl } from "@bazaar/shared/hooks/useMultiplayerRelay";
import { formatSui } from "@bazaar/shared/utils";
import { DAPPTAX_PERTYPE_ENABLED } from "@bazaar/shared/constants";

const MIST_PER_EVE = 1_000_000_000;
function eveToMist(eve: string): number { return Math.round((parseFloat(eve) || 0) * MIST_PER_EVE); }

interface Props {
  ownerCapId: string | null;
}

interface StatusMsg {
  ok: boolean;
  msg: string;
}

function bpsToPercent(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
    </div>
  );
}

export default function TaxesFeesTab({ ownerCapId }: Props) {
  const { data, isLoading, error, refetch } = useDAppTaxConfig();

  const [globalBpsInput, setGlobalBpsInput] = useState("");
  const [status, setStatus] = useState<StatusMsg | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const pct = parseFloat(globalBpsInput);
    if (isNaN(pct) || pct < 0 || pct > 50) {
      setStatus({ ok: false, msg: "Rate must be between 0 and 50 (%)." });
      return;
    }
    const bps = Math.round(pct * 100);

    setSaving(true);
    setStatus(null);

    try {
      const tx = buildSetGlobalDAppTaxRate(ownerCapId ?? "", bps);
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      if (result.$kind === "FailedTransaction") {
        throw new Error("Transaction failed. Ensure you hold the DAppOwnerCap.");
      }
      setStatus({ ok: true, msg: "Global DApp tax rate updated successfully." });
      setGlobalBpsInput("");
      setTimeout(() => refetch(), 1500);
    } catch (e: unknown) {
      setStatus({ ok: false, msg: e instanceof Error ? e.message : "Update failed." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel__section">
      {/* Current config display */}
      <div className="action-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h4>Current DApp Tax Rate</h4>
          <button className="btn btn--ghost btn--sm" onClick={() => refetch()} disabled={isLoading}>
            Refresh
          </button>
        </div>
        {isLoading && <p className="muted">Loading...</p>}
        {error && <p className="error-text">Error loading config.</p>}
        {data && !isLoading && (
          <div className="stats-row">
            <Stat label="Global DApp Tax Rate" value={bpsToPercent(data.globalTaxBps)} />
            {data.notribeDappBps !== null && (
              <Stat label="NoTribe Override" value={bpsToPercent(data.notribeDappBps)} />
            )}
            {data.easyDappBps !== null && (
              <Stat label="Easy Override" value={bpsToPercent(data.easyDappBps)} />
            )}
            {data.advancedExchangeDappBps !== null && (
              <Stat label="Advanced Exchange Override" value={bpsToPercent(data.advancedExchangeDappBps)} />
            )}
          </div>
        )}
        <p className="form-hint">
          This rate applies to all DApp-level transactions across all bazaar types.
          Maximum configurable rate: 50%.
        </p>
      </div>

      {/* Update global rate form */}
      <div className="action-card">
        <h4>Update Global Tax Rate</h4>
        <div className="form-group">
          <label className="form-label">New Rate (%)</label>
          <input
            className="input input--sm"
            type="number"
            min="0" max="50" step="0.01"
            value={globalBpsInput}
            onChange={e => setGlobalBpsInput(e.target.value)}
            placeholder={data ? bpsToPercent(data.globalTaxBps) : "0.00"}
            style={{ width: "160px" }}
          />
        </div>

        {status && (
          <p style={{ fontSize: "0.8rem", color: status.ok ? "var(--success)" : "var(--danger)" }}>
            {status.msg}
          </p>
        )}

        <div className="modal__actions">
          <button
            className="btn btn--primary"
            onClick={handleSave}
            disabled={saving || !globalBpsInput.trim()}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Per-type rate cards — V36 only; gated by DAPPTAX_PERTYPE_ENABLED */}
      {DAPPTAX_PERTYPE_ENABLED && (
        <PerTypeRatesSection ownerCapId={ownerCapId} refetchConfig={refetch} />
      )}

      {/* Registration & Creation Fees (V31) */}
      <RegistrationFeesCard ownerCapId={ownerCapId} />

      {/* Mission (MIS) per-hour listing fee — DApp layer (V33; NoTribe + Easy only) */}
      <MissionFeeCard ownerCapId={ownerCapId} />

      {/* Multiplayer relay URL (V32) — one shared standard endpoint for all players */}
      <MultiplayerRelayCard ownerCapId={ownerCapId} />
    </div>
  );
}

// ── Per-type rate cards (V36; gated) ─────────────────────────────────────────

interface PerTypeRateCardProps {
  label:       string;
  hint:        string;
  currentBps:  number | null;
  globalBps:   number;
  ownerCapId:  string | null;
  onSave:      (rateBps: number | null) => Promise<void>;
}

function PerTypeRateCard({ label, hint, currentBps, globalBps, ownerCapId, onSave }: PerTypeRateCardProps) {
  const [useGlobal, setUseGlobal] = useState(currentBps === null);
  const [rateInput, setRateInput] = useState(currentBps !== null ? String((currentBps / 100).toFixed(2)) : "");
  const [status, setStatus] = useState<StatusMsg | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!ownerCapId) {
      setStatus({ ok: false, msg: "DAppOwnerCap not found." });
      return;
    }
    if (useGlobal) {
      // Send None — clear to global
      setSaving(true);
      setStatus(null);
      try {
        await onSave(null);
        setStatus({ ok: true, msg: "Rate cleared — uses global." });
      } catch (e: unknown) {
        setStatus({ ok: false, msg: e instanceof Error ? e.message : "Update failed." });
      } finally {
        setSaving(false);
      }
      return;
    }
    const pct = parseFloat(rateInput);
    if (isNaN(pct) || pct < 0 || pct > 50) {
      setStatus({ ok: false, msg: "Rate must be 0–50 (%)." });
      return;
    }
    const bps = Math.round(pct * 100);
    setSaving(true);
    setStatus(null);
    try {
      await onSave(bps);
      setStatus({ ok: true, msg: `Rate set to ${bpsToPercent(bps)}.` });
    } catch (e: unknown) {
      setStatus({ ok: false, msg: e instanceof Error ? e.message : "Update failed." });
    } finally {
      setSaving(false);
    }
  }

  const displayCurrent = currentBps !== null
    ? bpsToPercent(currentBps)
    : `uses global (${bpsToPercent(globalBps)})`;

  return (
    <div className="action-card">
      <h4>{label}</h4>
      <p className="form-hint">{hint}</p>
      <div className="stats-row">
        <Stat label="Current" value={displayCurrent} />
      </div>
      <div className="form-group" style={{ marginTop: "0.75rem" }}>
        <label className="form-label" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input
            type="checkbox"
            checked={useGlobal}
            onChange={e => {
              setUseGlobal(e.target.checked);
              setStatus(null);
            }}
          />
          Use global rate (unset / clear override)
        </label>
        <p className="form-hint" style={{ marginTop: "0.2rem" }}>
          Unchecked = send an explicit rate (0% = exempt; not the same as unset).
        </p>
      </div>
      {!useGlobal && (
        <div className="form-group">
          <label className="form-label">Rate (%)</label>
          <input
            className="input input--sm"
            type="number"
            min="0" max="50" step="0.01"
            value={rateInput}
            onChange={e => setRateInput(e.target.value)}
            placeholder="0.00"
            style={{ width: "160px" }}
          />
        </div>
      )}
      {status && (
        <p style={{ fontSize: "0.8rem", color: status.ok ? "var(--success)" : "var(--danger)" }}>
          {status.msg}
        </p>
      )}
      <div className="modal__actions">
        <button
          className="btn btn--primary"
          onClick={handleSave}
          disabled={saving || !ownerCapId}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

function PerTypeRatesSection({ ownerCapId, refetchConfig }: { ownerCapId: string | null; refetchConfig: () => void }) {
  const { data, isLoading } = useDAppTaxConfig();

  if (isLoading || !data) return <p className="muted">Loading per-type rates…</p>;

  async function saveNotribe(rateBps: number | null) {
    const tx = buildSetNotribeDappTax({ ownerCapId: ownerCapId ?? "", rateBps });
    const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
    if (result.$kind === "FailedTransaction") throw new Error("Transaction failed.");
    setTimeout(() => refetchConfig(), 1500);
  }

  async function saveEasy(rateBps: number | null) {
    const tx = buildSetEasyDappTax({ ownerCapId: ownerCapId ?? "", rateBps });
    const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
    if (result.$kind === "FailedTransaction") throw new Error("Transaction failed.");
    setTimeout(() => refetchConfig(), 1500);
  }

  async function saveAdvanced(rateBps: number | null) {
    const tx = buildSetAdvancedExchangeDappTax({ ownerCapId: ownerCapId ?? "", rateBps });
    const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
    if (result.$kind === "FailedTransaction") throw new Error("Transaction failed.");
    setTimeout(() => refetchConfig(), 1500);
  }

  return (
    <>
      <PerTypeRateCard
        label="NoTribe DApp Tax Rate"
        hint="Overrides the global rate for NoTribe WTS/WTB shops. Unset = uses global. 0% = exempt. Requires V36."
        currentBps={data.notribeDappBps}
        globalBps={data.globalTaxBps}
        ownerCapId={ownerCapId}
        onSave={saveNotribe}
      />
      <PerTypeRateCard
        label="Easy DApp Tax Rate"
        hint="Overrides the global rate for Easy WTS/WTB shops. Unset = uses global. 0% = exempt. Requires V36."
        currentBps={data.easyDappBps}
        globalBps={data.globalTaxBps}
        ownerCapId={ownerCapId}
        onSave={saveEasy}
      />
      <PerTypeRateCard
        label="Advanced Exchange DApp Tax Rate"
        hint="Overrides the global rate for the Advanced Exchange swap only. Advanced WTS/WTB shops have no DApp layer. Unset = uses global. 0% = exempt. Requires V36."
        currentBps={data.advancedExchangeDappBps}
        globalBps={data.globalTaxBps}
        ownerCapId={ownerCapId}
        onSave={saveAdvanced}
      />
    </>
  );
}

// ── Existing sub-cards ───────────────────────────────────────────────────────

function MissionFeeCard({ ownerCapId }: { ownerCapId: string | null }) {
  const { data: fees, isLoading, error, refetch } = useDAppFees();
  const [feeInput, setFeeInput] = useState("");
  const [status, setStatus] = useState<StatusMsg | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const eve = parseFloat(feeInput);
    if (isNaN(eve) || eve < 0) {
      setStatus({ ok: false, msg: "Fee must be 0 or greater." });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const tx = buildSetDappMissionFee({ ownerCapId: ownerCapId ?? "", feePerHourMist: eveToMist(feeInput) });
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      if (result.$kind === "FailedTransaction") {
        throw new Error("Transaction failed. Ensure you hold the DAppOwnerCap (needs V33).");
      }
      setStatus({ ok: true, msg: "DApp Mission listing fee updated." });
      setTimeout(() => refetch(), 1500);
    } catch (e: unknown) {
      setStatus({ ok: false, msg: e instanceof Error ? e.message : "Update failed." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="action-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h4>Mission Listing Fee (per hour)</h4>
        <button className="btn btn--ghost btn--sm" onClick={() => refetch()} disabled={isLoading}>
          Refresh
        </button>
      </div>
      <p className="form-hint">
        DApp-layer per-hour fee for posting a Mission (MIS). Charged once at creation
        as <code>fee/hour × listing-hours</code> and routed to the DApp tax wallet.
        Applies to NoTribe + Easy missions only — Advanced missions have no DApp layer.
        Set 0 to make the DApp layer free. Requires the V33 publish.
      </p>
      {isLoading && <p className="muted">Loading…</p>}
      {error && <p className="error-text">Error loading fees.</p>}
      {fees && !isLoading && (
        <div className="stats-row">
          <Stat label="DApp Mission Fee / hour" value={`${formatSui(fees.missionListingFeePerHour)} EVE`} />
        </div>
      )}
      <div className="form-group" style={{ marginTop: "0.75rem" }}>
        <FeeInput
          label="Mission Fee / hour (EVE)"
          value={feeInput}
          onChange={setFeeInput}
          placeholder={fees ? formatSui(fees.missionListingFeePerHour) : "0"}
        />
      </div>
      {status && (
        <p style={{ fontSize: "0.8rem", color: status.ok ? "var(--success)" : "var(--danger)" }}>
          {status.msg}
        </p>
      )}
      <div className="modal__actions">
        <button className="btn btn--primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Mission Fee"}
        </button>
      </div>
    </div>
  );
}

function MultiplayerRelayCard({ ownerCapId }: { ownerCapId: string | null }) {
  const { data: currentUrl, isLoading, refetch } = useMultiplayerRelayUrl();
  const [urlInput, setUrlInput] = useState("");
  const [status, setStatus] = useState<StatusMsg | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const normalized = normalizeRelayUrl(urlInput);
    setSaving(true);
    setStatus(null);
    try {
      const tx = buildSetMultiplayerRelayUrl(ownerCapId ?? "", normalized);
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      if (result.$kind === "FailedTransaction") {
        throw new Error("Transaction failed. Ensure you hold the DAppOwnerCap (needs V32).");
      }
      setUrlInput(normalized);
      setStatus({ ok: true, msg: normalized ? `Relay URL set to ${normalized}` : "Relay URL cleared." });
      setTimeout(() => refetch(), 1500);
    } catch (e: unknown) {
      setStatus({ ok: false, msg: e instanceof Error ? e.message : "Update failed." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="action-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h4>Multiplayer Relay URL</h4>
        <button className="btn btn--ghost btn--sm" onClick={() => refetch()} disabled={isLoading}>
          Refresh
        </button>
      </div>
      <p className="form-hint">
        One shared WebSocket relay for ALL players' real-time presence + proximity chat.
        Set it once here and every bazaar app uses it automatically — no per-player setup.
        Paste an <code>https://</code> or <code>wss://</code> URL (https is auto-converted to wss).
        Requires the V32 publish.
      </p>
      {isLoading && <p className="muted">Loading…</p>}
      {!isLoading && (
        <div className="stats-row">
          <Stat label="Current Relay" value={currentUrl && currentUrl.length > 0 ? currentUrl : "— not set —"} />
        </div>
      )}
      <div className="form-group" style={{ marginTop: "0.75rem" }}>
        <label className="form-label">Relay URL</label>
        <input
          className="input input--sm"
          type="text"
          value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          placeholder={currentUrl || "wss://your-relay.example.com"}
          style={{ width: "100%" }}
        />
      </div>
      {status && (
        <p style={{ fontSize: "0.8rem", color: status.ok ? "var(--success)" : "var(--danger)" }}>
          {status.msg}
        </p>
      )}
      <div className="modal__actions">
        <button className="btn btn--primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Relay URL"}
        </button>
      </div>
    </div>
  );
}

function RegistrationFeesCard({ ownerCapId }: { ownerCapId: string | null }) {
  const { data: fees, isLoading, error, refetch } = useDAppFees();

  const [ssuFee, setSsuFee] = useState("");
  const [joinFee, setJoinFee] = useState("");
  const [easyFee, setEasyFee] = useState("");
  const [advFee, setAdvFee] = useState("");
  const [status, setStatus] = useState<StatusMsg | null>(null);
  const [saving, setSaving] = useState(false);

  function prefill() {
    if (!fees) return;
    setSsuFee(formatSui(fees.ssuRegistrationFee));
    setJoinFee(formatSui(fees.tribeJoinFee));
    setEasyFee(formatSui(fees.easyTribeCreationFee));
    setAdvFee(formatSui(fees.advancedTribeCreationFee));
  }

  async function handleSave() {
    setSaving(true);
    setStatus(null);
    try {
      const tx = buildSetRegistrationFees(ownerCapId ?? "", {
        ssuRegistrationFee:       eveToMist(ssuFee),
        tribeJoinFee:             eveToMist(joinFee),
        easyTribeCreationFee:     eveToMist(easyFee),
        advancedTribeCreationFee: eveToMist(advFee),
      });
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      if (result.$kind === "FailedTransaction") {
        throw new Error("Transaction failed. Ensure you hold the DAppOwnerCap (needs V31).");
      }
      setStatus({ ok: true, msg: "Registration fees updated." });
      setTimeout(() => refetch(), 1500);
    } catch (e: unknown) {
      setStatus({ ok: false, msg: e instanceof Error ? e.message : "Update failed." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="action-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h4>Registration &amp; Creation Fees</h4>
        <button className="btn btn--ghost btn--sm" onClick={() => { refetch(); prefill(); }} disabled={isLoading}>
          Refresh
        </button>
      </div>
      <p className="form-hint">
        Charged in EVE and routed to the DApp tax wallet. Tribe-join fees are held
        in escrow until the leader accepts (then forwarded) or rejects (then
        refunded). Set any fee to 0 to make that flow free. Requires the V31 publish.
      </p>
      {isLoading && <p className="muted">Loading…</p>}
      {error && <p className="error-text">Error loading fees.</p>}
      {fees && !isLoading && (
        <div className="stats-row">
          <Stat label="SSU Registration" value={`${formatSui(fees.ssuRegistrationFee)} EVE`} />
          <Stat label="Tribe Join" value={`${formatSui(fees.tribeJoinFee)} EVE`} />
          <Stat label="Easy Tribe Creation" value={`${formatSui(fees.easyTribeCreationFee)} EVE`} />
          <Stat label="Advanced Tribe Creation" value={`${formatSui(fees.advancedTribeCreationFee)} EVE`} />
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginTop: "0.75rem" }}>
        <FeeInput label="SSU Registration (EVE)" value={ssuFee} onChange={setSsuFee} placeholder={fees ? formatSui(fees.ssuRegistrationFee) : "0"} />
        <FeeInput label="Tribe Join (EVE)" value={joinFee} onChange={setJoinFee} placeholder={fees ? formatSui(fees.tribeJoinFee) : "0"} />
        <FeeInput label="Easy Tribe Creation (EVE)" value={easyFee} onChange={setEasyFee} placeholder={fees ? formatSui(fees.easyTribeCreationFee) : "0"} />
        <FeeInput label="Advanced Tribe Creation (EVE)" value={advFee} onChange={setAdvFee} placeholder={fees ? formatSui(fees.advancedTribeCreationFee) : "0"} />
      </div>
      {status && (
        <p style={{ fontSize: "0.8rem", color: status.ok ? "var(--success)" : "var(--danger)" }}>
          {status.msg}
        </p>
      )}
      <div className="modal__actions">
        <button className="btn btn--primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Fees"}
        </button>
      </div>
    </div>
  );
}

function FeeInput({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input
        className="input input--sm"
        type="number"
        min="0" step="0.0001"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: "100%" }}
      />
    </div>
  );
}
