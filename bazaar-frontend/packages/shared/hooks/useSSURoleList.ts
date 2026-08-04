// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// AMENDMENT (OS-54-followup Phase 2): signature changed from useSSURoleList()
// to useSSURoleList(ssuId: string | null). memberRegistryId now resolved via
// useSSUSharedObjects(ssuId) instead of env-baked MEMBER_REGISTRY_ID.
// All call sites updated to pass SSU_OBJECT_ID (or null for shared contexts).

import { useState, useEffect, useCallback } from "react";
import { useSSUSharedObjects } from "./bazaarcore/governance-resolution-hooks";
import { ROLE_LABEL } from "@bazaar/shared/constants";
import type { Role } from "@bazaar/shared/types";

const RPC =
  (import.meta.env.VITE_SUI_RPC_ENDPOINT as string | undefined) ??
  "https://api.zan.top/public/sui-testnet";

async function rpc(method: string, params: unknown[]): Promise<any> {
  const resp = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!resp.ok) throw new Error(`RPC HTTP ${resp.status}`);
  const data = await resp.json();
  if (data?.error) throw new Error(data.error.message);
  return data.result;
}

interface SSURoleEntry {
  address: string;
  role: number;
  label: Role;
}

export function useSSURoleList(ssuId: string | null) {
  const [entries, setEntries] = useState<SSURoleEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const { data: sharedObjs } = useSSUSharedObjects(ssuId);
  const memberRegistryId = sharedObjs?.memberRegistryId ?? null;

  const fetchRoles = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    // If ssuId is absent or shared objects not yet resolved, emit empty state.
    if (!ssuId || !memberRegistryId) {
      setEntries([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        // Step 1: Get MemberRegistry object to find the members table UID
        const registry = await rpc("sui_getObject", [
          memberRegistryId,
          { showContent: true },
        ]);
        const fields = registry?.data?.content?.fields ?? {};
        const tableId: string | undefined = fields.members?.fields?.id?.id;
        if (!tableId) {
          if (!cancelled) setEntries([]);
          return;
        }

        // Step 2: Enumerate dynamic fields on the table UID (up to 200 entries)
        const dynResult = await rpc("suix_getDynamicFields", [tableId, null, 200]);
        const dynFields: any[] = dynResult?.data ?? [];

        // Step 3: Fetch each dynamic field object to read the role value
        const detailed = await Promise.all(
          dynFields.map(async (df: any) => {
            const addr = String(df.name?.value ?? "");
            try {
              const fieldObj = await rpc("suix_getDynamicFieldObject", [
                tableId,
                df.name,
              ]);
              // C-01 FIX: value is MemberEntry struct, read ssu_role field
              const val = Number(
                fieldObj?.data?.content?.fields?.value?.fields?.ssu_role ?? 0,
              );
              return {
                address: addr,
                role: val,
                label: (ROLE_LABEL[val] ?? "Stranger") as Role,
              };
            } catch {
              return {
                address: addr,
                role: 0,
                label: "Stranger" as Role,
              };
            }
          }),
        );

        if (!cancelled) setEntries(detailed);
      } catch (e) {
        console.warn("[useSSURoleList] RPC fetch failed:", e);
        if (!cancelled) setEntries([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [memberRegistryId, tick]);

  // Poll so newly-registered users (and role changes made elsewhere) surface
  // without a manual refresh. 15s matches useSSUGovernance's cadence.
  useEffect(() => {
    if (!ssuId || !memberRegistryId) return;
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, [ssuId, memberRegistryId]);

  const roleOf = useCallback(
    (addr: string): Role => {
      const entry = entries.find((e) => e.address === addr);
      return entry?.label ?? "Stranger";
    },
    [entries],
  );

  return { entries, roleOf, isLoading, refetch: fetchRoles };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
