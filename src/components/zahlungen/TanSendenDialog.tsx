import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, CircleHelp, Loader2, Smartphone, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { euro, ibanFormatiert } from "@/lib/bankInfo";

type Zustand = "wartet" | "sendet" | "gesendet" | "pruefung" | "fehler" | "unklar" | "abgebrochen";

interface VopZeile {
  endToEndId: string;
  ergebnis: string;
  name: string | null;
  iban: string | null;
  vorschlag: string | null;
}

interface Lauf {
  id: string;
  art: "ueberweisung" | "lastschrift";
  faellig_am: string | null;
  name: string;
  konto_iban: string;
  summe: number;
  anzahl: number;
  zustand: Zustand;
  fehler?: string | null;
  vop?: { gesamt: string | null; zeilen: VopZeile[]; hinweis: string | null } | null;
  posten: { end_to_end_id: string; empfaenger: string; iban: string; betrag: number }[];
}

const ERGEBNIS: Record<string, { text: string; stil: string; icon: typeof CheckCircle2 }> = {
  RCVC: { text: "Name stimmt", stil: "text-green-700 dark:text-green-400", icon: CheckCircle2 },
  RVMC: { text: "Name stimmt nur nahezu", stil: "text-amber-700 dark:text-amber-400", icon: AlertTriangle },
  RVNM: { text: "Name stimmt nicht", stil: "text-destructive", icon: XCircle },
  RVNA: { text: "Prüfung nicht möglich", stil: "text-muted-foreground", icon: CircleHelp },
  PDNG: { text: "Prüfung läuft noch", stil: "text-muted-foreground", icon: CircleHelp },
};

/** Hinweistext der Bank kommt teils mit HTML – nur als Text zeigen. */
const ohneHtml = (s: string | null | undefined) =>
  (s ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<p>/gi, "\n\n").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim();

/**
 * Überweisungen per TAN: schickt die Zahlläufe nacheinander an die Bank –
 * je Konto eine Freigabe in der Banking-App. Weicht bei der
 * Empfängerüberprüfung ein Name ab, wird nichts gesendet; man sieht das
 * Ergebnis und entscheidet selbst („Trotzdem senden" oder „Nicht senden").
 */
export function TanSendenDialog({ laufIds, onClose }: { laufIds: string[] | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [laeufe, setLaeufe] = useState<Lauf[]>([]);
  const [aktiv, setAktiv] = useState<string | null>(null);
  const gestartet = useRef<string>("");

  const neuLaden = () => {
    queryClient.invalidateQueries({ queryKey: ["zahllauf-offen"] });
    queryClient.invalidateQueries({ queryKey: ["freigabe-rechnungen"] });
    queryClient.invalidateQueries({ queryKey: ["zahllauf-entscheidung"] });
  };

  const setze = (id: string, teil: Partial<Lauf>) => setLaeufe((ls) => ls.map((l) => (l.id === id ? { ...l, ...teil } : l)));

  const senden = async (lauf: Lauf, akzeptiert?: Record<string, string>) => {
    setAktiv(lauf.id);
    setze(lauf.id, { zustand: "sendet", fehler: null });
    try {
      const { data, error } = await supabase.functions.invoke("fints", { body: { aktion: "zahlung_senden", runId: lauf.id, akzeptiert } });
      if (error && !data) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setze(lauf.id, { zustand: (data.status as Zustand) ?? "fehler", fehler: data.fehler ?? null, vop: data.vop ?? null });
      if (data.status === "gesendet") toast.success(`${lauf.name}: an die Bank übergeben`);
    } catch (e: any) {
      setze(lauf.id, { zustand: "fehler", fehler: e?.message || "Senden fehlgeschlagen" });
    } finally {
      setAktiv(null);
      neuLaden();
    }
  };

  // Läufe laden und nacheinander senden
  useEffect(() => {
    if (!laufIds?.length) return;
    const schluessel = laufIds.join(",");
    if (gestartet.current === schluessel) return;
    gestartet.current = schluessel;
    (async () => {
      const { data, error } = await (supabase as any)
        .from("payment_runs")
        .select("id, art, faellig_am, konto_iban, summe, anzahl, status, fehler, empfaengerpruefung, buildings(name), payment_run_items(end_to_end_id, empfaenger, iban, betrag)")
        .in("id", laufIds);
      if (error) {
        toast.error("Zahlläufe konnten nicht geladen werden");
        return;
      }
      const liste: Lauf[] = (data ?? []).map((r: any) => ({
        id: r.id,
        art: r.art ?? "ueberweisung",
        faellig_am: r.faellig_am,
        name: r.buildings?.name ?? "Liegenschaft",
        konto_iban: r.konto_iban,
        summe: Number(r.summe),
        anzahl: r.anzahl,
        zustand: r.status === "pruefung" && !r.empfaengerpruefung ? "wartet" : (r.status as Zustand),
        fehler: r.fehler,
        vop: r.empfaengerpruefung,
        posten: r.payment_run_items ?? [],
      }));
      setLaeufe(liste);
      for (const l of liste) {
        if (l.zustand === "wartet") await senden(l);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laufIds]);

  const nichtSenden = async (lauf: Lauf) => {
    const { error } = await (supabase as any).from("payment_runs").update({ status: "abgebrochen", updated_at: new Date().toISOString() }).eq("id", lauf.id);
    if (error) {
      toast.error("Konnte nicht gespeichert werden");
      return;
    }
    setze(lauf.id, { zustand: "abgebrochen" });
    neuLaden();
  };

  const trotzdem = (lauf: Lauf) => {
    const akzeptiert = Object.fromEntries((lauf.vop?.zeilen ?? []).map((z) => [z.endToEndId, z.ergebnis]));
    senden(lauf, akzeptiert);
  };

  const fertig = laeufe.length > 0 && laeufe.every((l) => ["gesendet", "abgebrochen"].includes(l.zustand));

  return (
    <Dialog open={!!laufIds?.length} onOpenChange={(o) => !o && !aktiv && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Freigeben per TAN</DialogTitle>
          <DialogDescription>
            Je Konto kommt eine Anfrage in die Banking-App (SecureGo plus). Erst mit Ihrer Freigabe geht das Geld raus.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {laeufe.map((l) => (
            <section key={l.id} className="overflow-hidden rounded-xl border">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{l.name}</span>
                  <span className="block font-mono text-xs text-muted-foreground">{ibanFormatiert(l.konto_iban)}</span>
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {l.art === "lastschrift"
                    ? `${l.anzahl} Einzüge · ${euro(l.summe)}${l.faellig_am ? ` · am ${l.faellig_am.split("-").reverse().join(".")}` : ""}`
                    : `${l.anzahl} Überweisungen · ${euro(l.summe)}`}
                </span>
                <StatusText zustand={l.zustand} />
              </div>

              {l.zustand === "sendet" && (
                <div className="flex items-center gap-2 border-t bg-primary/5 px-4 py-3 text-sm">
                  <Smartphone className="h-4 w-4 shrink-0 text-primary" />
                  {l.art === "lastschrift" ? "Kommt gleich eine Anfrage in die Banking-App: bitte dort freigeben." : "Die Bank prüft die Empfänger. Kommt eine Anfrage in die Banking-App: bitte dort freigeben."}
                </div>
              )}

              {l.fehler && ["fehler", "unklar"].includes(l.zustand) && (
                <div className="border-t bg-red-50 px-4 py-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-200">{l.fehler}</div>
              )}

              {l.zustand === "pruefung" && l.vop && (
                <div className="border-t">
                  <div className="bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    <b>Empfängerüberprüfung:</b> Bei mindestens einer Zahlung passt der Name nicht genau zum Konto. Es wurde noch nichts überwiesen.
                  </div>
                  <ul className="divide-y">
                    {l.vop.zeilen.map((z, i) => {
                      const p = l.posten.find((x) => x.end_to_end_id === z.endToEndId) ?? (l.posten.length === 1 ? l.posten[0] : null);
                      const e = ERGEBNIS[z.ergebnis] ?? { text: z.ergebnis, stil: "", icon: CircleHelp };
                      const Icon = e.icon;
                      return (
                        <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{p?.empfaenger ?? z.name ?? "Empfänger"}</span>
                            <span className="block font-mono text-xs text-muted-foreground">{ibanFormatiert(p?.iban ?? z.iban ?? "")}</span>
                          </span>
                          {p && <span className="tabular-nums">{euro(p.betrag)}</span>}
                          <span className={cn("flex w-52 items-center gap-1.5", e.stil)}>
                            <Icon className="h-4 w-4 shrink-0" /> {e.text}
                          </span>
                          {z.ergebnis === "RVMC" && z.vorschlag && z.vorschlag.length < 140 && (
                            <span className="w-full text-xs text-muted-foreground">Bei der Bank hinterlegt: {z.vorschlag}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {l.vop.hinweis && (
                    <p className="whitespace-pre-line border-t px-4 py-3 text-xs text-muted-foreground">{ohneHtml(l.vop.hinweis)}</p>
                  )}
                  <div className="flex flex-wrap justify-end gap-2 border-t px-4 py-3">
                    <Button variant="outline" onClick={() => nichtSenden(l)} disabled={!!aktiv}>
                      Nicht senden
                    </Button>
                    <Button onClick={() => trotzdem(l)} disabled={!!aktiv}>
                      Trotzdem senden
                    </Button>
                  </div>
                </div>
              )}

              {l.zustand === "fehler" && (
                <div className="flex flex-wrap justify-end gap-2 border-t px-4 py-3">
                  <Button variant="outline" onClick={() => nichtSenden(l)} disabled={!!aktiv}>
                    Verwerfen
                  </Button>
                  <Button onClick={() => senden(l)} disabled={!!aktiv}>
                    Noch einmal versuchen
                  </Button>
                </div>
              )}

              {l.zustand === "unklar" && (
                <div className="flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3 text-sm">
                  <span className="flex-1 text-muted-foreground">
                    Sobald die Abbuchung auf dem Konto ankommt, ist alles automatisch erledigt.
                  </span>
                  <Button variant="outline" onClick={() => nichtSenden(l)} disabled={!!aktiv}>
                    Wurde nicht ausgeführt
                  </Button>
                </div>
              )}
            </section>
          ))}

          {laeufe.length === 0 && (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-xs text-muted-foreground">
              Kommt die Abbuchung auf dem Konto an, steht die Rechnung von selbst auf „bezahlt".
            </p>
            <Button variant={fertig ? "default" : "outline"} onClick={onClose} disabled={!!aktiv}>
              {fertig ? "Fertig" : "Schließen"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatusText({ zustand }: { zustand: Zustand }) {
  const m: Record<Zustand, [string, string]> = {
    wartet: ["Wartet", "text-muted-foreground"],
    sendet: ["Läuft …", "text-primary"],
    gesendet: ["An die Bank übergeben", "text-green-700 dark:text-green-400"],
    pruefung: ["Ihre Entscheidung", "text-amber-700 dark:text-amber-400"],
    fehler: ["Nicht gesendet", "text-destructive"],
    unklar: ["Unklar – im Online-Banking prüfen", "text-amber-700 dark:text-amber-400"],
    abgebrochen: ["Nicht gesendet", "text-muted-foreground"],
  };
  const [text, stil] = m[zustand];
  return (
    <span className={cn("flex items-center gap-1.5 font-medium", stil)}>
      {zustand === "sendet" && <Loader2 className="h-4 w-4 animate-spin" />}
      {zustand === "gesendet" && <CheckCircle2 className="h-4 w-4" />}
      {text}
    </span>
  );
}
