// ============================================================
// TribeAccordionRow.tsx — Single collapsible accordion row for
// the tribes list, shows nested SSUs when expanded.
// Part of DappHub admin panel. Created for FixPolishPlan1 Phase B.
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useMemo } from "react";
import { useSSUOwners, useCharacterNames } from "@bazaar/shared/hooks";
import { useDepreciatedSSUs } from "@bazaar/shared/hooks/bazaarcore/useDepreciatedSSUs";
import { truncateAddress } from "@bazaar/shared/utils";
import type { TribeRow } from "./TribesTab";

export interface TribeAccordionRowProps {
  tribe: TribeRow;
  isExpanded: boolean;
  onToggle: () => void;
  onDetails: (tribe: TribeRow) => void;
}

export default function TribeAccordionRow({
  tribe,
  isExpanded,
  onToggle,
  onDetails,
}: TribeAccordionRowProps) {
  // Live registered-SSU list from the dapp_hub Tribe.ssu_ids vector (carried on
  // TribeSummary). The bazaar_core TribeGovernance.ssu_ids vector is DEAD and must
  // not be used here (memory reference_dapphub_tribe_gov_data_sourcing).
  const ssuIds = tribe.ssuIds ?? [];

  // Resolve owner address + active status per SSU — gated on isExpanded so RPC
  // only fans out for the tribe the admin is actually looking at (the row is
  // mounted for every tribe). Owner wallet → EVE Frontier character name.
  const { data: ssuOwners, isLoading: ownersLoading } = useSSUOwners(ssuIds, isExpanded);
  // V41 SSU depreciation/prune — gated on isExpanded like useSSUOwners (no RPC
  // fan-out for a collapsed accordion row). Badge only — per plan §5/OQ-3,
  // depreciation does NOT remove the SSU from Tribe.ssu_ids.
  const { depreciated } = useDepreciatedSSUs(ssuIds, isExpanded);
  const ownerAddresses = useMemo(
    () =>
      Object.values(ssuOwners ?? {})
        .map(info => info.ownerAddress)
        .filter((a): a is string => !!a),
    [ssuOwners],
  );
  const ownerNames = useCharacterNames(ownerAddresses);

  function handleDetailsClick(e: React.MouseEvent) {
    e.stopPropagation();
    onDetails(tribe);
  }

  return (
    <div className={`accordion-row${isExpanded ? " accordion-row--open" : ""}`}>
      <div className="accordion-row__header" onClick={onToggle} role="button" tabIndex={0}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onToggle(); }}
      >
        <span className="accordion-row__chevron">{isExpanded ? "▼" : "▶"}</span>
        <span className="accordion-row__name">{tribe.name}</span>
        <span className={`badge badge--${tribe.bazaarType}`} style={{ marginLeft: "0.5rem" }}>
          {tribe.bazaarType}
        </span>
        <span className="accordion-row__meta">
          {tribe.memberCount} members
        </span>
        <span className="accordion-row__meta">
          {tribe.ssuCount} SSUs
        </span>
        <span className={`badge badge--${tribe.status}`} style={{ marginLeft: "0.25rem" }}>
          {tribe.status}
        </span>
        <button
          className="btn btn--ghost btn--sm"
          style={{ marginLeft: "auto" }}
          onClick={handleDetailsClick}
        >
          Details
        </button>
      </div>

      <div className={`accordion-row__body${isExpanded ? " accordion-row__body--open" : ""}`}>
        {ssuIds.length === 0 ? (
          <p className="muted" style={{ padding: "0.5rem 1rem", fontSize: "0.8rem" }}>
            No SSUs registered under this tribe.
          </p>
        ) : (
          <ul className="accordion-row__ssu-list">
            {ssuIds.map(ssuId => {
              const info = ssuOwners?.[ssuId];
              const ownerAddr = info?.ownerAddress ?? null;
              const ownerName = ownerAddr ? ownerNames.get(ownerAddr) : undefined;
              const ownerLabel = ownerName
                ?? (ownerAddr ? truncateAddress(ownerAddr, 6)
                  : ownersLoading ? "resolving…" : "unknown owner");
              const statusLabel = info ? (info.isActive ? "active" : "inactive")
                : ownersLoading ? "…" : "registered";
              const statusKind = info ? (info.isActive ? "active" : "inactive") : "pending";
              const isDep = depreciated.has(ssuId.toLowerCase());
              return (
                <li key={ssuId} className="accordion-row__ssu-item">
                  <span className="accordion-row__ssu-id" title={ssuId}>
                    {truncateAddress(ssuId, 6)}
                  </span>
                  <span className="accordion-row__ssu-owner" title={ownerAddr ?? undefined}>
                    {ownerLabel}
                  </span>
                  <span className={`badge badge--${statusKind}`}>{statusLabel}</span>
                  {isDep && <span className="badge badge--depreciated">Depreciated</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
