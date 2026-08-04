// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState, useMemo } from "react";
import { dAppKit, useConnection } from "@evefrontier/dapp-kit";
import { useGuestbook } from "@bazaar/shared/hooks/useGuestbook";
import { useRoles } from "@bazaar/shared/hooks/useRoles";
import { useCharacterNames } from "@bazaar/shared/hooks/useCharacterNames";
import { buildAddGuestbookEntry, buildDeleteGuestbookEntry } from "@bazaar/shared/tx/shared_widgets/widget-config-tx";
import { maybeRegisterStranger } from "@bazaar/shared/tx/dapp_hub/auto-register-tx";
import { PACKAGE_IDS, SSU_OBJECT_ID } from "@bazaar/shared/constants";
import { useSSUSharedObjects } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";

const PAGE_SIZE = 15;

interface Props {
  onClose: () => void;
  /** When true, renders without the modal-overlay wrapper (for inline use in game view) */
  inline?: boolean;
}

export default function GuestbookPanel({ onClose, inline }: Props) {
  const { walletAddress } = useConnection();
  const { refetchRoles, ...roles } = useRoles(SSU_OBJECT_ID || null);
  const { data: shared } = useSSUSharedObjects(SSU_OBJECT_ID || null);
  const ssuGovId = shared?.ssuGovId;
  const guestbookBoardId = shared?.guestbookBoardId ?? "";
  const { entries, loading, refetch } = useGuestbook(guestbookBoardId);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingMessage, setPendingMessage] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(0);

  const reversed = [...entries].reverse(); // newest first
  const totalPages = Math.max(1, Math.ceil(reversed.length / PAGE_SIZE));
  const pageEntries = reversed.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const isModPlus = roles.isModerator || roles.isAdmin || roles.isOwner;

  // Resolve character names for all entry authors
  const authorAddresses = useMemo(
    () => [...new Set(entries.map(e => e.author))],
    [entries],
  );
  const characterNames = useCharacterNames(authorAddresses);

  function displayName(addr: string): string {
    const name = characterNames.get(addr);
    if (name) return name;
    return addr.slice(0, 6) + "..." + addr.slice(-4);
  }

  async function handleWrite() {
    if (!message.trim()) return;
    if (!ssuGovId) return; // SSU governance not yet resolved — silently skip
    if (!guestbookBoardId) { alert("Guestbook not yet resolved for this SSU."); return; }
    setSending(true);
    try {
      const tx = buildAddGuestbookEntry({
        guestbookBoardId,
        callerPackage: PACKAGE_IDS.BAZAAR_CORE,
        message: message.trim(),
        authorAddress: walletAddress ?? "",
      });
      maybeRegisterStranger(tx, roles.isRegistered, ssuGovId ?? "", shared?.memberRegistryId ?? "");
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      if (!roles.isRegistered) refetchRoles();
      setMessage("");
    } catch (e: any) {
      alert(e?.message);
      setSending(false);
      return;
    }
    setSending(false);
    setPendingMessage(true);
    const MAX_POLLS = 5;
    for (let i = 0; i < MAX_POLLS; i++) {
      refetch();
      await new Promise<void>(r => setTimeout(r, 1000));
    }
    setPendingMessage(false);
  }

  async function handleDelete(entryId: number) {
    if (deleting) return; // prevent concurrent UI churn during delete
    if (!guestbookBoardId) { alert("Guestbook not yet resolved for this SSU."); return; }
    setDeleting(true);
    try {
      // entryId is the monotonic GuestbookEntry.id (the Table key), NOT a positional
      // index — C2/GAS-11 keyed the board by id, so delete must pass entry.id.
      const tx = buildDeleteGuestbookEntry({ guestbookBoardId, callerPackage: PACKAGE_IDS.BAZAAR_CORE, entryId });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      refetch();
    } catch (e: any) {
      alert(e?.message);
    } finally {
      setDeleting(false);
    }
  }

  const content = (
      <div className={`guestbook${inline ? " guestbook--inline" : ""}`} onClick={e => e.stopPropagation()}>
        <div className="guestbook__header">
          <h3>Guestbook</h3>
          <button className="btn btn--ghost btn--sm" onClick={onClose} style={{ color: "#cc7000" }}>X</button>
        </div>

        {loading ? (
          <p className="muted">Loading...</p>
        ) : (
          <>
            {pendingMessage && (
              <p className="muted" style={{ fontSize: "0.8rem", marginBottom: "0.5rem" }}>
                Message sent! It may take a moment to appear.
              </p>
            )}

            <div className="guestbook__entries">
              {pageEntries.length === 0 ? (
                <p className="muted">No entries yet. Be the first to sign!</p>
              ) : (
                pageEntries.map((entry) => (
                  <div key={entry.id} className="guestbook__entry">
                    <div className="guestbook__entry-header">
                      <span className="guestbook__entry-author" title={entry.author}>
                        {displayName(entry.author)}
                      </span>
                      <span className="guestbook__entry-time">
                        {new Date(entry.createdAtMs).toLocaleDateString()}
                      </span>
                      {(entry.author === walletAddress || isModPlus) && (
                        <button
                          className="btn btn--ghost btn--xs"
                          disabled={deleting}
                          onClick={() => handleDelete(entry.id)}
                        >
                          {deleting ? "..." : "Del"}
                        </button>
                      )}
                    </div>
                    <p className="guestbook__entry-message">{entry.message}</p>
                  </div>
                ))
              )}
            </div>

            {totalPages > 1 && (
              <div className="guestbook__pagination">
                <button className="btn btn--ghost btn--xs" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</button>
                <span className="muted">{page + 1} / {totalPages}</span>
                <button className="btn btn--ghost btn--xs" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</button>
              </div>
            )}

            <div className="guestbook__input">
              <input
                type="text"
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Leave a message..."
                maxLength={250}
                onKeyDown={e => e.key === "Enter" && handleWrite()}
              />
              <button
                className="btn btn--cta btn--sm"
                disabled={sending || !message.trim()}
                onClick={handleWrite}
              >
                {sending ? "..." : "Sign"}
              </button>
            </div>
          </>
        )}
      </div>
  );

  if (inline) return content;
  return <div className="modal-overlay" onClick={onClose}>{content}</div>;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
