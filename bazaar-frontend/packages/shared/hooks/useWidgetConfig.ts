// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { WIDGET_CONFIG_ID } from "@bazaar/shared/constants";
import { debug } from "@bazaar/shared/utils/debug";

const RPC =
  (import.meta.env.VITE_SUI_RPC_ENDPOINT as string | undefined) ??
  "https://api.zan.top/public/sui-testnet";

export interface UseWidgetConfigResult {
  enabledWidgets: boolean[];
  serverUrl:      string;
  loading:        boolean;
  refetch:        () => void;
}

/**
 * Fetches WidgetConfig state from chain via direct RPC (avoids GraphQL indexer lag).
 *
 * @param widgetConfigId — Optional per-SSU override. When omitted, falls back to the
 *   global WIDGET_CONFIG_ID env var (original behavior — backward-compatible).
 *   Pass the widgetConfigId from useSSUSharedObjects(ssuId) for per-SSU contexts
 *   (e.g., WidgetsSubTab in SSUSuperAdminTab).
 */
export function useWidgetConfig(widgetConfigId?: string): UseWidgetConfigResult {
  const [enabledWidgets, setEnabledWidgets] = useState<boolean[]>([false, false, false, false]);
  const [serverUrl, setServerUrl]           = useState<string>("");
  const [loading, setLoading]               = useState(true);
  const [tick, setTick]                     = useState(0);

  const refetch = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const targetId = widgetConfigId ?? WIDGET_CONFIG_ID;
      if (!targetId) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        // Use RPC fullnode directly to avoid GraphQL indexer lag after toggle
        const resp = await fetch(RPC, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0", id: 1,
            method: "sui_getObject",
            params: [targetId, { showContent: true }],
          }),
        });
        if (!resp.ok) throw new Error(`RPC HTTP ${resp.status}`);
        const data = await resp.json();
        if (data?.error) throw new Error(data.error.message);

        const fields = data?.result?.data?.content?.fields ?? {};
        const rawWidgets: any[] = fields?.enabled_widgets ?? [];
        const parsed = rawWidgets.map((v: any) => v === true || v === "true");

        // server_url is a String field — Sui RPC returns it as a plain JSON string
        const parsedServerUrl: string = (fields?.server_url as string | undefined) ?? "";

        debug("[useWidgetConfig] RPC fields:", fields, "parsed:", parsed);

        if (!cancelled) {
          setEnabledWidgets(parsed.length > 0 ? parsed : [false, false, false, false]);
          setServerUrl(parsedServerUrl);
          setLoading(false);
        }
      } catch (e) {
        console.warn("[useWidgetConfig] RPC load failed:", e);
        if (!cancelled) {
          setEnabledWidgets([false, false, false, false]);
          setServerUrl("");
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [tick, widgetConfigId]);

  return { enabledWidgets, serverUrl, loading, refetch };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
