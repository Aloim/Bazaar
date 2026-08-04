// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * ItemRowEditor.tsx — Reusable item-row list editor for trade forms.
 *
 * Renders a labelled list of (typeId, qty) pairs with add/remove controls.
 * Used by CreateTradeTab for both "I Give" and "I Get" item lists.
 * Future use: inventory picker (FP1-11) will reuse this component.
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ItemRow {
  typeId: number;
  qty:    number;
}

export interface ItemRowEditorProps {
  label:    string;
  rows:     ItemRow[];
  onChange: (rows: ItemRow[]) => void;
}

// ── ItemRowEditor ─────────────────────────────────────────────────────────────

export default function ItemRowEditor({ label, rows, onChange }: ItemRowEditorProps) {
  function addRow() {
    onChange([...rows, { typeId: 0, qty: 1 }]);
  }

  function updateRow(idx: number, field: keyof ItemRow, value: number) {
    const next = rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r));
    onChange(next);
  }

  function removeRow(idx: number) {
    onChange(rows.filter((_, i) => i !== idx));
  }

  return (
    <div className="trade-column__items">
      <div className="trade-column__header">{label}</div>
      {rows.length === 0 && (
        <p className="muted" style={{ fontSize: "0.8rem" }}>No items added.</p>
      )}
      {rows.map((row, idx) => (
        <div key={idx} className="trade-give-item">
          <input
            className="input input--xs"
            type="number"
            min={0}
            placeholder="Type ID"
            value={row.typeId === 0 ? "" : row.typeId}
            onChange={e => updateRow(idx, "typeId", Math.max(0, Number(e.target.value)))}
            title="Item type ID (from EVE Frontier item database)"
          />
          <span className="muted" style={{ fontSize: "0.75rem" }}>x</span>
          <input
            className="input input--xs"
            type="number"
            min={1}
            value={row.qty}
            onChange={e => updateRow(idx, "qty", Math.max(1, Number(e.target.value)))}
            title="Quantity"
          />
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => removeRow(idx)}
            title="Remove item"
            type="button"
          >
            x
          </button>
        </div>
      ))}
      <button
        className="btn btn--outline btn--sm"
        onClick={addRow}
        type="button"
        style={{ marginTop: "0.4rem" }}
      >
        + Add Item
      </button>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
