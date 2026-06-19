import { supabase } from "@/integrations/supabase/client";
import type { TakeoverQuestion } from "./questions";

export interface AnswerValue {
  value_text?: string | null;
  value_number?: number | null;
  value_date?: string | null;
  value_bool?: boolean | null;
  notes?: string | null;
}

/** Wendet die Antwort direkt im Zielsystem an. Liefert kurzen Audit-String zurück. */
export async function applyAnswer(
  buildingId: string,
  q: TakeoverQuestion,
  v: AnswerValue,
): Promise<string> {
  switch (q.apply) {
    case "buildings.heating_type": {
      const val = (v.value_text ?? "").trim();
      if (!val) throw new Error("Bitte zuerst die Heizungsart eintragen.");
      const { error } = await supabase.from("buildings").update({ heating_type: val }).eq("id", buildingId);
      if (error) throw error;
      return `buildings.heating_type=${val}`;
    }
    case "buildings.creditor_id": {
      const val = (v.value_text ?? "").trim();
      if (!val) throw new Error("Bitte Gläubiger-ID eintragen.");
      const { error } = await supabase.from("buildings").update({ creditor_id: val } as any).eq("id", buildingId);
      if (error) throw error;
      return `buildings.creditor_id=${val}`;
    }
    case "buildings.etv_default_location": {
      const val = (v.value_text ?? "").trim();
      if (!val) throw new Error("Bitte Versammlungsort eintragen.");
      const { error } = await supabase.from("buildings").update({ etv_default_location: val } as any).eq("id", buildingId);
      if (error) throw error;
      return `buildings.etv_default_location=${val}`;
    }
    case "buildings.fiscal_year": {
      // Format "TT.MM.-TT.MM." parsen → start_month/day
      const raw = (v.value_text ?? "").trim();
      const m = raw.match(/^(\d{1,2})\.(\d{1,2})\.?\s*[–-]\s*(\d{1,2})\.(\d{1,2})/);
      if (!m) throw new Error("Format: TT.MM.–TT.MM. (z. B. 01.01.–31.12.)");
      const day = Number(m[1]);
      const month = Number(m[2]);
      const { error } = await supabase
        .from("buildings")
        .update({ fiscal_year_start_day: day, fiscal_year_start_month: month } as any)
        .eq("id", buildingId);
      if (error) throw error;
      return `buildings.fiscal_year_start=${day}.${month}.`;
    }
    case "buildings.general_notes": {
      const val = (v.value_text ?? "").trim();
      const { error } = await supabase.from("buildings").update({ general_notes: val } as any).eq("id", buildingId);
      if (error) throw error;
      return `buildings.general_notes`;
    }
    case "service_provider": {
      const name = (v.value_text ?? "").trim();
      if (!name) throw new Error("Bitte Name / Firma eintragen.");
      if (!q.providerCategory) throw new Error("Keine Kategorie hinterlegt.");
      const { data: user } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("building_service_providers")
        .insert({
          building_id: buildingId,
          name,
          category: q.providerCategory,
          notes: v.notes ?? null,
          source: "takeover",
          created_by: user.user?.id ?? null,
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      return `building_service_providers:${(data as any).id}`;
    }
    case "note": {
      const text = formatNoteContent(q, v);
      const { data: user } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("building_notes")
        .insert({
          building_id: buildingId,
          title: `Übernahme: ${q.label}`,
          content: text,
          category: "Übernahme",
          created_by: user.user?.id ?? null,
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      return `building_notes:${(data as any).id}`;
    }
    default:
      throw new Error("Für diese Frage ist keine automatische Übernahme hinterlegt.");
  }
}

function formatNoteContent(q: TakeoverQuestion, v: AnswerValue): string {
  const parts: string[] = [];
  if (v.value_text) parts.push(v.value_text);
  if (v.value_number !== null && v.value_number !== undefined) parts.push(String(v.value_number));
  if (v.value_date) parts.push(v.value_date);
  if (v.value_bool !== null && v.value_bool !== undefined) parts.push(v.value_bool ? "Ja" : "Nein");
  if (v.notes) parts.push(`Notiz: ${v.notes}`);
  return parts.join(" · ") || "(keine Angabe)";
}
