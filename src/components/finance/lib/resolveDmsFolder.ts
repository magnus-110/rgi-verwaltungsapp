/**
 * resolveDmsFolder
 *
 * Liefert die `building_file_categories`-ID für einen der Standard-DMS-Ordner
 * einer Liegenschaft. Die Soll-Struktur wird per `ensure_stammakte_categories`
 * RPC sichergestellt, danach erfolgt der Lookup über den (eindeutigen) Slug.
 *
 * Soll-Struktur (Auszug, relevant für Finance):
 *   Jahresbericht
 *     ├── Gesamtabrechnung            (jahresbericht-gesamtabrechnung)
 *     ├── Einzelabrechnung            (jahresbericht-einzelabrechnung)
 *     ├── Gesamtwirtschaftsplan       (jahresbericht-gesamt-wp)
 *     ├── Einzelwirtschaftsplan       (jahresbericht-einzel-wp)
 *     ├── Vermögensbericht            (jahresbericht-vermoegen)
 *     ├── §35a Bescheinigung          (jahresbericht-35a)
 *     └── Sammelberichte              (jahresbericht-sammelberichte)
 */
import { supabase } from "@/integrations/supabase/client";

export type DmsFolderKey =
  | "gesamtabrechnung"
  | "einzelabrechnung"
  | "wirtschaftsplan_gesamt"
  | "wirtschaftsplan_einzel"
  | "paragraph_35a"
  | "sammelbericht"
  | "vermoegensbericht";

const SLUG_MAP: Record<DmsFolderKey, string> = {
  gesamtabrechnung:       "jahresbericht-gesamtabrechnung",
  einzelabrechnung:       "jahresbericht-einzelabrechnung",
  wirtschaftsplan_gesamt: "jahresbericht-gesamt-wp",
  wirtschaftsplan_einzel: "jahresbericht-einzel-wp",
  paragraph_35a:          "jahresbericht-35a",
  sammelbericht:          "jahresbericht-sammelberichte",
  vermoegensbericht:      "jahresbericht-vermoegen",
};

export async function resolveDmsFolder(
  buildingId: string,
  key: DmsFolderKey,
  _managementMode: "weg" | "rent" = "weg",
): Promise<string> {
  // Stelle sicher, dass die Soll-Struktur existiert (idempotent)
  await supabase.rpc("ensure_stammakte_categories", { p_building_id: buildingId });

  const slug = SLUG_MAP[key];
  const { data, error } = await supabase
    .from("building_file_categories")
    .select("id")
    .eq("building_id", buildingId)
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) {
    throw new Error(
      `DMS-Ordner "${slug}" für Gebäude ${buildingId} nicht gefunden: ${error?.message || "leer"}`,
    );
  }
  return (data as any).id;
}
