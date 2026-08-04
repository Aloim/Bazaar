// ContactOverlay.tsx — "Contact / Support" overlay. New Station-Hub visual;
// wired to the live submit_ticket TX flow (buildSubmitTicket).

import { useState } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import type { TicketTag } from "@bazaar/shared/types";
import { buildSubmitTicket } from "@bazaar/shared/tx";
import { useToast } from "@bazaar/shared/components";
import { HUB, fieldLabel, counterStyle, inputBase } from "../hubStyle";
import { OverlayShell, PrimaryBtn, GhostBtn } from "../HubPrimitives";

const TITLE_MAX = 100, BODY_MAX = 1000;
type ContactMethod = "none" | "discord" | "email";

const TAGS: { value: TicketTag; label: string }[] = [
  { value: "bug", label: "Bug" },
  { value: "feature-request", label: "Feature Request" },
  { value: "ssu-issue", label: "SSU Issue" },
  { value: "tribe-issue", label: "Tribe Issue" },
  { value: "account", label: "Account" },
  { value: "other", label: "Other" },
];

export default function ContactOverlay({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [tag, setTag] = useState<TicketTag>("bug");
  const [body, setBody] = useState("");
  const [contactBy, setContactBy] = useState<ContactMethod>("none");
  const [contactValue, setContactValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function validate(): string | null {
    if (!title.trim()) return "Title is required.";
    if (!body.trim()) return "Description is required.";
    if (contactBy === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactValue.trim())) return "Please enter a valid email address.";
    if (contactBy === "discord" && !contactValue.trim()) return "Discord username is required when Discord is selected.";
    return null;
  }

  async function handleSubmit() {
    const err = validate();
    if (err) { setError(err); return; }
    setError(null);
    setIsSubmitting(true);
    try {
      const tx = buildSubmitTicket(title, tag, body, contactBy, contactValue);
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      if (result.$kind === "FailedTransaction") throw new Error("Transaction failed. Check your wallet and try again.");
      setSubmitted(true);
      toast.success("Ticket submitted");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Ticket submission failed.";
      setError(msg);
      toast.error("Ticket submission failed", { detail: msg });
    } finally {
      setIsSubmitting(false);
    }
  }

  const Pill = ({ value, label }: { value: TicketTag; label: string }) => {
    const active = tag === value;
    return (
      <button type="button" onClick={() => setTag(value)} style={{
        padding: "8px 14px",
        background: active ? "rgba(255,144,48,0.16)" : "transparent",
        border: `1px solid ${active ? HUB.ORANGE : HUB.DIM}`,
        color: active ? HUB.ORANGE : HUB.FG2,
        fontFamily: "inherit", fontSize: 13, cursor: "pointer", transition: "all 120ms ease",
      }}>{label}</button>
    );
  };

  const Radio = ({ value, label }: { value: ContactMethod; label: string }) => {
    const active = contactBy === value;
    return (
      <button type="button" onClick={() => setContactBy(value)} style={{
        background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
        padding: 4, fontFamily: "inherit", color: active ? HUB.ORANGE : HUB.FG2, fontSize: 13,
      }}>
        <span style={{ width: 14, height: 14, borderRadius: "50%", border: `1.5px solid ${active ? HUB.ORANGE : HUB.DIM}`, display: "inline-grid", placeItems: "center", background: active ? "rgba(255,144,48,0.12)" : "transparent" }}>
          {active && <span style={{ width: 6, height: 6, borderRadius: "50%", background: HUB.ORANGE, boxShadow: `0 0 6px ${HUB.ORANGE}` }} />}
        </span>
        {label}
      </button>
    );
  };

  return (
    <OverlayShell title={submitted ? "TICKET SUBMITTED" : "CONTACT / SUPPORT"} width={760} onClose={onClose} hideClose={submitted}>
      {submitted ? (
        <>
          <div style={{ textAlign: "center", color: HUB.GREEN, fontSize: 16, margin: "6px 0 18px" }}>Your support ticket has been submitted.</div>
          <div style={{ fontSize: 13, color: HUB.FG2, lineHeight: 1.6 }}>We will review your ticket and respond as soon as possible.{contactBy !== "none" && " You will be contacted via your preferred method."}</div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 22 }}><PrimaryBtn onClick={onClose}>Done</PrimaryBtn></div>
        </>
      ) : (
        <>
          <div style={{ marginBottom: 18 }}>
            <label style={fieldLabel}>Title <span style={counterStyle}>({title.length}/{TITLE_MAX})</span></label>
            <input type="text" maxLength={TITLE_MAX} value={title} onChange={(e) => { setTitle(e.target.value); setError(null); }} placeholder="Brief summary of your issue..." style={inputBase} />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={fieldLabel}>Category</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{TAGS.map((t) => <Pill key={t.value} value={t.value} label={t.label} />)}</div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={fieldLabel}>Description <span style={counterStyle}>({body.length}/{BODY_MAX})</span></label>
            <textarea maxLength={BODY_MAX} value={body} rows={5} onChange={(e) => { setBody(e.target.value); setError(null); }} placeholder="Describe your issue in detail..." style={{ ...inputBase, resize: "vertical", minHeight: 120, lineHeight: 1.55 }} />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={fieldLabel}>Preferred Contact Method</label>
            <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
              <Radio value="none" label="No contact needed" />
              <Radio value="discord" label="Discord" />
              <Radio value="email" label="Email" />
            </div>
          </div>

          {contactBy !== "none" && (
            <div style={{ marginBottom: 18 }}>
              <label style={fieldLabel}>{contactBy === "discord" ? "Discord Username" : "Email Address"}</label>
              <input type={contactBy === "email" ? "email" : "text"} value={contactValue} onChange={(e) => { setContactValue(e.target.value); setError(null); }} placeholder={contactBy === "discord" ? "username#1234" : "your@email.com"} style={inputBase} />
            </div>
          )}

          {error && <div style={{ marginBottom: 14, fontSize: 13, color: HUB.RED }}>{error}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 14, paddingTop: 6 }}>
            <GhostBtn onClick={onClose}>Cancel</GhostBtn>
            <PrimaryBtn disabled={isSubmitting || !title.trim() || !body.trim()} onClick={handleSubmit}>{isSubmitting ? "Submitting…" : "Submit Ticket"}</PrimaryBtn>
          </div>
        </>
      )}
    </OverlayShell>
  );
}
