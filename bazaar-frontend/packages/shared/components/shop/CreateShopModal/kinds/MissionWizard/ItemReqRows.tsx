// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * ItemReqRows — reusable item-requirement editor for the Mission wizard.
 *
 * Used by Step 3 (proof items, completion_mode = item-proof) and Step 4 (reward
 * items). Each row is a name-searched item (via the shared ItemTypeSearch, which
 * resolves by NAME, never id) plus a required amount. The list is capped at
 * `maxRows` (10 on-chain, MAX_PROOF_ITEMS / MAX_REWARD_ITEMS).
 *
 * Stateless: parent owns the rows array (MissionItemReqInput[]) and the mutators.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import React from "react";
import { ItemTypeSearch } from "../../ItemTypeSearch";
import type { MissionItemReqInput } from "@bazaar/shared/tx/bazaarcore/mission-tx";

export interface ItemReqRowsProps {
  rows: MissionItemReqInput[];
  /** id → display name (from useItemTypes) so resolved rows show the item name. */
  itemTypes: Map<number, { name?: string } | undefined>;
  maxRows: number;
  addLabel: string;
  onSetType: (i: number, typeId: number) => void;
  onSetAmount: (i: number, amount: number) => void;
  onRemove: (i: number) => void;
  onAdd: () => void;
}

export const ItemReqRows: React.FC<ItemReqRowsProps> = ({
  rows, itemTypes, maxRows, addLabel, onSetType, onSetAmount, onRemove, onAdd,
}) => (
  <div className="mis-req-rows">
    {rows.map((row, i) => {
      const resolvedName = row.typeId !== 0 ? (itemTypes.get(row.typeId)?.name ?? `#${row.typeId}`) : null;
      return (
        <div key={i} className="mis-req-row">
          {resolvedName ? (
            <span className="mis-req-resolved" title={resolvedName}>{resolvedName} <span className="muted">#{row.typeId}</span></span>
          ) : (
            <ItemTypeSearch value={row.typeId} onChange={(id) => onSetType(i, id)} />
          )}
          <input
            type="number" min={1} className="input mis-req-row__amt"
            value={row.amount}
            onChange={(e) => onSetAmount(i, Math.max(1, Math.floor(Number(e.target.value) || 1)))}
            aria-label="Amount per run"
          />
          <button className="mis-req-row__del" onClick={() => onRemove(i)} title="Remove" type="button">✕</button>
        </div>
      );
    })}
    <button className="mis-req-add" onClick={onAdd} disabled={rows.length >= maxRows} type="button">
      {addLabel} {rows.length >= maxRows ? `(max ${maxRows})` : ""}
    </button>
  </div>
);

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
