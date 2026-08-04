/**
 * GodotCanvas — Loads and renders the Godot engine in a canvas element.
 *
 * basePath resolution precedence (AP2-B / FP1-27):
 *   1. Explicit basePath prop — always wins (AP2-E per-SSU/per-tribe resolver uses this).
 *   2. VITE_GODOT_BASE_URL env var (build-time; set per-app in .env.local).
 *   3. "/godot/" fallback — each app's public/godot/ (preserves dev default).
 *
 * The canvas is embedded directly in the React tree (not iframe).
 * Communication happens via CustomEvent bridge (useGodotBridge hook).
 *
 * Phase D: additive render-prop slots + onPhaseChange callback (FA-FP2-D-001).
 * Phase AP2-B: host-agnostic basePath via getDefaultGodotBaseUrl (FP1-27).
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import type { ReactNode } from "react";
import { getDefaultGodotBaseUrl } from "@bazaar/shared/godot/url-config";

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Phase observable from the Godot canvas lifecycle.
 * Exported so consumers (BazaarScreen) can type their own phase callbacks.
 */
export type GodotCanvasPhase = "idle" | "loading" | "running" | "error";

export interface GodotCanvasProps {
  /** Base path where Godot assets are served. Default: "/godot/" */
  basePath?: string;
  /** Called when Godot engine fails to load */
  onLoadError?: (error: string) => void;
  /** Additional CSS class for the container */
  className?: string;
  /**
   * Loading overlay content (simple ReactNode slot).
   * @deprecated Prefer renderLoadingOverlay for progress-aware overlays.
   *             When both are supplied, renderLoadingOverlay takes precedence.
   */
  loadingContent?: ReactNode;
  /**
   * Render-prop slot shown ABOVE the canvas while phase === "loading".
   * When provided, SUPPRESSES the built-in "LOADING BAZAAR ENGINE..." overlay.
   * Receives current load progress (0–100).
   * BazaarScreen passes () => <DockingText /> here.
   */
  renderLoadingOverlay?: (ctx: { progress: number }) => ReactNode;
  /**
   * Render-prop slot shown ABOVE the canvas AFTER phase transitions to "running".
   * Consumer decides when to return null (typically after arrival fade completes).
   * BazaarScreen returns <ArrivalOverlay> while bazaarPhase === "arrived", null otherwise.
   */
  renderArrivalOverlay?: () => ReactNode;
  /**
   * Fires once on every internal phase transition.
   * Lets BazaarScreen layer its docking → arrived → running state machine on top.
   * Must be stabilized with useCallback in the consumer to avoid re-mounts.
   */
  onPhaseChange?: (phase: GodotCanvasPhase) => void;
}

export interface GodotCanvasHandle {
  canvas: HTMLCanvasElement | null;
}

// Internal alias — same shape as the exported GodotCanvasPhase.
type GodotState = GodotCanvasPhase;

// Godot engine types (minimal)
interface GodotEngine {
  startGame: (config: Record<string, unknown>) => Promise<void>;
}

interface GodotEngineClass {
  new (config: Record<string, unknown>): GodotEngine;
  isWebGLAvailable: () => boolean;
}

// ── Component ────────────────────────────────────────────────────────────────

const GodotCanvas = forwardRef<GodotCanvasHandle, GodotCanvasProps>(
  function GodotCanvas(
    {
      basePath = getDefaultGodotBaseUrl(),
      onLoadError,
      className,
      loadingContent,
      renderLoadingOverlay,
      renderArrivalOverlay,
      onPhaseChange,
    },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const engineRef = useRef<GodotEngine | null>(null);
    const [state, setState] = useState<GodotState>("idle");
    const [progress, setProgress] = useState(0);
    // Stable ref for onPhaseChange — prevents stale closure in loadEngine useCallback.
    const onPhaseChangeRef = useRef(onPhaseChange);
    useEffect(() => { onPhaseChangeRef.current = onPhaseChange; }, [onPhaseChange]);

    useImperativeHandle(ref, () => ({
      get canvas() { return canvasRef.current; },
    }));

    // Helper: set state AND notify consumer.
    const setPhase = useCallback((phase: GodotState) => {
      setState(phase);
      onPhaseChangeRef.current?.(phase);
    }, []);

    const loadEngine = useCallback(async () => {
      if (state === "loading" || state === "running") return;
      setPhase("loading");

      try {
        // Load the Godot engine script
        const scriptUrl = `${basePath}Bazaar.js`;
        await new Promise<void>((resolve, reject) => {
          // Check if already loaded
          if ((window as Record<string, unknown>).Engine) {
            resolve();
            return;
          }
          const script = document.createElement("script");
          script.src = scriptUrl;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error(`Failed to load ${scriptUrl}`));
          document.head.appendChild(script);
        });

        const EngineClass = (window as unknown as { Engine: GodotEngineClass }).Engine;
        if (!EngineClass) {
          throw new Error("Godot Engine class not found after script load");
        }

        if (!EngineClass.isWebGLAvailable()) {
          throw new Error("WebGL is not available in this browser");
        }

        const engine = new EngineClass({});
        engineRef.current = engine;

        await engine.startGame({
          canvas: canvasRef.current,
          executable: `${basePath}Bazaar`,
          mainPack: `${basePath}Bazaar.pck`,
          args: [],
          canvasResizePolicy: 2,
          experimentalVK: false,
          focusCanvas: true,
          gdextensionLibs: [],
          onProgress: (current: number, total: number) => {
            if (total > 0) setProgress(Math.round((current / total) * 100));
          },
        });

        setPhase("running");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setPhase("error");
        onLoadError?.(msg);
      }
    }, [basePath, onLoadError, state, setPhase]);

    // Auto-load on mount
    useEffect(() => {
      loadEngine();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
      <div
        ref={containerRef}
        className={`godot-container ${className ?? ""}`}
        style={{
          width: "100%",
          height: "100%",
          flex: "1 1 0",
          minHeight: 0,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <canvas
          ref={canvasRef}
          id="godot-canvas"
          tabIndex={-1}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            outline: "none",
            touchAction: "none",
            opacity: state === "running" ? 1 : 0,
            transition: "opacity 0.5s ease-in",
          }}
        />

        {state === "loading" && (
          <div className="godot-loading-overlay" style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            background: "#000", color: "var(--accent, #cc7000)",
            fontFamily: "monospace", fontSize: "0.9rem",
            zIndex: 1,
          }}>
            {renderLoadingOverlay
              ? renderLoadingOverlay({ progress })
              : loadingContent ?? (
              <>
                <p>LOADING BAZAAR ENGINE...</p>
                <div style={{
                  width: "200px", height: "4px", background: "#222",
                  borderRadius: "2px", marginTop: "1rem", overflow: "hidden",
                }}>
                  <div style={{
                    width: `${progress}%`, height: "100%",
                    background: "var(--accent, #cc7000)", transition: "width 0.2s",
                  }} />
                </div>
                <p style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "#666" }}>
                  {progress}%
                </p>
              </>
            )}
          </div>
        )}

        {state === "running" && renderArrivalOverlay && (
          <div
            className="godot-arrival-slot"
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 2,
              pointerEvents: "none",
            }}
          >
            {renderArrivalOverlay()}
          </div>
        )}

        {state === "error" && (
          <div className="godot-error-overlay" style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.9)", color: "#f88",
            fontFamily: "monospace", fontSize: "0.85rem",
          }}>
            <p>ENGINE LOAD FAILED</p>
            <button
              onClick={loadEngine}
              style={{
                marginTop: "1rem", padding: "0.5rem 1rem",
                background: "transparent", border: "1px solid #f88",
                color: "#f88", cursor: "pointer", fontFamily: "monospace",
              }}
            >
              RETRY
            </button>
          </div>
        )}
      </div>
    );
  },
);

export default GodotCanvas;
