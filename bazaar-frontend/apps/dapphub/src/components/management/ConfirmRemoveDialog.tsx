// ============================================================
// ConfirmRemoveDialog.tsx — Reusable confirmation dialog
// requiring user to type entity name before destructive actions.
// Part of DappHub admin panel. Created for FixPolishPlan1 Phase B.
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState } from "react";

interface ConfirmRemoveDialogProps {
  entityType: "tribe" | "ssu";
  entityName: string;
  warningText: string;
  isRemoving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmRemoveDialog({
  entityType,
  entityName,
  warningText,
  isRemoving,
  onConfirm,
  onCancel,
}: ConfirmRemoveDialogProps) {
  const [inputValue, setInputValue] = useState("");

  const label =
    entityType === "tribe"
      ? `Type the tribe name "${entityName}" to confirm:`
      : `Type the last 8 characters of the SSU ID "${entityName}" to confirm:`;

  const isMatch = inputValue.trim().toLowerCase() === entityName.toLowerCase();

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && !isRemoving) {
      onCancel();
    }
  }

  return (
    <div className="confirm-dialog" onClick={handleBackdropClick}>
      <div className="confirm-dialog__card">
        <h4 className="confirm-dialog__title">
          {entityType === "tribe" ? "Remove Tribe" : "Remove SSU"}
        </h4>

        <div className="confirm-dialog__warning">
          <span className="confirm-dialog__warning-icon">!</span>
          <p>{warningText}</p>
        </div>

        <p className="confirm-dialog__label">{label}</p>

        <input
          type="text"
          className="confirm-dialog__input"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          placeholder={entityName}
          disabled={isRemoving}
          autoFocus
        />

        <div className="confirm-dialog__actions">
          <button
            className="btn btn--ghost btn--sm"
            onClick={onCancel}
            disabled={isRemoving}
          >
            Cancel
          </button>
          <button
            className="btn btn--danger btn--sm"
            onClick={onConfirm}
            disabled={!isMatch || isRemoving}
          >
            {isRemoving ? "Removing..." : "Confirm Remove"}
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
