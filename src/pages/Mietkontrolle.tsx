import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Bot, Download, Loader2, MessageSquareText, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { euro } from "@/lib/bankInfo";

type Reiter = "mieter" | "mahnungen";

const STATUS_FARBE: Record<string, string> = {
  puenktlich: "bg-green-600",
  verspaetet: "bg-amber-400",
  zu_wenig: "bg-orange-600",
  offen: "bg-red-600",
  kein_soll: "bg-muted",
};
const STATUS_TEXT: Record<string, string> = { puenktlich: "pünktlich", verspaetet: "verspätet", zu_wenig: "zu wenig", offen: "offen", kein_soll: "kein Soll" };
const STUFE: Record<string, string> = { erinnerung: "Zahlungserinnerung", mahnung1: "1. Mahnung", mahnung2: "2. Mahnung" };
const MONAT_KURZ = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const datum = (d: string | null | undefined) => (d ? format(new Date(d), "dd.MM.yyyy") : "");

async function rufe(aktion: string, daten: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("mietkontrolle", { body: { aktion, ...daten } });
  if (error && !data) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

/** Ergebnis eines Mieters in einem Wort (für Liste und Detail). */
function ergebnis(x: any): { kurz: string; lang: string; stil: string } {
  const f = x.fall;
  if (x.rueckstand <= 0) {
    const spaet = x.monate.some((m: any) => m.status === "verspaetet");
    return spaet
      ? { kurz: "ausgeglichen", lang: "Ausgeglichen – keine Mahnung", stil: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" }
      : { kurz: "passt", lang: "Alles in Ordnung", stil: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" };
  }
  if (!f) return { kurz: "offen", lang: "Rückstand – Mahnung wird beim nächsten Lauf geplant", stil: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" };
  if (f.status === "ausgesetzt") return { kurz: "keine Mahnung", lang: `Ausgesetzt: ${f.ausgesetzt_grund ?? ""}`, stil: "bg-muted text-muted-foreground" };
  if (f.status === "fehler") return { kurz: "nicht zugestellt", lang: f.fehler ?? "Versand fehlgeschlagen", stil: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" };
  const wann = `${STUFE[f.stufe]} ${datum(f.geplant_am).slice(0, 6)}`;
  return {
    kurz: wann,
    lang: `${STUFE[f.stufe]} am ${datum(f.geplant_am)}${f.kuendigung_pruefen ? " · Aufgabe für dich: Kündigung prüfen" : ""}`,
    stil: f.stufe === "erinnerung" ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  };
}

/**
 * Mietkontrolle: Soll und Ist je Mieter und Monat, Abgleich nach festen
 * Regeln, KI-Prüfung nur bei Abweichungen mit den hinterlegten Infos, und
 * automatische Mahnungen (Standardschreiben per E-Mail und App-Nachricht,
 * nie per Post; nur von Hand aussetzbar).
 */
export default function Mietkontrolle() {
  const queryClient = useQueryClient();
  const [reiter, setReiter] = useState<Reiter>("mieter");
  const [haus, setHaus] = useState<string>("alle");
  const [auswahl, setAuswahl] = useState<string | null>(null);
  const [fallAuswahl, setFallAuswahl] = useState<string | null>(null);
  const [entwurf, setEntwurf] = useState("");
  const [arbeitet, setArbeitet] = useState<string | null>(null);
  const [aussetzenGrund, setAussetzenGrund] = useState<string | null>(null);

  const { data: u, isLoading } = useQuery({
    queryKey: ["mietkontrolle", "uebersicht"],
    queryFn: () => rufe("uebersicht"),
  });
  const { data: mahn } = useQuery({
    queryKey: ["mietkontrolle", "mahnungen"],
    queryFn: () => rufe("mahnungen"),
  });
  const neuLaden = () => queryClient.invalidateQueries({ queryKey: ["mietkontrolle"] });

  const mieter: any[] = useMemo(() => (u?.mieter ?? []).filter((x: any) => haus === "alle" || x.buildingId === haus), [u, haus]);
  const sel = mieter.find((x) => x.assignmentId === auswahl) ?? mieter.find((x) => x.rueckstand > 0) ?? mieter[0] ?? null;
  const faelle: any[] = (mahn?.faelle ?? []).filter((f: any) => haus === "alle" || f.building_id === haus);
  const geplant = faelle.filter((f) => f.status === "geplant" || f.status === "fehler");
  const ausgesetzt = faelle.filter((f) => f.status === "ausgesetzt");
  const versendet = faelle.filter((f) => f.status === "versendet" || (f.status === "erledigt" && f.versendet_am));
  const fall = faelle.find((f) => f.id === fallAuswahl) ?? geplant[0] ?? ausgesetzt[0] ?? null;
  const einstellungen = mahn?.einstellungen;

  const { data: vorschau, isFetching: ladeVorschau } = useQuery({
    queryKey: ["mietkontrolle", "vorschau", fall?.id],
    enabled: reiter === "mahnungen" && !!fall,
    queryFn: () => rufe("vorschau", { caseId: fall.id }),
  });

  const machen = async (schluessel: string, f: () => Promise<any>, ok?: string) => {
    setArbeitet(schluessel);
    try {
      const r = await f();
      if (ok) toast.success(ok);
      neuLaden();
      return r;
    } catch (e: any) {
      toast.error(e?.message || "Fehlgeschlagen");
    } finally {
      setArbeitet(null);
    }
  };

  const summen = useMemo(() => {
    const monat = new Date().toISOString().slice(0, 7);
    const im = (x: any) => x.monate.find((m: any) => m.monat === monat);
    return {
      soll: mieter.reduce((s, x) => s + (im(x)?.soll ?? 0), 0),
      ist: mieter.reduce((s, x) => s + (im(x)?.bezahlt ?? 0), 0),
      rueck: mieter.reduce((s, x) => s + x.rueckstand, 0),
    };
  }, [mieter]);

  const fallpaket = async (x: any) => {
    const d = await machen("paket", () => rufe("fallpaket", { assignmentId: x.assignmentId }));
    if (!d) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `Fallpaket_${x.name.replace(/[^A-Za-z0-9]+/g, "_")}_${format(new Date(), "yyyy-MM-dd")}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast.success("Fallpaket heruntergeladen – in Claude hochladen und den Skill „Mieterkonto“ nutzen");
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-3 md:p-0">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Mietkontrolle</h1>
          <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground md:text-base">
            {reiter === "mieter"
              ? "Der Abgleich läuft nach festen Regeln. Nur wenn etwas abweicht, prüft die KI – mit den Infos, die du beim Mieter hinterlegt hast."
              : "Mahnungen gehen täglich um 8:00 Uhr als Standardschreiben per E-Mail und App-Nachricht raus – nie per Post. Einzelne Mahnungen kannst du aussetzen."}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            Mietobjekt
            <Select value={haus} onValueChange={setHaus}>
              <SelectTrigger className="h-11 w-64 text-sm text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle Mietobjekte</SelectItem>
                {(u?.haeuser ?? []).map((h: any) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <Button variant="outline" className="h-11" disabled={!!arbeitet} onClick={() => machen("pruefen", () => rufe("pruefen"), "Abgleich aktualisiert")}>
            {arbeitet === "pruefen" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Jetzt abgleichen
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-end justify-between gap-3 border-b">
        <div className="flex gap-6">
          {(["mieter", "mahnungen"] as Reiter[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReiter(r)}
              className={cn("inline-flex min-h-[44px] items-center gap-2 border-b-2 px-1 text-[15px] font-medium", reiter === r ? "border-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground")}
            >
              {r === "mieter" ? "Mieter" : "Mahnungen"}
              {r === "mahnungen" && geplant.length > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">{geplant.length}</span>}
            </button>
          ))}
        </div>
        {reiter === "mahnungen" && einstellungen && (
          <div className="flex flex-wrap items-center gap-3 pb-2">
            <Select
              value={einstellungen.email_account_id ?? "keins"}
              onValueChange={(v) => machen("postfach", () => rufe("einstellungen", { email_account_id: v === "keins" ? null : v }), "Absender gespeichert")}
            >
              <SelectTrigger className="h-9 w-64 text-xs">
                <SelectValue placeholder="Absender-Postfach" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="keins">Kein Absender gewählt</SelectItem>
                {(mahn?.postfaecher ?? []).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    Absender: {p.display_name} · {p.email_address}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <Switch
                checked={!!einstellungen.auto_versand}
                disabled={!!arbeitet || (!einstellungen.auto_versand && !einstellungen.email_account_id)}
                onCheckedChange={(v) => machen("auto", () => rufe("einstellungen", { auto_versand: v }), v ? "Automatischer Versand eingeschaltet" : "Automatischer Versand ausgeschaltet")}
              />
              {einstellungen.auto_versand ? "Automatischer Versand an" : "Automatischer Versand aus"}
            </label>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : reiter === "mieter" ? (
        <>
          <section className="grid gap-4 sm:grid-cols-3" aria-label="Monatssummen">
            <Kachel label={`Soll ${MONAT_KURZ[new Date().getMonth()]}`} wert={euro(summen.soll)} />
            <Kachel label="Eingegangen" wert={euro(summen.ist)} farbe="text-green-700 dark:text-green-400" />
            <Kachel label="Rückstand gesamt" wert={euro(summen.rueck)} farbe="text-red-700 dark:text-red-400" />
          </section>

          <div className="flex flex-wrap items-start gap-5">
            <section className="min-w-0 flex-[3_1_560px] overflow-hidden rounded-xl border bg-card" aria-label="Mieter">
              <div className="overflow-x-auto">
                <div className="min-w-[600px]">
                  <div className="grid grid-cols-[minmax(130px,1.4fr)_84px_minmax(140px,1.2fr)_92px_minmax(100px,1fr)] gap-3 px-4 pb-2 pt-3 text-xs text-muted-foreground">
                    <span>Mieter</span>
                    <span>Soll / Monat</span>
                    <span>Letzte 12 Monate</span>
                    <span className="text-right">Rückstand</span>
                    <span>Ergebnis</span>
                  </div>
                  {mieter.map((x) => {
                    const e = ergebnis(x);
                    return (
                      <button
                        key={x.assignmentId}
                        type="button"
                        onClick={() => {
                          setAuswahl(x.assignmentId);
                          setEntwurf("");
                        }}
                        className={cn(
                          "grid w-full grid-cols-[minmax(130px,1.4fr)_84px_minmax(140px,1.2fr)_92px_minmax(100px,1fr)] items-center gap-3 border-t px-4 py-2.5 text-left hover:bg-muted/40",
                          sel?.assignmentId === x.assignmentId && "bg-primary/5 shadow-[inset_3px_0_0_hsl(var(--primary))]",
                        )}
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 truncate font-semibold">
                            {x.name}
                            {x.infos.length > 0 && <MessageSquareText className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Info hinterlegt" />}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {haus === "alle" ? `${x.haus} · ` : ""}
                            {x.einheit || "–"}
                          </span>
                        </span>
                        <span className="tabular-nums">{euro(x.sollMonat)}</span>
                        <span className="flex flex-wrap gap-1" aria-label={x.monate.map((m: any) => `${m.monat}: ${STATUS_TEXT[m.status]}`).join(", ")}>
                          {x.monate.map((m: any) => (
                            <span key={m.monat} title={`${MONAT_KURZ[Number(m.monat.slice(5, 7)) - 1]} ${m.monat.slice(0, 4)}: ${STATUS_TEXT[m.status]}`} className={cn("h-3.5 w-3.5 rounded-[4px]", STATUS_FARBE[m.status])} />
                          ))}
                        </span>
                        <span className={cn("text-right font-semibold tabular-nums", x.rueckstand > 0 ? "text-red-700 dark:text-red-400" : "text-muted-foreground")}>{x.rueckstand > 0 ? euro(x.rueckstand) : "—"}</span>
                        <span className="min-w-0">
                          <span title={e.lang} className={cn("inline-block max-w-full truncate whitespace-nowrap rounded-full px-2.5 py-0.5 align-middle text-xs font-semibold", e.stil)}>{e.kurz}</span>
                        </span>
                      </button>
                    );
                  })}
                  {!mieter.length && <div className="border-t px-4 py-10 text-center text-sm text-muted-foreground">Keine Mieter mit hinterlegter Miete (Gebäude › Personen › Kosten).</div>}
                </div>
              </div>
              <div className="flex flex-wrap gap-4 border-t px-4 py-3 text-xs text-muted-foreground">
                {(["puenktlich", "verspaetet", "zu_wenig", "offen"] as const).map((s) => (
                  <span key={s} className="inline-flex items-center gap-1.5">
                    <span className={cn("h-3 w-3 rounded-[3px]", STATUS_FARBE[s])} />
                    {STATUS_TEXT[s]}
                  </span>
                ))}
                <span className="inline-flex items-center gap-1.5">
                  <MessageSquareText className="h-3.5 w-3.5 text-primary" /> Info hinterlegt
                </span>
              </div>
            </section>

            {sel && (
              <section className="min-w-0 flex-[2_1_360px] space-y-4 rounded-xl border bg-card p-5" aria-label="Mieter im Detail">
                <div>
                  <div className="text-sm text-muted-foreground">
                    {sel.haus} · {sel.einheit || "–"}
                  </div>
                  <div className="mt-0.5 text-xl font-bold">{sel.name}</div>
                  <div className="mt-0.5 text-sm text-muted-foreground">
                    Soll {euro(sel.sollMonat)} · Rückstand {sel.rueckstand > 0 ? euro(sel.rueckstand) : "—"}
                    {sel.guthaben > 0 && ` · Guthaben ${euro(sel.guthaben)}`}
                  </div>
                </div>

                <Schritt nr="1" titel="Abgleich nach Regeln">
                  {sel.rueckstand <= 0
                    ? sel.monate.some((m: any) => m.status === "verspaetet")
                      ? "Kein Betrag offen. Einige Zahlungen kamen nach dem 3. Werktag; spätere Zahlungen wurden dem ältesten offenen Monat zugeordnet."
                      : "Alle Mieten pünktlich und vollständig."
                    : `Offen: ${sel.monate
                        .filter((m: any) => m.status === "offen" || m.status === "zu_wenig")
                        .map((m: any) => `${MONAT_KURZ[Number(m.monat.slice(5, 7)) - 1]} ${euro(m.soll - m.bezahlt)}`)
                        .join(", ")}.`}
                </Schritt>
                {sel.rueckstand > 0 && sel.infos.length > 0 && (
                  <Schritt nr="2" titel="KI-Prüfung mit deinen Infos" ki>
                    {sel.fall?.ki_pruefung?.begruendung ?? "Wird beim nächsten Abgleich geprüft."}
                  </Schritt>
                )}
                <Schritt nr={sel.rueckstand > 0 && sel.infos.length ? "3" : "2"} titel="Ergebnis">
                  <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold", ergebnis(sel).stil)}>{ergebnis(sel).lang}</span>
                </Schritt>

                <div className="rounded-xl border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">Hinterlegte Infos</span>
                    <span className="text-xs text-muted-foreground">liest die KI bei Abweichungen</span>
                  </div>
                  {!sel.infos.length && <div className="mt-2 text-sm text-muted-foreground">Noch keine Info hinterlegt.</div>}
                  {sel.infos.map((i: any) => (
                    <div key={i.id} className="mt-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                      <span className="text-muted-foreground">{datum(i.created_at)} · </span>
                      {i.text}
                    </div>
                  ))}
                  <label className="mt-3 block space-y-1.5 text-xs text-muted-foreground">
                    Neue Info, z. B. Vereinbarung, Ratenzahlung, Widerspruch, Mietminderung
                    <Textarea rows={2} value={entwurf} onChange={(e) => setEntwurf(e.target.value)} className="text-sm text-foreground" />
                  </label>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    disabled={!entwurf.trim() || !!arbeitet}
                    onClick={async () => {
                      await machen("info", () => rufe("info_speichern", { assignmentId: sel.assignmentId, text: entwurf.trim() }), "Info gespeichert und neu geprüft");
                      setEntwurf("");
                    }}
                  >
                    {arbeitet === "info" && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                    Speichern &amp; neu prüfen
                  </Button>
                </div>

                <details className="text-sm">
                  <summary className="min-h-[32px] cursor-pointer font-semibold">Zahlungen (zuletzt)</summary>
                  <table className="mt-1 w-full text-sm">
                    <tbody>
                      {sel.letzteZahlungen.map((z: any) => (
                        <tr key={z.id} className="border-t">
                          <td className="whitespace-nowrap py-1.5 text-muted-foreground">{datum(z.datum)}</td>
                          <td className="truncate px-2 py-1.5">{z.text}</td>
                          <td className="py-1.5 text-right tabular-nums text-green-700 dark:text-green-400">+{euro(z.betrag)}</td>
                        </tr>
                      ))}
                      {!sel.letzteZahlungen.length && (
                        <tr>
                          <td className="py-2 text-muted-foreground">Keine Zahlung erkannt. Stimmt die IBAN beim Mieter?</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </details>

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => fallpaket(sel)} disabled={!!arbeitet}>
                    {arbeitet === "paket" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                    Fallpaket für Claude
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Das Fallpaket enthält Mieterkonto, Infos und bisherige Mahnungen dieses Mieters – zum Hochladen in Claude (Skill „Mieterkonto“), z. B. für einen Ratenplan oder eine Einschätzung.
                </p>
              </section>
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-start gap-5">
          <section className="min-w-0 flex-[3_1_480px] overflow-hidden rounded-xl border bg-card" aria-label="Mahnungen">
            <Gruppe titel="Geplant" hinweis={einstellungen?.auto_versand ? "gehen automatisch raus" : "automatischer Versand ist aus"} />
            {!geplant.length && <div className="border-t px-4 py-3 text-sm text-muted-foreground">Nichts geplant.</div>}
            {geplant.map((f) => (
              <FallZeile key={f.id} f={f} aktiv={fall?.id === f.id} onWahl={() => setFallAuswahl(f.id)}>
                <Button size="sm" variant="outline" onClick={() => { setFallAuswahl(f.id); setAussetzenGrund("Ratenzahlung vereinbart"); }}>
                  Aussetzen
                </Button>
              </FallZeile>
            ))}
            <Gruppe titel="Ausgesetzt" hinweis="von dir oder laut hinterlegter Info" />
            {!ausgesetzt.length && <div className="border-t px-4 py-3 text-sm text-muted-foreground">Nichts ausgesetzt.</div>}
            {ausgesetzt.map((f) => (
              <FallZeile key={f.id} f={f} aktiv={fall?.id === f.id} onWahl={() => setFallAuswahl(f.id)} grund={f.ausgesetzt_grund}>
                <Button size="sm" variant="outline" disabled={!!arbeitet} onClick={() => machen(f.id, () => rufe("einplanen", { caseId: f.id }), "Wieder eingeplant")}>
                  Wieder einplanen
                </Button>
              </FallZeile>
            ))}
            <Gruppe titel="Versendet" hinweis="letzte 6 Monate" />
            {!versendet.length && <div className="border-t px-4 py-3 text-sm text-muted-foreground">Noch nichts versendet.</div>}
            {versendet.map((f) => (
              <div key={f.id} className="flex min-h-[56px] items-center gap-3 border-t px-4 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">
                    {f.name} <span className="font-normal text-muted-foreground">· {f.einheit}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {STUFE[f.stufe]} · versendet am {datum(f.versendet_am)} per {(f.kanaele ?? []).map((k: string) => (k === "email" ? "E-Mail" : "App")).join(" und ")}
                  </span>
                </span>
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", f.status === "erledigt" ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" : "bg-muted text-muted-foreground")}>
                  {f.status === "erledigt" ? "erledigt" : "zugestellt"}
                </span>
              </div>
            ))}
          </section>

          <section className="min-w-0 flex-[2_1_360px] space-y-4" aria-label="Vorschau">
            {aussetzenGrund != null && fall && (
              <div className="space-y-3 rounded-xl border bg-card p-4">
                <div className="font-semibold">{fall.name}: Mahnung aussetzen</div>
                <label className="block space-y-1.5 text-xs text-muted-foreground">
                  Grund (wird als Info beim Mieter hinterlegt)
                  <Select value={aussetzenGrund} onValueChange={setAussetzenGrund}>
                    <SelectTrigger className="h-10 text-sm text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["Ratenzahlung vereinbart", "Widerspruch / Klärung läuft", "Mietminderung strittig", "Zahlung angekündigt", "Sonstiges"].map((g) => (
                        <SelectItem key={g} value={g}>
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={!!arbeitet}
                    onClick={async () => {
                      await machen(fall.id, () => rufe("aussetzen", { caseId: fall.id, grund: aussetzenGrund }), "Mahnung ausgesetzt");
                      setAussetzenGrund(null);
                    }}
                  >
                    Aussetzen
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAussetzenGrund(null)}>
                    Abbrechen
                  </Button>
                </div>
              </div>
            )}

            {fall ? (
              <div className="rounded-xl border bg-card p-6 shadow-sm">
                <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                  <span>Vorschau · Standardschreiben „{STUFE[fall.stufe]}“</span>
                  <span>{fall.status === "ausgesetzt" ? "ausgesetzt" : `Versand am ${datum(fall.geplant_am)}, 8:00`}</span>
                </div>
                {ladeVorschau || !vorschau ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    <div className="mt-4 text-sm text-muted-foreground">
                      RGI Immobilien GmbH &amp; Co. KG · Pfronten
                      <br />
                      <span className="text-foreground">{vorschau.adresse}</span>
                    </div>
                    <div className="mt-4 font-bold">{vorschau.betreff}</div>
                    <div className="mt-2 whitespace-pre-line text-sm leading-relaxed">{vorschau.text}</div>
                    <div className="mt-4 text-xs text-muted-foreground">
                      Geht an: {vorschau.email ? `E-Mail ${vorschau.email}` : "keine E-Mail-Adresse"}
                      {vorschau.app ? " und App-Nachricht" : ""}
                      {!vorschau.email && !vorschau.app && " – es entsteht eine Aufgabe für dich"}
                    </div>
                    {fall.status !== "ausgesetzt" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3"
                        disabled={!!arbeitet}
                        onClick={() => machen(fall.id + "s", () => rufe("senden", { caseId: fall.id }).then((r) => { if (!r.ok) throw new Error(r.fehler); }), "Mahnung versendet")}
                      >
                        {arbeitet === fall.id + "s" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
                        Jetzt senden
                      </Button>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Keine Mahnung ausgewählt.</div>
            )}

            <details className="rounded-xl border bg-card p-4 text-sm leading-relaxed">
              <summary className="min-h-[28px] cursor-pointer font-semibold">Mahnregeln</summary>
              <div className="mt-2 space-y-1">
                <div>• Zahlungserinnerung {einstellungen?.erinnerung_nach_tagen ?? 5} Tage nach Fälligkeit (Miete: 3. Werktag, § 556b Abs. 1 BGB)</div>
                <div>• 1. Mahnung {einstellungen?.mahnung_abstand_tagen ?? 14} Tage nach der Erinnerung, 2. Mahnung {einstellungen?.mahnung_abstand_tagen ?? 14} Tage später; danach entscheidest du</div>
                <div>• Ab zwei offenen Monatsmieten sofort 1. Mahnung + Aufgabe „Kündigung prüfen“ (§ 543 Abs. 2 Nr. 3 BGB) – die App kündigt nie selbst</div>
                <div>• Hinweis auf Verzugszinsen (5 Prozentpunkte über Basiszinssatz, § 288 Abs. 1 BGB); keine Mahngebühren</div>
                <div>• Versand per E-Mail und App-Nachricht, nie per Post – fehlt beides, entsteht eine Aufgabe</div>
                <div>• Vor jedem Versand: neuer Abgleich mit den Konten und KI-Prüfung der hinterlegten Infos</div>
              </div>
            </details>
          </section>
        </div>
      )}
    </div>
  );
}

function Kachel({ label, wert, farbe }: { label: string; wert: string; farbe?: string }) {
  return (
    <div className="rounded-xl border bg-card px-5 py-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-bold tabular-nums", farbe)}>{wert}</div>
    </div>
  );
}

function Schritt({ nr, titel, ki, children }: { nr: string; titel: string; ki?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold", ki ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
        {ki ? <Bot className="h-4 w-4" /> : nr}
      </span>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titel}</div>
        <div className="mt-0.5 text-[15px] leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function Gruppe({ titel, hinweis }: { titel: string; hinweis: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t bg-muted/30 px-4 pb-2 pt-3 first:border-t-0">
      <span className="font-bold">{titel}</span>
      <span className="text-xs text-muted-foreground">{hinweis}</span>
    </div>
  );
}

function FallZeile({ f, aktiv, onWahl, grund, children }: { f: any; aktiv: boolean; onWahl: () => void; grund?: string | null; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-end gap-x-3 gap-y-1 border-t py-2 pr-4", aktiv && "bg-primary/5 shadow-[inset_3px_0_0_hsl(var(--primary))]")}>
      <button type="button" onClick={onWahl} className="flex min-h-[48px] min-w-0 flex-[1_1_240px] items-center gap-3 pl-4 text-left">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">
            {f.name} <span className="font-normal text-muted-foreground">· {f.haus}{f.einheit ? `, ${f.einheit}` : ""}</span>
          </span>
          <span className="block text-xs text-muted-foreground">
            {STUFE[f.stufe]} · {grund ? `Grund: ${grund}` : f.status === "fehler" ? `nicht zugestellt: ${f.fehler ?? ""}` : `Versand am ${datum(f.geplant_am)}, 8:00`}
          </span>
          {f.kuendigung_pruefen && f.status !== "ausgesetzt" && <span className="block text-xs font-semibold text-red-700 dark:text-red-400">Aufgabe für dich: Kündigung prüfen</span>}
        </span>
        <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums">{euro(Number(f.betrag))}</span>
      </button>
      {children}
    </div>
  );
}
