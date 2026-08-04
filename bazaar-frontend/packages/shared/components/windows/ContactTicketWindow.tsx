// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// ContactTicketWindow.tsx — Floating window for submitting support tickets.
// Calls dapp_hub::tickets::submit_ticket on-chain via @bazaar/shared TX builder.
// Lifted from apps/dapphub for reuse by the in-HUD bug-report button.

import { useState } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import type { TicketTag } from "@bazaar/shared/types";
import { buildSubmitTicket } from "@bazaar/shared/tx";
import { useToast } from "../widgets/Toast";

interface Props {
  onClose: () => void;
  /** Pre-select the ticket category. Default "bug" when opened from HUD; the
   *  DappHub Contact-us flow leaves it unset and the user picks. */
  defaultCategory?: TicketTag;
}

const TITLE_MAX = 100;
const BODY_MAX = 1000;

const TAG_OPTIONS: { value: TicketTag; label: string }[] = [
  { value: "bug",             label: "Bug" },
  { value: "feature-request", label: "Feature Request" },
  { value: "ssu-issue",       label: "SSU Issue" },
  { value: "tribe-issue",     label: "Tribe Issue" },
  { value: "account",         label: "Account" },
  { value: "other",           label: "Other" },
];

type ContactMethod = "discord" | "email" | "none";

export default function ContactTicketWindow({ onClose, defaultCategory }: Props) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [tag, setTag] = useState<TicketTag>(defaultCategory ?? "bug");
  const [body, setBody] = useState("");
  const [contactMethod, setContactMethod] = useState<ContactMethod>("none");
  const [contactValue, setContactValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function validate(): string | null {
    if (!title.trim()) return "Title is required.";
    if (title.length > TITLE_MAX) return `Title cannot exceed ${TITLE_MAX} characters.`;
    if (!body.trim()) return "Description is required.";
    if (body.length > BODY_MAX) return `Description cannot exceed ${BODY_MAX} characters.`;
    if (contactMethod === "email" && !contactValue.trim()) {
      return "Email address is required when email is selected.";
    }
    if (contactMethod === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactValue.trim())) {
      return "Please enter a valid email address.";
    }
    if (contactMethod === "discord" && !contactValue.trim()) {
      return "Discord username is required when Discord is selected.";
    }
    return null;
  }

  async function handleSubmit() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const tx = buildSubmitTicket(title, tag, body, contactMethod, contactValue);
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      if (result.$kind === "FailedTransaction") {
        throw new Error("Transaction failed. Check your wallet and try again.");
      }
      setSubmitted(true);
      toast.success(tag === "bug" ? "Bug report submitted" : "Ticket submitted");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Ticket submission failed.";
      setError(msg);
      toast.error("Ticket submission failed", { detail: msg });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal__header">
            <h3 className="modal__title">Ticket Submitted</h3>
          </div>
          <p style={{ color: "var(--success)", fontSize: "0.9rem" }}>
            Your support ticket has been submitted successfully.
          </p>
          <p className="form-hint">
            We will review your ticket and respond as soon as possible.
            {contactMethod !== "none" && " You will be contacted via your preferred method."}
          </p>
          <div className="modal__actions">
            <button className="btn btn--primary" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--wide" onClick={e => e.stopPropagation()}>
        <div className="modal__header">
          <h3 className="modal__title">
            {defaultCategory === "bug" ? "Report a Bug" : "Contact / Support"}
          </h3>
          <button className="btn btn--ghost btn--sm" onClick={onClose}>Close</button>
        </div>

        {/* Title */}
        <div className="form-group">
          <label className="form-label">
            Title
            <span className="muted" style={{ marginLeft: "0.5rem", fontSize: "0.72rem" }}>
              ({title.length}/{TITLE_MAX})
            </span>
          </label>
          <input
            className="input"
            type="text"
            value={title}
            onChange={e => { setTitle(e.target.value); setError(null); }}
            placeholder="Brief summary of your issue..."
            maxLength={TITLE_MAX}
            disabled={isSubmitting}
          />
        </div>

        {/* Tag selector */}
        <div className="form-group">
          <label className="form-label">Category</label>
          <div className="tag-selector">
            {TAG_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`tag-btn ${tag === opt.value ? "tag-btn--active" : ""}`}
                onClick={() => { setTag(opt.value); setError(null); }}
                disabled={isSubmitting}
                type="button"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="form-group">
          <label className="form-label">
            Description
            <span className="muted" style={{ marginLeft: "0.5rem", fontSize: "0.72rem" }}>
              ({body.length}/{BODY_MAX})
            </span>
          </label>
          <textarea
            className="textarea"
            value={body}
            onChange={e => { setBody(e.target.value); setError(null); }}
            placeholder="Describe your issue in detail..."
            maxLength={BODY_MAX}
            disabled={isSubmitting}
            rows={5}
          />
        </div>

        {/* Contact method */}
        <div className="form-group">
          <label className="form-label">Preferred Contact Method</label>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            {(["none", "discord", "email"] as ContactMethod[]).map(method => (
              <label key={method} style={{
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                cursor: "pointer",
                fontSize: "0.82rem",
                color: contactMethod === method ? "var(--accent)" : "var(--muted)",
              }}>
                <input
                  type="radio"
                  name="contactMethod"
                  checked={contactMethod === method}
                  onChange={() => { setContactMethod(method); setError(null); }}
                  disabled={isSubmitting}
                />
                {method === "none" ? "No contact needed" :
                 method === "discord" ? "Discord" : "Email"}
              </label>
            ))}
          </div>
        </div>

        {/* Contact value input */}
        {contactMethod !== "none" && (
          <div className="form-group">
            <label className="form-label">
              {contactMethod === "discord" ? "Discord Username" : "Email Address"}
            </label>
            <input
              className="input"
              type={contactMethod === "email" ? "email" : "text"}
              value={contactValue}
              onChange={e => { setContactValue(e.target.value); setError(null); }}
              placeholder={contactMethod === "discord" ? "username#1234" : "your@email.com"}
              disabled={isSubmitting}
            />
          </div>
        )}

        {error && <p className="error-text">{error}</p>}

        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button
            className="btn btn--primary"
            onClick={handleSubmit}
            disabled={isSubmitting || !title.trim() || !body.trim()}
          >
            {isSubmitting ? "Submitting..." : "Submit Ticket"}
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
