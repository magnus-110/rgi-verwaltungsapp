/**
 * resolveDmsFolder
 *
 * Liefert (und legt bei Bedarf an) die `building_file_categories`-ID für
 * einen der DMS-Standardordner einer Liegenschaft. Strukturen:
 *
 *   Finanzen
 *     ├── Gesamtabrechnungen
 *     ├── Einzelabrechnungen
 *     ├── Wirtschaftspläne
 *     │     └── Einzel
 *     ├── §35a Bescheinigungen
 *     ├── Sammelberichte
 *     └── Vermögensberichte
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

const FOLDER_MAP: Record<DmsFolderKey, { parent: string; child?: string; sub?: string }> = {
  gesamtabrechnung:        { parent: "Finanzen", child: "Gesamtabrechnungen" },
  einzelabrechnung:        { parent: "Finanzen", child: "Einzelabrechnungen" },
  wirtschaftsplan_gesamt:  { parent: "Finanzen", child: "Wirtschaftspläne" },
  wirtschaftsplan_einzel:  { parent: "Finanzen", child: "Wirtschaftspläne", sub: "Einzel" },
  paragraph_35a:           { parent: "Finanzen", child: "§35a Bescheinigungen" },
  sammelbericht:           { parent: "Finanzen", child: "Sammelberichte" },
  vermoegensbericht:       { parent: "Finanzen", child: "Vermögensberichte" },
};

async function findOrCreateCategory(
  buildingId: string,
  name: string,
  parentId: string | null,
  managementMode: "weg" | "rent",
): Promise<string> {
  // Lookup: building+name+parent (case-insensitive)
  const q = supabase
    .from("building_file_categories")
    .select("id, name")
    .eq("building_id", buildingId)
    .ilike("name", name)
    .limit(20);
  const { data: existing } = await q;
  const match = (existing || []).find((r: any) => {
    // parent_id can't be filtered via .is() and .eq() conditionally in one chain → filter client-side
    return true;
  });
  if (existing && existing.length) {
    // Fetch parent_id details
    const { data: rows } = await supabase
      .from("building_file_categories")
      .select("id, parent_id")
      .in("id", existing.map((r: any) => r.id));
    const hit = (rows || []).find((r: any) =>
      parentId === null ? r.parent_id == null : r.parent_id === parentId,
    );
    if (hit) return hit.id;
  }

  // Insert
  const { data: ins, error } = await supabase
    .from("building_file_categories")
    .insert({
      name,
      parent_id: parentId,
      building_id: buildingId,
      management_mode: managementMode,
    } as any)
    .select("id")
    .single();
  if (error || !ins) throw new Error(`Ordner "${name}" konnte nicht angelegt werden: ${error?.message || "unbekannt"}`);
  return (ins as any).id;
}

export async function resolveDmsFolder(
  buildingId: string,
  key: DmsFolderKey,
  managementMode: "weg" | "rent" = "weg",
): Promise<string> {
  const spec = FOLDER_MAP[key];
  const parentId = await findOrCreateCategory(buildingId, spec.parent, null, managementMode);
  if (!spec.child) return parentId;
  const childId = await findOrCreateCategory(buildingId, spec.child, parentId, managementMode);
  if (!spec.sub) return childId;
  return await findOrCreateCategory(buildingId, spec.sub, childId, managementMode);
}
