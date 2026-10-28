import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, ChevronLeft, Info, Loader2, Pencil } from "lucide-react";
import { EigentuemerBearbeiten } from "./EigentuemerBearbeiten";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { euro } from "@/lib/bankInfo";
import { hausgeldAm, ladeEigentuemer, type Eigentuemer } from "@/lib/eigentuemer";
import { heuteIso, plusMonate } from "@/lib/auftraege";
import { naechsterTermin, useLaufendeAuftraege } from "./AuftraegeListe";

const SCHRITT: Record<string, number> = { monatlich: 1, quartal: 3, halbjahr: 6, jahr: 12 };
const zahl = (t: string) => {
  const v = Number(String(t).replace(/\s/g, "").replace(/€/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(v) ? v : NaN;
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const deZahl = (n: number) => r2(n).toFixed(2).replace(".", ",");
const vortag = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};
const monatText = (ym: string) => `${ym.slice(5, 7)}/${ym.slice(0, 4)}`;

/** „09/2026“, „09+10/2026“, „09-12/2026“, „11/2026-02/2027“ */
function zeitraumText(monate: string[]): string {
  const m = [...new Set(monate)].sort();
  if (!m.length) return "";
  if (m.length === 1) return monatText(m[0]);
  const a = m[0];
  const z = m[m.length - 1];
  if (a.slice(0, 4) !== z.slice(0, 4)) return `${monatText(a)}-${monatText(z)}`;
  return `${a.slice(5, 7)}${m.length === 2 ? "+" : "-"}${z.slice(5, 7)}/${a.slice(0, 4)}`;
}

export interface SammelVorlage {
  buildingId: string;
  kontoIban: string;
  nzWerte: Record<string, string>;
  zweck: string;
  titel: string;
}

/**
 * Hausgeld ändern: neue Beträge je Eigentümer mit „gültig ab“. Bisherige
 * Zeile endet am Vortag, die neue beginnt am Monatsersten. Liegt der Monat in
 * der Vergangenheit, wird die Differenz für schon eingezogene Monate
 * ausgerechnet und als Sammelauftrag vorbereitet.
 */
export function HausgeldAendern({
  buildingId,
  name,
  onZurueck,
  onFertig,
  onSammelauftrag,
}: {
  buildingId: string;
  name: string;
  onZurueck: () => void;
  onFertig: () => void;
  onSammelauftrag: (v: SammelVorlage) => void;
}) {
  const queryClient = useQueryClient();
  const heute = heuteIso();
  const { data: eigentuemer = [], isLoading } = useQuery({
    queryKey: ["mandate", buildingId],
    queryFn: () => ladeEigentuemer(buildingId),
  });
  const { data: auftraege = [] } = useLaufendeAuftraege();
  const dauer = auftraege.find((a) => a.art === "dauerlastschrift" && a.building_id === buildingId && a.betragsquelle === "wirtschaftsplan") ?? null;
  const termin = dauer ? naechsterTermin(dauer) : null;
  const naechsterMonat = (termin ?? plusMonate(heute.slice(0, 8) + "01", 1)).slice(0, 7);
  const januar = `${Number(heute.slice(0, 4)) + 1}-01`;

  const [ab, setAb] = useState(naechsterMonat);
  const [eigenerMonat, setEigenerMonat] = useState(false);
  const [neu, setNeu] = useState<Record<string, string>>({});
  const [prozent, setProzent] = useState("");
  const [rueckwirkend, setRueckwirkend] = useState(true);
  const [speichert, setSpeichert] = useState(false);
  const [bearbeiten, setBearbeiten] = useState<Eigentuemer | null>(null);
  useEffect(() => {
    if (!eigenerMonat) setAb(naechsterMonat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naechsterMonat]);

  const abTag = `${ab}-01`;
  const zeilen = useMemo(
    () =>
      eigentuemer.map((e) => {
        const bisher = hausgeldAm(e.hausgeldZeilen, abTag);
        const v = (neu[e.assignmentId] ?? "").trim() === "" ? bisher : zahl(neu[e.assignmentId]);
        const spaeter = e.hausgeldZeilen.filter((z) => z.valid_from && z.valid_from > abTag);
        return { e, bisher, neu: v, diff: Number.isFinite(v) ? r2(v - bisher) : NaN, spaeter };
      }),
    [eigentuemer, neu, abTag],
  );
  const geaendert = zeilen.filter((z) => Number.isFinite(z.neu) && Math.abs(z.diff) >= 0.005);
  const ungueltig = zeilen.find((z) => !Number.isFinite(z.neu) || z.neu < 0);
  const summeBisher = zeilen.reduce((s, z) => s + z.bisher, 0);
  const summeNeu = zeilen.reduce((s, z) => s + (Number.isFinite(z.neu) ? z.neu : z.bisher), 0);

  // Schon eingezogen (oder in einem Zahllauf) ab dem neuen Monat – mit dem alten Betrag
  const itemIds = dauer?.payment_order_items.map((i) => i.id) ?? [];
  const { data: eingezogen = [] } = useQuery({
    queryKey: ["hausgeld-eingezogen", dauer?.id, abTag],
    enabled: !!dauer,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("payment_run_items")
        .select("order_item_id, betrag, einzel_status, run:payment_runs!inner(status, faellig_am, ausfuehrung_am)")
        .in("order_item_id", itemIds);
      if (error) throw error;
      return (data ?? [])
        .filter((r: any) => !["abgebrochen", "fehler"].includes(r.run?.status) || r.einzel_status)
        .map((r: any) => ({
          assignmentId: dauer!.payment_order_items.find((i) => i.id === r.order_item_id)?.assignment_id ?? null,
          tag: (r.run?.faellig_am ?? r.run?.ausfuehrung_am ?? "") as string,
          betrag: Number(r.betrag) || 0,
        }))
        .filter((r: any) => r.tag >= abTag);
    },
  });

  // Rückwirkende Differenz je Eigentümer
  const rueck = useMemo(() => {
    const werte: Record<string, number> = {};
    let monate: string[] = [];
    if (dauer) {
      const faktor = dauer.rhythmus ? SCHRITT[dauer.rhythmus] : 1;
      for (const z of zeilen) {
        const meine = eingezogen.filter((r: any) => r.assignmentId === z.e.assignmentId);
        if (!meine.length || !Number.isFinite(z.neu)) continue;
        werte[z.e.assignmentId] = r2(meine.reduce((s: number, r: any) => s + (z.neu * faktor - r.betrag), 0));
      }
      monate = eingezogen.map((r: any) => r.tag.slice(0, 7));
    } else {
      // ohne Dauerlastschrift: alle Monate ab „gültig ab“ bis heute
      for (let m = ab; m <= heute.slice(0, 7); m = plusMonate(`${m}-01`, 1).slice(0, 7)) monate.push(m);
      for (const z of zeilen) if (Number.isFinite(z.diff) && monate.length) werte[z.e.assignmentId] = r2(z.diff * monate.length);
    }
    for (const k of Object.keys(werte)) if (Math.abs(werte[k]) < 0.005) delete werte[k];
    return { werte, monate: [...new Set(monate)].sort() };
  }, [dauer, zeilen, eingezogen, ab, heute]);
  const rueckSumme = Object.values(rueck.werte).reduce((s, v) => s + v, 0);
  const hatRueck = Object.keys(rueck.werte).length > 0;
  const zeitraum = zeitraumText(rueck.monate);

  const prozentAnwenden = () => {
    const p = zahl(prozent);
    if (!Number.isFinite(p)) return toast.error("Bitte eine Zahl eintragen, z. B. 5 oder -3");
    setNeu(Object.fromEntries(zeilen.map((z) => [z.e.assignmentId, deZahl(z.bisher * (1 + p / 100))])));
  };

  const speichern = async () => {
    if (ungueltig) return toast.error(`Betrag bei ${ungueltig.e.name} ist nicht gültig.`);
    if (!geaendert.length) return toast.error("Es wurde kein Betrag geändert.");
    setSpeichert(true);
    try {
      for (const z of geaendert) {
        const alle = z.e.hausgeldZeilen;
        // Zeilen, die erst nach dem Stichtag beginnen, ersetzt die neue
        for (const s of alle.filter((x) => x.valid_from && x.valid_from > abTag)) {
          const { error } = await supabase.from("contact_building_costs").delete().eq("id", s.id);
          if (error) throw error;
        }
        const gelten = alle.filter((x) => (!x.valid_from || x.valid_from <= abTag) && (!x.valid_to || x.valid_to >= abTag));
        for (const g of gelten) {
          const { error } =
            g.valid_from === abTag
              ? await supabase.from("contact_building_costs").delete().eq("id", g.id)
              : await supabase.from("contact_building_costs").update({ valid_to: vortag(abTag) }).eq("id", g.id);
          if (error) throw error;
        }
        const { error } = await supabase.from("contact_building_costs").insert({
          assignment_id: z.e.assignmentId,
          cost_type: "Hausgeld",
          amount: r2(z.neu),
          interval: "monatlich",
          valid_from: abTag,
          reserve_share_monthly: gelten[0]?.reserve_share_monthly ?? 0,
        } as any);
        if (error) throw error;
      }
      toast.success(`Hausgeld für ${geaendert.length} Eigentümer ab ${monatText(ab)} gespeichert`);
      queryClient.invalidateQueries({ queryKey: ["mandate"] });
      queryClient.invalidateQueries({ queryKey: ["auftraege"] });
      queryClient.invalidateQueries({ queryKey: ["auftraege-hausgeld"] });
      queryClient.invalidateQueries({ queryKey: ["hausgeld-bestand"] });
      queryClient.invalidateQueries({ queryKey: ["freigabe-auftraege"] });
      if (rueckwirkend && hatRueck) {
        onSammelauftrag({
          buildingId,
          kontoIban: dauer?.konto_iban ?? "",
          nzWerte: Object.fromEntries(Object.entries(rueck.werte).map(([k, v]) => [k, deZahl(v)])),
          zweck: `Hausgeld-Differenz ${zeitraum} - {einheit} {lage}`,
          titel: `Hausgeld-Differenz ${zeitraum}`,
        });
      } else onFertig();
    } catch (e: any) {
      toast.error("Speichern fehlgeschlagen: " + (e?.message ?? "Unbekannter Fehler"));
    } finally {
      setSpeichert(false);
    }
  };

  const pill = (aktiv: boolean) =>
    cn("h-10 rounded-full border px-4 text-sm font-medium transition-colors", aktiv ? "border-foreground bg-foreground text-background" : "bg-card hover:border-foreground/30");
  const vergangen = abTag <= heute;
  const spaeterHinweis = zeilen.find((z) => z.spaeter.length);

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-6">
      <div>
        <button type="button" onClick={onZurueck} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Hausgeld
        </button>
        <h1 className="mt-2 text-2xl font-bold md:text-3xl">Hausgeld ändern</h1>
        <p className="mt-1 text-sm text-muted-foreground">{name} · neue Beträge eintragen, Monat wählen, fertig.</p>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {/* 1 Ab wann */}
          <section className="space-y-3 rounded-2xl border bg-card p-5">
            <h2 className="flex items-center gap-2.5 text-lg font-bold">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-sm text-background">1</span>
              Ab wann gilt das neue Hausgeld?
            </h2>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={pill(!eigenerMonat && ab === naechsterMonat)} onClick={() => { setEigenerMonat(false); setAb(naechsterMonat); }}>
                Ab nächstem Einzug · {monatText(naechsterMonat)}
              </button>
              {januar !== naechsterMonat && (
                <button type="button" className={pill(eigenerMonat && ab === januar)} onClick={() => { setEigenerMonat(true); setAb(januar); }}>
                  Ab {monatText(januar)}
                </button>
              )}
              <label className={cn(pill(eigenerMonat && ab !== januar), "inline-flex items-center gap-2")}>
                Anderer Monat:
                <input
                  type="month"
                  value={ab}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    setEigenerMonat(true);
                    setAb(e.target.value);
                  }}
                  className="bg-transparent text-sm outline-none"
                  aria-label="Monat wählen"
                />
              </label>
            </div>
            {vergangen && (
              <div className="flex gap-2.5 rounded-xl bg-orange-50 p-3 text-sm text-orange-900 dark:bg-orange-950/50 dark:text-orange-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {monatText(ab)} liegt in der Vergangenheit.{" "}
                  {hatRueck ? `Für ${zeitraum} wurde noch das alte Hausgeld eingezogen – die Differenz können Sie unten gleich nachholen.` : "Es wurde in diesem Zeitraum noch nichts mit dem alten Betrag eingezogen."}
                </span>
              </div>
            )}
            {spaeterHinweis && (
              <div className="flex gap-2.5 rounded-xl bg-muted/60 p-3 text-sm">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>Bei manchen Eigentümern ist schon eine spätere Änderung hinterlegt. Sie wird durch die neue ersetzt.</span>
              </div>
            )}
          </section>

          {/* 2 Beträge */}
          <section className="overflow-hidden rounded-2xl border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
              <h2 className="flex items-center gap-2.5 text-lg font-bold">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-sm text-background">2</span>
                Neue Beträge je Monat
              </h2>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Input
                    value={prozent}
                    onChange={(e) => setProzent(e.target.value)}
                    inputMode="decimal"
                    placeholder="z. B. 5"
                    className="h-10 w-24 pr-7 text-right"
                    aria-label="Alle um Prozent ändern"
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
                <Button variant="outline" className="h-10" onClick={prozentAnwenden}>
                  Alle ändern
                </Button>
              </div>
            </div>
            {isLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm md:text-[15px]">
                  <thead>
                    <tr className="bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="px-5 py-2.5">Einheit</th>
                      <th className="px-3 py-2.5">Eigentümer</th>
                      <th className="px-3 py-2.5 text-right">Bisher</th>
                      <th className="px-3 py-2.5 text-right">Neu</th>
                      <th className="px-5 py-2.5 text-right">Differenz</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zeilen.map((z) => (
                      <tr key={z.e.assignmentId} className="border-t">
                        <td className="px-5 py-2.5">
                          <div className="font-semibold tabular-nums">{z.e.einheit || "–"}</div>
                          {z.e.lage && <div className="text-xs text-muted-foreground">{z.e.lage}</div>}
                        </td>
                        <td className="px-3 py-2.5 font-medium">
                          <button type="button" onClick={() => setBearbeiten(z.e)} className="group inline-flex items-center gap-1.5 text-left hover:text-primary" title="Name und Konto bearbeiten">
                            {z.e.name}
                            <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-60 group-hover:opacity-100" />
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{euro(z.bisher)}</td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="relative ml-auto w-32">
                            <Input
                              inputMode="decimal"
                              placeholder={deZahl(z.bisher)}
                              value={neu[z.e.assignmentId] ?? ""}
                              onChange={(ev) => setNeu((x) => ({ ...x, [z.e.assignmentId]: ev.target.value }))}
                              className="h-10 pr-7 text-right font-semibold tabular-nums"
                              aria-label={`Neues Hausgeld ${z.e.name}`}
                            />
                            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
                          </div>
                        </td>
                        <td className={cn("px-5 py-2.5 text-right font-semibold tabular-nums", !Number.isFinite(z.diff) ? "text-destructive" : Math.abs(z.diff) < 0.005 ? "text-muted-foreground" : "text-blue-700 dark:text-blue-300")}>
                          {!Number.isFinite(z.diff) ? "ungültig" : Math.abs(z.diff) < 0.005 ? "–" : `${z.diff > 0 ? "+ " : "− "}${euro(Math.abs(z.diff))}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 bg-muted/40 font-bold">
                      <td colSpan={2} className="px-5 py-3">
                        Summe je Monat
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{euro(summeBisher)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{euro(summeNeu)}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-blue-700 dark:text-blue-300">
                        {Math.abs(summeNeu - summeBisher) < 0.005 ? "–" : `${summeNeu > summeBisher ? "+ " : "− "}${euro(Math.abs(summeNeu - summeBisher))}`}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          {/* 3 Rückwirkend */}
          {hatRueck && (
            <section className="space-y-3 rounded-2xl border bg-card p-5">
              <h2 className="flex items-center gap-2.5 text-lg font-bold">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-sm text-background">3</span>
                Rückwirkende Differenz
              </h2>
              <label className={cn("flex cursor-pointer gap-3 rounded-xl border p-4", rueckwirkend && "border-2 border-foreground p-[15px]")}>
                <Checkbox checked={rueckwirkend} onCheckedChange={(v) => setRueckwirkend(!!v)} className="mt-0.5 h-5 w-5" />
                <span>
                  <span className="block font-semibold">Differenz für {zeitraum} als Sammelauftrag vorbereiten</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    Zusammen {rueckSumme >= 0 ? "" : "− "}
                    {euro(Math.abs(rueckSumme))}. Der Sammelauftrag öffnet sich danach fertig ausgefüllt – Sie prüfen nur noch und geben frei. Minus wird zur Überweisung an den Eigentümer.
                  </span>
                </span>
              </label>
            </section>
          )}
        </div>

        {/* Zusammenfassung */}
        <aside className="min-w-0 lg:sticky lg:top-4">
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="border-b bg-muted/40 px-5 py-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Zusammenfassung</div>
              <div className="mt-1 text-lg font-bold">Neues Hausgeld ab 01.{monatText(ab)}</div>
            </div>
            <div className="space-y-4 px-5 py-4 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground">je Monat</span>
                <span className="text-2xl font-bold tabular-nums">{euro(summeNeu)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>bisher</span>
                <span className="tabular-nums">{euro(summeBisher)}</span>
              </div>
              <div className="flex gap-2.5 border-t pt-3">
                <span className="h-fit shrink-0 rounded-md bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-200">Dauerlastschrift</span>
                <span>
                  {dauer
                    ? `Ab dem Einzug am ${termin && termin >= abTag ? termin.split("-").reverse().join(".") : `01.${monatText(ab)}`} automatisch die neuen Beträge. Am Auftrag ändert sich sonst nichts.`
                    : "Für diese Liegenschaft gibt es keine Dauerlastschrift."}
                </span>
              </div>
              {hatRueck && rueckwirkend && (
                <div className="flex gap-2.5">
                  <span className="h-fit shrink-0 rounded-md bg-orange-100 px-1.5 py-0.5 text-xs font-medium text-orange-900 dark:bg-orange-950 dark:text-orange-200">Sammelauftrag</span>
                  <span>
                    {zeitraum} nachholen: <b className="tabular-nums">{euro(Math.abs(rueckSumme))}</b>
                  </span>
                </div>
              )}
              <div className="flex gap-2.5">
                <span className="h-fit shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">Eigentümer-App</span>
                <span>Das neue Hausgeld erscheint bei „Meine Wohnung“.</span>
              </div>
              {ungueltig && (
                <div className="flex gap-2 rounded-xl bg-amber-50 p-3 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> Betrag bei {ungueltig.e.name} ist nicht gültig.
                </div>
              )}
              <Button onClick={speichern} disabled={speichert || !geaendert.length || !!ungueltig} className="h-12 w-full text-base">
                {speichert ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                {hatRueck && rueckwirkend ? "Speichern & Sammelauftrag öffnen" : "Speichern"}
              </Button>
              <Button variant="outline" onClick={onZurueck} className="h-11 w-full">
                Abbrechen
              </Button>
            </div>
          </div>
        </aside>
      </div>
      <EigentuemerBearbeiten eigentuemer={bearbeiten} onClose={() => setBearbeiten(null)} />
    </div>
  );
}
