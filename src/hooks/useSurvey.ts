import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Datenzugriff für die Eigentümer-Umfrage.
 * - Eigentümer: alle sichtbaren Umfragen der eigenen Gebäude laden, einzelne Umfrage öffnen, Stimmen speichern.
 * - Verwaltung: Ergebnisse (Kopf + MEA) inkl. automatischer Einstufung.
 */

export type SurveyChoice = "ja" | "neutral" | "nein";
export type SurveyItemType = "question" | "info";

export interface SurveyItem {
  id: string;
  survey_id: string;
  position: number;
  group_label: string | null;
  title: string;
  explanation: string;
  cost_tier: string | null;
  is_safety: boolean;
  item_type: SurveyItemType;
  depends_on_item_id: string | null;
  depends_on_choice: SurveyChoice | null;
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

export interface OwnerSurveySummary {
  id: string;
  building_id: string;
  title: string;
  description: string | null;
  closes_at: string | null;
  building_name: string | null;
  total_items: number;
  answered_items: number;
}

const SIGNED_URL_TTL = 60 * 60;

async function signImages(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await (supabase as any).storage.from("survey-images").createSignedUrls(paths, SIGNED_URL_TTL);
  const map: Record<string, string> = {};
  (data || []).forEach((d: any) => {
    if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
  });
  return map;
}

/** Liste aller für den Eigentümer sichtbaren, offenen Umfragen (RLS filtert). */
export function useOwnerVisibleSurveys(userId?: string) {
  return useQuery({
    queryKey: ["owner-visible-surveys", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: surveys } = await (supabase as any)
        .from("surveys")
        .select("id, building_id, title, description, closes_at, buildings(name)")
        .order("opens_at", { ascending: false });
      const list = (surveys || []) as any[];
      if (!list.length) return [] as OwnerSurveySummary[];

      const ids = list.map((s) => s.id);
      const { data: items } = await (supabase as any)
        .from("survey_items")
        .select("id, survey_id, is_safety, item_type")
        .in("survey_id", ids);
      const { data: votes } = await (supabase as any)
        .from("survey_votes")
        .select("survey_id, item_id")
        .in("survey_id", ids);

      const totalBySurvey = new Map<string, number>();
      (items || []).forEach((it: any) => {
        if (it.item_type === "info" || it.is_safety) return;
        totalBySurvey.set(it.survey_id, (totalBySurvey.get(it.survey_id) || 0) + 1);
      });
      const answeredBySurvey = new Map<string, number>();
      (votes || []).forEach((v: any) => {
        answeredBySurvey.set(v.survey_id, (answeredBySurvey.get(v.survey_id) || 0) + 1);
      });

      return list.map((s) => ({
        id: s.id,
        building_id: s.building_id,
        title: s.title,
        description: s.description,
        closes_at: s.closes_at,
        building_name: s.buildings?.name ?? null,
        total_items: totalBySurvey.get(s.id) || 0,
        answered_items: answeredBySurvey.get(s.id) || 0,
      })) as OwnerSurveySummary[];
    },
  });
}

/** Kennzeichen für Menü: hat der Eigentümer aktuell sichtbare Umfragen? */
export function useHasVisibleSurveys(userId?: string) {
  const q = useOwnerVisibleSurveys(userId);
  return { hasSurveys: (q.data?.length ?? 0) > 0, isLoading: q.isLoading };
}

/** Lädt eine konkrete Umfrage (Items, Bilder, eigene Stimmen, eigenes MEA). */
export function useOwnerSurvey(surveyId?: string, userId?: string) {
  return useQuery({
    queryKey: ["owner-survey", surveyId, userId],
    enabled: !!surveyId && !!userId,
    queryFn: async () => {
      const { data: survey } = await (supabase as any)
        .from("surveys")
        .select("id, building_id, title, description, status, closes_at, welcome_title, welcome_message, end_title, end_message, safety_notice, buildings(name)")
        .eq("id", surveyId)
        .maybeSingle();
      if (!survey) return null;

      const { data: rawItems } = await (supabase as any)
        .from("survey_items")
        .select("*, survey_item_images(storage_path, caption, position)")
        .eq("survey_id", survey.id)
        .order("position", { ascending: true });

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
        item_type: (it.item_type ?? "question") as SurveyItemType,
        depends_on_item_id: it.depends_on_item_id ?? null,
        depends_on_choice: it.depends_on_choice ?? null,
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

      const { data: votes } = await (supabase as any)
        .from("survey_votes")
        .select("item_id, choice, followup_choice, urgent, comment")
        .eq("survey_id", survey.id);

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner-survey", surveyId] });
      qc.invalidateQueries({ queryKey: ["owner-visible-surveys", userId] });
    },
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
  jaPctMea: number;
  einstufung: Einstufung;
}

export function classify(isSafety: boolean, jaPctMea: number): Einstufung {
  if (isSafety) return "pflicht";
  if (jaPctMea >= 50) return "antrag";
  if (jaPctMea >= 25) return "diskussion";
  return "zurueckgestellt";
}

export function useSurveyResults(surveyId?: string, buildingId?: string) {
  return useQuery({
    queryKey: ["survey-results", surveyId],
    enabled: !!surveyId && !!buildingId,
    queryFn: async () => {
      const { data: rows } = await (supabase as any)
        .from("survey_item_results")
        .select("*")
        .eq("survey_id", surveyId);

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

      const participatingMea = results.reduce(
        (s, r) => Math.max(s, r.mea_ja + r.mea_neutral + r.mea_nein),
        0,
      );
      const beteiligungPct = totalMea > 0 ? Math.round((participatingMea / totalMea) * 100) : 0;

      return { results, totalMea, participatingMea, beteiligungPct };
    },
  });
}

/** Kosten-Skala 1–4 als € / €€ / €€€ / €€€€ – zentraler Renderer. */
export function costTierSymbol(tier: string | null | undefined): string {
  if (!tier || tier === "offen") return "€ offen";
  const parts = tier.split("–").map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));
  if (!parts.length) return "€ offen";
  const hi = Math.min(4, Math.max(1, parts[parts.length - 1]));
  const lo = Math.min(4, Math.max(1, parts[0]));
  if (parts.length > 1 && lo !== hi) return "€".repeat(lo) + " – " + "€".repeat(hi);
  return "€".repeat(hi);
}

// ---------------- Einzelstimmen (Verwaltung) ----------------

export interface VoteDetail {
  contact_id: string;
  name: string;
  unit_number: string | null;
  mea: number;
  choice: SurveyChoice | null;
  followup_text: string | null;
  urgent: boolean;
  comment: string | null;
}

/** Einzelstimmen je Umfragepunkt (nur Verwaltung – RLS erlaubt Vollzugriff via is_rgi_staff()). */
export function useSurveyVoteDetails(surveyId?: string, buildingId?: string) {
  return useQuery({
    queryKey: ["survey-vote-details", surveyId],
    enabled: !!surveyId,
    queryFn: async () => {
      const { data: votes } = await (supabase as any)
        .from("survey_votes")
        .select("item_id, contact_id, choice, followup_choice, urgent, comment, mea_weight")
        .eq("survey_id", surveyId);
      const rows = (votes || []) as any[];
      if (!rows.length) return {} as Record<string, VoteDetail[]>;

      const contactIds = Array.from(new Set(rows.map((r) => r.contact_id).filter(Boolean)));
      const { data: contacts } = await (supabase as any)
        .from("contacts")
        .select("id, first_name, last_name, company_name")
        .in("id", contactIds);
      const nameById = new Map<string, string>();
      (contacts || []).forEach((c: any) => {
        const n = [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.company_name || "Unbekannt";
        nameById.set(c.id, n);
      });

      const unitById = new Map<string, string>();
      if (buildingId) {
        const { data: assigns } = await (supabase as any)
          .from("contact_building_assignments")
          .select("contact_id, unit_number")
          .eq("building_id", buildingId)
          .in("contact_id", contactIds);
        (assigns || []).forEach((a: any) => {
          if (a.unit_number && !unitById.has(a.contact_id)) unitById.set(a.contact_id, a.unit_number);
        });
      }

      const { data: items } = await (supabase as any)
        .from("survey_items")
        .select("id, followup_options")
        .eq("survey_id", surveyId);
      const optsById = new Map<string, string[]>();
      (items || []).forEach((it: any) => optsById.set(it.id, it.followup_options || []));

      const grouped: Record<string, VoteDetail[]> = {};
      rows.forEach((r) => {
        const opts = optsById.get(r.item_id) || [];
        const fi = r.followup_choice;
        const detail: VoteDetail = {
          contact_id: r.contact_id,
          name: nameById.get(r.contact_id) || "Unbekannt",
          unit_number: unitById.get(r.contact_id) ?? null,
          mea: Number(r.mea_weight ?? 0),
          choice: r.choice,
          followup_text: fi === null || fi === undefined ? null : opts[fi] ?? `Option ${fi + 1}`,
          urgent: !!r.urgent,
          comment: r.comment,
        };
        (grouped[r.item_id] ||= []).push(detail);
      });

      Object.values(grouped).forEach((list) =>
        list.sort((a, b) => {
          const ca = a.comment ? 0 : 1;
          const cb = b.comment ? 0 : 1;
          if (ca !== cb) return ca - cb;
          return a.name.localeCompare(b.name, "de");
        }),
      );

      return grouped;
    },
  });
}
