import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Datenzugriff für die Eigentümer-Umfrage.
 * - Eigentümer: aktuelle offene Umfrage + eigene Stimmen laden, Stimmen speichern.
 * - Verwaltung: Ergebnisse (Kopf + MEA) inkl. automatischer Einstufung.
 */

export type SurveyChoice = "ja" | "neutral" | "nein";

export interface SurveyItem {
  id: string;
  survey_id: string;
  position: number;
  group_label: string | null;
  title: string;
  explanation: string;
  cost_tier: string | null;
  is_safety: boolean;
  followup_question: string | null;
  followup_options: string[] | null;
  images: { path: string; caption: string | null; url: string | null }[];
}

export interface OwnerVote {
  item_id: string;
  choice: SurveyChoice | null;
  followup_choice: number | null;
  urgent: boolean;
  comment: string | null;
}

const SIGNED_URL_TTL = 60 * 60; // 1 h

/** Signierte URLs für private Bild-Pfade erzeugen. */
async function signImages(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await (supabase as any).storage.from("survey-images").createSignedUrls(paths, SIGNED_URL_TTL);
  const map: Record<string, string> = {};
  (data || []).forEach((d) => {
    if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
  });
  return map;
}

/** Lädt die aktuell offene Umfrage für die Gebäude des eingeloggten Eigentümers. */
export function useOwnerSurvey(userId?: string) {
  return useQuery({
    queryKey: ["owner-survey", userId],
    enabled: !!userId,
    queryFn: async () => {
      // offene Umfrage der eigenen Gebäude (RLS filtert automatisch)
      const { data: survey } = await (supabase as any)
        .from("surveys")
        .select("id, building_id, title, description, status, closes_at, buildings(name)")
        .eq("status", "open")
        .order("opens_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!survey) return null;

      const { data: rawItems } = await (supabase as any)
        .from("survey_items")
        .select("*, survey_item_images(storage_path, caption, position)")
        .eq("survey_id", survey.id)
        .order("position", { ascending: true });

      // Bilder signieren
      const allPaths = (rawItems || []).flatMap((it: any) =>
        (it.survey_item_images || []).map((im: any) => im.storage_path),
      );
      const signed = await signImages(allPaths);

      const items: SurveyItem[] = (rawItems || []).map((it: any) => ({
        id: it.id,
        survey_id: it.survey_id,
        position: it.position,
        group_label: it.group_label,
        title: it.title,
        explanation: it.explanation,
        cost_tier: it.cost_tier,
        is_safety: it.is_safety,
        followup_question: it.followup_question,
        followup_options: it.followup_options,
        images: (it.survey_item_images || [])
          .sort((a: any, b: any) => a.position - b.position)
          .map((im: any) => ({
            path: im.storage_path,
            caption: im.caption,
            url: signed[im.storage_path] ?? null,
          })),
      }));

      // eigene bereits abgegebene Stimmen
      const { data: votes } = await (supabase as any)
        .from("survey_votes")
        .select("item_id, choice, followup_choice, urgent, comment")
        .eq("survey_id", survey.id);

      // eigenes MEA-Stimmgewicht (informativ)
      const { data: mea } = await (supabase as any).rpc("current_owner_mea", { _building: survey.building_id });

      return {
        survey,
        items,
        votes: (votes || []) as OwnerVote[],
        ownerMea: Number(mea ?? 0),
      };
    },
  });
}

/** Speichert (Upsert) eine Stimme des Eigentümers. contact_id/mea werden serverseitig gesetzt. */
export function useSaveVote(surveyId: string, userId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: OwnerVote & { survey_id: string }) => {
      const { error } = await (supabase as any)
        .from("survey_votes")
        .upsert(
          {
            survey_id: v.survey_id,
            item_id: v.item_id,
            choice: v.choice,
            followup_choice: v.followup_choice,
            urgent: v.urgent,
            comment: v.comment,
          },
          { onConflict: "item_id,contact_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner-survey", userId] }),
  });
}

// ---------------- Verwaltung ----------------

export type Einstufung = "pflicht" | "antrag" | "diskussion" | "zurueckgestellt";

export interface ItemResult {
  item_id: string;
  title: string;
  is_safety: boolean;
  head_ja: number;
  head_neutral: number;
  head_nein: number;
  mea_ja: number;
  mea_neutral: number;
  mea_nein: number;
  urgent_count: number;
  jaPctMea: number;         // Ja-Anteil bezogen auf teilnehmendes MEA
  einstufung: Einstufung;
}

export function classify(isSafety: boolean, jaPctMea: number): Einstufung {
  if (isSafety) return "pflicht";
  if (jaPctMea >= 50) return "antrag";
  if (jaPctMea >= 25) return "diskussion";
  return "zurueckgestellt";
}

/** Lädt Ergebnisse einer Umfrage inkl. MEA-Auswertung und Einstufung (nur Verwaltung). */
export function useSurveyResults(surveyId?: string, buildingId?: string) {
  return useQuery({
    queryKey: ["survey-results", surveyId],
    enabled: !!surveyId && !!buildingId,
    queryFn: async () => {
      const { data: rows } = await (supabase as any)
        .from("survey_item_results")
        .select("*")
        .eq("survey_id", surveyId);

      // Gesamt-MEA des Gebäudes (für Prozentangaben / Beteiligung)
      const { data: totalRow } = await (supabase as any).rpc("building_total_mea", { _building: buildingId });
      const totalMea = Number(totalRow ?? 0);

      const results: ItemResult[] = (rows || []).map((r: any) => {
        const part = Number(r.mea_ja) + Number(r.mea_neutral) + Number(r.mea_nein);
        const jaPct = part > 0 ? Math.round((Number(r.mea_ja) / part) * 100) : 0;
        return {
          item_id: r.item_id,
          title: r.title,
          is_safety: r.is_safety,
          head_ja: r.head_ja,
          head_neutral: r.head_neutral,
          head_nein: r.head_nein,
          mea_ja: Number(r.mea_ja),
          mea_neutral: Number(r.mea_neutral),
          mea_nein: Number(r.mea_nein),
          urgent_count: r.urgent_count,
          jaPctMea: jaPct,
          einstufung: classify(r.is_safety, jaPct),
        };
      });

      const participatingMea = results.reduce((s, r) => Math.max(s, r.mea_ja + r.mea_neutral + r.mea_nein), 0);
      const beteiligungPct = totalMea > 0 ? Math.round((participatingMea / totalMea) * 100) : 0;

      return { results, totalMea, participatingMea, beteiligungPct };
    },
  });
}
