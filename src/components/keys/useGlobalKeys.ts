import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  KeyItem,
  KeyManufacturer,
  KeyStorageLocation,
  KeySubjectType,
  KeyTag,
  KeyType,
} from "@/components/buildings/keys/types";

export interface GlobalKeyTag extends KeyTag {
  buildings: { id: string; name: string; building_code: string | null } | null;
  keys: KeyItem[];
}

/** Query-Keys der gebäudeübergreifenden Sicht. */
export const GLOBAL_TAGS_KEY = ["keys-global-tags"] as const;
export const GLOBAL_LOANS_KEY = ["keys-global-open-loans"] as const;
export const GLOBAL_EVENTS_KEY = ["keys-global-events"] as const;
export const GLOBAL_SETTINGS_KEY = ["keys-global-property-settings"] as const;
export const GLOBAL_PLANS_KEY = ["keys-global-closing-plans"] as const;
export const GLOBAL_BUILDINGS_KEY = ["keys-global-buildings"] as const;

/**
 * Die App setzt global staleTime = 2 Minuten. Die Gebäude-Dialoge invalidieren
 * nur ihre eigenen, gebäudebezogenen Keys – ohne diese Option würde die globale
 * Seite nach einer Ausgabe im Gebäude-Tab bis zu zwei Minuten veraltete Daten
 * zeigen. Die Datenmenge ist klein genug, um beim Mount immer neu zu laden.
 */
const freshOnMount = { staleTime: 0, refetchOnMount: "always" } as const;

export const useInvalidateGlobalKeys = () => {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: GLOBAL_TAGS_KEY });
    qc.invalidateQueries({ queryKey: GLOBAL_LOANS_KEY });
    qc.invalidateQueries({ queryKey: GLOBAL_EVENTS_KEY });
    qc.invalidateQueries({ queryKey: GLOBAL_SETTINGS_KEY });
    qc.invalidateQueries({ queryKey: GLOBAL_PLANS_KEY });
    // Dashboard-Widget und die Gebäude-Tabs mitziehen
    qc.invalidateQueries({ queryKey: ["outstanding-key-loans"] });
  };
};

export const useGlobalKeyTags = () =>
  useQuery<GlobalKeyTag[]>({
    queryKey: GLOBAL_TAGS_KEY,
    ...freshOnMount,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("key_tags")
        .select("*, buildings(id, name, building_code), keys(*)")
        .order("tag_number");
      if (error) throw error;
      return (data ?? []) as unknown as GlobalKeyTag[];
    },
  });

export const useGlobalOpenLoans = () =>
  useQuery<any[]>({
    queryKey: GLOBAL_LOANS_KEY,
    ...freshOnMount,
    queryFn: async () =>
      ((await supabase.from("key_loans").select("*").eq("status", "open")).data as any[]) ?? [],
  });

export const useGlobalKeyEvents = () =>
  useQuery<any[]>({
    queryKey: GLOBAL_EVENTS_KEY,
    ...freshOnMount,
    queryFn: async () =>
      ((
        await supabase
          .from("key_events")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200)
      ).data as any[]) ?? [],
  });

export const useGlobalPropertySettings = () =>
  useQuery<any[]>({
    queryKey: GLOBAL_SETTINGS_KEY,
    ...freshOnMount,
    queryFn: async () =>
      ((await supabase.from("key_property_settings").select("*")).data as any[]) ?? [],
  });

/** Schließplan-Dateien aller Liegenschaften, im Detailpanel nach building_id gefiltert. */
export const useGlobalClosingPlanFiles = () =>
  useQuery<any[]>({
    queryKey: GLOBAL_PLANS_KEY,
    ...freshOnMount,
    queryFn: async () =>
      ((
        await supabase
          .from("key_closing_plan_files" as any)
          .select("*")
          .order("created_at", { ascending: false })
      ).data as any[]) ?? [],
  });

export const useKeyBuildings = () =>
  useQuery<any[]>({
    queryKey: GLOBAL_BUILDINGS_KEY,
    queryFn: async () =>
      ((await supabase.from("buildings").select("id, name, building_code").order("name")).data as any[]) ??
      [],
  });

// ── Stammdaten: bewusst dieselben Query-Keys wie im Gebäude-Tab, damit der Cache geteilt wird ──

export const useKeyTypes = () =>
  useQuery<KeyType[]>({
    queryKey: ["key-types"],
    queryFn: async () =>
      (await supabase.from("key_types").select("*").eq("is_active", true).order("sort_order")).data ?? [],
  });

export const useKeyStorageLocations = () =>
  useQuery<KeyStorageLocation[]>({
    queryKey: ["key-storage-locations"],
    queryFn: async () =>
      (await supabase.from("key_storage_locations").select("*").eq("is_active", true).order("sort_order"))
        .data ?? [],
  });

export const useKeySubjectTypes = () =>
  useQuery<KeySubjectType[]>({
    queryKey: ["key-subject-types"],
    queryFn: async () =>
      (await supabase.from("key_subject_types").select("*").eq("is_active", true).order("sort_order"))
        .data ?? [],
  });

export const useKeyManufacturers = () =>
  useQuery<KeyManufacturer[]>({
    queryKey: ["key-manufacturers"],
    queryFn: async () =>
      (await supabase.from("key_manufacturers").select("*").eq("is_active", true).order("name")).data ?? [],
  });

export const useKeyGlobalSettings = () =>
  useQuery<any>({
    queryKey: ["key-global-settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("key_global_settings" as any)
        .select("*")
        .eq("id", "singleton")
        .maybeSingle();
      return data as any;
    },
  });
