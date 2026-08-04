// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// gas-sponsor.mts — Netlify Function: Sui dual-signature gas sponsorship.
//
// Implements the sponsor-signer service from SPONSORED_TRANSACTION_WORKFLOW_GUIDE
// (FrontierHackaton devnotes): the frontend sends a TransactionKind (intent only,
// no gas info) + sender; this service validates the intent against a fail-closed
// allowlist, attaches OUR gas (sender = player, gas owner = sponsor hot wallet),
// builds the full transaction, co-signs, and returns bytes + sponsor signature.
// The player then signs the same bytes in EVE Vault and the app submits with
// both signatures. The player's wallet never needs SUI.
//
//   GET  /.netlify/functions/gas-sponsor   -> health { ok, sponsoring }
//   POST /.netlify/functions/gas-sponsor   -> { txKindB64, sender, timestamp? }
//                                          -> { txB64, sponsorSignature }
//
// Security model (per the guide — the sponsor key is a drainable resource):
//   - Command-kind allowlist, FAIL-CLOSED: MoveCall / SplitCoins / MergeCoins /
//     MakeMoveVec, plus TransferObjects ONLY when the recipient is a Pure input
//     equal to the sender (our TX builders transfer caps/coins back to the
//     sender; arbitrary recipients are refused).
//   - Recursive GasCoin-reference detection: any command touching the gas coin
//     (= OUR coin) is refused. This is the theft-vector blocker.
//   - MoveCall package allowlist: the 5 bazaar packages + the EVE world package
//     ("*" modules — on-chain cap/sender checks gate the privileged paths), and
//     0x2 restricted to coin::zero (used by free-shop builders).
//   - Generic error responses; specific reasons only in server logs.
//
// Env vars (Netlify UI):
//   GAS_SPONSOR_PRIVATE_KEY     REQUIRED — bech32 "suiprivkey..." hot wallet.
//                               Fund from deployer; it pays all players' gas.
//   GAS_SPONSOR_ENABLED         kill switch — set "false" to disable instantly
//   GAS_SPONSOR_BUDGET_MIST     per-tx gas budget cap (default 0.05 SUI)
//   GAS_SPONSOR_MAX_COMMANDS    PTB command ceiling (default 64)
//   SPONSOR_ALLOWED_PACKAGES    JSON override of the package allowlist
//   SUI_RPC_URL                 fullnode override (default: testnet)
//
// Known alpha limitation: one hot wallet = gas-coin lock contention under truly
// concurrent transactions; the loser falls back to user-paid in the FE wrapper.
// NOTE: every fresh-publish cascade rotates package IDs — the allowlist below
// (or SPONSOR_ALLOWED_PACKAGES) MUST rotate with it (deployment checklist).

import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Transaction } from "@mysten/sui/transactions";
import { toBase64, fromBase64 } from "@mysten/sui/utils";

// Minimal Node global (workspace has no @types/node; Netlify runtime provides it).
declare const process: { env: Record<string, string | undefined> };

const GAS_BUDGET_MIST = BigInt(process.env.GAS_SPONSOR_BUDGET_MIST ?? 50_000_000); // 0.05 SUI
const MAX_COMMANDS = Number(process.env.GAS_SPONSOR_MAX_COMMANDS ?? 64);
const MAX_BODY_BYTES = 131_072; // 128 KB
const TIMESTAMP_WINDOW_MS = 120_000;

type PackageAllow = "*" | Record<string, "*" | string[]>;

function normalizeAddr(addr: string): string {
  return "0x" + addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

// Default allowlist = testnet V38 (2026-06-25 fresh publish; 6-package layout) + EVE world + 0x2::coin::zero.
const DEFAULT_ALLOWED: Record<string, PackageAllow> = {
  "0x931f71c0c8f839b692b2cf8b6512e505ad07c133679d85b1d2741e8e636bc63a": "*", // dapp_hub
  "0xe410963aa069ae1e8b2114984787201fcf50ffc9d9a0b5ccb59148b86e88f911": "*", // bazaar_core
  "0x51c61a3647a67d3970b568882292709f1178275ec6d74fec38bb83667eeb7d24": "*", // bazaar_economy
  "0xadcf3f71ffd909b55aeb40d9ee7b88c2cfd7db9d8e1304a008fa9274c2d19114": "*", // shared_widgets
  "0xb2f01c1df61c8ffbcd48273cb499239a513c60c560e12a64743164c350224a89": "*", // bazaar_mission
  "0xe842772dd23793a49f793c379a7f36cd95dfd08a295ed5c969ee47da5181261d": "*", // bazaar_shop_ops
  "0x8b8a46ed766fa1358ce7c5c51f6a164b13d627a63e45343f69ed0ba0446c1aa1": "*", // EVE world
  [normalizeAddr("0x2")]: { coin: ["zero"] }, // sui framework — coin::zero only
};

function loadAllowedPackages(): Record<string, PackageAllow> {
  const raw = process.env.SPONSOR_ALLOWED_PACKAGES;
  if (!raw) return DEFAULT_ALLOWED;
  const parsed = JSON.parse(raw) as Record<string, PackageAllow>;
  const normalized: Record<string, PackageAllow> = {};
  for (const [pkg, allow] of Object.entries(parsed)) normalized[normalizeAddr(pkg)] = allow;
  return normalized;
}

/** Recursive walk for { $kind: "GasCoin" } anywhere in a command's argument tree. */
function containsGasCoinReference(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsGasCoinReference);
  const obj = value as Record<string, unknown>;
  if (obj.$kind === "GasCoin") return true;
  return Object.values(obj).some((v) => typeof v === "object" && containsGasCoinReference(v));
}

interface ValidationInput {
  commands: Array<Record<string, unknown> & { $kind?: string }>;
  inputs: Array<Record<string, unknown> & { $kind?: string }>;
  sender: string;
}

function validateIntent({ commands, inputs, sender }: ValidationInput): { ok: boolean; reason: string } {
  if (!Array.isArray(commands) || commands.length === 0) return { ok: false, reason: "no-commands" };
  if (commands.length > MAX_COMMANDS) return { ok: false, reason: "too-many-commands" };

  const allowed = loadAllowedPackages();
  if (Object.keys(allowed).length === 0) return { ok: false, reason: "no-policies" }; // fail closed
  const normSender = normalizeAddr(sender);
  let moveCallCount = 0;

  for (const cmd of commands) {
    if (containsGasCoinReference(cmd)) return { ok: false, reason: "gascoin-reference" };

    switch (cmd.$kind) {
      case "MoveCall": {
        const mc = cmd.MoveCall as { package: string; module: string; function: string };
        const pkgAllow = allowed[normalizeAddr(mc.package)];
        if (!pkgAllow) return { ok: false, reason: `package:${mc.package}` };
        if (pkgAllow !== "*") {
          const modAllow = pkgAllow[mc.module];
          if (!modAllow) return { ok: false, reason: `module:${mc.module}` };
          if (modAllow !== "*" && !modAllow.includes(mc.function)) {
            return { ok: false, reason: `function:${mc.module}::${mc.function}` };
          }
        }
        moveCallCount += 1;
        break;
      }
      case "TransferObjects": {
        // Only self-transfers: recipient must be a Pure input == sender. Our TX
        // builders use this to route caps/coins back to the calling wallet.
        const addr = (cmd.TransferObjects as { address?: { $kind?: string; Input?: number } }).address;
        if (!addr || addr.$kind !== "Input" || typeof addr.Input !== "number") {
          return { ok: false, reason: "transfer-recipient-not-pure" };
        }
        const input = inputs[addr.Input] as { $kind?: string; Pure?: { bytes?: string } } | undefined;
        if (!input || input.$kind !== "Pure" || !input.Pure?.bytes) {
          return { ok: false, reason: "transfer-recipient-not-pure" };
        }
        const bytes = fromBase64(input.Pure.bytes);
        if (bytes.length !== 32) return { ok: false, reason: "transfer-recipient-not-address" };
        const recipient = "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
        if (normalizeAddr(recipient) !== normSender) return { ok: false, reason: "transfer-recipient-not-sender" };
        break;
      }
      case "SplitCoins":
      case "MergeCoins":
      case "MakeMoveVec":
        break; // safe once GasCoin refs are excluded (operate on sender-owned inputs)
      default:
        return { ok: false, reason: `command-kind:${cmd.$kind}` }; // Publish/Upgrade/unknown — fail closed
    }
  }

  if (moveCallCount === 0) return { ok: false, reason: "no-movecall" };
  return { ok: true, reason: "" };
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function audit(entry: Record<string, unknown>): void {
  console.log(JSON.stringify({ service: "gas-sponsor", at: new Date().toISOString(), ...entry }));
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  const privateKey = process.env.GAS_SPONSOR_PRIVATE_KEY;
  const enabled = process.env.GAS_SPONSOR_ENABLED !== "false";

  if (req.method === "GET") return json(200, { ok: true, sponsoring: enabled && Boolean(privateKey) });
  if (req.method !== "POST") return json(405, { error: "method-not-allowed" });
  if (!enabled) return json(503, { error: "sponsor-disabled" });
  if (!privateKey) return json(503, { error: "sponsor-not-configured" });

  let txKindB64: string, sender: string, timestamp: number | undefined;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return json(413, { error: "request-too-large" });
    const body = JSON.parse(text) as { txKindB64?: string; sender?: string; timestamp?: number };
    txKindB64 = body.txKindB64 ?? "";
    sender = (body.sender ?? "").trim();
    timestamp = body.timestamp;
  } catch {
    return json(400, { error: "bad-json" });
  }
  if (!txKindB64) return json(400, { error: "missing-txKindB64" });
  if (!/^0x[0-9a-fA-F]{64}$/.test(sender)) return json(400, { error: "bad-sender" });
  if (typeof timestamp === "number" && Math.abs(Date.now() - timestamp) > TIMESTAMP_WINDOW_MS) {
    return json(400, { error: "request-expired" });
  }

  try {
    let tx: Transaction;
    try {
      tx = Transaction.fromKind(fromBase64(txKindB64));
    } catch {
      return json(400, { error: "bad-transaction-kind" });
    }

    const data = tx.getData() as unknown as ValidationInput;
    const verdict = validateIntent({ commands: data.commands, inputs: data.inputs, sender });
    if (!verdict.ok) {
      audit({ event: "rejected", sender, reason: verdict.reason });
      return json(403, { error: "not-eligible" }); // generic by design — reason stays server-side
    }

    const client = new SuiJsonRpcClient({
      url: process.env.SUI_RPC_URL ?? "https://api.zan.top/public/sui-testnet",
      network: "testnet",
    });
    const keypair = Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(privateKey).secretKey);
    const sponsorAddress = keypair.getPublicKey().toSuiAddress();

    tx.setSender(sender);
    tx.setGasOwner(sponsorAddress);
    tx.setGasBudget(GAS_BUDGET_MIST);
    const txBytes = await tx.build({ client });

    const { signature } = await keypair.signTransaction(txBytes);
    audit({ event: "approved", sender, commands: data.commands.length });
    return json(200, { txB64: toBase64(txBytes), sponsorSignature: signature });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    audit({ event: "error", sender, detail: message });
    return json(500, { error: "sponsor-failed" }); // generic by design
  }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
