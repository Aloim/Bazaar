// TicketsTab.tsx — Support ticket management for the DApp owner.
// Lists all submitted tickets with status filtering and detail view.

import { useState, useMemo } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import type { SupportTicket, TicketTag } from "../../types";
import { useTickets } from "@bazaar/shared/hooks";
import { buildUpdateTicketStatus } from "@bazaar/shared/tx";

type StatusFilter = "all" | "open" | "in-progress" | "resolved" | "closed";

function formatDate(ms: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(ms));
}

function tagLabel(tag: TicketTag): string {
  const labels: Record<TicketTag, string> = {
    "bug": "Bug",
    "feature-request": "Feature",
    "ssu-issue": "SSU",
    "tribe-issue": "Tribe",
    "account": "Account",
    "other": "Other",
  };
  return labels[tag] ?? tag;
}

interface Props {
  ownerCapId: string | null;
}

export default function TicketsTab({ ownerCapId }: Props) {
  const { data: tickets = [], isLoading, refetch } = useTickets();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  async function handleStatusUpdate(ticketId: string, newStatus: string) {
    if (!ownerCapId) {
      setUpdateError("DAppOwnerCap not found. You must be the DApp owner to update tickets.");
      return;
    }
    setUpdatingId(ticketId);
    setUpdateError(null);
    try {
      const tx = buildUpdateTicketStatus(ownerCapId, Number(ticketId), newStatus);
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setTimeout(() => refetch(), 1500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Status update failed.";
      console.error("Status update failed:", e);
      setUpdateError(msg);
    } finally {
      setUpdatingId(null);
    }
  }

  const filtered = useMemo(() => {
    if (filter === "all") return tickets;
    return tickets.filter(t => t.status === filter);
  }, [tickets, filter]);

  const selected = selectedId ? tickets.find(t => t.id === selectedId) : null;

  if (selected) {
    return (
      <div className="panel__section">
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginBottom: "0.5rem" }}>
          <button className="btn btn--ghost btn--sm" onClick={() => setSelectedId(null)}>
            Back to list
          </button>
          <span className={`badge badge--${selected.status === "open" ? "pending" : selected.status === "resolved" ? "active" : "inactive"}`}>
            {selected.status}
          </span>
        </div>

        <div className="action-card">
          <h4>{selected.title}</h4>
          <div style={{ display: "flex", gap: "0.75rem", fontSize: "0.78rem" }}>
            <span className="muted">Tag: {tagLabel(selected.tag)}</span>
            <span className="muted">From: {selected.authorAddress}</span>
            <span className="muted">{formatDate(selected.createdAtMs)}</span>
          </div>
          <p style={{ fontSize: "0.85rem", lineHeight: 1.5, marginTop: "0.5rem" }}>
            {selected.body}
          </p>
          {selected.contactMethod !== "none" && (
            <p style={{ fontSize: "0.78rem", marginTop: "0.5rem" }}>
              <span className="muted">Contact: </span>
              <span style={{ color: "var(--accent)" }}>
                {selected.contactMethod === "discord" ? "Discord: " : "Email: "}
                {selected.contactValue}
              </span>
            </p>
          )}
        </div>

        <div className="modal__actions">
          {selected.status === "open" && (
            <button
              className="btn btn--primary btn--sm"
              disabled={updatingId === selected.id}
              onClick={() => handleStatusUpdate(selected.id, "in-progress")}
            >
              {updatingId === selected.id ? "..." : "Mark In Progress"}
            </button>
          )}
          {selected.status === "in-progress" && (
            <button
              className="btn btn--primary btn--sm"
              disabled={updatingId === selected.id}
              onClick={() => handleStatusUpdate(selected.id, "resolved")}
            >
              {updatingId === selected.id ? "..." : "Mark Resolved"}
            </button>
          )}
          {selected.status !== "closed" && (
            <button
              className="btn btn--ghost btn--sm"
              disabled={updatingId === selected.id}
              onClick={() => handleStatusUpdate(selected.id, "closed")}
            >
              {updatingId === selected.id ? "..." : "Close Ticket"}
            </button>
          )}
        </div>
        {updateError && (
          <p style={{ color: "#ff4444", fontSize: "0.8rem", marginTop: "0.3rem" }}>
            {updateError}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="panel__section">
      <div className="action-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h4>Support Tickets ({tickets.length})</h4>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <select
              value={filter}
              onChange={e => setFilter(e.target.value as StatusFilter)}
              style={{
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: "3px",
                padding: "0.25rem 0.5rem",
                color: "var(--text)",
                fontFamily: "var(--font)",
                fontSize: "0.78rem",
              }}
            >
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="in-progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
            <button className="btn btn--ghost btn--sm" onClick={refetch} disabled={isLoading}>
              {isLoading ? "..." : "Refresh"}
            </button>
          </div>
        </div>

        {isLoading && <p className="muted">Loading tickets...</p>}

        {!isLoading && filtered.length === 0 && (
          <p className="muted">No tickets match the current filter.</p>
        )}

        {!isLoading && filtered.length > 0 && (
          <div style={{ overflowX: "auto", maxHeight: "500px", overflowY: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Tag</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(ticket => (
                  <tr key={ticket.id}>
                    <td style={{ fontWeight: "bold", maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ticket.title}
                    </td>
                    <td style={{ fontSize: "0.78rem" }}>{tagLabel(ticket.tag)}</td>
                    <td>
                      <span className={`badge badge--${ticket.status === "open" ? "pending" : ticket.status === "resolved" ? "active" : "inactive"}`}>
                        {ticket.status}
                      </span>
                    </td>
                    <td style={{ fontSize: "0.75rem", color: "var(--muted)", whiteSpace: "nowrap" }}>
                      {formatDate(ticket.createdAtMs)}
                    </td>
                    <td>
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => setSelectedId(ticket.id)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
