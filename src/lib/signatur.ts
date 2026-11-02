/**
 * Elektronische Unterschrift (Textform, § 126b BGB) — Typen, Abfragen und
 * der Aufruf der Edge-Funktion `sign-request`.
 *
 * Grundsatz (siehe API-Vertrag): Lesen direkt aus den Tabellen, ALLE
 * zustandsändernden Aktionen nur über `sign-request`, damit Mails, PDFs
 * und Protokoll zusammenpassen. Ausnahme: Mail-Vorlagen (Einstellungen).
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Die neuen Tabellen stehen (noch) nicht in den generierten Typen.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// ---------------------------------------------------------------
// Typen
// ---------------------------------------------------------------

export type SignTyp = "ausgehend" | "eingehend" | "etv_protokoll";
export type SignStatus = "entwurf" | "offen" | "abgeschlossen" | "zurueckgezogen" | "abgelaufen";
export type SignReihenfolge = "gleichzeitig" | "nacheinander";
export type Dokumentart =
  | "verwaltervertrag" | "vollmacht" | "umlaufbeschluss" | "dienstleistervertrag"
  | "angebot" | "protokoll" | "abnahme" | "sonstiges";
export type QuelleTyp = "building_file" | "email_attachment" | "offer" | "contract" | "etv_meeting" | "upload";
export type SignerStatus =
  | "wartet" | "offen" | "geoeffnet" | "unterschrieben" | "papier_eingegangen"
  | "papier_uebernommen" | "abgelehnt" | "zurueckgezogen";
export type SignerMethode = "online" | "papier" | "intern";

/** Unterschriftsfeld in PDF-Punkten, Ursprung oben links, `page` ab 0 (wie src/lib/pdfSign.ts). */
export interface SignPlacement {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SignSigner {
  id: string;
  request_id: string;
  position: number;
  rolle: string | null;
  rolle_key: string | null;
  contact_id: string | null;
  user_id: string | null;
  name: string;
  email: string | null;
  anrede: string | null;
  methode: SignerMethode;
  status: SignerStatus;
  expires_at: string | null;
  eingeladen_at: string | null;
  geoeffnet_at: string | null;
  typed_name: string | null;
  signed_at: string | null;
  signed_by: string | null;
  placements: SignPlacement[] | null;
  paper_bucket: string | null;
  paper_path: string | null;
  paper_page_count: number | null;
  paper_eingang: "upload" | "email" | null;
  paper_email_id: string | null;
  paper_eingang_at: string | null;
  paper_pruefung: Record<string, boolean> | null;
  copy_sent_at: string | null;
  reminder_count: number;
  last_reminder_at: string | null;
  created_at: string;
}

export interface SignRequest {
  id: string;
  nummer: string;
  typ: SignTyp;
  dokumentart: Dokumentart;
  titel: string;
  building_id: string | null;
  quelle_typ: QuelleTyp | null;
  quelle_id: string | null;
  quelle_label: string | null;
  source_bucket: string | null;
  source_path: string | null;
  seitenzahl: number | null;
  status: SignStatus;
  frist: string | null;
  reihenfolge: SignReihenfolge;
  mail_betreff: string | null;
  mail_text: string | null;
  erinnerung: boolean;
  kopie_dms: boolean;
  final_bucket: string | null;
  final_path: string | null;
  final_file_id: string | null;
  final_sha256: string | null;
  completed_at: string | null;
  email_id: string | null;
  zugewiesen_an: string | null;
  antwort_an: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  signers: SignSigner[];
  building: { id: string; name: string; address: string | null; city: string | null } | null;
}

export interface SignEvent {
  id: string;
  request_id: string;
  signer_id: string | null;
  ereignis: string;
  details: Record<string, any> | null;
  created_by: string | null;
  created_at: string;
}

export interface MailTemplate {
  dokumentart: Dokumentart;
  bezeichnung: string;
  betreff: string;
  text: string;
  frist_tage: number;
  erinnerung_nach_tagen: number;
  updated_at: string;
}

// ---------------------------------------------------------------
// Farben (RGI Corporate Design)
// ---------------------------------------------------------------

export const SIG = {
  button: "#B35300",
  orange: "#ee7202",
  linie: "#F08C1F",
  text: "#2B2B2B",
  text2: "#595959",
  grau: "#6B6B6B",
  creme: "#FAFAFA",
  orangeBg: "#FFF7ED",
  gruenBg: "#D4EDDA",
  gruen: "#1E6B34",
  rand: "#E5E5E5",
  randButton: "#D6D6D6",
  vorschau: "#EDEDED",
} as const;

export const DOKUMENTART_LABEL: Record<Dokumentart, string> = {
  verwaltervertrag: "Verwaltervertrag",
  vollmacht: "Vollmacht",
  umlaufbeschluss: "Umlaufbeschluss",
  dienstleistervertrag: "Dienstleistervertrag",
  angebot: "Angebot",
  protokoll: "ETV-Protokoll",
  abnahme: "Abnahmeprotokoll",
  sonstiges: "Sonstiges Dokument",
};

// ---------------------------------------------------------------
// Datum & Zeit
// ---------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

/** „2026-11-16“ oder ISO-Zeit → „16.11.2026“ */
export const formatDate = (d: string | Date | null | undefined): string => {
  if (!d) return "—";
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, t] = d.split("-");
    return `${t}.${m}.${y}`;
  }
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  return `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()}`;
};

/** → „03.11.2026, 18:42“ */
export const formatDateTime = (d: string | Date | null | undefined): string => {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  return `${formatDate(dt)}, ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

/** → „29.10.“ */
export const formatShortDate = (d: string | Date | null | undefined): string => {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "";
  return `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.`;
};

/** Heute als „YYYY-MM-DD“ (Ortszeit). */
export const todayIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const addDaysIso = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Tage bis zur Frist (negativ = überfällig). */
export const tageBisFrist = (frist: string | null): number | null => {
  if (!frist) return null;
  const [y, m, d] = frist.split("-").map(Number);
  const f = new Date(y, m - 1, d).getTime();
  const t = new Date();
  const heute = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  return Math.round((f - heute) / 86_400_000);
};

// ---------------------------------------------------------------
// Status & Fortschritt
// ---------------------------------------------------------------

export const istUnterschrieben = (s: SignSigner) => s.status === "unterschrieben" || s.status === "papier_uebernommen";

/** Unterzeichner, die zählen (zurückgezogene nicht), nach Position. */
export const aktiveSigner = (r: Pick<SignRequest, "signers">) =>
  [...(r.signers ?? [])].filter((s) => s.status !== "zurueckgezogen").sort((a, b) => a.position - b.position);

export const fortschritt = (r: Pick<SignRequest, "signers">) => {
  const alle = aktiveSigner(r);
  return { fertig: alle.filter(istUnterschrieben).length, gesamt: alle.length };
};

/** „2 von 3“ */
export const fortschrittText = (r: Pick<SignRequest, "signers">) => {
  const f = fortschritt(r);
  return `${f.fertig} von ${f.gesamt}`;
};

/** Anzeige-Status für Badges. „Gesendet“ = offen, aber noch niemand hat reagiert. */
export type AnzeigeStatus = "offen" | "gesendet" | "abgeschlossen" | "abgelaufen" | "zurueckgezogen" | "entwurf";

export const anzeigeStatus = (r: Pick<SignRequest, "status" | "signers">): AnzeigeStatus => {
  if (r.status !== "offen") return r.status;
  const reagiert = (r.signers ?? []).some((s) =>
    ["geoeffnet", "unterschrieben", "papier_eingegangen", "papier_uebernommen", "abgelehnt"].includes(s.status),
  );
  return reagiert ? "offen" : "gesendet";
};

export const STATUS_STIL: Record<AnzeigeStatus, { text: string; color: string; bg: string }> = {
  offen: { text: "Offen", color: SIG.button, bg: SIG.orangeBg },
  gesendet: { text: "Gesendet", color: SIG.button, bg: "#FDEBD8" },
  abgeschlossen: { text: "Abgeschlossen", color: SIG.gruen, bg: SIG.gruenBg },
  abgelaufen: { text: "Abgelaufen", color: SIG.grau, bg: "#EFEFEF" },
  zurueckgezogen: { text: "Zurückgezogen", color: SIG.grau, bg: "#EFEFEF" },
  entwurf: { text: "Entwurf", color: SIG.grau, bg: "#EFEFEF" },
};

/** Anzeigename eines Unterzeichners (RGI intern: nur die Rolle). */
export const signerName = (s: SignSigner) => (s.methode === "intern" ? s.rolle || "RGI Immobilien" : s.name);

/** Kopfzeile in der Box: „Beiratsvorsitz · Erika Mustermann“ bzw. nur Rolle bei RGI. */
export const signerKopf = (s: SignSigner) => {
  if (s.methode === "intern") return s.rolle || "RGI Immobilien";
  return s.rolle ? `${s.rolle} · ${s.name}` : s.name;
};

export type StatusTon = "gruen" | "orange" | "grau";

/** Kurzer Status rechts in der Box („✓ 29.10.“, „offen“, „wartet“ …). */
export const signerStatusKurz = (s: SignSigner): { text: string; ton: StatusTon; check?: boolean } => {
  switch (s.status) {
    case "unterschrieben":
    case "papier_uebernommen":
      return { text: formatShortDate(s.signed_at || s.paper_eingang_at), ton: "gruen", check: true };
    case "papier_eingegangen":
      return { text: "Papier eingegangen", ton: "orange" };
    case "wartet":
      return { text: "wartet", ton: "grau" };
    case "zurueckgezogen":
      return { text: "zurückgezogen", ton: "grau" };
    case "abgelehnt":
      return { text: "neu angefordert", ton: "orange" };
    default:
      return { text: "offen", ton: "orange" };
  }
};

/** Ausführlicher Status in der Seitenleiste („✓ 03.11.2026, 18:42“, „geöffnet, offen“ …). */
export const signerStatusLang = (s: SignSigner): { text: string; ton: StatusTon; check?: boolean } => {
  switch (s.status) {
    case "unterschrieben":
    case "papier_uebernommen":
      return { text: formatDateTime(s.signed_at || s.paper_eingang_at), ton: "gruen", check: true };
    case "papier_eingegangen":
      return { text: "Papier eingegangen", ton: "orange" };
    case "geoeffnet":
      return { text: "geöffnet, offen", ton: "grau" };
    case "wartet":
      return { text: "wartet", ton: "grau" };
    case "zurueckgezogen":
      return { text: "zurückgezogen", ton: "grau" };
    case "abgelehnt":
      return { text: "neu angefordert", ton: "grau" };
    default:
      return { text: "offen", ton: "grau" };
  }
};

/** Kleine Zeile unter dem Namen: wie wird unterschrieben? */
export const signerMethodeText = (s: SignSigner): string => {
  if (s.status === "papier_eingegangen") return "Papier eingegangen – prüfen";
  if (s.status === "papier_uebernommen") return "Papier · übernommen";
  if (s.methode === "intern") return "RGI · hinterlegte Unterschrift";
  if (s.methode === "papier") return "Papier gewählt · Scan steht aus";
  return "online";
};

export const TON_FARBE: Record<StatusTon, string> = { gruen: SIG.gruen, orange: SIG.button, grau: SIG.grau };

// ---------------------------------------------------------------
// Protokoll-Texte
// ---------------------------------------------------------------

const QUELLE_HERKUNFT: Record<QuelleTyp, string> = {
  building_file: "aus DMS",
  email_attachment: "aus E-Mail",
  offer: "aus Angeboten",
  contract: "aus Verwaltervertrag",
  etv_meeting: "aus ETV",
  upload: "aus Upload",
};

/**
 * Ereignisse in lesbare Sätze übersetzen (unbekannte: `details.text`
 * vom Server). „unterschrieben“ und
 * „kopie_versendet“ desselben Unterzeichners werden zusammengefasst
 * („… hat unterschrieben, Kopie per E-Mail versendet“).
 */
export const protokollEintraege = (r: SignRequest, events: SignEvent[]) => {
  const signerById = new Map(r.signers.map((s) => [s.id, s]));
  const kopieFuer = new Set(events.filter((e) => e.ereignis === "kopie_versendet" && e.signer_id).map((e) => e.signer_id));
  const name = (e: SignEvent) => {
    const s = e.signer_id ? signerById.get(e.signer_id) : null;
    return s ? (s.methode === "intern" ? s.name || signerName(s) : s.name) : (e.details?.name as string) || "Unbekannt";
  };
  const out: { id: string; text: string; zeit: string }[] = [];
  for (const e of [...events].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    // Bekannte Ereignisse mit festen Sätzen (Wortlaut wie im Mockup), sonst der Text vom Server
    let text: string | null;
    switch (e.ereignis) {
      case "angelegt":
        text = `Vorgang angelegt${r.quelle_typ ? " " + QUELLE_HERKUNFT[r.quelle_typ] : ""}`;
        break;
      case "versendet": {
        const n = Number(e.details?.anzahl ?? e.details?.count ?? 0);
        text = e.signer_id
          ? `Einladung an ${name(e)} versendet`
          : n > 0
            ? `Einladung${n === 1 ? "" : "en"} an ${n} Unterzeichner versendet`
            : "Einladungen versendet";
        break;
      }
      case "geoeffnet":
        text = `${name(e)} hat das Dokument geöffnet`;
        break;
      case "heruntergeladen":
        text = `${name(e)} hat das PDF heruntergeladen`;
        break;
      case "unterschrieben":
        text = `${name(e)} hat unterschrieben${kopieFuer.has(e.signer_id) ? ", Kopie per E-Mail versendet" : ""}`;
        break;
      case "kopie_versendet":
        text = null; // steckt in „unterschrieben“
        break;
      case "scan_eingegangen":
        text = `Papier-Unterschrift von ${name(e)} eingegangen${e.details?.eingang === "email" ? " (per E-Mail)" : e.details?.eingang === "upload" ? " (Upload)" : ""}`;
        break;
      case "uebernommen":
        text = `Papier-Unterschrift von ${name(e)} übernommen`;
        break;
      case "abgelehnt":
        text = `Papier-Unterschrift von ${name(e)} abgelehnt, neu angefordert`;
        break;
      case "erinnert":
        text = e.signer_id ? `Erinnerung an ${name(e)} versendet` : "Erinnerung versendet";
        break;
      case "zurueckgezogen":
        text = "Vorgang zurückgezogen";
        break;
      case "abgeschlossen":
        text = "Alle haben unterschrieben – Vorgang abgeschlossen";
        break;
      case "endfassung_versendet":
        text = "Endfassung an alle versendet";
        break;
      case "abgelaufen":
        text = "Frist abgelaufen";
        break;
      default:
        text = typeof e.details?.text === "string" && e.details.text ? e.details.text : e.ereignis;
    }
    if (text) out.push({ id: e.id, text, zeit: e.created_at });
  }
  return out;
};

// ---------------------------------------------------------------
// Wohin führt die Quelle?
// ---------------------------------------------------------------

export const quellePfad = async (r: Pick<SignRequest, "quelle_typ" | "quelle_id" | "building_id" | "email_id">): Promise<string | null> => {
  switch (r.quelle_typ) {
    case "building_file":
      return r.building_id ? `/buildings/${r.building_id}?tab=documents` : null;
    case "offer":
      return "/rgi-intern?bereich=offers";
    case "contract":
      return "/rgi-intern?bereich=contracts";
    case "etv_meeting":
      return r.quelle_id ? `/versammlungen?m=${r.quelle_id}&phase=protokoll` : "/versammlungen";
    case "email_attachment": {
      if (r.email_id) return `/postfach?email=${r.email_id}`;
      if (!r.quelle_id) return "/postfach";
      const { data } = await db.from("email_attachments").select("email_id").eq("id", r.quelle_id).maybeSingle();
      return data?.email_id ? `/postfach?email=${data.email_id}` : "/postfach";
    }
    default:
      return r.building_id ? `/buildings/${r.building_id}` : null;
  }
};

// ---------------------------------------------------------------
// Abfragen
// ---------------------------------------------------------------

export const SIGNATUR_KEY = ["signatur"] as const;

const SELECT_REQUEST = "*, signers:sign_request_signers(*), building:buildings(id, name, address, city)";

const normalisieren = (r: any): SignRequest => ({
  ...r,
  signers: [...(r.signers ?? [])].sort((a: SignSigner, b: SignSigner) => a.position - b.position),
});

export interface SignFilter {
  typ?: SignTyp | SignTyp[];
  status?: SignStatus | SignStatus[];
  buildingId?: string | null;
  quelleTyp?: QuelleTyp;
}

export const useSignRequests = (filter: SignFilter = {}, enabled = true) =>
  useQuery({
    queryKey: [...SIGNATUR_KEY, "liste", filter],
    enabled,
    queryFn: async (): Promise<SignRequest[]> => {
      let q = db.from("sign_requests").select(SELECT_REQUEST).order("created_at", { ascending: false }).limit(500);
      if (filter.typ) q = Array.isArray(filter.typ) ? q.in("typ", filter.typ) : q.eq("typ", filter.typ);
      if (filter.status) q = Array.isArray(filter.status) ? q.in("status", filter.status) : q.eq("status", filter.status);
      if (filter.buildingId) q = q.eq("building_id", filter.buildingId);
      if (filter.quelleTyp) q = q.eq("quelle_typ", filter.quelleTyp);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(normalisieren);
    },
    staleTime: 30_000,
  });

export const useSignRequest = (id: string | null | undefined) =>
  useQuery({
    queryKey: [...SIGNATUR_KEY, "vorgang", id],
    enabled: !!id,
    queryFn: async (): Promise<SignRequest | null> => {
      const { data, error } = await db.from("sign_requests").select(SELECT_REQUEST).eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? normalisieren(data) : null;
    },
  });

export const useSignEvents = (requestId: string | null | undefined) =>
  useQuery({
    queryKey: [...SIGNATUR_KEY, "events", requestId],
    enabled: !!requestId,
    queryFn: async (): Promise<SignEvent[]> => {
      const { data, error } = await db
        .from("sign_request_events")
        .select("*")
        .eq("request_id", requestId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

export const useSignRequestsForQuelle = (quelleTyp: QuelleTyp, quelleId: string | null | undefined) =>
  useQuery({
    queryKey: [...SIGNATUR_KEY, "quelle", quelleTyp, quelleId],
    enabled: !!quelleId,
    queryFn: async (): Promise<SignRequest[]> => {
      const { data, error } = await db
        .from("sign_requests")
        .select(SELECT_REQUEST)
        .eq("quelle_typ", quelleTyp)
        .eq("quelle_id", quelleId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(normalisieren);
    },
    staleTime: 15_000,
  });

/**
 * Zähler für Menü und Startseite: offene Vorgänge und davon überfällige.
 * „Von uns zu unterschreiben“ (typ eingehend) zählt nur, wenn es dem angemeldeten
 * Nutzer zugewiesen ist (`vonMir`); alle anderen offenen Vorgänge zählen immer.
 */
export const useSignOpenCount = (enabled = true) =>
  useQuery({
    queryKey: [...SIGNATUR_KEY, "zaehler"],
    enabled,
    queryFn: async (): Promise<{ offen: number; ueberfaellig: number; vonMir: number }> => {
      const [{ data: auth }, { data, error }] = await Promise.all([
        supabase.auth.getUser(),
        db.from("sign_requests").select("id, frist, typ, zugewiesen_an").eq("status", "offen"),
      ]);
      if (error) throw error;
      const ich = auth?.user?.id ?? null;
      const heute = todayIso();
      const rows = ((data ?? []) as { frist: string | null; typ: SignTyp; zugewiesen_an: string | null }[]).filter(
        (r) => r.typ !== "eingehend" || (!!ich && r.zugewiesen_an === ich),
      );
      return {
        offen: rows.length,
        ueberfaellig: rows.filter((r) => r.frist && r.frist < heute).length,
        vonMir: rows.filter((r) => r.typ === "eingehend").length,
      };
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

export const useMailTemplates = () =>
  useQuery({
    queryKey: [...SIGNATUR_KEY, "vorlagen"],
    queryFn: async (): Promise<MailTemplate[]> => {
      const { data, error } = await db.from("sign_mail_templates").select("*").order("bezeichnung");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

/** Büro-Mitarbeiter (für „RGI unterschreibt auch“). */
export const useBueroMitarbeiter = () =>
  useQuery({
    queryKey: [...SIGNATUR_KEY, "mitarbeiter"],
    queryFn: async (): Promise<{ user_id: string; name: string }[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, email, role")
        .in("role", ["admin", "employee"]);
      if (error) throw error;
      return (data ?? [])
        .map((p) => ({
          user_id: p.user_id,
          name: [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.email,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "de"));
    },
    staleTime: 10 * 60_000,
  });

// ---------------------------------------------------------------
// Aktionen über die Edge-Funktion
// ---------------------------------------------------------------

export type SignActionName =
  | "create" | "preview_mail" | "sign_internal" | "remind" | "withdraw"
  | "accept_paper" | "reject_paper" | "assign_paper_email" | "urls" | "nachweis"
  | "create_incoming" | "complete_incoming";

/** Ruft `sign-request` auf und liefert die Antwort; Fehlertexte kommen deutsch vom Server. */
export async function signAction<T = any>(action: SignActionName, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("sign-request", { body: { action, ...payload } });
  if (error) {
    let msg = error.message || "Aktion fehlgeschlagen";
    const ctx = (error as any).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const body = await ctx.json();
        if (body?.error) msg = body.error;
      } catch {
        /* Text bleibt */
      }
    }
    throw new Error(msg);
  }
  if (data && typeof data === "object" && "error" in data && (data as any).error) {
    throw new Error((data as any).error);
  }
  return data as T;
}

/** Nach jeder Aktion: alle Unterschriften-Abfragen neu laden. */
export const useSignInvalidate = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: SIGNATUR_KEY });
};

/** Signierte Adresse öffnen (Endfassung, Nachweis …). Fenster sofort öffnen, damit kein Pop-up-Blocker greift. */
export async function oeffneSignUrl(laden: () => Promise<string | null | undefined>) {
  const w = window.open("about:blank", "_blank");
  try {
    const url = await laden();
    if (!url) throw new Error("Datei ist noch nicht vorhanden.");
    if (w) w.location.href = url;
    else window.open(url, "_blank", "noopener,noreferrer");
  } catch (e) {
    w?.close();
    throw e;
  }
}

/** Dokumentart aus einem Dateinamen raten (Vorauswahl im Dialog, frei änderbar). */
export const dokumentartAusName = (name: string): Dokumentart => {
  const n = name.toLowerCase();
  if (n.includes("verwaltervertrag")) return "verwaltervertrag";
  if (n.includes("vollmacht")) return "vollmacht";
  if (n.includes("umlauf")) return "umlaufbeschluss";
  if (n.includes("abnahme")) return "abnahme";
  if (n.includes("angebot")) return "angebot";
  if (n.includes("protokoll") || n.includes("niederschrift")) return "protokoll";
  if (n.includes("vertrag")) return "dienstleistervertrag";
  return "sonstiges";
};

/** „Verwaltervertrag 2027–2031.pdf“ → „Verwaltervertrag 2027–2031“ */
export const titelAusDateiname = (name: string) => name.replace(/\.pdf$/i, "").replace(/_/g, " ").trim() || name;
