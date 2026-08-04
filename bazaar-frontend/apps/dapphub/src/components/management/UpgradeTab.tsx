// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * UpgradeTab — DApp Management → Upgrade tab.
 *
 * Generic ceremony runner for any Move package upgrade request. Reads a
 * static manifest of contract requests (`CONTRACT_REQUESTS` below), fetches
 * each one's build artifact from `/upgrade-v<N>/<pkg>.json`, builds a
 * package::authorize_upgrade → upgrade → commit_upgrade PTB, and asks the
 * connected wallet to sign via DAppKit. After signing, the panel queries
 * the fullnode for the transaction's objectChanges and displays the new
 * package ID.
 *
 * To add a new request, drop the build artifact JSON (produced by
 * `sui move build --dump-bytecode-as-base64`) into
 * `apps/dapphub/public/upgrade-v<N>/<pkg>.json` and add a row to
 * CONTRACT_REQUESTS.
 *
 * Wallet requirement: connected wallet MUST own the listed UpgradeCap. Sui
 * aborts the TX otherwise.
 */

import { useState, useEffect, useCallback } from "react";
import { dAppKit, useConnection } from "@evefrontier/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";

const COMPATIBLE_POLICY = 0;
const SUI_FRAMEWORK = "0x2";
const TESTNET_RPC = "https://api.zan.top/public/sui-testnet";

/** Query the fullnode for the post-publish package ID. Used both after auto-
 *  extracted digests and after the manual paste fallback. */
async function queryNewPackageId(reqId: string, txDigest: string): Promise<string> {
  try {
    const rpc = await fetch(TESTNET_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "sui_getTransactionBlock",
        params: [txDigest, { showObjectChanges: true, showEffects: true }],
      }),
    }).then(r => r.json());
    const changes = rpc?.result?.objectChanges ?? [];
    const published = changes.find((c: any) => c?.type === "published");
    console.log(`[UpgradeTab:${reqId}] objectChanges:`, changes);
    return published?.packageId ?? "<not-in-changes>";
  } catch (qe) {
    console.error(`[UpgradeTab:${reqId}] post-sign query failed:`, qe);
    return "<query-failed-check-explorer>";
  }
}

interface ContractRequest {
  id:               string;
  label:            string;
  description:      string;
  artifactPath:     string;   // relative to BASE_URL
  upgradeCapId:     string;
  currentPackageId: string;
  /** Optional: other request IDs that must complete before this one can run. */
  dependsOn?:       string[];
  /** Pre-fill when the upgrade has already landed (e.g. signed before this
   *  panel existed). Prevents duplicate sign attempts and unblocks dependents. */
  completedPackageId?: string;
  completedDigest?:    string;
}

// Manifest of contract requests. Append rows here as new upgrades land.
const CONTRACT_REQUESTS: ContractRequest[] = [
  {
    id: "v27-bazaar-core",
    label: "V27 — BazaarCore upgrade",
    description: "Wave 2 + Wave 3-A bundle: ssu_economy_init helper refactor, "
      + "WTB drain skip in close/force-close, auto-deactivate on buyout, "
      + "permissionless try_expire_shop.",
    artifactPath:     "upgrade-v27/bazaar-core.json",
    upgradeCapId:     "0xc641e24af04137aa5bc70a720f042fdcd67f73d918f247219a444fed19633804",
    currentPackageId: "0x92ec721d09258a618d7c6b973299069efbc8889a05778cfc68a216828d582f9c",
    completedPackageId: "0x8915bd74f5460fee193a4427515d3eaf99aa294e85a0738c9b9fc18ada5b73f5",
    completedDigest:    "ANk4b7NtnV7CmCCa9BFoQtWfpfktbeqpUgKZ6MWwNAp4",
  },
  {
    id: "v27-bazaar-economy",
    label: "V27 — BazaarEconomy upgrade",
    description: "NEW ssu_economy_init.move module (per-SSU Initialize Economy "
      + "entry). public(package) create_and_share_pool helper added to "
      + "tribe_token_wtb_pool. Depends on V27 BazaarCore landing first.",
    artifactPath:     "upgrade-v27/bazaar-economy.json",
    upgradeCapId:     "0xad73acf57d093ee530011e51ead4c33b22b0305a52f4c26bdf7c35dc2d2e4736",
    currentPackageId: "0x8c047f38e97b0dd077bdc1f958bb6c0d0f3ebbf2f6318d4607a52c302ffad811",
    dependsOn: ["v27-bazaar-core"],
    completedPackageId: "0x2a2d5b872f43e08218524ce1f09a3001507546005585277c2ddb488eeaca810f",
    completedDigest:    "6D1cGDeJcksHRW85Y4mpMsHzhEiujg2HYiq46H8mKk7F",
  },
  {
    id: "v28-bazaar-economy",
    label: "V28 — BazaarEconomy exchange tribe-wallet semantics",
    description: "Exchange swap_eve_to_tokens transfers tokens from the tribe "
      + "wallet (gov_addr ledger row) instead of minting fresh supply. Reverse "
      + "swap returns tokens to the tribe wallet instead of burning. Rate now "
      + "uses tribe_wallet_balance as the denominator. NEW errors: "
      + "E_TRIBE_WALLET_INSUFFICIENT (12). NEW fns: exchange_rate_v28, "
      + "exchange_rate_scaled_v28, tribe_wallet_balance, "
      + "tribe_token_ledger::internal_transfer. Compatible (additive) upgrade.",
    artifactPath:     "upgrade-v28/bazaar-economy.json",
    upgradeCapId:     "0xad73acf57d093ee530011e51ead4c33b22b0305a52f4c26bdf7c35dc2d2e4736",
    currentPackageId: "0x2a2d5b872f43e08218524ce1f09a3001507546005585277c2ddb488eeaca810f",
  },
];

interface BuildArtifact {
  modules:      string[];
  dependencies: string[];
  digest:       number[];
}

interface RequestState {
  artifact:     BuildArtifact | null;
  loadError:    string | null;
  resultPkg:    string | null;
  resultDigest: string | null;
  signError:    string | null;
  /** V27 follow-up: when the wallet response shape doesn't surface a digest
   *  (EVE Vault wallet returns a different shape than the Mysten SDK docs),
   *  the panel falls back to prompting for a pasted digest. */
  needsManualDigest?: boolean;
}

interface Props {
  // Mounted by DAppManagementPanel, but no DApp-owner-cap requirement —
  // UpgradeCap is the per-package gate, not DAppOwnerCap.
  ownerCapId?: string | null;
}

export default function UpgradeTab(_props: Props) {
  const { walletAddress, isConnected } = useConnection();
  const [states, setStates] = useState<Record<string, RequestState>>(() =>
    Object.fromEntries(CONTRACT_REQUESTS.map(r => [r.id, {
      artifact: null,
      loadError: null,
      resultPkg: r.completedPackageId ?? null,
      resultDigest: r.completedDigest ?? null,
      signError: null,
    } satisfies RequestState])),
  );
  const [busy, setBusy] = useState<string | null>(null);

  // Load all artifacts on mount.
  useEffect(() => {
    const base = import.meta.env.BASE_URL || "/";
    async function load(req: ContractRequest): Promise<void> {
      const url = `${base}${req.artifactPath}`;
      try {
        const r = await fetch(url);
        const ct = r.headers.get("content-type") || "";
        if (!r.ok) throw new Error(`HTTP ${r.status} on ${url}`);
        if (!ct.includes("json")) {
          const peek = (await r.text()).slice(0, 80);
          throw new Error(`wrong content-type "${ct}" on ${url} (peek: ${peek})`);
        }
        const artifact = await r.json() as BuildArtifact;
        setStates(prev => ({ ...prev, [req.id]: { ...prev[req.id], artifact } }));
      } catch (e) {
        setStates(prev => ({ ...prev, [req.id]: {
          ...prev[req.id], loadError: e instanceof Error ? e.message : String(e),
        }}));
      }
    }
    CONTRACT_REQUESTS.forEach(req => { void load(req); });
  }, []);

  const runRequest = useCallback(async (req: ContractRequest) => {
    const st = states[req.id];
    if (!st?.artifact) return;
    setBusy(req.id);
    setStates(prev => ({ ...prev, [req.id]: { ...prev[req.id], signError: null } }));
    try {
      const tx = new Transaction();
      const ticket = tx.moveCall({
        target: `${SUI_FRAMEWORK}::package::authorize_upgrade`,
        arguments: [
          tx.object(req.upgradeCapId),
          tx.pure.u8(COMPATIBLE_POLICY),
          tx.pure.vector("u8", st.artifact.digest),
        ],
      });
      const receipt = tx.upgrade({
        modules:      st.artifact.modules,
        dependencies: st.artifact.dependencies,
        package:      req.currentPackageId,
        ticket,
      });
      tx.moveCall({
        target: `${SUI_FRAMEWORK}::package::commit_upgrade`,
        arguments: [tx.object(req.upgradeCapId), receipt],
      });
      const res = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      if (res.$kind === "FailedTransaction") {
        throw new Error(res.FailedTransaction?.status?.error?.message ?? "Upgrade TX failed");
      }
      // Wallets return different response shapes. Best-effort extraction:
      //   - Mysten SDK shape: `{ digest, effects, ... }`
      //   - Older wrapped:    `{ Transaction: { digest, ... } }`
      //   - EVE Vault wallet: variant of one of the above with the digest at
      //     `res.digest` or `res.transactionDigest` (observed mid-V27).
      // If none of the above land, surface the full response shape via console
      // and prompt the user to paste a digest manually instead of silently failing.
      const r = res as any;
      const txDigest: string | null =
        r?.digest ??
        r?.transactionDigest ??
        r?.Transaction?.digest ??
        r?.Transaction?.transactionDigest ??
        null;
      if (!txDigest) {
        console.warn(
          `[UpgradeTab:${req.id}] could not extract digest from wallet response — ` +
          `paste it manually. Response shape was:`, res,
        );
        setStates(prev => ({ ...prev, [req.id]: {
          ...prev[req.id], needsManualDigest: true,
        }}));
        return;
      }
      const newPkgId = await queryNewPackageId(req.id, txDigest);
      setStates(prev => ({ ...prev, [req.id]: {
        ...prev[req.id], resultPkg: newPkgId, resultDigest: txDigest,
      }}));
    } catch (e: unknown) {
      setStates(prev => ({ ...prev, [req.id]: {
        ...prev[req.id], signError: e instanceof Error ? e.message : String(e),
      }}));
    } finally {
      setBusy(null);
    }
  }, [states]);

  /** Manual digest paste fallback (V27 follow-up): used when the wallet
   *  response shape diverges and `txDigest` cannot be auto-extracted. The
   *  user pastes the digest from their wallet's confirmation screen; the
   *  panel then runs the same RPC query as the auto path. */
  const submitManualDigest = useCallback(async (reqId: string, digest: string) => {
    const trimmed = digest.trim();
    if (!trimmed) return;
    setBusy(reqId);
    const newPkgId = await queryNewPackageId(reqId, trimmed);
    setStates(prev => ({ ...prev, [reqId]: {
      ...prev[reqId],
      resultPkg: newPkgId,
      resultDigest: trimmed,
      needsManualDigest: false,
    }}));
    setBusy(null);
  }, []);

  return (
    <div className="panel__section">
      <div className="action-card">
        <h4>Contract Upgrade Ceremony</h4>
        <p className="muted" style={{ fontSize: "0.78rem", margin: "0.4rem 0" }}>
          Sign Move package upgrade transactions for the testnet deployment.
          Each request requires the listed UpgradeCap to be held by the
          connected wallet. Sui aborts otherwise.
        </p>
        {isConnected && walletAddress && (
          <div className="muted" style={{ fontSize: "0.78rem", marginBottom: "0.4rem" }}>
            Signing as {walletAddress.slice(0, 10)}…{walletAddress.slice(-6)}
          </div>
        )}
        {!isConnected && (
          <div className="error-text" style={{ marginBottom: "0.4rem" }}>
            Connect your wallet to sign.
          </div>
        )}
      </div>

      {CONTRACT_REQUESTS.map((req, idx) => {
        const st = states[req.id];
        const deps = req.dependsOn ?? [];
        const blocked = deps.some(d => !states[d]?.resultPkg);
        const done = !!st?.resultPkg;
        return (
          <div className="action-card" key={req.id} style={{ marginTop: idx === 0 ? "1rem" : "0.75rem" }}>
            <h4>{req.label}</h4>
            <p className="muted" style={{ fontSize: "0.78rem", margin: "0.3rem 0" }}>
              {req.description}
            </p>
            <div className="muted" style={{ fontSize: "0.72rem", fontFamily: "monospace" }}>
              UpgradeCap {req.upgradeCapId.slice(0, 12)}…
              {" · "}from pkg {req.currentPackageId.slice(0, 12)}…
            </div>
            {st?.loadError && (
              <p className="error-text" style={{ marginTop: "0.4rem" }}>
                Artifact load failed: {st.loadError}
              </p>
            )}
            {!st?.loadError && !st?.artifact && (
              <p className="muted" style={{ marginTop: "0.4rem", fontSize: "0.78rem" }}>
                Loading artifact…
              </p>
            )}
            {st?.artifact && (
              <div style={{ fontSize: "0.72rem", marginTop: "0.4rem", fontFamily: "monospace" }}>
                modules={st.artifact.modules.length}
                {" · "}deps={st.artifact.dependencies.length}
                {" · "}digest={st.artifact.digest.length}B
              </div>
            )}
            {st?.signError && (
              <p className="error-text" style={{ marginTop: "0.4rem" }}>
                {st.signError}
              </p>
            )}
            {st?.needsManualDigest && !done && (
              <ManualDigestEntry
                reqId={req.id}
                busy={busy === req.id}
                onSubmit={submitManualDigest}
              />
            )}
            {done && (
              <div className="action-card" style={{
                marginTop: "0.5rem",
                background: "rgba(74, 222, 128, 0.04)",
                borderColor: "rgba(74, 222, 128, 0.4)",
              }}>
                <div style={{ color: "#4ade80", fontSize: "0.82rem", marginBottom: "0.3rem" }}>
                  ✓ Upgrade landed
                </div>
                <div style={{ fontFamily: "monospace", fontSize: "0.72rem", wordBreak: "break-all" }}>
                  <strong>new pkg:</strong> {st.resultPkg}
                </div>
                <div className="muted" style={{ fontFamily: "monospace", fontSize: "0.72rem", wordBreak: "break-all" }}>
                  tx: {st.resultDigest}
                </div>
              </div>
            )}
            {!done && (
              <button
                className="btn btn--primary"
                style={{ marginTop: "0.5rem" }}
                disabled={!isConnected || !st?.artifact || busy !== null || blocked}
                onClick={() => void runRequest(req)}
                title={blocked
                  ? `Waiting on: ${deps.filter(d => !states[d]?.resultPkg).join(", ")}`
                  : ""}
              >
                {busy === req.id ? "Signing…"
                  : blocked ? `Blocked by: ${deps.filter(d => !states[d]?.resultPkg).join(", ")}`
                  : `Sign ${req.label}`}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ManualDigestEntry({
  reqId, busy, onSubmit,
}: {
  reqId: string;
  busy: boolean;
  onSubmit: (reqId: string, digest: string) => void;
}) {
  const [digest, setDigest] = useState("");
  return (
    <div className="action-card" style={{
      marginTop: "0.5rem",
      background: "rgba(255, 200, 60, 0.05)",
      borderColor: "rgba(255, 200, 60, 0.4)",
    }}>
      <div style={{ fontSize: "0.78rem", marginBottom: "0.3rem", color: "#ffc83c" }}>
        Wallet response did not include a digest. Paste it manually:
      </div>
      <p className="muted" style={{ fontSize: "0.72rem", margin: "0.2rem 0" }}>
        Find the transaction digest in your wallet's confirmation screen or in
        an explorer search for your wallet address. Then paste it below — the
        panel will query the fullnode for the new package ID.
      </p>
      <input
        type="text"
        className="input"
        placeholder="e.g. 9aBc1234…"
        value={digest}
        onChange={e => setDigest(e.target.value)}
        style={{ width: "100%", fontFamily: "monospace", fontSize: "0.78rem" }}
      />
      <button
        className="btn btn--primary btn--sm"
        style={{ marginTop: "0.4rem" }}
        disabled={busy || !digest.trim()}
        onClick={() => onSubmit(reqId, digest)}
      >
        {busy ? "Querying…" : "Submit digest"}
      </button>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
