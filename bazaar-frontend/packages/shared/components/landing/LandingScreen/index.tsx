// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// LandingScreen — the pre-Godot intro. Replaced the legacy BootScan → HalGate →
// Recognized → Docked flow with the new matrix-rain cinematic (../IntroSequence).
// The Props API is unchanged so notribe/easy/advanced mount it identically.
//
// Flow: connect required up-front → eye forms → cursor wakes it → "WHO APPROACHES
// THE BAZAAR?" → "Me." (identity) → Consent (or Refuse → Accept) fires the real
// STRANGER registration TX → Scanning covers the latency → PROCEED → Godot.
// The Skip button is ALWAYS shown: returning/privileged users jump straight to
// Godot; a CONFIRMED-new wallet is auto-registered (same STRANGER PTB as Consent)
// and then enters. While the registry lookup is still resolving we let them in
// WITHOUT registering — register_stranger aborts E_ALREADY_REGISTERED for any
// wallet already in the registry. Skip + Consent share one `register()` routine.

import { useCallback, useRef, useState } from "react";
import { dAppKit, useConnection } from "@evefrontier/dapp-kit";
import type { Screen, Roles } from "@bazaar/shared/types";
import { SSU_OBJECT_ID, PACKAGE_ID } from "@bazaar/shared/constants";
import { useSSUSharedObjects, useCharacterNames } from "@bazaar/shared/hooks";
import { useSSUCaps } from "@bazaar/shared/hooks/bazaarcore/ssu-governance-hooks";
import { buildRegisterStranger, appendSetSSURole } from "@bazaar/shared/tx/dapp_hub/auto-register-tx";
import ConnectPrompt from "../ConnectPrompt";
import { Portal } from "../Portal";
import IntroScene from "../IntroSequence/IntroScene";

interface Props {
  nav:               (s: Screen) => void;
  roles:             Roles;
  assemblyName:      string;
  walletAddress:     string | null;
  needsRegistration: boolean;
  onRegistered:      () => void;
  isRegistered:      boolean;
}

function abbreviate(a: string | null): string {
  if (!a) return "0x????";
  return a.length <= 12 ? a : `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default function LandingScreen({
  nav,
  roles,
  walletAddress,
  onRegistered,
  isRegistered,
}: Props) {
  const { isConnected, walletAddress: connectedWallet } = useConnection();

  // Portal mode: when no SSU ID in URL (or ?view=), render the tribe portal.
  const hasSSUInUrl = Boolean(SSU_OBJECT_ID);
  const hasViewParam = Boolean(new URLSearchParams(window.location.search).get("view"));
  if (!hasSSUInUrl || hasViewParam) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "transparent", overflow: "hidden" }}>
        <div className="overlay-vignette" />
        <div className="overlay-scanlines" />
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1, pointerEvents: "none" }} />
        <Portal />
      </div>
    );
  }

  return (
    <ConnectedIntro
      isConnected={isConnected}
      connectedWallet={connectedWallet ?? null}
      walletAddress={walletAddress}
      isRegistered={isRegistered}
      roles={roles}
      onRegistered={onRegistered}
      nav={nav}
    />
  );
}

interface IntroProps {
  isConnected: boolean;
  connectedWallet: string | null;
  walletAddress: string | null;
  isRegistered: boolean;
  roles: Roles;
  onRegistered: () => void;
  nav: (s: Screen) => void;
}

// Split into its own component so the registration hooks only mount once an SSU
// is present (keeps the Portal branch above hook-free).
function ConnectedIntro({ isConnected, connectedWallet, walletAddress, isRegistered, roles, onRegistered, nav }: IntroProps) {
  const { data: sharedObjects } = useSSUSharedObjects(SSU_OBJECT_ID || null);
  const { data: ssuCaps } = useSSUCaps(connectedWallet ?? null, SSU_OBJECT_ID || null);
  const names = useCharacterNames(walletAddress ? [walletAddress] : []);

  const regState = useRef<"idle" | "pending" | "done" | "error">("idle");
  const [, force] = useState(0);
  const rerender = useCallback(() => force((x) => x + 1), []);

  const playerName = (walletAddress && names.get(walletAddress)) || "Capsuleer";
  const walletShort = abbreviate(walletAddress);

  // Shared STRANGER-registration routine for BOTH the Consent card and the
  // always-available Skip button. Mirrors the legacy HalGate "Scan and Provide
  // All Information" handler: register_stranger + atomic owner-cap elevate
  // (role 7) in one PTB if the wallet holds the cap. Resolves true once the
  // wallet is registered (or already was / privileged); false if a TX is in
  // flight, the SSU can't be registered against, or the signature was rejected.
  const register = useCallback(async (): Promise<boolean> => {
    if (regState.current === "pending") return false;
    if (regState.current === "done") return true;
    if (isRegistered || roles.isOwner || roles.isAdmin || roles.isModerator) {
      regState.current = "done";
      if (walletAddress) localStorage.setItem(`bazar-identified-${PACKAGE_ID}`, walletAddress);
      onRegistered();
      return true;
    }
    // Registry lookup still in flight: isRegistered defaults to false while
    // loading, so firing register_stranger now could hit an already-registered
    // wallet (aborts E_ALREADY_REGISTERED). Only register a CONFIRMED-new wallet.
    if (roles.isLoading) return false;
    if (!sharedObjects) return false; // SSU not bootstrapped / resolver in-flight
    regState.current = "pending";
    rerender();
    try {
      const tx = buildRegisterStranger({
        memberRegistryId: sharedObjects.memberRegistryId,
        ssuGovId: sharedObjects.ssuGovId,
      });
      if (ssuCaps?.hasSSUOwnerCap && ssuCaps.capIds?.ownerCapId && connectedWallet) {
        appendSetSSURole(tx, {
          ownerCapId: ssuCaps.capIds.ownerCapId,
          memberRegistryId: sharedObjects.memberRegistryId,
          player: connectedWallet,
          role: 7,
        });
      }
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      regState.current = "done";
      if (walletAddress) localStorage.setItem(`bazar-identified-${PACKAGE_ID}`, walletAddress);
      onRegistered();
      rerender();
      return true;
    } catch (e: unknown) {
      regState.current = "error";
      rerender();
      console.error("[LandingScreen] registration TX failed:", e);
      alert("Registration failed: " + (e instanceof Error ? e.message : String(e)));
      return false;
    }
  }, [isRegistered, roles, sharedObjects, ssuCaps, connectedWallet, walletAddress, onRegistered, rerender]);

  // Consent fires registration; the intro's Scanning → PROCEED step handles nav.
  const onConsent = useCallback(() => { void register(); }, [register]);

  const onProceed = useCallback(() => {
    if (regState.current === "error") {
      alert("Registration didn't complete. Please reload and consent again.");
      return;
    }
    nav("bazar");
  }, [nav]);

  // Skip is ALWAYS available. Returning/privileged users (or a completed
  // registration) go straight in; new users are auto-registered first, then
  // enter. If a TX is already in flight, wait it out. If the SSU can't be
  // registered against (resolver in-flight / not bootstrapped) we still let
  // them through rather than trapping them on the intro.
  const onSkip = useCallback(() => {
    if (regState.current === "done" || isRegistered || roles.isOwner || roles.isAdmin || roles.isModerator) {
      nav("bazar");
      return;
    }
    if (regState.current === "pending") return;
    // Status not yet resolved → don't risk re-registering a returning player;
    // just let them in. Auto-register only fires for a confirmed-new wallet.
    if (roles.isLoading) { nav("bazar"); return; }
    void (async () => {
      const ok = await register();
      if (ok || !sharedObjects) nav("bazar");
    })();
  }, [register, nav, isRegistered, roles, sharedObjects]);

  if (!isConnected) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "transparent", overflow: "hidden" }}>
        <div className="overlay-vignette" />
        <div className="overlay-scanlines" />
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1, pointerEvents: "none" }} />
        <ConnectPrompt />
      </div>
    );
  }

  return (
    <IntroScene
      onConsent={onConsent}
      onProceed={onProceed}
      onSkip={onSkip}
      isRegistered={isRegistered}
      skipPending={regState.current === "pending"}
      walletShort={walletShort}
      playerName={playerName}
    />
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
