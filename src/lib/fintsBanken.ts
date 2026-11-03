/**
 * Banken für die Bankzugänge (FinTS).
 *
 * Die Liste steht in der Tabelle fints_banken und wird von Admins unter
 * Einstellungen › Kontoauszüge abrufen › Banken gepflegt. Ist die Tabelle
 * nicht lesbar, gilt die feste Liste FINTS_BANKEN_STATISCH.
 *
 * vorschlagFuer() schlägt beim Hinzufügen einer Bank FinTS-Adresse,
 * Anmeldename und TAN-App vor. Vorbelegt werden nur Adressen, die belegt
 * sind (Quellen jeweils am Eintrag); sonst bleibt das Feld leer.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { bankNamenSetzen, blzAusIban, cleanIban } from "@/lib/bankInfo";

export interface FintsBank {
  blz: string;
  name: string;
  bic: string | null;
  fints_url: string;
  anmeldename_hinweis: string | null;
  tan_app: string | null;
  blz_muster: string | null;
  blz_muster_text: string | null;
  aktiv: boolean;
  hinzugefuegt_von?: string | null;
  created_at?: string;
}

const ATRUVIA = "https://fints1.atruvia.de/cgi-bin/hbciservlet";
const SPARKASSE_BAYERN = "https://banking-by1.s-fints-pt-by.de/fints30";

/** Rückfall, falls die Tabelle nicht gelesen werden kann. */
export const FINTS_BANKEN_STATISCH: FintsBank[] = [
  { blz: "72090000", name: "VR Bank Augsburg-Ostallgäu", bic: "GENODEF1AUB", fints_url: ATRUVIA, anmeldename_hinweis: "VR-NetKey oder Alias", tan_app: "SecureGo plus", blz_muster: null, blz_muster_text: null, aktiv: true },
  { blz: "73350000", name: "Sparkasse Allgäu", bic: "BYLADEM1ALG", fints_url: SPARKASSE_BAYERN, anmeldename_hinweis: "Anmeldename oder Legitimations-ID", tan_app: "S-pushTAN", blz_muster: null, blz_muster_text: null, aktiv: true },
  { blz: "73369933", name: "Raiffeisenbank Südliches Ostallgäu", bic: "GENODEF1RHP", fints_url: ATRUVIA, anmeldename_hinweis: "VR-NetKey oder Alias", tan_app: "SecureGo plus", blz_muster: null, blz_muster_text: null, aktiv: true },
];

/** Alle Banken aus der Tabelle (auch abgeschaltete); bei Fehler die feste Liste. */
export function useFintsBanken() {
  return useQuery({
    queryKey: ["fints-banken"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ banken: FintsBank[]; ausTabelle: boolean }> => {
      const { data, error } = await (supabase as any)
        .from("fints_banken")
        .select("blz, name, bic, fints_url, anmeldename_hinweis, tan_app, blz_muster, blz_muster_text, aktiv, hinzugefuegt_von, created_at")
        .order("name");
      if (error || !data?.length) {
        bankNamenSetzen(FINTS_BANKEN_STATISCH);
        return { banken: FINTS_BANKEN_STATISCH, ausTabelle: false };
      }
      bankNamenSetzen(data as FintsBank[]);
      return { banken: data as FintsBank[], ausTabelle: true };
    },
  });
}

/** Passt eine BLZ zum Muster einer Bank (z. B. alle Commerzbank-Filialen)? */
export function blzPasstZuMuster(blz: string, muster: string | null | undefined): boolean {
  if (!muster || !/^\d{8}$/.test(blz)) return false;
  try {
    return new RegExp(muster).test(blz);
  } catch {
    return false;
  }
}

/** Bank zu einer BLZ: genauer Treffer vor Muster. */
export function bankZurBlz(banken: FintsBank[], blz: string): FintsBank | null {
  return banken.find((b) => b.blz === blz) ?? banken.find((b) => blzPasstZuMuster(blz, b.blz_muster)) ?? null;
}

/** BLZ aus Eingabe „IBAN oder BLZ“ – oder null. */
export function blzAusEingabe(eingabe: string): string | null {
  const t = cleanIban(eingabe);
  if (/^\d{8}$/.test(t)) return t;
  if (/^DE\d{20}$/.test(t)) return blzAusIban(t);
  return null;
}

/** Prüfung der FinTS-Adresse wie in der Datenbank und der Funktion fints. */
export function fintsUrlFehler(url: string): string | null {
  const t = url.trim();
  if (!t) return "Bitte die FinTS-Adresse eintragen.";
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return "Das ist keine gültige Adresse.";
  }
  if (u.protocol !== "https:") return "Die Adresse muss mit https:// beginnen.";
  if (u.username || u.password) return "Die Adresse darf keine Zugangsdaten enthalten.";
  if (u.port && u.port !== "443") return "Nur der übliche Port 443 ist erlaubt.";
  const host = u.hostname.toLowerCase();
  if (/^[\d.]+$/.test(host) || host.includes(":") || host.startsWith("[")) return "Bitte einen Namen statt einer IP-Adresse verwenden.";
  if (!/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(host)) return "Der Servername ist ungültig.";
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp)$/.test(host)) return "Interne Adressen sind nicht erlaubt.";
  if (/[\s@]/.test(u.pathname + u.search)) return "Die Adresse enthält unerlaubte Zeichen.";
  if (t.length > 300) return "Die Adresse ist zu lang.";
  return null;
}

/** Adresse so speichern, wie die Datenbank sie erwartet (Servername klein). */
export function fintsUrlNormal(url: string): string {
  const u = new URL(url.trim());
  return `https://${u.hostname.toLowerCase()}${u.port === "443" ? ":443" : ""}${u.pathname}${u.search}`;
}

// ── Vorschläge beim Hinzufügen ─────────────────────────────────────────────

export interface BankVorschlag {
  name: string;
  bic: string | null;
  ort: string | null;
  fints_url: string;
  /** woher die Adresse stammt bzw. warum sie leer ist */
  url_hinweis: string;
  /** true = Adresse belegt; false = bitte selbst eintragen/prüfen */
  url_sicher: boolean;
  anmeldename_hinweis: string;
  tan_app: string;
  blz_muster: string | null;
  blz_muster_text: string | null;
}

let blzListe: Promise<Record<string, [string, string, string]>> | null = null;
/** Bankleitzahlendatei der Bundesbank (offline, wird erst bei Bedarf geladen). */
export function blzListeLaden() {
  blzListe ??= import("@/data/blzListe.json").then((m: any) => (m.default ?? m).b);
  return blzListe;
}

interface Grossbank {
  erkennung: (bic: string, blz: string) => boolean;
  name: string;
  fints_url: string;
  quelle: string;
  anmeldename_hinweis: string;
  tan_app: string;
  blz_muster?: string;
  blz_muster_text?: string;
}

/**
 * Bekannte Großbanken. fints_url nur, wenn belegt (Quelle angegeben);
 * sonst leer – dann bitte bei der Bank erfragen.
 */
const GROSSBANKEN: Grossbank[] = [
  {
    erkennung: (bic) => bic.startsWith("COBADE") && !bic.startsWith("COBADEHD"),
    name: "Commerzbank",
    fints_url: "https://fints.commerzbank.de/fints",
    quelle: "commerzbank.de › Kommunikationsadressen für HBCI",
    anmeldename_hinweis: "Teilnehmernummer",
    tan_app: "Commerzbank photoTAN",
    blz_muster: "^(?!20041)[0-9]{3}4[0-9]{4}$",
    blz_muster_text: "alle Commerzbank-Filialen (4. Stelle der BLZ ist eine 4, ohne comdirect)",
  },
  {
    erkennung: (bic) => bic.startsWith("COBADEHD"),
    name: "comdirect",
    fints_url: "",
    quelle: "Adresse bitte bei comdirect erfragen (Hilfe › Software-Banking)",
    anmeldename_hinweis: "Zugangsnummer",
    tan_app: "comdirect photoTAN-App",
  },
  {
    erkennung: (bic) => bic.startsWith("DEUTDE"),
    name: "Deutsche Bank",
    fints_url: "https://fints.deutsche-bank.de/",
    quelle: "Hilfeseite fino (Stand 09/2025) und Institutsliste der Deutschen Kreditwirtschaft",
    anmeldename_hinweis: "Filiale + Kontonummer (ohne Unterkonto) oder Deutsche Bank ID",
    tan_app: "Deutsche Bank BestSign",
    blz_muster: "^(?!10077777)[0-9]{3}7[0-9]{4}$",
    blz_muster_text: "alle Deutsche-Bank-Filialen (4. Stelle der BLZ ist eine 7, ohne norisbank)",
  },
  {
    erkennung: (bic) => bic.startsWith("PBNKDEFF"),
    name: "Postbank",
    fints_url: "",
    quelle: "Adresse bitte bei der Postbank erfragen (seit dem Umzug auf die Technik der Deutschen Bank nicht sicher belegt)",
    anmeldename_hinweis: "Postbank ID",
    tan_app: "Postbank BestSign",
  },
  {
    erkennung: (bic) => bic.startsWith("HYVEDEMM"),
    name: "HypoVereinsbank",
    fints_url: "",
    quelle: "Adresse bitte bei der HypoVereinsbank erfragen (BLZ für FinTS laut HVB: 70020270)",
    anmeldename_hinweis: "Direkt-Banking-Nummer (10 Ziffern)",
    tan_app: "HVB photoTAN",
  },
  {
    erkennung: (bic) => bic.startsWith("INGDDEFF"),
    name: "ING",
    fints_url: "https://fints.ing.de/fints/",
    quelle: "ing.de › Hilfe › FinTS/HBCI (Aufträge vom Girokonto lassen sich darüber nicht freigeben)",
    anmeldename_hinweis: "Zugangsnummer (letzte 10 Ziffern der IBAN)",
    tan_app: "ING Banking to go",
  },
  {
    erkennung: (_bic, blz) => blz === "12030000",
    name: "DKB",
    fints_url: "https://fints.dkb.de/fints",
    quelle: "Umstellung der DKB zum 25.11.2024 (u. a. teltarif.de, ifun.de)",
    anmeldename_hinweis: "Anmeldename",
    tan_app: "DKB-App",
  },
  {
    erkennung: (bic) => bic.startsWith("CMCIDEDD"),
    name: "TARGOBANK",
    fints_url: "",
    quelle: "Adresse bitte bei der TARGOBANK erfragen",
    anmeldename_hinweis: "Benutzername",
    tan_app: "TARGOBANK easyTAN",
  },
];

/** Vorschlag für BLZ (aus IBAN oder direkt): Name/BIC aus der Bundesbank-Liste + FinTS-Daten. */
export async function vorschlagFuer(blz: string): Promise<BankVorschlag | null> {
  const liste = await blzListeLaden();
  const eintrag = liste[blz];
  if (!eintrag) return null;
  const [name, bicRoh, ort] = eintrag;
  const bic = bicRoh || null;
  const b = (bic ?? "").toUpperCase();
  const basis = { name, bic, ort, blz_muster: null, blz_muster_text: null };

  const gross = GROSSBANKEN.find((g) => g.erkennung(b, blz));
  if (gross) {
    return {
      ...basis,
      name: gross.name === "Commerzbank" || gross.name === "Deutsche Bank" ? gross.name : name,
      fints_url: gross.fints_url,
      url_hinweis: gross.quelle,
      url_sicher: !!gross.fints_url,
      anmeldename_hinweis: gross.anmeldename_hinweis,
      tan_app: gross.tan_app,
      blz_muster: gross.blz_muster ?? null,
      blz_muster_text: gross.blz_muster_text ?? null,
    };
  }

  // Volks- und Raiffeisenbanken: gemeinsames Rechenzentrum Atruvia
  if (b.startsWith("GENO")) {
    const vr = /volksbank|raiffeisen|vr[ -]?bank|vr-bank|genossenschaftsbank|spar- und kreditbank/i.test(name);
    return {
      ...basis,
      fints_url: ATRUVIA,
      url_hinweis: vr
        ? "Volks- und Raiffeisenbanken: Rechenzentrum Atruvia (wie VR Bank Augsburg-Ostallgäu)"
        : "Vorschlag Atruvia – diese Bank nutzt evtl. ein anderes Rechenzentrum (z. B. Sparda/PSD), bitte prüfen",
      url_sicher: vr,
      anmeldename_hinweis: "VR-NetKey oder Alias",
      tan_app: "SecureGo plus",
    };
  }

  // Sparkassen: Adresse je Region; belegt ist nur Bayern (BLZ beginnt mit 7)
  if (/sparkasse/i.test(name) || /^(BYLA|SOLA|HELA|NOLA|WELA|MALA|SALA|BRLA)/.test(b)) {
    const bayern = blz.startsWith("7");
    return {
      ...basis,
      fints_url: bayern ? SPARKASSE_BAYERN : "",
      url_hinweis: bayern
        ? "Sparkassen in Bayern (wie Sparkasse Allgäu)"
        : "Adresse bitte bei der Sparkasse erfragen – sie hat meist die Form https://banking-xx1.s-fints-pt-xx.de/fints30",
      url_sicher: bayern,
      anmeldename_hinweis: "Anmeldename oder Legitimations-ID",
      tan_app: "S-pushTAN",
    };
  }

  return {
    ...basis,
    fints_url: "",
    url_hinweis: "Adresse für „FinTS mit PIN/TAN“ bitte bei der Bank erfragen",
    url_sicher: false,
    anmeldename_hinweis: "",
    tan_app: "",
  };
}
