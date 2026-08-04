// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// src/components/DepositWarningModal.tsx
// Warning modal shown before depositing EVE to the tribe reserve vault.
// Explains that withdrawal requires multi-sig and warns solo operators.

interface Props {
  amount:    string;  // display string (in EVE / SUI)
  onCancel:  () => void;
  onProceed: () => void;
}

export default function DepositWarningModal({ amount, onCancel, onProceed }: Props) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <h3 style={{ color: "var(--color-warning, #ff9800)", marginBottom: "0.75rem" }}>
          Vault Deposit Warning
        </h3>

        <p style={{ marginBottom: "0.75rem", fontSize: "0.9rem" }}>
          You are about to deposit <strong>{amount} EVE</strong> into the Tribe Reserve Vault.
        </p>

        <div style={{
          background: "rgba(255, 152, 0, 0.1)",
          border: "1px solid var(--color-warning, #ff9800)",
          borderRadius: "4px",
          padding: "0.75rem",
          marginBottom: "1rem",
          fontSize: "0.85rem",
        }}>
          <p style={{ marginBottom: "0.5rem", fontWeight: "bold" }}>
            Multi-Sig Required for Withdrawal
          </p>
          <p style={{ marginBottom: "0.5rem" }}>
            Deposited EVE can only be withdrawn via a multi-signature vote involving
            the tribe leader and all tribe SuperAdmins. A minimum of 2 signers is required.
          </p>
          <p style={{ color: "var(--color-danger, #f44336)" }}>
            If you are the sole operator of this tribe (no SuperAdmins assigned),
            you will not be able to withdraw until at least one SuperAdmin is added.
          </p>
        </div>

        <div className="modal__actions" style={{ flexDirection: "row", gap: "0.5rem" }}>
          <button className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={onProceed}>
            Proceed to Deposit
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
