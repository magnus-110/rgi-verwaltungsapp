import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowDownLeft, ArrowUpRight, Check, CheckCircle2, ChevronLeft, Info, Landmark, Loader2, Plus, Repeat, ShieldCheck, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useManagementMode } from "@/hooks/useManagementMode";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { bankName, cleanIban, euro, ibanFormatiert } from "@/lib/bankInfo";
import { ibanGueltig } from "@/lib/sepa";
import { ladeEigentuemer, mandatBereit, mandatVerfallen, monatlich, type Eigentuemer } from "@/lib/eigentuemer";
import { fruehesterEinzug, heuteIso, plusMonate, type AuftragsArt, type Betragsquelle, type Rhythmus } from "@/lib/auftraege";
import type { KontoZeile } from "@/components/konten/kontenTypes";

interface Empfaenger {
  name: string;
  iban: string;
  betrag: string;
  zweck: string;
}

const zahl = (t: string) => {
  const v = Number(String(t).replace(/\s/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(v) ? v : NaN;
};
const leerEmpfaenger = (): Empfaenger => ({ name: "", iban: "", betrag: "", zweck: "" });

/** Einheit für Verwendungszwecke: 3 → 0003, „W 14" bleibt „W 14". */
const einheitText = (e: Eigentuemer | null | undefined) => (e?.einheit ? (/^\d+$/.test(e.einheit) ? e.einheit.padStart(4, "0") : e.einheit) : "");

/** „Abrechnungsspitze 2025 - Guthaben 0003 EG rechts" */
const spitzenZweck = (jahr: string, nachzahlung: boolean, e: Eigentuemer | null | undefined) =>
  `Abrechnungsspitze ${jahr} - ${nachzahlung ? "Nachzahlung" : "Guthaben"} ${einheitText(e)} ${e?.lage ?? ""}`.replace(/\s+/g, " ").trim();

/** „01–09/2026“, „11/2025–02/2026“ oder „09/2026“ (Monate als JJJJ-MM). */
export function zeitraumText(von: string, bis: string): string {
  if (!von || !bis) return "";
  const [vj, vm] = von.split("-");
  const [bj, bm] = bis.split("-");
  if (von === bis) return `${vm}/${vj}`;
  return vj === bj ? `${vm}–${bm}/${bj}` : `${vm}/${vj}–${bm}/${bj}`;
}

/** Monate von–bis (JJJJ-MM, jeweils einschließlich) als Liste. */
function monateZwischen(von: string, bis: string): string[] {
  const out: string[] = [];
  if (!von || !bis || von > bis) return out;
  let [j, m] = von.split("-").map(Number);
  for (let i = 0; i < 120; i++) {
    const t = `${j}-${String(m).padStart(2, "0")}`;
    if (t > bis) break;
    out.push(t);
    m++;
    if (m > 12) { m = 1; j++; }
  }
  return out;
}

/** Vormonat (JJJJ-MM). */
function vormonat(jm: string): string {
  let [j, m] = jm.split("-").map(Number);
  m--;
  if (m < 1) { m = 12; j--; }
  return `${j}-${String(m).padStart(2, "0")}`;
}

/** Platzhalter im Verwendungszweck eines Einzugs füllen. */
function zweckFuellen(vorlage: string, e: Eigentuemer | null | undefined, monatJahr: string, zeitraum: string): string {
  const [jahr, monat] = (monatJahr || "").split("-");
  return vorlage
    .replace(/\{einheit\}/g, einheitText(e))
    .replace(/\{lage\}/g, e?.lage ?? "")
    .replace(/\{monat\}/g, monat ?? "")
    .replace(/\{jahr\}/g, jahr ?? "")
    .replace(/\{zeitraum\}/g, zeitraum)
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*$/, "")
    .trim();
}

const NZ_STANDARD = "Hausgeld-Nachzahlung {zeitraum} - {einheit} {lage}";
const NZ_ERSTATTUNG = "Hausgeld-Erstattung {zeitraum} - {einheit} {lage}";

const PLATZHALTER: { wert: string; text: string }[] = [
  { wert: "{einheit}", text: "Einheit" },
  { wert: "{lage}", text: "Lage" },
  { wert: "{monat}", text: "Monat" },
  { wert: "{jahr}", text: "Jahr" },
  { wert: "{zeitraum}", text: "Zeitraum" },
];

/**
 * Neuer Auftrag: Überweisung (einmalig an einen oder mehrere Empfänger),
 * Einzug (einmalige Lastschrift von Eigentümern) oder Dauerlastschrift
 * (z. B. Hausgeld jeden Monat aus dem Wirtschaftsplan). Alles landet in der
 * Freigabe und geht erst mit TAN raus.
 */
export function NeuerAuftrag({ onFertig, onAbbrechen }: { onFertig: () => void; onAbbrechen: () => void }) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { managementMode } = useManagementMode();
  const [art, setArt] = useState<AuftragsArt>("ueberweisung");
  const [quelle, setQuelle] = useState<Betragsquelle>("fest");
  const [buildingId, setBuildingId] = useState<string>("");
  const [kontoIban, setKontoIban] = useState<string>("");
  const [titel, setTitel] = useState("");
  const [zweck, setZweck] = useState("");
  const [faellig, setFaellig] = useState(heuteIso());
  const [empfaenger, setEmpfaenger] = useState<Empfaenger[]>([leerEmpfaenger()]);
  const [festBetrag, setFestBetrag] = useState("");
  const [auswahl, setAuswahl] = useState<Record<string, boolean>>({});
  const [ergebnis, setErgebnis] = useState<Record<string, string>>({}); // Abrechnungsspitze je Eigentümer
  const [guthabenAuszahlen, setGuthabenAuszahlen] = useState(true);
  const [spitzenJahr, setSpitzenJahr] = useState(String(new Date().getFullYear() - 1));
  const [rhythmus, setRhythmus] = useState<Rhythmus>("monatlich");
  const [tag, setTag] = useState("1");
  const [erster, setErster] = useState(() => plusMonate(heuteIso().slice(0, 8) + "01", 1));
  const [speichert, setSpeichert] = useState(false);
  // Hausgeld-Nachzahlung (rückwirkende Hausgeldänderung)
  const [nzAb, setNzAb] = useState(() => `${new Date().getFullYear()}-01`);
  const [nzBis, setNzBis] = useState(() => vormonat(heuteIso().slice(0, 7)));
  const [nzWerte, setNzWerte] = useState<Record<string, string>>({});
  const [nzGuthaben, setNzGuthaben] = useState(false);
  // Monat/Jahr für die Platzhalter {monat} und {jahr}
  const [zweckMonat, setZweckMonat] = useState(() => heuteIso().slice(0, 7));

  const { data: gebaeude = [] } = useQuery({
    queryKey: ["konten-liegenschaften"],
    queryFn: async () => {
      const { data, error } = await supabase.from("buildings").select("id, name, management_mode").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: konten = [] } = useQuery({
    queryKey: ["konten-uebersicht"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("v_konten_uebersicht").select("*");
      if (error) throw error;
      return (data ?? []) as KontoZeile[];
    },
  });
  const { data: eigentuemer = [], isFetching: ladeEig } = useQuery({
    queryKey: ["mandate", buildingId],
    enabled: !!buildingId && art !== "ueberweisung" || (!!buildingId && quelle === "abrechnung"),
    queryFn: () => ladeEigentuemer(buildingId),
  });

  // Hausgeld-Verlauf je Einheit (für die Nachzahlung)
  const { data: kosten = [] } = useQuery({
    queryKey: ["hausgeld-verlauf", buildingId, eigentuemer.map((e) => e.assignmentId).join(",")],
    enabled: !!buildingId && quelle === "nachzahlung" && eigentuemer.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("contact_building_costs")
        .select("assignment_id, amount, interval, valid_from, valid_to")
        .in("assignment_id", eigentuemer.map((e) => e.assignmentId))
        .eq("cost_type", "Hausgeld");
      if (error) throw error;
      return (data ?? []) as { assignment_id: string; amount: number; interval: string | null; valid_from: string | null; valid_to: string | null }[];
    },
  });
  /** Hausgeld je Monat am Stichtag (JJJJ-MM-TT) laut Verlauf. */
  const hausgeldAm = (assignmentId: string, tag: string) =>
    Math.round(
      kosten
        .filter((k) => k.assignment_id === assignmentId && (!k.valid_from || k.valid_from <= tag) && (!k.valid_to || k.valid_to >= tag))
        .reduce((s, k) => s + monatlich(Number(k.amount) || 0, k.interval), 0) * 100,
    ) / 100;
  const nzMonate = monateZwischen(nzAb, nzBis);
  const nzZeitraum = zeitraumText(nzAb, nzBis);
  /** Rechnung je Eigentümer: alt (Monat vor der Änderung), neu (je Monat), Differenz gesamt */
  const nzRechnung = (e: Eigentuemer) => {
    const altTag = `${vormonat(nzAb)}-15`;
    const alt = hausgeldAm(e.assignmentId, altTag);
    const neu = nzMonate.map((m) => hausgeldAm(e.assignmentId, `${m}-15`));
    const differenz = Math.round(neu.reduce((s, n) => s + (n - alt), 0) * 100) / 100;
    return { alt, neu: neu[neu.length - 1] ?? 0, differenz };
  };

  const auswahlListe = useMemo(
    () =>
      konten
        .filter((k) => gebaeude.some((g: any) => g.id === k.building_id && (g.management_mode ?? "weg") === managementMode))
        .map((k) => ({ ...k, haus: gebaeude.find((g: any) => g.id === k.building_id)?.name ?? "" }))
        .sort((a, b) => a.haus.localeCompare(b.haus) || Number(/r[üu]cklage/i.test(a.display_name ?? "")) - Number(/r[üu]cklage/i.test(b.display_name ?? ""))),
    [konten, gebaeude, managementMode],
  );

  // Art wechselt → passende Betragsquelle und Datum
  useEffect(() => {
    if (art === "dauerlastschrift") {
      setQuelle("wirtschaftsplan");
      setZweck((z) => z || "Hausgeld {monat} - {einheit} {lage}");
      setTitel((t) => t || "Hausgeld");
    }
    else {
      if (quelle === "wirtschaftsplan") setQuelle("fest");
      // Vorgaben der Dauerlastschrift nicht in andere Arten mitnehmen
      setZweck((z) => (z.includes("{") ? "" : z));
      setTitel((t) => (t === "Hausgeld" ? "" : t));
    }
    if (art === "einzug") {
      setFaellig(fruehesterEinzug());
      setZweckMonat(fruehesterEinzug().slice(0, 7));
    }
    if (art !== "einzug" && quelle === "nachzahlung") setQuelle("fest");
    if (art === "ueberweisung") setFaellig(heuteIso());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [art]);

  // Abrechnungsspitze: zuletzt beschlossenes Ergebnis der Jahresabrechnung
  const { data: beschluss } = useQuery({
    queryKey: ["settlement-results-auftrag", buildingId],
    enabled: !!buildingId && quelle === "abrechnung",
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("settlement_results")
        .select("assignment_id, nachzahlung, beschlossen_am, geschaeftsjahr, billing_period_id")
        .eq("building_id", buildingId)
        .order("beschlossen_am", { ascending: false })
        .limit(2000);
      if (error) throw error;
      const erste = data?.[0];
      if (!erste) return null;
      return { jahr: erste.geschaeftsjahr as number | null, am: erste.beschlossen_am as string, zeilen: (data ?? []).filter((z: any) => z.billing_period_id === erste.billing_period_id) };
    },
  });
  useEffect(() => {
    if (!beschluss) return;
    setErgebnis(Object.fromEntries(beschluss.zeilen.map((z: any) => [z.assignment_id, Number(z.nachzahlung) ? String(Number(z.nachzahlung).toFixed(2)).replace(".", ",") : ""])));
    if (beschluss.jahr) setSpitzenJahr(String(beschluss.jahr));
    if (beschluss.jahr && !titel) setTitel(`Abrechnungsspitze ${beschluss.jahr}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beschluss]);

  // Eigentümer mit Mandat vorauswählen
  useEffect(() => {
    setAuswahl(Object.fromEntries(eigentuemer.map((e) => [e.assignmentId, mandatBereit(e.mandat)])));
  }, [eigentuemer]);

  const istEinzug = art !== "ueberweisung";
  const ausgewaehlt = eigentuemer.filter((e) => auswahl[e.assignmentId]);

  // Vorschau der Posten
  const posten = useMemo(() => {
    if (quelle === "fest" && art === "ueberweisung") {
      return empfaenger
        .filter((e) => e.name.trim() || e.iban.trim() || e.betrag.trim())
        .map((e) => ({ name: e.name.trim(), iban: cleanIban(e.iban), betrag: zahl(e.betrag), zweck: e.zweck.trim(), e: null as Eigentuemer | null, art: "ueberweisung" as const }));
    }
    if (quelle === "fest") {
      return ausgewaehlt.map((e) => ({
        name: e.name,
        iban: e.mandat?.iban ?? e.iban,
        betrag: zahl(festBetrag),
        zweck: art === "einzug" && zweck.trim() ? zweckFuellen(zweck, e, zweckMonat, "") : "",
        e,
        art: "einzug" as const,
      }));
    }
    if (quelle === "nachzahlung") {
      return eigentuemer
        .map((e) => {
          const eigen = nzWerte[e.assignmentId];
          const v = eigen !== undefined && eigen.trim() !== "" ? zahl(eigen) : nzRechnung(e).differenz;
          return { e, v };
        })
        .filter(({ v }) => Number.isFinite(v) && Math.abs(v) >= 0.01)
        .filter(({ v }) => v > 0 || nzGuthaben)
        // ohne vollständiges Mandat kann nicht eingezogen werden (steht in der Liste dabei)
        .filter(({ e, v }) => v < 0 || mandatBereit(e.mandat))
        .map(({ e, v }) => ({
          name: e.name,
          iban: v > 0 ? e.mandat?.iban ?? e.iban : e.iban,
          betrag: Math.abs(v),
          zweck: zweckFuellen(zweck || (v > 0 ? NZ_STANDARD : NZ_ERSTATTUNG), e, zweckMonat, nzZeitraum),
          e,
          art: v > 0 ? ("einzug" as const) : ("ueberweisung" as const),
        }));
    }
    if (quelle === "abrechnung") {
      return eigentuemer
        .map((e) => ({ e, v: zahl(ergebnis[e.assignmentId] ?? "") }))
        .filter(({ v }) => Number.isFinite(v) && v !== 0)
        .filter(({ v }) => v > 0 || guthabenAuszahlen)
        .map(({ e, v }) => ({
          name: e.name,
          iban: v > 0 ? e.mandat?.iban ?? e.iban : e.iban,
          betrag: Math.abs(v),
          zweck: spitzenZweck(spitzenJahr, v > 0, e),
          e,
          art: v > 0 ? ("einzug" as const) : ("ueberweisung" as const),
        }));
    }
    // Wirtschaftsplan
    const monate = { monatlich: 1, quartal: 3, halbjahr: 6, jahr: 12 }[rhythmus];
    return ausgewaehlt.map((e) => ({ name: e.name, iban: e.mandat?.iban ?? e.iban, betrag: Math.round(e.hausgeldMonat * monate * 100) / 100, zweck: "", e, art: "einzug" as const }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quelle, art, empfaenger, ausgewaehlt, festBetrag, eigentuemer, ergebnis, guthabenAuszahlen, rhythmus, spitzenJahr, nzWerte, nzGuthaben, kosten, nzAb, nzBis, zweck, zweckMonat]);

  const summeEin = posten.filter((p) => p.art === "einzug").reduce((s, p) => s + (Number.isFinite(p.betrag) ? p.betrag : 0), 0);
  const summeAus = posten.filter((p) => p.art === "ueberweisung").reduce((s, p) => s + (Number.isFinite(p.betrag) ? p.betrag : 0), 0);

  const fehler = (): string | null => {
    if (!buildingId || !kontoIban) return "Bitte Liegenschaft und Konto wählen.";
    if (!posten.length) return "Bitte mindestens eine Zahlung eintragen.";
    for (const p of posten) {
      if (!p.name) return "Bei jeder Zahlung bitte einen Namen eintragen.";
      if (!Number.isFinite(p.betrag) || p.betrag <= 0) return `Betrag bei ${p.name} fehlt.`;
      if (p.art === "ueberweisung" && !ibanGueltig(p.iban)) return `IBAN bei ${p.name} fehlt oder ist falsch.`;
      if (p.art === "einzug" && !mandatBereit(p.e?.mandat)) return `Für ${p.name} gibt es kein vollständiges Mandat.`;
    }
    if (art === "einzug" && faellig < fruehesterEinzug()) return `Einzug frühestens am ${fruehesterEinzug().split("-").reverse().join(".")}.`;
    if (art === "dauerlastschrift" && !erster) return "Bitte den ersten Einzug angeben.";
    if (quelle === "abrechnung" && !/^\d{4}$/.test(spitzenJahr)) return "Bitte das Abrechnungsjahr angeben.";
    if (quelle === "nachzahlung" && (!nzAb || !nzBis || nzAb > nzBis)) return "Bitte den Zeitraum der Nachzahlung prüfen.";
    const zuLang = posten.find((p) => (p.zweck || "").length > 140);
    if (zuLang) return `Verwendungszweck bei ${zuLang.name} ist zu lang (höchstens 140 Zeichen).`;
    return null;
  };

  const anlegen = async () => {
    const f = fehler();
    if (f) {
      toast.error(f);
      return;
    }
    setSpeichert(true);
    try {
      const gruppen: { art: AuftragsArt; liste: typeof posten }[] =
        quelle === "abrechnung" || quelle === "nachzahlung"
          ? [
              { art: "einzug" as AuftragsArt, liste: posten.filter((p) => p.art === "einzug") },
              { art: "ueberweisung" as AuftragsArt, liste: posten.filter((p) => p.art === "ueberweisung") },
            ].filter((g) => g.liste.length)
          : [{ art, liste: posten }];
      for (const g of gruppen) {
        const ersterTag = art === "dauerlastschrift" ? `${erster.slice(0, 8)}${String(Math.min(28, Math.max(1, Number(tag) || 1))).padStart(2, "0")}` : faellig;
        const standardTitel =
          art === "dauerlastschrift"
            ? "Hausgeld"
            : quelle === "abrechnung"
              ? (g.art === "einzug" ? `Abrechnungsspitze ${spitzenJahr} – Nachzahlungen` : `Abrechnungsspitze ${spitzenJahr} – Guthaben`)
              : quelle === "nachzahlung"
                ? (g.art === "einzug" ? `Hausgeld-Nachzahlung ${nzZeitraum}` : `Hausgeld-Erstattung ${nzZeitraum}`)
                : g.art === "einzug" ? "Einzug" : "Überweisung";
        const { data: auftrag, error } = await (supabase as any)
          .from("payment_orders")
          .insert({
            building_id: buildingId,
            konto_iban: kontoIban,
            art: g.art,
            betragsquelle: quelle,
            titel: (quelle === "nachzahlung" && g.art === "ueberweisung" ? "" : titel.trim()) || standardTitel,
            verwendungszweck:
              quelle === "abrechnung"
                ? null
                : quelle === "nachzahlung"
                  ? zweck.trim() || NZ_STANDARD
                  : zweck.trim() || (art === "dauerlastschrift" ? "Hausgeld {monat} - {einheit} {lage}" : null),
            rhythmus: art === "dauerlastschrift" ? rhythmus : null,
            faellig_am: ersterTag,
            status: "aktiv",
            created_by: profile?.user_id ?? null,
          })
          .select("id")
          .single();
        if (error) throw error;
        const { error: e2 } = await (supabase as any).from("payment_order_items").insert(
          g.liste.map((p) => ({
            order_id: auftrag.id,
            assignment_id: p.e?.assignmentId ?? null,
            mandate_id: g.art !== "ueberweisung" ? p.e?.mandat?.id ?? null : null,
            name: p.name,
            iban: p.iban,
            bic: g.art !== "ueberweisung" ? p.e?.mandat?.bic ?? null : null,
            betrag: quelle === "wirtschaftsplan" ? null : Math.round(p.betrag * 100) / 100,
            verwendungszweck: p.zweck || null,
          })),
        );
        if (e2) {
          await (supabase as any).from("payment_orders").delete().eq("id", auftrag.id);
          throw e2;
        }
      }
      toast.success(art === "dauerlastschrift" ? "Dauerlastschrift angelegt – die Einzüge erscheinen rechtzeitig in der Freigabe" : "Auftrag angelegt – er liegt jetzt in der Freigabe");
      queryClient.invalidateQueries({ queryKey: ["auftraege"] });
      queryClient.invalidateQueries({ queryKey: ["freigabe-auftraege"] });
      onFertig();
    } catch (e: any) {
      toast.error(e?.message || "Auftrag konnte nicht angelegt werden");
    } finally {
      setSpeichert(false);
    }
  };

  const konto = auswahlListe.find((k) => k.building_id === buildingId && k.iban === kontoIban) ?? null;
  const offenerFehler = fehler();
  const rhythmusText = { monatlich: "Monat", quartal: "Quartal", halbjahr: "Halbjahr", jahr: "Jahr" }[rhythmus];
  const datumDe = (d: string) => d.split("-").reverse().join(".");
  const beispielZweck = (() => {
    const e = ausgewaehlt[0] ?? eigentuemer[0];
    const m = erster.slice(5, 7) + "/" + erster.slice(2, 4);
    const einheit = e?.einheit ? (/^\d+$/.test(e.einheit) ? e.einheit.padStart(4, "0") : e.einheit) : "0002";
    return (zweck || "Hausgeld {monat} - {einheit} {lage}")
      .replace(/\{monat\}/g, m)
      .replace(/\{einheit\}/g, einheit)
      .replace(/\{lage\}/g, e?.lage ?? "EG links")
      .replace(/\s+/g, " ")
      .trim();
  })();
  const beispielEinzug = (() => {
    const e = ausgewaehlt[0] ?? eigentuemer.find((x) => x.lage) ?? eigentuemer[0];
    const vorlage = zweck || (quelle === "nachzahlung" ? NZ_STANDARD : "");
    return vorlage ? zweckFuellen(vorlage, e, zweckMonat, quelle === "nachzahlung" ? nzZeitraum : "") : "";
  })();
  const setzeEmpfaenger = (i: number, feld: keyof Empfaenger, wert: string) => setEmpfaenger((l) => l.map((x, j) => (j === i ? { ...x, [feld]: wert } : x)));

  const ARTEN: { wert: AuftragsArt; titel: string; text: string; icon: typeof ArrowUpRight }[] = [
    { wert: "ueberweisung", titel: "Überweisung", text: "Geld an einen oder mehrere Empfänger", icon: ArrowUpRight },
    { wert: "einzug", titel: "Einzug", text: "einmalige Lastschrift von Eigentümern", icon: ArrowDownLeft },
    { wert: "dauerlastschrift", titel: "Dauerlastschrift", text: "regelmäßig, z. B. Hausgeld", icon: Repeat },
  ];

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-6">
      <div>
        <button type="button" onClick={onAbbrechen} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Zahlungen
        </button>
        <h1 className="mt-2 text-2xl font-bold md:text-3xl">Neuer Auftrag</h1>
        <p className="mt-1 text-sm text-muted-foreground">Alles landet zuerst in der Freigabe – Geld bewegt sich erst mit deiner TAN.</p>
      </div>

      {/* Art */}
      <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Art des Auftrags">
        {ARTEN.map(({ wert, titel: t, text, icon: Icon }) => {
          const aktiv = art === wert;
          return (
            <button
              key={wert}
              type="button"
              role="radio"
              aria-checked={aktiv}
              onClick={() => setArt(wert)}
              className={cn(
                "group flex items-center gap-3 rounded-2xl border bg-card p-4 text-left transition-all",
                aktiv ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary" : "hover:border-foreground/25 hover:shadow-sm",
              )}
            >
              <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", aktiv ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:text-foreground")}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">{t}</span>
                <span className="block text-xs text-muted-foreground">{text}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {/* 1 Konto */}
          <Abschnitt nr={1} titel={istEinzug ? "Auf welches Konto?" : "Von welchem Konto?"}>
            <Select
              value={kontoIban ? `${buildingId}|${kontoIban}` : ""}
              onValueChange={(v) => {
                const [b, i] = v.split("|");
                setBuildingId(b);
                setKontoIban(i);
              }}
            >
              <SelectTrigger className="h-auto min-h-[56px] w-full min-w-0 overflow-hidden py-2 text-left">
                {konto ? (
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Landmark className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {konto.haus} · {konto.display_name || "Konto"}
                      </div>
                      <div className="truncate font-mono text-xs text-muted-foreground">
                        {bankName(konto.iban, null)} · {ibanFormatiert(konto.iban)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <span className="text-muted-foreground">Liegenschaft und Konto wählen …</span>
                )}
              </SelectTrigger>
              <SelectContent>
                {auswahlListe.map((k) => (
                  <SelectItem key={`${k.building_id}|${k.iban}`} value={`${k.building_id}|${k.iban}`}>
                    <span className="block font-medium">
                      {k.haus} · {k.display_name || "Konto"}
                    </span>
                    <span className="block font-mono text-xs text-muted-foreground">
                      {bankName(k.iban, null)} · {ibanFormatiert(k.iban)}
                      {k.saldo != null && ` · ${euro(Number(k.saldo))}`}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Abschnitt>

          {/* 2 Wer / Betrag */}
          <Abschnitt
            nr={2}
            titel={art === "ueberweisung" && quelle === "fest" ? "An wen?" : art === "dauerlastschrift" ? "Wer zahlt Hausgeld?" : "Von wem und wie viel?"}
            rechts={
              art !== "dauerlastschrift" ? (
                <div className="inline-flex rounded-full bg-muted p-1 text-sm" role="tablist" aria-label="Betrag">
                  {(
                    [
                      ["fest", "Fester Betrag"],
                      ...(art === "einzug" ? [["nachzahlung", "Hausgeld-Nachzahlung"]] : []),
                      ["abrechnung", "Abrechnungsspitze"],
                    ] as [Betragsquelle, string][]
                  ).map(([w, t]) => (
                    <button
                      key={w}
                      type="button"
                      role="tab"
                      aria-selected={quelle === w}
                      onClick={() => setQuelle(w)}
                      className={cn("rounded-full px-3.5 py-1.5 font-medium transition-colors", quelle === w ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">Betrag aus dem Wirtschaftsplan</span>
              )
            }
          >
            {/* Überweisung an freie Empfänger */}
            {quelle === "fest" && art === "ueberweisung" && (
              <div className="space-y-3">
                {empfaenger.map((e, i) => (
                  <EmpfaengerZeile
                    key={i}
                    nr={i + 1}
                    e={e}
                    mehrere={empfaenger.length > 1}
                    onAendern={(feld, wert) => setzeEmpfaenger(i, feld, wert)}
                    onEntfernen={() => setEmpfaenger((l) => l.filter((_, j) => j !== i))}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setEmpfaenger((l) => [...l, leerEmpfaenger()])}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed py-3 text-sm font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                >
                  <Plus className="h-4 w-4" /> Weiteren Empfänger hinzufügen
                </button>
              </div>
            )}

            {/* Einzug mit festem Betrag */}
            {quelle === "fest" && istEinzug && (
              <div className="space-y-4">
                <BetragFeld label="Betrag je Eigentümer" wert={festBetrag} onAendern={setFestBetrag} />
                <EigentuemerListe
                  liste={eigentuemer}
                  laedt={ladeEig}
                  ohneKonto={!buildingId}
                  auswahl={auswahl}
                  setAuswahl={setAuswahl}
                  wert={() => (Number.isFinite(zahl(festBetrag)) && zahl(festBetrag) > 0 ? euro(zahl(festBetrag)) : "–")}
                />
              </div>
            )}

            {/* Abrechnungsspitze */}
            {quelle === "abrechnung" && (
              <div className="space-y-4">
                <div className="flex gap-3 rounded-xl bg-muted/60 p-3 text-sm">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    {beschluss ? (
                      <>
                        Übernommen aus der Abrechnung{beschluss.jahr ? ` ${beschluss.jahr}` : ""}. <b>Nachzahlungen</b> werden eingezogen, <b>Guthaben</b> (mit Minus) überwiesen – bei Bedarf hier anpassen.
                      </>
                    ) : buildingId ? (
                      <>Noch keine Abrechnung übernommen (Finanzen › Abrechnung › „Für Zahlungen übernehmen“). Bis dahin von Hand eintragen: Nachzahlung positiv, Guthaben mit Minus.</>
                    ) : (
                      <>Erst das Konto wählen – dann stehen hier die Ergebnisse der Jahresabrechnung.</>
                    )}
                  </div>
                </div>
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 text-sm">
                  <span>
                    <span className="block font-medium">Guthaben auszahlen</span>
                    <span className="block text-xs text-muted-foreground">Aus: mit dem nächsten Hausgeld verrechnen</span>
                  </span>
                  <Switch checked={guthabenAuszahlen} onCheckedChange={setGuthabenAuszahlen} />
                </label>
                <div className="divide-y rounded-xl border">
                  {eigentuemer.map((e) => {
                    const v = zahl(ergebnis[e.assignmentId] ?? "");
                    return (
                      <div key={e.assignmentId} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                        <Avatar name={e.name} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{e.name}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            {e.einheit && <span>Einheit {e.einheit}</span>}
                            <MandatChip e={e} />
                          </div>
                          {Number.isFinite(v) && v !== 0 && <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{spitzenZweck(spitzenJahr, v > 0, e)}</div>}
                        </div>
                        <div className="flex items-center gap-2">
                          {Number.isFinite(v) && v !== 0 && (
                            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", v > 0 ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" : "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300")}>
                              {v > 0 ? "Einzug" : "Guthaben"}
                            </span>
                          )}
                          <div className="relative w-32">
                            <Input
                              inputMode="decimal"
                              placeholder="0,00"
                              value={ergebnis[e.assignmentId] ?? ""}
                              onChange={(ev) => setErgebnis((x) => ({ ...x, [e.assignmentId]: ev.target.value }))}
                              className="h-10 pr-7 text-right tabular-nums"
                              aria-label={`Ergebnis ${e.name}`}
                            />
                            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {!eigentuemer.length && <Leer text={buildingId ? (ladeEig ? "Lädt …" : "Keine Eigentümer hinterlegt") : "Bitte zuerst das Konto wählen"} />}
                </div>
              </div>
            )}

            {/* Hausgeld-Nachzahlung (rückwirkende Hausgeldänderung) */}
            {quelle === "nachzahlung" && (
              <div className="space-y-4">
                <div className="flex gap-3 rounded-xl bg-muted/60 p-3 text-sm">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    Für jeden Monat im Zeitraum: <b>neues Hausgeld minus altes Hausgeld</b> (aus dem Hausgeld-Verlauf der Einheit). Das alte Hausgeld ist das aus dem Monat vor der Änderung.
                    Beträge lassen sich je Eigentümer überschreiben.
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Feld label="Änderung gilt ab">
                    <Input type="month" value={nzAb} onChange={(e) => setNzAb(e.target.value)} className="h-11" />
                  </Feld>
                  <Feld label="Nachzahlen bis einschließlich" hinweis={nzMonate.length ? `${nzMonate.length} ${nzMonate.length === 1 ? "Monat" : "Monate"} · ${nzZeitraum}` : "Zeitraum prüfen"}>
                    <Input type="month" value={nzBis} onChange={(e) => setNzBis(e.target.value)} className="h-11" />
                  </Feld>
                </div>
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 text-sm">
                  <span>
                    <span className="block font-medium">Zu viel gezahltes Hausgeld zurücküberweisen</span>
                    <span className="block text-xs text-muted-foreground">Aus: wird nicht erstattet (z. B. mit der Abrechnung verrechnen)</span>
                  </span>
                  <Switch checked={nzGuthaben} onCheckedChange={setNzGuthaben} />
                </label>
                <div className="divide-y rounded-xl border">
                  {eigentuemer.map((e) => {
                    const r = nzRechnung(e);
                    const eigen = nzWerte[e.assignmentId];
                    const v = eigen !== undefined && eigen.trim() !== "" ? zahl(eigen) : r.differenz;
                    const ok = v <= 0 || mandatBereit(e.mandat);
                    return (
                      <div key={e.assignmentId} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                        <Avatar name={e.name} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{e.name}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            {e.einheit && <span>Einheit {e.einheit}{e.lage ? ` · ${e.lage}` : ""}</span>}
                            <span>· {euro(r.alt)} → {euro(r.neu)} je Monat</span>
                            <MandatChip e={e} />
                          </div>
                          {Number.isFinite(v) && Math.abs(v) >= 0.01 && (
                            <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{zweckFuellen(zweck || NZ_STANDARD, e, zweckMonat, nzZeitraum)}</div>
                          )}
                          {!ok && <div className="mt-1 text-xs text-amber-700">Kein vollständiges Mandat – wird nicht eingezogen, bitte anders anfordern.</div>}
                        </div>
                        <div className="flex items-center gap-2">
                          {Number.isFinite(v) && Math.abs(v) >= 0.01 && (
                            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", v > 0 ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" : "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300")}>
                              {v > 0 ? "Einzug" : nzGuthaben ? "Erstattung" : "zu viel gezahlt"}
                            </span>
                          )}
                          <div className="relative w-32">
                            <Input
                              inputMode="decimal"
                              placeholder={r.differenz ? String(r.differenz.toFixed(2)).replace(".", ",") : "0,00"}
                              value={eigen ?? ""}
                              onChange={(ev) => setNzWerte((x) => ({ ...x, [e.assignmentId]: ev.target.value }))}
                              className="h-10 pr-7 text-right tabular-nums"
                              aria-label={`Nachzahlung ${e.name}`}
                            />
                            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {!eigentuemer.length && <Leer text={buildingId ? (ladeEig ? "Lädt …" : "Keine Eigentümer hinterlegt") : "Bitte zuerst das Konto wählen"} />}
                </div>
                <p className="text-xs text-muted-foreground">Leeres Feld = berechneter Betrag (grau). Eine eigene Zahl überschreibt ihn, 0 lässt den Eigentümer weg.</p>
              </div>
            )}

            {/* Dauerlastschrift */}
            {quelle === "wirtschaftsplan" && (
              <div className="space-y-4">
                <EigentuemerListe
                  liste={eigentuemer}
                  laedt={ladeEig}
                  ohneKonto={!buildingId}
                  auswahl={auswahl}
                  setAuswahl={setAuswahl}
                  wert={(e) => (e.hausgeldMonat > 0 ? euro(e.hausgeldMonat * { monatlich: 1, quartal: 3, halbjahr: 6, jahr: 12 }[rhythmus]) : "kein Hausgeld")}
                />
                <p className="text-xs text-muted-foreground">
                  Der Betrag kommt zu jedem Einzug aus dem dann gültigen Hausgeld. Wird ein neuer Wirtschaftsplan übernommen, zieht der Auftrag automatisch die neuen Beträge ein. Eigentümer ohne vollständiges Mandat sind nicht wählbar.
                </p>
              </div>
            )}
          </Abschnitt>

          {/* 3 Wann & Text */}
          <Abschnitt nr={3} titel={art === "dauerlastschrift" ? "Wann und mit welchem Text?" : "Wann und mit welchem Text?"}>
            <div className="grid gap-4 sm:grid-cols-2">
              {art === "dauerlastschrift" ? (
                <>
                  <div className="space-y-1.5 sm:col-span-2">
                    <span className="text-sm font-medium">Rhythmus</span>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {(
                        [
                          ["monatlich", "monatlich"],
                          ["quartal", "vierteljährlich"],
                          ["halbjahr", "halbjährlich"],
                          ["jahr", "jährlich"],
                        ] as [Rhythmus, string][]
                      ).map(([w, t]) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => setRhythmus(w)}
                          className={cn("rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors", rhythmus === w ? "border-primary bg-primary/5 text-primary" : "hover:border-foreground/25")}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Feld label="Einzug am">
                    <Select value={tag} onValueChange={setTag}>
                      <SelectTrigger className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 28 }, (_, i) => String(i + 1)).map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}. des Monats
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Feld>
                  <Feld label="Erster Einzug">
                    <Input type="month" value={erster.slice(0, 7)} onChange={(e) => setErster(`${e.target.value}-01`)} className="h-11" />
                  </Feld>
                </>
              ) : (
                <Feld label={istEinzug ? "Einzug am" : "Ausführen am"} hinweis={istEinzug ? `frühestens ${datumDe(fruehesterEinzug())}` : "sofort nach der Freigabe"}>
                  <Input type="date" value={faellig} min={istEinzug ? fruehesterEinzug() : heuteIso()} onChange={(e) => setFaellig(e.target.value)} className="h-11" />
                </Feld>
              )}
              <Feld label="Bezeichnung" hinweis="nur für euch, erscheint in der Freigabe">
                <Input
                  placeholder={art === "dauerlastschrift" ? "Hausgeld" : art === "einzug" ? "z. B. Sonderumlage Dach" : "z. B. Erstattung Auslagen Beirat"}
                  value={titel}
                  onChange={(e) => setTitel(e.target.value)}
                  className="h-11"
                />
              </Feld>
              {quelle === "abrechnung" ? (
                <Feld label="Abrechnungsjahr" hinweis={`Verwendungszweck je Eigentümer, z. B. „${spitzenZweck(spitzenJahr, false, eigentuemer.find((x) => x.lage) ?? eigentuemer[0])}“`} breit>
                  <Input inputMode="numeric" value={spitzenJahr} onChange={(e) => setSpitzenJahr(e.target.value.replace(/\D/g, "").slice(0, 4))} className="h-11 max-w-[140px]" />
                </Feld>
              ) : (
                art === "einzug" ? (
                  <div className="space-y-3 sm:col-span-2">
                    <Feld label="Verwendungszweck" hinweis={`Beispiel: ${beispielEinzug || "–"}${beispielEinzug.length > 140 ? " (zu lang – höchstens 140 Zeichen)" : ""}`} breit>
                      <Input
                        placeholder={quelle === "nachzahlung" ? NZ_STANDARD : "z. B. Sonderumlage Dach {einheit} {lage}"}
                        value={zweck}
                        onChange={(e) => setZweck(e.target.value)}
                        className="h-11"
                      />
                    </Feld>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-xs text-muted-foreground">Einfügen:</span>
                      {PLATZHALTER.filter((x) => x.wert !== "{zeitraum}" || quelle === "nachzahlung").map((x) => (
                        <button
                          key={x.wert}
                          type="button"
                          onClick={() => setZweck((z) => `${(z || (quelle === "nachzahlung" ? NZ_STANDARD : "")).trimEnd()} ${x.wert}`.trim())}
                          className="rounded-full border px-3 py-1 text-xs font-medium hover:border-primary hover:text-primary"
                        >
                          + {x.text}
                        </button>
                      ))}
                    </div>
                    {/(\{monat\}|\{jahr\})/.test(zweck) && (
                      <Feld label="Monat und Jahr im Verwendungszweck">
                        <Input type="month" value={zweckMonat} onChange={(e) => setZweckMonat(e.target.value)} className="h-11 max-w-[220px]" />
                      </Feld>
                    )}
                  </div>
                ) : (
                <Feld label="Verwendungszweck" hinweis={art === "dauerlastschrift" ? `Beispiel: ${beispielZweck}` : "steht auf dem Kontoauszug des Empfängers"} breit>
                  <Input
                    placeholder={art === "dauerlastschrift" ? "Hausgeld {monat} - {einheit} {lage}" : "z. B. Re. Nr. 123, Auslagen"}
                    value={zweck}
                    onChange={(e) => setZweck(e.target.value)}
                    className="h-11"
                  />
                </Feld>
                )
              )}
            </div>
          </Abschnitt>
        </div>

        {/* Zusammenfassung */}
        <aside className="min-w-0 lg:sticky lg:top-4">
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="border-b bg-muted/40 px-5 py-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Zusammenfassung</div>
              <div className="mt-1 text-lg font-bold">{ARTEN.find((x) => x.wert === art)?.titel}</div>
              <div className="text-sm text-muted-foreground">
                {konto ? `${konto.haus} · ${konto.display_name || "Konto"}` : "Noch kein Konto gewählt"}
              </div>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-muted-foreground">{art === "dauerlastschrift" ? `je ${rhythmusText}` : "Summe"}</span>
                <span className="text-right">
                  {summeAus > 0 && <span className="block text-2xl font-bold tabular-nums">{euro(summeAus)}</span>}
                  {summeEin > 0 && <span className={cn("block font-bold tabular-nums", summeAus > 0 ? "text-base text-blue-700 dark:text-blue-300" : "text-2xl")}>{summeAus > 0 ? `+ ${euro(summeEin)} Einzug` : euro(summeEin)}</span>}
                  {summeAus === 0 && summeEin === 0 && <span className="text-2xl font-bold tabular-nums text-muted-foreground">0,00 €</span>}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{posten.length === 1 ? "1 Zahlung" : `${posten.length} Zahlungen`}</span>
                <span className="text-muted-foreground">
                  {art === "dauerlastschrift"
                    ? `ab ${datumDe(`${erster.slice(0, 8)}${String(tag).padStart(2, "0")}`)}`
                    : istEinzug
                      ? `Einzug ${datumDe(faellig)}`
                      : faellig <= heuteIso()
                        ? "nach Freigabe"
                        : `am ${datumDe(faellig)}`}
                </span>
              </div>
              {posten.length > 0 && (
                <ul className="space-y-1.5 border-t pt-3 text-sm">
                  {posten.slice(0, 6).map((p, i) => (
                    <li key={i} className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", p.art === "einzug" ? "bg-blue-500" : "bg-primary")} />
                        <span className="truncate">{p.name || "Ohne Namen"}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{Number.isFinite(p.betrag) && p.betrag > 0 ? euro(p.betrag) : "–"}</span>
                    </li>
                  ))}
                  {posten.length > 6 && <li className="text-xs text-muted-foreground">und {posten.length - 6} weitere</li>}
                </ul>
              )}
              {offenerFehler && (
                <div className="flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {offenerFehler}
                </div>
              )}
              <Button onClick={anlegen} disabled={speichert || !!offenerFehler} className="h-12 w-full text-base">
                {speichert ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                {art === "dauerlastschrift" ? "Dauerlastschrift anlegen" : "In die Freigabe"}
              </Button>
              <Button variant="ghost" onClick={onAbbrechen} className="w-full">
                Abbrechen
              </Button>
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {art === "dauerlastschrift" ? "Jeder Einzug erscheint rechtzeitig in der Freigabe und geht erst mit TAN raus." : "Nichts wird sofort ausgeführt – du gibst den Auftrag in der Freigabe per TAN frei."}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Nummerierter Abschnitt als Karte. */
function Abschnitt({ nr, titel, rechts, children }: { nr: number; titel: string; rechts?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl border bg-card p-4 sm:p-5 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-base font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">{nr}</span>
          {titel}
        </h2>
        {rechts}
      </div>
      {children}
    </section>
  );
}

function Feld({ label, hinweis, breit, children }: { label: string; hinweis?: string; breit?: boolean; children: React.ReactNode }) {
  return (
    <label className={cn("block space-y-1.5", breit && "sm:col-span-2")}>
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hinweis && <span className="block text-xs text-muted-foreground">{hinweis}</span>}
    </label>
  );
}

function BetragFeld({ label, wert, onAendern }: { label: string; wert: string; onAendern: (v: string) => void }) {
  return (
    <label className="block max-w-[220px] space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      <span className="relative block">
        <Input inputMode="decimal" placeholder="0,00" value={wert} onChange={(e) => onAendern(e.target.value)} className="h-12 pr-8 text-right text-lg font-semibold tabular-nums" />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
      </span>
    </label>
  );
}

function Avatar({ name }: { name: string }) {
  const k = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">{k || "?"}</span>;
}

function Leer({ text }: { text: string }) {
  return <div className="px-4 py-8 text-center text-sm text-muted-foreground">{text}</div>;
}

/** Ein Empfänger einer Überweisung, mit IBAN-Prüfung und Bankname. */
function EmpfaengerZeile({
  nr, e, mehrere, onAendern, onEntfernen,
}: {
  nr: number;
  e: Empfaenger;
  mehrere: boolean;
  onAendern: (feld: keyof Empfaenger, wert: string) => void;
  onEntfernen: () => void;
}) {
  const [eigenerZweck, setEigenerZweck] = useState(!!e.zweck);
  const iban = cleanIban(e.iban);
  const ibanOk = iban.length >= 15 && ibanGueltig(iban);
  const ibanFalsch = iban.length >= 15 && !ibanOk;
  return (
    <div className="rounded-xl border bg-background/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Empfänger {mehrere ? nr : ""}</span>
        {mehrere && (
          <button type="button" onClick={onEntfernen} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive" aria-label="Empfänger entfernen">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_160px]">
        <Input placeholder="Name des Empfängers" value={e.name} onChange={(ev) => onAendern("name", ev.target.value)} className="h-11" aria-label="Empfänger" />
        <span className="relative block">
          <Input inputMode="decimal" placeholder="0,00" value={e.betrag} onChange={(ev) => onAendern("betrag", ev.target.value)} className="h-11 pr-8 text-right font-semibold tabular-nums" aria-label="Betrag" />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
        </span>
        <div className="md:col-span-2">
          <span className="relative block">
            <Input
              placeholder="IBAN"
              value={e.iban}
              onChange={(ev) => onAendern("iban", ev.target.value)}
              className={cn("h-11 pr-9 font-mono tracking-tight", ibanFalsch && "border-destructive focus-visible:ring-destructive")}
              aria-label="IBAN"
            />
            {ibanOk && <CheckCircle2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-green-600" />}
            {ibanFalsch && <AlertCircle className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-destructive" />}
          </span>
          <span className={cn("mt-1 block text-xs", ibanFalsch ? "text-destructive" : "text-muted-foreground")}>
            {ibanOk ? `${bankName(iban, null)} · ${ibanFormatiert(iban)}` : ibanFalsch ? "Die IBAN stimmt nicht – bitte prüfen" : " "}
          </span>
        </div>
        {eigenerZweck ? (
          <Input placeholder="Eigener Verwendungszweck für diesen Empfänger" value={e.zweck} onChange={(ev) => onAendern("zweck", ev.target.value)} className="h-11 md:col-span-2" />
        ) : (
          <button type="button" onClick={() => setEigenerZweck(true)} className="justify-self-start text-sm font-medium text-primary hover:underline md:col-span-2">
            + Eigener Verwendungszweck
          </button>
        )}
      </div>
    </div>
  );
}

function MandatChip({ e }: { e: Eigentuemer }) {
  return mandatBereit(e.mandat) ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-800 dark:bg-green-950 dark:text-green-200">
      <CheckCircle2 className="h-3 w-3" /> Mandat
    </span>
  ) : e.mandat ? (
    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
      {mandatVerfallen(e.mandat) ? "Mandat verfallen" : "Mandat unvollständig"}
    </span>
  ) : e.iban ? (
    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">kein Mandat</span>
  ) : (
    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">keine IBAN</span>
  );
}

/** Eigentümer zum Auswählen, mit „alle wählen" und Hinweis auf fehlende Mandate. */
function EigentuemerListe({
  liste, laedt, ohneKonto, auswahl, setAuswahl, wert,
}: {
  liste: Eigentuemer[];
  laedt: boolean;
  ohneKonto: boolean;
  auswahl: Record<string, boolean>;
  setAuswahl: (f: (x: Record<string, boolean>) => Record<string, boolean>) => void;
  wert: (e: Eigentuemer) => string;
}) {
  const waehlbar = liste.filter((e) => mandatBereit(e.mandat));
  const gewaehlt = waehlbar.filter((e) => auswahl[e.assignmentId]);
  const alle = waehlbar.length > 0 && gewaehlt.length === waehlbar.length;
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-3 py-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Checkbox
            checked={alle}
            disabled={!waehlbar.length}
            onCheckedChange={(v) => setAuswahl((x) => ({ ...x, ...Object.fromEntries(waehlbar.map((e) => [e.assignmentId, !!v])) }))}
            aria-label="Alle wählen"
          />
          Alle mit Mandat
        </label>
        <span className="text-xs text-muted-foreground">
          {gewaehlt.length} von {liste.length} gewählt
          {liste.length - waehlbar.length > 0 && ` · ${liste.length - waehlbar.length} ohne Mandat`}
        </span>
      </div>
      <div className="max-h-[440px] divide-y overflow-y-auto">
        {liste.map((e) => {
          const ok = mandatBereit(e.mandat);
          const an = !!auswahl[e.assignmentId] && ok;
          return (
            <label key={e.assignmentId} className={cn("flex items-center gap-3 px-3 py-2.5", ok ? "cursor-pointer hover:bg-muted/40" : "opacity-60")}>
              <Checkbox checked={an} disabled={!ok} onCheckedChange={(v) => setAuswahl((x) => ({ ...x, [e.assignmentId]: !!v }))} aria-label={`${e.name} auswählen`} />
              <Avatar name={e.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{e.name}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {e.einheit && <span>Einheit {e.einheit}{e.lage ? ` · ${e.lage}` : ""}</span>}
                  <MandatChip e={e} />
                </span>
              </span>
              <span className={cn("shrink-0 text-right font-semibold tabular-nums", !an && "text-muted-foreground")}>{an ? wert(e) : "–"}</span>
            </label>
          );
        })}
        {!liste.length && <Leer text={ohneKonto ? "Bitte zuerst das Konto wählen" : laedt ? "Lädt …" : "Keine Eigentümer hinterlegt"} />}
      </div>
    </div>
  );
}
