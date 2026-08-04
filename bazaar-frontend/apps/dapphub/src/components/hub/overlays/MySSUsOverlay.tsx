// MySSUsOverlay.tsx — "My Registered SSUs" overlay (NoTribe / Tribe tabs).
// New Station-Hub visual; wired to live useMySSUs + useUnregisterSSU.

import { useState, useMemo } from "react";
import { useConnection } from "@evefrontier/dapp-kit";
import { useMySSUs, useUnregisterSSU } from "@bazaar/shared/hooks";
import { useTribeRegistry } from "@bazaar/shared/hooks/useTribeRegistry";
import { HUB } from "../hubStyle";
import { OverlayShell, PrimaryBtn, GhostBtn } from "../HubPrimitives";

type SSUTab = "notribe" | "tribe";
type SSURow = NonNullable<ReturnType<typeof useMySSUs>["data"]>[number];

function truncateId(id: string): string { return id.length <= 16 ? id : `${id.slice(0, 8)}…${id.slice(-6)}`; }
function formatDate(ms: number): string {
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
}

// Small pill showing the SSU's tribe type (NoTribe / Easy / Advanced).
function TypeBadge({ label }: { label: string }) {
  return (
    <span style={{
      padding: "3px 9px", border: `1px solid ${HUB.DIM}`, background: "rgba(184,102,32,0.12)",
      color: HUB.ORANGE, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
    }}>{label}</span>
  );
}

export default function MySSUsOverlay({ onClose, onSsuGov }: { onClose: () => void; onSsuGov: (ssuId: string) => void }) {
  const { walletAddress } = useConnection();
  const { data: ssus = [], isLoading } = useMySSUs(walletAddress ?? null);
  // Tribe registry — resolves each SSU's tribe name + bazaar type by tribe index.
  // useMySSUs returns tribeId as the tribe INDEX (string) and leaves tribeName
  // null for performance, so the type/name shown on each row come from here.
  const { tribes } = useTribeRegistry();
  const tribesByIdx = useMemo(() => {
    const m = new Map<number, (typeof tribes)[number]>();
    for (const t of tribes) m.set(t.idx, t);
    return m;
  }, [tribes]);
  const resolveTribe = (ssu: SSURow): { typeLabel: string; tribeName: string | null } => {
    if (ssu.tribeId == null) return { typeLabel: "NoTribe", tribeName: null };
    const t = tribesByIdx.get(Number(ssu.tribeId));
    if (!t) return { typeLabel: "Tribe", tribeName: ssu.tribeName ?? null };
    const typeLabel = t.bazaarType === 1 ? "Easy" : t.bazaarType === 2 ? "Advanced" : "Tribe";
    return { typeLabel, tribeName: t.name || ssu.tribeName || null };
  };
  const [tab, setTab] = useState<SSUTab>("notribe");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [target, setTarget] = useState<SSURow | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { mutateAsync: unregister, isPending } = useUnregisterSSU();

  const noTribe = useMemo(() => ssus.filter((s) => !s.tribeId), [ssus]);
  const tribe = useMemo(() => ssus.filter((s) => !!s.tribeId), [ssus]);
  const displayed = tab === "notribe" ? noTribe : tribe;

  async function handleCopy(url: string, id: string) {
    try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function confirmUnregister() {
    if (!target) return;
    try {
      await unregister({ ssuId: target.ssuId, tribeGovId: null });
      setTarget(null);
    } catch (e: unknown) {
      setErrorMessage(e instanceof Error ? e.message : "Unregister failed.");
    }
  }

  const TabBtn = ({ id, label }: { id: SSUTab; label: string }) => (
    <button onClick={() => setTab(id)} style={{
      background: "transparent", border: "none", padding: "12px 6px", marginRight: 28,
      fontFamily: "inherit", fontWeight: 700, fontSize: 14, letterSpacing: "0.04em",
      color: tab === id ? HUB.ORANGE : HUB.MUTED, cursor: "pointer",
      borderBottom: tab === id ? `2px solid ${HUB.ORANGE}` : "2px solid transparent",
    }}>{label}</button>
  );

  return (
    <OverlayShell title="MY REGISTERED SSUS" width={1100} onClose={onClose}>
      <div style={{ display: "flex", borderBottom: `1px solid rgba(184,102,32,0.45)`, marginBottom: 20 }}>
        <TabBtn id="notribe" label={`NoTribe SSUs (${noTribe.length})`} />
        <TabBtn id="tribe" label={`Tribe SSUs (${tribe.length})`} />
      </div>

      {tab === "tribe" && (
        <div style={{ border: `1px solid ${HUB.DIM}`, background: "rgba(184,102,32,0.06)", padding: "14px 18px", marginBottom: 16 }}>
          <div style={{ color: HUB.ORANGE, fontWeight: 700, fontSize: 13, marginBottom: 6 }}>About tribe currency</div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: HUB.FG2 }}>
            Your tribe currency is not stored in your wallet, but within the Bazaar network where it is registered to your
            wallet. To exchange tribe currency with EVE, you can only do so in Bazaar dApps that are part of that tribe&apos;s
            network and with that tribe&apos;s specific Escrow pool.
          </div>
        </div>
      )}

      {isLoading && <div style={{ color: HUB.MUTED, fontSize: 14 }}>Loading your SSUs…</div>}

      {!isLoading && displayed.length === 0 && (
        <div style={{ padding: "36px 20px", textAlign: "center", fontSize: 15, color: HUB.FG2 }}>
          {tab === "notribe" ? "You have no standalone SSUs registered." : "You have no tribe-affiliated SSUs registered."}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: 420, overflowY: "auto" }}>
        {displayed.map((ssu) => {
          const { typeLabel, tribeName } = resolveTribe(ssu);
          return (
          <div key={ssu.ssuId} style={{ border: `1px solid ${HUB.BORDER}`, background: "rgba(20,14,8,0.55)", padding: "18px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ color: HUB.ORANGE, fontWeight: 700, fontSize: 16, flex: 1, minWidth: 140 }}>{truncateId(ssu.ssuId)}</span>
              <TypeBadge label={typeLabel} />
              {tribeName && <span style={{ color: HUB.FG2, fontSize: 12 }}>Tribe: {tribeName}</span>}
              <span style={{ padding: "3px 10px", background: ssu.status === "active" ? "rgba(58,210,120,0.18)" : "rgba(184,102,32,0.18)", border: `1px solid ${ssu.status === "active" ? HUB.GREEN : HUB.DIM}`, color: ssu.status === "active" ? HUB.GREEN : HUB.DIM, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>{ssu.status}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", alignItems: "center", gap: 14 }}>
              <code style={{ fontFamily: "inherit", fontSize: 13, color: HUB.FG2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ssu.url}</code>
              <GhostBtn outlined small onClick={() => onSsuGov(ssu.ssuId)}>SSU Governance</GhostBtn>
              <GhostBtn outlined small onClick={() => handleCopy(ssu.url, ssu.ssuId)}>{copiedId === ssu.ssuId ? "Copied!" : "Copy"}</GhostBtn>
              <GhostBtn danger small onClick={() => { setErrorMessage(null); setTarget(ssu); }}>Unregister</GhostBtn>
            </div>
            <div style={{ fontSize: 12, color: HUB.MUTED }}>Registered: {formatDate(ssu.registeredAtMs)}</div>
          </div>
          );
        })}
      </div>

      {target && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(8,6,4,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }} onClick={() => !isPending && setTarget(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: HUB.PANEL, border: `1.5px solid ${HUB.RED}`, padding: "26px 30px", width: "min(520px, 100%)" }}>
            <h3 style={{ margin: "0 0 12px", color: HUB.RED, fontSize: 15, letterSpacing: "0.12em" }}>UNREGISTER SSU</h3>
            <div style={{ fontSize: 13, color: HUB.FG2, lineHeight: 1.6, marginBottom: 16 }}>
              Unregister <span style={{ color: HUB.ORANGE }}>{truncateId(target.ssuId)}</span> from Bazaar? Its marketplace
              link will stop working until you register again.
            </div>
            {errorMessage && <div style={{ fontSize: 13, color: HUB.RED, marginBottom: 12 }}>{errorMessage}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <GhostBtn onClick={() => { if (!isPending) setTarget(null); }}>Cancel</GhostBtn>
              <PrimaryBtn disabled={isPending} onClick={() => void confirmUnregister()}>{isPending ? "Unregistering…" : "Unregister"}</PrimaryBtn>
            </div>
          </div>
        </div>
      )}
    </OverlayShell>
  );
}
