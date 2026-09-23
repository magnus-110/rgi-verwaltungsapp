import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Datenzugriff für Umfragen.
 *
 * Jeder Punkt einer Umfrage hat eine Art (kind). Die Art entscheidet, was
 * gefragt und wie ausgewertet wird:
 *
 *   massnahme        wie bisher: Kosten, Pflicht, Ja/Neutral/Nein, MEA-Gewicht
 *   einfachauswahl   eine von mehreren selbst geschriebenen Antworten
 *   mehrfachauswahl  mehrere davon
 *   skala            1 bis n
 *   freitext         freie Antwort
 *   datum            ein Datum
 *   info             nur Information, keine Antwort
 *
 * Alles, was früher fest eingebaut war (Kosten, Pflicht, Ja/Neutral/Nein,
 * Gewichtung nach Miteigentumsanteilen), hängt jetzt an der Art „massnahme".
 */

export type SurveyChoice = "ja" | "neutral" | "nein";
export type SurveyItemType = "question" | "info";

export type SurveyKind =
  | "massnahme"
  | "einfachauswahl"
  | "mehrfachauswahl"
  | "skala"
  | "freitext"
  | "datum"
  | "info";

export const FRAGENARTEN: { kind: SurveyKind; label: string; hint: string }[] = [
  { kind: "einfachauswahl", label: "Einfachauswahl", hint: "Eine Antwort aus einer Liste" },
  { kind: "mehrfachauswahl", label: "Mehrfachauswahl", hint: "Mehrere Antworten möglich" },
  { kind: "skala", label: "Skala", hint: "Zustimmung oder Zufriedenheit von 1 bis n" },
  { kind: "freitext", label: "Freitext", hint: "Die Eigentümer schreiben selbst" },
  { kind: "datum", label: "Termin / Datum", hint: "Ein Datum auswählen" },
  { kind: "info", label: "Nur Information", hint: "Eine Seite ohne Frage" },
  { kind: "massnahme", label: "Maßnahme", hint: "Kosten, Pflicht-Kennzeichen, Ja/Neutral/Nein" },
];

export const ART_LABEL: Record<SurveyKind, string> = FRAGENARTEN.reduce(
  (acc, a) => ({ ...acc, [a.kind]: a.label }),
  {} as Record<SurveyKind, string>,
);

/** Fragenarten, deren Antwort als Filter für andere Punkte taugt. */
export const ARTEN_MIT_LOGIK: SurveyKind[] = ["massnahme", "einfachauswahl"];

export const JA_NEUTRAL_NEIN = ["Ja", "Neutral", "Nein"];

export interface SurveyItem {
  id: string;
  survey_id: string;
  position: number;
  group_label: string | null;
  title: string;
  explanation: string;
  kind: SurveyKind;
  answer_options: string[] | null;
  scale_max: number | null;
  scale_min_label: string | null;
  scale_max_label: string | null;
  is_required: boolean;
  cost_tier: string | null;
  is_safety: boolean;
  item_type: SurveyItemType;
  depends_on_item_id: string | null;
  depends_on_value: string | null;
  followup_question: string | null;
  followup_options: string[] | null;
  images: { path: string; caption: string | null; url: string | null }[];
}

export interface OwnerVote {
  item_id: string;
  choice: SurveyChoice | null;
  option_indexes: number[] | null;
  scale_value: number | null;
  text_answer: string | null;
  date_answer: string | null;
  followup_choice: number | null;
  urgent: boolean;
  comment: string | null;
}

export const leereAntwort = (itemId: string): OwnerVote => ({
  item_id: itemId,
  choice: null,
  option_indexes: null,
  scale_value: null,
  text_answer: null,
  date_answer: null,
  followup_choice: null,
  urgent: false,
  comment: null,
});

/** Erwartet dieser Punkt überhaupt eine Antwort? */
export function willAntwort(it: { kind: SurveyKind; is_safety: boolean }) {
  if (it.kind === "info") return false;
  if (it.kind === "massnahme" && it.is_safety) return false;
  return true;
}

/** Liegt für diesen Punkt eine Antwort vor? */
export function istBeantwortet(it: SurveyItem, v?: OwnerVote | null): boolean {
  if (!willAntwort(it)) return true;
  if (!v) return false;
  switch (it.kind) {
    case "massnahme": return !!v.choice;
    case "einfachauswahl":
    case "mehrfachauswahl": return !!v.option_indexes?.length;
    case "skala": return v.scale_value !== null && v.scale_value !== undefined;
    case "freitext": return !!v.text_answer?.trim();
    case "datum": return !!v.date_answer;
    default: return false;
  }
}

/**
 * Der Wert, auf den sich andere Punkte beziehen können
 * („nur zeigen, wenn hier X geantwortet wurde").
 */
export function logikWert(it: SurveyItem, v?: OwnerVote | null): string | null {
  if (!v) return null;
  if (it.kind === "massnahme") return v.choice ?? null;
  if (it.kind === "einfachauswahl") {
    const i = v.option_indexes?.[0];
    return i === undefined || i === null ? null : String(i);
  }
  return null;
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

// Bewusst "*": so laufen die Abfragen auch, solange eine neue Spalte in der
// Datenbank noch fehlt — baueItem() fängt das ab.
const ITEM_SPALTEN = "*";
const VOTE_SPALTEN = "*";

async function signImages(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await (supabase as any).storage.from("survey-images").createSignedUrls(paths, SIGNED_URL_TTL);
  const map: Record<string, string> = {};
  (data || []).forEach((d: any) => {
    if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
  });
  return map;
}

function baueItem(it: any, signed: Record<string, string>): SurveyItem {
  return {
    id: it.id,
    survey_id: it.survey_id,
    position: it.position,
    group_label: it.group_label,
    title: it.title,
    explanation: it.explanation ?? "",
    kind: (it.kind ?? (it.item_type === "info" ? "info" : "massnahme")) as SurveyKind,
    answer_options: it.answer_options ?? null,
    scale_max: it.scale_max ?? null,
    scale_min_label: it.scale_min_label ?? null,
    scale_max_label: it.scale_max_label ?? null,
    is_required: it.is_required ?? true,
    cost_tier: it.cost_tier,
    is_safety: !!it.is_safety,
    item_type: (it.item_type ?? "question") as SurveyItemType,
    depends_on_item_id: it.depends_on_item_id ?? null,
    depends_on_value: it.depends_on_value ?? it.depends_on_choice ?? null,
    followup_question: it.followup_question,
    followup_options: it.followup_options,
    images: (it.survey_item_images || [])
      .sort((a: any, b: any) => a.position - b.position)
      .map((im: any) => ({
        path: im.storage_path,
        caption: im.caption,
        url: signed[im.storage_path] ?? null,
      })),
  };
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
        .select(ITEM_SPALTEN)
        .in("survey_id", ids);
      const { data: votes } = await (supabase as any)
        .from("survey_votes")
        .select("survey_id, item_id")
        .in("survey_id", ids);

      const totalBySurvey = new Map<string, number>();
      (items || []).forEach((it: any) => {
        const kind = (it.kind ?? (it.item_type === "info" ? "info" : "massnahme")) as SurveyKind;
        if (!willAntwort({ kind, is_safety: !!it.is_safety })) return;
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

/** Lädt eine konkrete Umfrage (Punkte, Bilder, eigene Antworten, eigenes MEA). */
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
        .select(`${ITEM_SPALTEN}, survey_item_images(storage_path, caption, position)`)
        .eq("survey_id", survey.id)
        .order("position", { ascending: true });

      const allPaths = (rawItems || []).flatMap((it: any) =>
        (it.survey_item_images || []).map((im: any) => im.storage_path),
      );
      const signed = await signImages(allPaths);
      const items: SurveyItem[] = (rawItems || []).map((it: any) => baueItem(it, signed));

      const { data: votes } = await (supabase as any)
        .from("survey_votes")
        .select(VOTE_SPALTEN)
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

/** Speichert (Upsert) eine Antwort des Eigentümers. contact_id/mea werden serverseitig gesetzt. */
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
            option_indexes: v.option_indexes,
            scale_value: v.scale_value,
            text_answer: v.text_answer,
            date_answer: v.date_answer,
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

// ---------------- Verwaltung: Auswertung ----------------

export type Einstufung = "pflicht" | "antrag" | "diskussion" | "zurueckgestellt";

export function classify(isSafety: boolean, jaPct: number): Einstufung {
  if (isSafety) return "pflicht";
  if (jaPct >= 50) return "antrag";
  if (jaPct >= 25) return "diskussion";
  return "zurueckgestellt";
}

/** Eine abgegebene Antwort mit Namen — für die Einzelansicht in der Verwaltung. */
export interface VoteDetail {
  contact_id: string;
  name: string;
  unit_number: string | null;
  mea: number;
  choice: SurveyChoice | null;
  option_indexes: number[] | null;
  scale_value: number | null;
  text_answer: string | null;
  date_answer: string | null;
  followup_text: string | null;
  urgent: boolean;
  comment: string | null;
}

/** Eine Zeile im Balkendiagramm (Auswahl, Datum). */
export interface VerteilungsZeile {
  label: string;
  koepfe: number;
  mea: number;
  pct: number;
}

export interface AuswertungBasis {
  item: SurveyItem;
  teilnehmer: number;
  stimmen: VoteDetail[];
}

export type Auswertung =
  | (AuswertungBasis & { art: "info" })
  | (AuswertungBasis & { art: "verteilung"; zeilen: VerteilungsZeile[] })
  | (AuswertungBasis & { art: "skala"; schnitt: number; zeilen: VerteilungsZeile[] })
  | (AuswertungBasis & { art: "text"; antworten: VoteDetail[] })
  | (AuswertungBasis & {
      art: "massnahme";
      head_ja: number; head_neutral: number; head_nein: number;
      mea_ja: number; mea_neutral: number; mea_nein: number;
      jaPct: number; neutralPct: number; neinPct: number;
      urgent_count: number;
      einstufung: Einstufung;
    });

function prozent(teil: number, ganz: number) {
  return ganz > 0 ? Math.round((teil / ganz) * 100) : 0;
}

/** Wertet einen Punkt aus — wahlweise nach Köpfen oder nach Miteigentumsanteilen. */
export function auswerten(item: SurveyItem, stimmen: VoteDetail[], nachMea: boolean): Auswertung {
  const gewicht = (v: VoteDetail) => (nachMea ? v.mea : 1);
  const basis: AuswertungBasis = { item, stimmen, teilnehmer: stimmen.length };

  // Reine Info-Seiten haben nichts auszuwerten. Pflichtpunkte schon: sie
  // stehen ohne Abstimmung auf der Tagesordnung.
  if (item.kind === "info") return { ...basis, art: "info", teilnehmer: 0, stimmen: [] };

  if (item.kind === "massnahme") {
    const summe = (c: SurveyChoice, feld: "kopf" | "mea") =>
      stimmen.filter((v) => v.choice === c).reduce((s, v) => s + (feld === "kopf" ? 1 : v.mea), 0);
    const head_ja = summe("ja", "kopf"), head_neutral = summe("neutral", "kopf"), head_nein = summe("nein", "kopf");
    const mea_ja = summe("ja", "mea"), mea_neutral = summe("neutral", "mea"), mea_nein = summe("nein", "mea");
    const ganz = nachMea ? mea_ja + mea_neutral + mea_nein : head_ja + head_neutral + head_nein;
    const jaPct = prozent(nachMea ? mea_ja : head_ja, ganz);
    const neutralPct = prozent(nachMea ? mea_neutral : head_neutral, ganz);
    return {
      ...basis,
      art: "massnahme",
      head_ja, head_neutral, head_nein,
      mea_ja, mea_neutral, mea_nein,
      jaPct, neutralPct, neinPct: Math.max(0, 100 - jaPct - neutralPct),
      urgent_count: stimmen.filter((v) => v.urgent).length,
      einstufung: classify(item.is_safety, jaPct),
    };
  }

  if (item.kind === "einfachauswahl" || item.kind === "mehrfachauswahl") {
    const optionen = item.answer_options ?? [];
    const ganz = stimmen.reduce((s, v) => s + (v.option_indexes?.length ? gewicht(v) : 0), 0);
    const zeilen = optionen.map((label, i) => {
      const treffer = stimmen.filter((v) => (v.option_indexes ?? []).includes(i));
      const koepfe = treffer.length;
      const mea = treffer.reduce((s, v) => s + v.mea, 0);
      return { label, koepfe, mea, pct: prozent(nachMea ? mea : koepfe, ganz) };
    });
    return { ...basis, art: "verteilung", zeilen };
  }

  if (item.kind === "skala") {
    const max = item.scale_max ?? 5;
    const mitWert = stimmen.filter((v) => v.scale_value !== null && v.scale_value !== undefined);
    const gewichtSumme = mitWert.reduce((s, v) => s + gewicht(v), 0);
    const schnitt = gewichtSumme > 0
      ? mitWert.reduce((s, v) => s + (v.scale_value as number) * gewicht(v), 0) / gewichtSumme
      : 0;
    const zeilen = Array.from({ length: max }, (_, k) => {
      const wert = k + 1;
      const treffer = mitWert.filter((v) => v.scale_value === wert);
      const koepfe = treffer.length;
      const mea = treffer.reduce((s, v) => s + v.mea, 0);
      return { label: String(wert), koepfe, mea, pct: prozent(nachMea ? mea : koepfe, gewichtSumme) };
    });
    return { ...basis, art: "skala", schnitt: Math.round(schnitt * 10) / 10, zeilen, teilnehmer: mitWert.length };
  }

  if (item.kind === "datum") {
    const mitDatum = stimmen.filter((v) => !!v.date_answer);
    const ganz = mitDatum.reduce((s, v) => s + gewicht(v), 0);
    const tage = Array.from(new Set(mitDatum.map((v) => v.date_answer as string))).sort();
    const zeilen = tage.map((tag) => {
      const treffer = mitDatum.filter((v) => v.date_answer === tag);
      const koepfe = treffer.length;
      const mea = treffer.reduce((s, v) => s + v.mea, 0);
      return {
        label: new Date(tag).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }),
        koepfe, mea, pct: prozent(nachMea ? mea : koepfe, ganz),
      };
    });
    return { ...basis, art: "verteilung", zeilen, teilnehmer: mitDatum.length };
  }

  const antworten = stimmen.filter((v) => !!v.text_answer?.trim());
  return { ...basis, art: "text", antworten, teilnehmer: antworten.length };
}

/**
 * Lädt alles, was die Verwaltung für die Ergebnisse braucht: Punkte, alle
 * Antworten mit Namen und Einheit, sowie das Gesamt-MEA des Gebäudes.
 */
export function useSurveyAuswertung(surveyId?: string, buildingId?: string) {
  return useQuery({
    queryKey: ["survey-auswertung", surveyId, buildingId],
    enabled: !!surveyId && !!buildingId,
    queryFn: async () => {
      const { data: rawItems } = await (supabase as any)
        .from("survey_items")
        .select(ITEM_SPALTEN)
        .eq("survey_id", surveyId)
        .order("position", { ascending: true });
      const items: SurveyItem[] = (rawItems || []).map((it: any) => baueItem(it, {}));

      const { data: votes } = await (supabase as any)
        .from("survey_votes")
        .select(`${VOTE_SPALTEN}, contact_id, mea_weight`)
        .eq("survey_id", surveyId);
      const rows = (votes || []) as any[];

      const contactIds = Array.from(new Set(rows.map((r) => r.contact_id).filter(Boolean)));
      const nameById = new Map<string, string>();
      const unitById = new Map<string, string>();
      if (contactIds.length) {
        const { data: contacts } = await (supabase as any)
          .from("contacts")
          .select("id, first_name, last_name, company_name")
          .in("id", contactIds);
        (contacts || []).forEach((c: any) => {
          const n = [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.company_name || "Unbekannt";
          nameById.set(c.id, n);
        });
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
      }

      const proPunkt: Record<string, VoteDetail[]> = {};
      rows.forEach((r) => {
        const opts = items.find((i) => i.id === r.item_id)?.followup_options ?? [];
        const fi = r.followup_choice;
        const detail: VoteDetail = {
          contact_id: r.contact_id,
          name: nameById.get(r.contact_id) || "Unbekannt",
          unit_number: unitById.get(r.contact_id) ?? null,
          mea: Number(r.mea_weight ?? 0),
          choice: r.choice ?? null,
          option_indexes: r.option_indexes ?? null,
          scale_value: r.scale_value ?? null,
          text_answer: r.text_answer ?? null,
          date_answer: r.date_answer ?? null,
          followup_text: fi === null || fi === undefined ? null : opts[fi] ?? `Option ${fi + 1}`,
          urgent: !!r.urgent,
          comment: r.comment,
        };
        (proPunkt[r.item_id] ||= []).push(detail);
      });
      Object.values(proPunkt).forEach((list) =>
        list.sort((a, b) => a.name.localeCompare(b.name, "de")),
      );

      const { data: totalRow } = await (supabase as any).rpc("building_total_mea", { _building: buildingId });
      const totalMea = Number(totalRow ?? 0);

      // Beteiligung: die meisten Teilnehmer an einem einzelnen Punkt.
      let teilnehmendeMea = 0;
      let teilnehmendeKoepfe = 0;
      Object.values(proPunkt).forEach((list) => {
        teilnehmendeMea = Math.max(teilnehmendeMea, list.reduce((s, v) => s + v.mea, 0));
        teilnehmendeKoepfe = Math.max(teilnehmendeKoepfe, list.length);
      });

      return {
        items,
        proPunkt,
        totalMea,
        teilnehmendeMea,
        teilnehmendeKoepfe,
        beteiligungPct: prozent(teilnehmendeMea, totalMea),
      };
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
