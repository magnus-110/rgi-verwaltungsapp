import { supabase } from "@/integrations/supabase/client";

/**
 * Beschluss-Sammlung neu uebertragen, ohne Vorgaenge zu verlieren.
 *
 * Die Uebertragung loescht die Beschluesse einer Versammlung und legt sie neu an.
 * Frueher gingen dabei die Verknuepfungen zu Vorgaengen verloren, und die Datenbank
 * legte fuer jeden umzusetzenden Beschluss erneut einen Vorgang an (Dubletten).
 * Hier merken wir uns vor dem Loeschen, welcher TOP an welchem Vorgang hing.
 */
export interface BisherigeUmsetzung {
  is_actionable: boolean;
  case_id: string | null;
  case_auto_created: boolean;
}

export async function bisherigeUmsetzungen(meetingId: string): Promise<Map<string, BisherigeUmsetzung>> {
  const { data } = await supabase
    .from("etv_resolutions")
    .select("agenda_item_id, is_actionable, case_id, case_auto_created")
    .eq("meeting_id", meetingId);
  const karte = new Map<string, BisherigeUmsetzung>();
  for (const r of (data || []) as any[]) {
    if (r.agenda_item_id) {
      karte.set(r.agenda_item_id, {
        is_actionable: !!r.is_actionable,
        case_id: r.case_id ?? null,
        case_auto_created: !!r.case_auto_created,
      });
    }
  }
  return karte;
}

/**
 * Felder fuer den neu angelegten Beschluss: bleibt mit dem bisherigen Vorgang verbunden,
 * sonst der beim TOP gewaehlte Vorgang; ohne beides legt die Datenbank einen neuen an.
 * War der Beschluss nachtraeglich in der Beschluss-Sammlung als umzusetzen markiert,
 * bleibt das erhalten.
 */
export function umsetzungFelder(item: any, bisher?: BisherigeUmsetzung) {
  const istUmzusetzen = !!item.is_actionable || !!bisher?.is_actionable;
  if (!istUmzusetzen) return { is_actionable: false };
  if (bisher?.case_id) {
    return { is_actionable: true, case_id: bisher.case_id, case_auto_created: bisher.case_auto_created };
  }
  if (item.case_id) {
    return { is_actionable: true, case_id: item.case_id, case_auto_created: false };
  }
  return { is_actionable: true };
}
