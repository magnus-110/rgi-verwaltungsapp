import { useMemo, useState } from "react";
import { FileUp, Landmark, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ibanFormatiert } from "@/lib/bankInfo";
import { ibanGueltig } from "@/lib/sepa";
import type { Eigentuemer } from "@/lib/eigentuemer";

/** Ein Mandat aus einer Datei. */
interface Eintrag {
  name: string;
  iban: string;
  referenz: string;
  unterschrieben: string | null;
  zuletzt: string | null; // letzter Einzugstag laut Datei
  einheit?: string | null;
  datei: string;
}

interface Zeile extends Eintrag {
  key: string;
  assignmentId: string | null;
  an: boolean;
  hinweis: string | null;
}

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "").toUpperCase();
const norm = (s: string | null | undefined) =>
  (s ?? "")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const datumIso = (t: string | null | undefined): string | null => {
  const s = (t ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (!m) return null;
  return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
};
const datumDe = (d: string | null) => (d ? d.split("-").reverse().join(".") : "–");

/** pain.008 (SEPA-Lastschrift-Datei) lesen – unabhängig von der Version. */
function lesePain008(xml: string, datei: string): { eintraege: Eintrag[]; glaeubigerIds: string[] } {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const alle = (el: Element | Document, name: string) => Array.from(el.getElementsByTagNameNS("*", name));
  const eins = (el: Element | Document, ...pfad: string[]): Element | null => {
    let cur: Element | Document | null = el;
    for (const p of pfad) {
      if (!cur) return null;
      cur = alle(cur, p)[0] ?? null;
    }
    return cur as Element | null;
  };
  const text = (el: Element | Document, ...pfad: string[]) => eins(el, ...pfad)?.textContent?.trim() ?? "";
  const eintraege: Eintrag[] = [];
  const glaeubigerIds = new Set<string>();
  for (const pmt of alle(doc, "PmtInf")) {
    const tag = datumIso(text(pmt, "ReqdColltnDt"));
    const gid = text(pmt, "CdtrSchmeId", "Othr", "Id");
    if (gid) glaeubigerIds.add(clean(gid));
    for (const tx of alle(pmt, "DrctDbtTxInf")) {
      const iban = clean(text(tx, "DbtrAcct", "IBAN"));
      const referenz = text(tx, "MndtRltdInf", "MndtId");
      if (!iban || !referenz) continue;
      eintraege.push({
        name: text(tx, "Dbtr", "Nm"),
        iban,
        referenz,
        unterschrieben: datumIso(text(tx, "MndtRltdInf", "DtOfSgntr")),
        zuletzt: tag,
        datei,
      });
    }
  }
  return { eintraege, glaeubigerIds: [...glaeubigerIds] };
}

/** CSV-Liste: Spalten werden an der Überschrift erkannt (Name, IBAN, Mandatsreferenz, Datum, Einheit). */
function leseCsv(text: string, datei: string): Eintrag[] {
  const zeilen = text.replace(/\r/g, "").split("\n").filter((z) => z.trim());
  if (zeilen.length < 2) return [];
  const trenner = (zeilen[0].match(/;/g)?.length ?? 0) >= (zeilen[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const teile = (z: string) => z.split(trenner).map((t) => t.trim().replace(/^"|"$/g, ""));
  const kopf = teile(zeilen[0]).map((k) => norm(k));
  const spalte = (...muster: RegExp[]) => kopf.findIndex((k) => muster.some((m) => m.test(k)));
  const iName = spalte(/kontoinhaber/, /name/, /zahlungspflichtig/, /schuldner/);
  const iIban = spalte(/iban/);
  const iRef = spalte(/mandat.*ref/, /referenz/, /mandat/);
  const iDatum = spalte(/unterschri/, /datum/, /signatur/);
  const iEinheit = spalte(/einheit/, /whg/, /wohnung/);
  if (iIban < 0 || iRef < 0) throw new Error(`${datei}: Spalten „IBAN“ und „Mandatsreferenz“ werden gebraucht.`);
  return zeilen.slice(1).map((z) => {
    const t = teile(z);
    return {
      name: iName >= 0 ? t[iName] : "",
      iban: clean(t[iIban]),
      referenz: t[iRef] ?? "",
      unterschrieben: iDatum >= 0 ? datumIso(t[iDatum]) : null,
      zuletzt: null,
      einheit: iEinheit >= 0 ? t[iEinheit] : null,
      datei,
    };
  }).filter((e) => e.iban && e.referenz);
}

/**
 * Einzeln gebuchte Lastschrift-Eingänge aus den Kontoauszügen lesen
 * („… MREF: E1002-0007-01012024 IBAN: DE… BIC: …"). Je Mandatsreferenz der
 * letzte Einzug. Das Datum am Ende der Referenz (TTMMJJJJ) ist das Mandatsdatum,
 * die mittlere Zahl die Einheit – so vergibt es das bisherige Programm.
 */
async function ausKontoauszuegen(buildingId: string): Promise<Eintrag[]> {
  const alle: any[] = [];
  for (let seite = 0; seite < 10; seite++) {
    const { data, error } = await (supabase as any)
      .from("bank_transactions")
      .select("booking_date, amount, debtor_name, debtor_iban, purpose")
      .eq("building_id", buildingId)
      .gt("amount", 0)
      .ilike("purpose", "%MREF:%")
      .order("booking_date", { ascending: false })
      .range(seite * 1000, seite * 1000 + 999);
    if (error) throw error;
    alle.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const jeRef = new Map<string, Eintrag>();
  for (const t of alle) {
    const p = String(t.purpose ?? "");
    const referenz = p.match(/MREF:\s*(\S+)/)?.[1]?.trim();
    if (!referenz || referenz.length < 3) continue;
    const iban = clean(t.debtor_iban) || clean(p.match(/IBAN:\s*([A-Z]{2}\d{2}[A-Z0-9 ]{10,30}?)(\s+BIC|$)/)?.[1]);
    if (!iban) continue;
    const k = `${referenz}|${iban}`;
    if (jeRef.has(k)) continue; // neueste Buchung kommt zuerst
    const teile = referenz.split("-");
    const datum = teile.at(-1)?.match(/^(\d{2})(\d{2})(\d{4})$/);
    const einheit = teile.length >= 3 && /^\d+$/.test(teile[1]) ? teile[1] : null;
    jeRef.set(k, {
      name: String(t.debtor_name ?? "").trim(),
      iban,
      referenz,
      unterschrieben: datum ? `${datum[3]}-${datum[2]}-${datum[1]}` : null,
      zuletzt: t.booking_date,
      einheit,
      datei: "Kontoauszügen",
    });
  }
  return [...jeRef.values()];
}

/** Eigentümer finden: zuerst über die IBAN, dann Einheit, dann eindeutiger Nachname. */
function zuordnen(e: Eintrag, liste: Eigentuemer[]): string | null {
  const perIban = liste.filter((x) => [x.iban, x.mandat?.iban, x.vorschlag?.iban].some((i) => clean(i) === e.iban));
  if (perIban.length === 1) return perIban[0].assignmentId;
  if (e.einheit) {
    const ohneNullen = (t: string) => norm(t).replace(/^0+(?=\d)/, "");
    const perEinheit = liste.filter((x) => ohneNullen(x.einheit) === ohneNullen(e.einheit!));
    if (perEinheit.length === 1) return perEinheit[0].assignmentId;
  }
  const woerter = norm(e.name).split(" ").filter((w) => w.length >= 3 && !["und", "weg", "herr", "frau", "familie", "eheleute"].includes(w));
  const perName = liste.filter((x) => woerter.some((w) => norm(x.name).split(" ").includes(w)));
  return perName.length === 1 ? perName[0].assignmentId : null;
}

/**
 * Mandate aus früheren Lastschrift-Dateien (SEPA-XML) oder einer Liste (CSV)
 * übernehmen. Die bisherigen Mandatsreferenzen bleiben erhalten – so zieht
 * die WEG weiter mit demselben Mandat ein.
 */
export function MandatImport({
  open, onOpenChange, buildingId, glaeubigerId, liste, onFertig,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  buildingId: string;
  glaeubigerId: string | null;
  liste: Eigentuemer[];
  onFertig: () => void;
}) {
  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [gids, setGids] = useState<string[]>([]);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const dateienLesen = async (files: FileList | null) => {
    if (!files?.length) return;
    setFehler(null);
    const eintraege: Eintrag[] = [];
    const gefundeneGids = new Set<string>();
    try {
      for (const f of Array.from(files)) {
        const text = await f.text();
        if (/<Document[\s>]/.test(text) && /DrctDbtTxInf/.test(text)) {
          const r = lesePain008(text, f.name);
          eintraege.push(...r.eintraege);
          r.glaeubigerIds.forEach((g) => gefundeneGids.add(g));
        } else if (/\.csv$/i.test(f.name) || text.includes(";")) {
          eintraege.push(...leseCsv(text, f.name));
        } else {
          throw new Error(`${f.name}: keine SEPA-Lastschrift-Datei (pain.008) und keine CSV-Liste.`);
        }
      }
    } catch (e: any) {
      setFehler(e?.message ?? "Datei konnte nicht gelesen werden");
      return;
    }
    aufbereiten(eintraege, [...gefundeneGids]);
  };

  const ausAuszuegenLesen = async () => {
    setFehler(null);
    setLaeuft(true);
    try {
      const e = await ausKontoauszuegen(buildingId);
      if (!e.length) {
        setFehler("In den Kontoauszügen dieser Liegenschaft stehen keine einzeln gebuchten Lastschriften mit Mandatsreferenz.");
        return;
      }
      aufbereiten(e, []);
    } catch (err: any) {
      setFehler(err?.message ?? "Kontoauszüge konnten nicht gelesen werden");
    } finally {
      setLaeuft(false);
    }
  };

  const aufbereiten = (eintraege: Eintrag[], gefundeneGids: string[]) => {
    // gleiche Mandatsreferenz aus mehreren Dateien: neuesten Einzug behalten
    const jeRef = new Map<string, Eintrag>();
    for (const e of eintraege) {
      const k = `${e.referenz}|${e.iban}`;
      const alt = jeRef.get(k);
      if (!alt || (e.zuletzt ?? "") > (alt.zuletzt ?? "")) jeRef.set(k, { ...e, unterschrieben: e.unterschrieben ?? alt?.unterschrieben ?? null, einheit: e.einheit ?? alt?.einheit });
    }
    const neu = [...jeRef.values()].map((e, i): Zeile => {
      const a = zuordnen(e, liste);
      const hinweis = !ibanGueltig(e.iban) ? "IBAN ungültig" : !e.unterschrieben ? "Unterschriftsdatum fehlt" : null;
      return { ...e, key: `${i}`, assignmentId: a, an: !!a && !hinweis, hinweis };
    });
    neu.sort((x, y) => Number(!!y.assignmentId) - Number(!!x.assignmentId) || x.name.localeCompare(y.name, "de"));
    setZeilen(neu);
    setGids(gefundeneGids);
    if (!neu.length) setFehler("Es wurden keine Mandate gefunden.");
  };

  const gewaehlt = zeilen.filter((z) => z.an && z.assignmentId);
  const doppelt = useMemo(() => {
    const zaehl = new Map<string, number>();
    gewaehlt.forEach((z) => zaehl.set(z.assignmentId!, (zaehl.get(z.assignmentId!) ?? 0) + 1));
    return new Set([...zaehl.entries()].filter(([, n]) => n > 1).map(([k]) => k));
  }, [gewaehlt]);
  const fremdeGid = gids.find((g) => glaeubigerId && g !== clean(glaeubigerId));

  const uebernehmen = async () => {
    if (doppelt.size) {
      toast.error("Einem Eigentümer sind mehrere Mandate zugeordnet – bitte eines abwählen.");
      return;
    }
    setLaeuft(true);
    let ok = 0;
    const fehlgeschlagen: string[] = [];
    try {
      // Gläubiger-ID aus der Datei übernehmen, wenn die Liegenschaft noch keine hat
      if (!glaeubigerId && gids.length === 1) await (supabase as any).from("buildings").update({ creditor_id: gids[0] }).eq("id", buildingId);
      for (const z of gewaehlt) {
        const e = liste.find((x) => x.assignmentId === z.assignmentId)!;
        const gleich = e.mandat && e.mandat.mandatsreferenz === z.referenz;
        let error: any = null;
        if (gleich) {
          ({ error } = await (supabase as any)
            .from("sepa_mandates")
            .update({ iban: z.iban, unterschrieben_am: z.unterschrieben ?? e.mandat!.unterschrieben_am, zuletzt_genutzt: z.zuletzt ?? e.mandat!.zuletzt_genutzt, updated_at: new Date().toISOString() })
            .eq("id", e.mandat!.id));
        } else {
          if (e.mandat) await (supabase as any).from("sepa_mandates").update({ status: "ersetzt", updated_at: new Date().toISOString() }).eq("id", e.mandat.id);
          ({ error } = await (supabase as any).from("sepa_mandates").insert({
            building_id: buildingId,
            assignment_id: e.assignmentId,
            contact_id: e.contactId,
            mandatsreferenz: z.referenz,
            kontoinhaber: (z.name && z.name !== z.name.toUpperCase() ? z.name : null) || e.kontoinhaber || z.name || e.name,
            iban: z.iban,
            unterschrieben_am: z.unterschrieben,
            zuletzt_genutzt: z.zuletzt,
            quelle: "import",
            status: "aktiv",
            notiz: z.datei === "Kontoauszügen" ? "Übernommen aus den Kontoauszügen (letzter Einzug), Datum aus der Mandatsreferenz" : `Übernommen aus ${z.datei}`,
          }));
        }
        if (error) {
          fehlgeschlagen.push(`${e.name}: ${/duplicate|unique/i.test(error.message) ? "Mandatsreferenz gibt es schon bei einem anderen Eigentümer" : error.message}`);
          continue;
        }
        // Vorschlag aus dem Fragebogen mit derselben IBAN ist damit erledigt
        if (e.vorschlag && clean(e.vorschlag.iban) === z.iban) await (supabase as any).from("sepa_mandates").update({ status: "verworfen" }).eq("id", e.vorschlag.id);
        ok++;
      }
      if (ok) toast.success(`${ok} Mandate übernommen`);
      if (fehlgeschlagen.length) toast.error(fehlgeschlagen.slice(0, 3).join(" · "), { duration: 10000 });
      onFertig();
      if (!fehlgeschlagen.length) schliessen(false);
    } finally {
      setLaeuft(false);
    }
  };

  const schliessen = (o: boolean) => {
    if (laeuft) return;
    onOpenChange(o);
    if (!o) {
      setZeilen([]);
      setGids([]);
      setFehler(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={schliessen}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Bestehende Mandate übernehmen</DialogTitle>
          <DialogDescription>
            Am einfachsten aus den Kontoauszügen: Wurden Hausgelder bisher eingezogen, stehen Name, IBAN und Mandatsreferenz in jeder Buchung. Sonst die SEPA-Dateien (XML) früherer Sammel-Lastschriften dieser WEG – dort stehen Name, IBAN, Mandatsreferenz und Unterschriftsdatum genau so, wie die Bank sie kennt. Alternativ eine Liste als CSV mit den Spalten Name, IBAN, Mandatsreferenz, Unterschrift am (und gern Einheit).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={ausAuszuegenLesen} disabled={laeuft} className="flex items-center justify-center gap-2 rounded-xl border bg-primary/5 px-4 py-6 text-sm hover:bg-primary/10 disabled:opacity-60">
          {laeuft && !zeilen.length ? <Loader2 className="h-5 w-5 animate-spin" /> : <Landmark className="h-5 w-5 text-primary" />}
          <span>
            <b>Aus Kontoauszügen übernehmen</b>
            <span className="block text-xs text-muted-foreground">bisherige Hausgeld-Einzüge mit Mandatsreferenz</span>
          </span>
        </button>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-6 text-sm hover:bg-muted/40">
          <FileUp className="h-5 w-5 text-muted-foreground" />
          <span>
            <b>Dateien wählen</b> – mehrere auf einmal möglich (.xml, .csv)
          </span>
          <input type="file" multiple accept=".xml,.csv,text/xml,application/xml,text/csv" className="hidden" onChange={(e) => { dateienLesen(e.target.files); e.target.value = ""; }} />
        </label>
        </div>

        {fehler && <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{fehler}</div>}
        {fremdeGid && (
          <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Die Datei nutzt die Gläubiger-ID {fremdeGid}, bei dieser Liegenschaft ist {glaeubigerId} eingetragen. Gehört die Datei wirklich zu dieser WEG?
          </div>
        )}
        {!glaeubigerId && gids.length === 1 && (
          <div className="rounded-md bg-muted px-3 py-2 text-sm">Die Gläubiger-ID {gids[0]} aus der Datei wird bei der Liegenschaft eingetragen.</div>
        )}

        {zeilen.length > 0 && (
          <div className="max-h-[50vh] overflow-auto rounded-lg border">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="sticky top-0 bg-muted/80 text-left text-xs text-muted-foreground backdrop-blur">
                <tr>
                  <th className="w-8 px-3 py-2" />
                  <th className="px-3 py-2 font-medium">Aus der Datei</th>
                  <th className="px-3 py-2 font-medium">Mandatsreferenz</th>
                  <th className="px-3 py-2 font-medium">Unterschrift</th>
                  <th className="px-3 py-2 font-medium">Letzter Einzug</th>
                  <th className="px-3 py-2 font-medium">Eigentümer</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {zeilen.map((z) => (
                  <tr key={z.key} className={z.assignmentId && doppelt.has(z.assignmentId) && z.an ? "bg-amber-50 dark:bg-amber-950/40" : ""}>
                    <td className="px-3 py-2">
                      <Checkbox
                        checked={z.an}
                        disabled={!z.assignmentId}
                        onCheckedChange={(v) => setZeilen((alt) => alt.map((x) => (x.key === z.key ? { ...x, an: !!v } : x)))}
                        aria-label="Übernehmen"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{z.name || "–"}</div>
                      <div className="font-mono text-xs text-muted-foreground">{ibanFormatiert(z.iban)}</div>
                      {z.hinweis && <div className="text-xs text-amber-700 dark:text-amber-400">{z.hinweis}</div>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{z.referenz}</td>
                    <td className="px-3 py-2">{datumDe(z.unterschrieben)}</td>
                    <td className="px-3 py-2">{datumDe(z.zuletzt)}</td>
                    <td className="px-3 py-2">
                      <select
                        value={z.assignmentId ?? ""}
                        onChange={(ev) => setZeilen((alt) => alt.map((x) => (x.key === z.key ? { ...x, assignmentId: ev.target.value || null, an: !!ev.target.value && !x.hinweis } : x)))}
                        className="h-9 w-full max-w-[240px] rounded-md border bg-background px-2 text-sm"
                        aria-label="Eigentümer zuordnen"
                      >
                        <option value="">– nicht übernehmen –</option>
                        {liste.map((e) => (
                          <option key={e.assignmentId} value={e.assignmentId}>
                            {e.einheit ? `${e.einheit} · ` : ""}
                            {e.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {zeilen.length ? `${zeilen.filter((z) => z.assignmentId).length} von ${zeilen.length} automatisch zugeordnet` : ""}
          </span>
          <Button onClick={uebernehmen} disabled={laeuft || !gewaehlt.length}>
            {laeuft && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {gewaehlt.length ? `${gewaehlt.length} Mandate übernehmen` : "Übernehmen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
