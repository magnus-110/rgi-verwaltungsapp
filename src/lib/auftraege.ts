import { supabase } from "@/integrations/supabase/client";
import { ladeEigentuemer, mandatBereit, type Eigentuemer, type Mandat } from "@/lib/eigentuemer";

export type AuftragsArt = "ueberweisung" | "einzug" | "dauerlastschrift";
export type Betragsquelle = "fest" | "abrechnung" | "wirtschaftsplan" | "nachzahlung";
export type Rhythmus = "monatlich" | "quartal" | "halbjahr" | "jahr";

export interface Auftrag {
  id: string;
  building_id: string;
  konto_iban: string;
  art: AuftragsArt;
  betragsquelle: Betragsquelle;
  titel: string;
  verwendungszweck: string | null;
  rhythmus: Rhythmus | null;
  faellig_am: string | null;
  ende_am: string | null;
  status: string;
  created_at: string;
  payment_order_items: AuftragsPosten[];
}

export interface AuftragsPosten {
  id: string;
  order_id: string;
  assignment_id: string | null;
  mandate_id: string | null;
  name: string;
  iban: string | null;
  bic: string | null;
  betrag: number | null;
  verwendungszweck: string | null;
  aktiv: boolean;
}

/** Eine fällige Zahlung oder ein fälliger Einzug aus einem Auftrag. */
export interface FaelligerPosten {
  schluessel: string;
  orderId: string;
  orderItemId: string;
  art: "ueberweisung" | "lastschrift";
  titel: string;
  buildingId: string;
  kontoIban: string;
  faelligAm: string;
  name: string;
  iban: string | null;
  bic: string | null;
  betrag: number;
  verwendungszweck: string;
  mandat: Mandat | null;
  /** warum der Posten (noch) nicht gesendet werden kann */
  hinderung: string | null;
}

/** Wie weit im Voraus Einzüge in der Freigabe erscheinen. */
export const VORLAUF_TAGE = 14;

const MONATE: Record<Rhythmus, number> = { monatlich: 1, quartal: 3, halbjahr: 6, jahr: 12 };

export function plusMonate(iso: string, n: number): string {
  const [j, m, t] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 1 + n, 1));
  const letzter = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(t, letzter));
  return d.toISOString().slice(0, 10);
}

export function heuteIso(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** Frühester Einzugstag einer Basislastschrift: zwei Bankarbeitstage ab heute. */
export function fruehesterEinzug(ab = new Date()): string {
  const d = new Date(ab);
  let n = 0;
  while (n < 2) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) n++;
  }
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export async function ladeAuftraege(nurAktive = true): Promise<Auftrag[]> {
  let q = (supabase as any).from("payment_orders").select("*, payment_order_items(*)").order("created_at", { ascending: false });
  if (nurAktive) q = q.eq("status", "aktiv");
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Auftrag[];
}

/** Welche Auftragsposten stecken schon in einem Zahllauf (je Fälligkeitstag)? */
async function ladeVerplant(itemIds: string[]): Promise<Map<string, Set<string>>> {
  const m = new Map<string, Set<string>>();
  for (let i = 0; i < itemIds.length; i += 100) {
    const { data } = await (supabase as any)
      .from("payment_run_items")
      .select("order_item_id, run:payment_runs!inner(status, faellig_am, ausfuehrung_am)")
      .in("order_item_id", itemIds.slice(i, i + 100))
      .not("run.status", "in", "(abgebrochen,fehler)");
    (data ?? []).forEach((r: any) => {
      const s = m.get(r.order_item_id) ?? new Set<string>();
      s.add(r.run?.faellig_am ?? r.run?.ausfuehrung_am ?? "*");
      m.set(r.order_item_id, s);
    });
  }
  return m;
}

/**
 * Alles, was aus Aufträgen jetzt in die Freigabe gehört: einmalige
 * Überweisungen und Einzüge, die noch nicht gesendet sind, und von
 * Dauerlastschriften die Einzüge der nächsten {@link VORLAUF_TAGE} Tage.
 */
export async function faelligeAuftragsposten(auftraege?: Auftrag[]): Promise<FaelligerPosten[]> {
  const liste = auftraege ?? (await ladeAuftraege(true));
  const alleItems = liste.flatMap((a) => a.payment_order_items.filter((i) => i.aktiv));
  if (!alleItems.length) return [];
  const verplant = await ladeVerplant(alleItems.map((i) => i.id));

  // Eigentümer (Mandate, Hausgeld) je Liegenschaft – nur wo Einzüge vorkommen
  const eigentuemer = new Map<string, Eigentuemer[]>();
  for (const b of new Set(liste.filter((a) => a.art !== "ueberweisung").map((a) => a.building_id))) {
    eigentuemer.set(b, await ladeEigentuemer(b));
  }
  const { data: mandateDirekt } = await (supabase as any)
    .from("sepa_mandates")
    .select("*")
    .in("id", alleItems.map((i) => i.mandate_id).filter(Boolean));

  const heute = heuteIso();
  const horizont = plusMonate(heute, 0).slice(0, 10);
  const grenze = new Date(Date.now() + VORLAUF_TAGE * 86400000).toISOString().slice(0, 10);
  const ergebnis: FaelligerPosten[] = [];

  for (const a of liste) {
    const items = a.payment_order_items.filter((i) => i.aktiv);
    // Fälligkeitstage
    let tage: string[] = [];
    if (a.art === "dauerlastschrift" && a.rhythmus && a.faellig_am) {
      const schritt = MONATE[a.rhythmus];
      // nach dem letzten schon verplanten Termin weitermachen
      const letzter = items
        .flatMap((i) => [...(verplant.get(i.id) ?? [])])
        .filter((d) => d !== "*")
        .sort()
        .at(-1);
      let d = a.faellig_am;
      for (let n = 0; n < 240 && d <= grenze; n++) {
        if ((!a.ende_am || d <= a.ende_am) && (!letzter || d > letzter)) tage.push(d);
        d = plusMonate(a.faellig_am, schritt * (n + 1));
      }
    } else {
      // Einmal-Aufträge: Überweisungen ab drei Tage vor dem Termin, Einzüge ab
      // {VORLAUF_TAGE} Tage vorher (dann gehen sie terminiert zur Bank).
      const termin = a.faellig_am ?? heute;
      const vorlauf = new Date(Date.now() + (a.art === "einzug" ? VORLAUF_TAGE : 3) * 86400000).toISOString().slice(0, 10);
      tage = termin <= vorlauf ? [termin] : [];
    }

    for (const tag of tage) {
      for (const it of items) {
        const schonDa = verplant.get(it.id);
        if (schonDa && (a.art !== "dauerlastschrift" || schonDa.has(tag) || schonDa.has("*"))) continue;

        const e = it.assignment_id ? (eigentuemer.get(a.building_id) ?? []).find((x) => x.assignmentId === it.assignment_id) : undefined;
        const mandat: Mandat | null = (mandateDirekt ?? []).find((m: any) => m.id === it.mandate_id) ?? e?.mandat ?? null;
        let betrag = Number(it.betrag) || 0;
        if (a.betragsquelle === "wirtschaftsplan") betrag = Math.round((e?.hausgeldMonat ?? 0) * (a.rhythmus ? MONATE[a.rhythmus] : 1) * 100) / 100;

        const lastschrift = a.art !== "ueberweisung";
        let hinderung: string | null = null;
        if (betrag <= 0) hinderung = a.betragsquelle === "wirtschaftsplan" ? "Kein Hausgeld hinterlegt" : "Kein Betrag";
        else if (lastschrift && !mandatBereit(mandat)) hinderung = "Mandat fehlt oder unvollständig";
        else if (!lastschrift && !it.iban) hinderung = "IBAN fehlt";

        // {monat} → 09/26, {einheit} → 0002, {lage} → EG links
        const monat = tag.slice(5, 7) + "/" + tag.slice(2, 4);
        const einheit = e?.einheit ? (/^\d+$/.test(e.einheit) ? e.einheit.padStart(4, "0") : e.einheit) : "";
        ergebnis.push({
          schluessel: `${it.id}|${tag}`,
          orderId: a.id,
          orderItemId: it.id,
          art: lastschrift ? "lastschrift" : "ueberweisung",
          titel: a.titel,
          buildingId: a.building_id,
          kontoIban: a.konto_iban,
          faelligAm: tag < horizont ? heute : tag,
          name: lastschrift ? mandat?.kontoinhaber || it.name : it.name,
          iban: lastschrift ? mandat?.iban ?? it.iban : it.iban,
          bic: lastschrift ? mandat?.bic ?? it.bic : it.bic,
          betrag,
          verwendungszweck: (it.verwendungszweck || a.verwendungszweck || a.titel)
            .replace(/\{monat\}/g, monat)
            .replace(/\{einheit\}/g, einheit)
            .replace(/\{lage\}/g, e?.lage ?? "")
            .replace(/\s+/g, " ")
            .replace(/\s*-\s*$/, "")
            .trim(),
          mandat,
          hinderung,
        });
      }
    }
  }
  return ergebnis;
}
