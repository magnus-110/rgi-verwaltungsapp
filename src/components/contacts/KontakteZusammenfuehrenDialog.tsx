/**
 * Adressen › „Mit anderem Kontakt zusammenführen …“
 * Zwei Kontakte wählen, Haupt-Kontakt festlegen, Vorschau (Trockenlauf), dann zusammenführen.
 * Ausgeführt von der Edge-Funktion kontakte-zusammenfuehren (nur Büro).
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2, GitMerge, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KontaktAuswahl } from "./KontaktAuswahl";
import { kontaktAnzeigename } from "@/lib/kontaktSuche";
import { useToast } from "@/hooks/use-toast";

const TABELLEN: Record<string, string> = {
  emails: "E-Mails",
  contact_building_assignments: "Gebäude-Zuordnungen",
  contact_change_notifications: "Änderungs-Hinweise",
  inquiries: "Anfragen",
  key_loans: "Schlüsselausgaben",
  call_logs: "Anrufe",
  case_participants: "Vorgangs-Beteiligte",
  processes: "Prozesse",
  sepa_mandates: "SEPA-Mandate",
  building_service_providers: "Dienstleister am Gebäude",
  heating_systems: "Heizungsanlagen (Ablesefirma)",
  billing_periods: "Abrechnungszeiträume (Ablesefirma)",
  utility_contracts: "Versorgerverträge",
  building_files: "Gebäude-Dateien",
  building_file_visibility: "Datei-Freigaben",
  building_assessments: "Einschätzungen",
  billable_events: "Abrechenbare Leistungen",
  broker_gesuche: "Makler-Gesuche",
  broker_leads: "Makler-Interessenten",
  broker_properties: "Makler-Objekte",
  cash_audits: "Kassenprüfungen",
  comm_recipients: "Rundmail-Empfänger",
  comm_recipient_overrides: "Rundmail-Anpassungen",
  email_rules: "E-Mail-Regeln",
  etv_agenda_items: "ETV-Tagesordnungspunkte",
  etv_attendees: "ETV-Vollmachten",
  etv_date_poll_notes: "Terminumfrage-Notizen",
  etv_date_poll_responses: "Terminumfrage-Antworten",
  etv_protocol_sign_requests: "Protokoll-Unterschriften",
  etv_protocol_signatures: "Protokoll-Unterschriften",
  offers: "Angebote",
  onboarding_letter_log: "Onboarding-Briefe",
  onboarding_progress: "Onboarding-Fortschritt",
  onboarding_submissions: "Onboarding-Angaben",
  report_participants: "Berichts-Beteiligte",
  rgi_clients: "RGI-Kunden",
  sign_request_signers: "Unterschrifts-Empfänger",
};

const FESTE: Record<string, { text: string; art: "dazu" | "weg" | "info" }> = {
  personen_zusammengelegt: { text: "Personen mit gleichem Namen zusammengelegt", art: "info" },
  personen_umgehaengt: { text: "Personen übernommen", art: "dazu" },
  telefon_umgehaengt: { text: "Telefonnummern übernommen", art: "dazu" },
  telefon_doppelt_verworfen: { text: "Telefonnummern doppelt – weggelassen", art: "weg" },
  email_umgehaengt: { text: "E-Mail-Adressen übernommen", art: "dazu" },
  email_doppelt_verworfen: { text: "E-Mail-Adressen doppelt – weggelassen", art: "weg" },
  bank_umgehaengt: { text: "Bankverbindungen übernommen", art: "dazu" },
  bank_doppelt_verworfen: { text: "Bankverbindungen doppelt oder leer – weggelassen", art: "weg" },
  sepa_mandate_audit_log_alt_id_bleibt: { text: "Einträge im SEPA-Protokoll behalten die alte Nummer (steht im Zusammenführungs-Protokoll)", art: "info" },
};

export interface VorschauZeile {
  text: string;
  anzahl: number | null;
  art: "dazu" | "weg" | "info";
}

/** Ergebnis der DB-Funktion in lesbare Zeilen übersetzen. */
export function vorschauZeilen(erg: Record<string, any>): VorschauZeile[] {
  const z: VorschauZeile[] = [];
  for (const [k, v] of Object.entries(erg ?? {})) {
    if (["trockenlauf", "haupt", "dublette", "warnungen"].includes(k)) continue;
    if (k === "app_login_uebernommen") {
      z.push({ text: "App-Zugang wird übernommen", anzahl: null, art: "dazu" });
    } else if (FESTE[k]) {
      z.push({ ...FESTE[k], anzahl: Number(v) });
    } else if (k.startsWith("verworfen_")) {
      const t = k.slice("verworfen_".length);
      z.push({ text: `${TABELLEN[t] ?? t}: bei beiden vorhanden – doppelte weggelassen`, anzahl: Number(v), art: "weg" });
    } else if (k.startsWith("umgehaengt_")) {
      const t = k.slice("umgehaengt_".length).replace(/^public\./, "").split(".")[0];
      z.push({ text: `${TABELLEN[t] ?? t} umgehängt`, anzahl: Number(v), art: "dazu" });
    } else {
      z.push({ text: k, anzahl: typeof v === "number" ? v : null, art: "info" });
    }
  }
  for (const w of (erg?.warnungen ?? []) as string[]) z.push({ text: w, anzahl: null, art: "info" });
  return z;
}

interface KontaktKurz {
  id: string;
  name: string;
  ort: string | null;
  login: boolean;
  personen: number;
  telefon: number;
  email: number;
  gebaeude: number;
}

function useKontaktKurz(id: string | null) {
  return useQuery({
    queryKey: ["zusammenfuehren-kontakt", id],
    enabled: !!id,
    queryFn: async (): Promise<KontaktKurz | null> => {
      const { data } = await supabase
        .from("contacts")
        .select(
          "id, company_name, short_name, first_name, last_name, address_zip, address_city, user_id, contact_persons(id), contact_phones(id), contact_emails(id), contact_building_assignments(id)",
        )
        .eq("id", id!)
        .maybeSingle();
      if (!data) return null;
      const d: any = data;
      return {
        id: d.id,
        name: kontaktAnzeigename(d),
        ort: [d.address_zip, d.address_city].filter(Boolean).join(" ") || null,
        login: !!d.user_id,
        personen: d.contact_persons?.length ?? 0,
        telefon: d.contact_phones?.length ?? 0,
        email: d.contact_emails?.length ?? 0,
        gebaeude: d.contact_building_assignments?.length ?? 0,
      };
    },
  });
}

async function fehlerText(error: any): Promise<string> {
  try {
    const b = await error?.context?.json?.();
    if (b?.error) return b.error;
  } catch {
    /* Standardtext */
  }
  return error?.message || "Unbekannter Fehler";
}

function KontaktKarte({ k, haupt, onWaehlen }: { k: KontaktKurz | null | undefined; haupt: boolean; onWaehlen: () => void }) {
  return (
    <button
      type="button"
      onClick={onWaehlen}
      className={cn(
        "flex-1 rounded-lg border p-3 text-left transition-colors",
        haupt ? "border-2 border-primary bg-primary/5" : "border-border hover:bg-muted/50",
      )}
    >
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
        {haupt ? (
          <>
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> <span className="text-primary">Bleibt</span>
          </>
        ) : (
          <>
            <Trash2 className="h-3.5 w-3.5 text-destructive" /> <span className="text-destructive">Wird aufgelöst</span>
          </>
        )}
      </div>
      {k ? (
        <>
          <p className="truncate text-sm font-medium">{k.name}</p>
          {k.ort && <p className="truncate text-xs text-muted-foreground">{k.ort}</p>}
          <p className="mt-1 text-xs text-muted-foreground">
            {k.personen} Pers. · {k.telefon} Tel. · {k.email} E-Mail · {k.gebaeude} Gebäude{k.login ? " · App-Zugang" : ""}
          </p>
        </>
      ) : (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      )}
    </button>
  );
}

export function KontakteZusammenfuehrenDialog({
  open,
  onOpenChange,
  startKontaktId,
  onFertig,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  startKontaktId: string;
  onFertig: (hauptId: string) => void;
}) {
  const { toast } = useToast();
  const [andererId, setAndererId] = useState<string | null>(null);
  const [startIstHaupt, setStartIstHaupt] = useState(true);
  const [vorschau, setVorschau] = useState<VorschauZeile[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [prueft, setPrueft] = useState(false);
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => {
    if (open) {
      setAndererId(null);
      setStartIstHaupt(true);
      setVorschau(null);
      setFehler(null);
    }
  }, [open, startKontaktId]);

  const { data: start } = useKontaktKurz(open ? startKontaktId : null);
  const { data: anderer } = useKontaktKurz(open ? andererId : null);

  const haupt = startIstHaupt ? startKontaktId : andererId;
  const dublette = startIstHaupt ? andererId : startKontaktId;
  const hauptK = startIstHaupt ? start : anderer;
  const dublK = startIstHaupt ? anderer : start;

  const rufe = async (trocken: boolean) =>
    supabase.functions.invoke("kontakte-zusammenfuehren", { body: { haupt, dublette, trocken } });

  // Vorschau (Trockenlauf) bei jeder Auswahl neu
  useEffect(() => {
    if (!open || !haupt || !dublette) return;
    let abbruch = false;
    setPrueft(true);
    setVorschau(null);
    setFehler(null);
    (async () => {
      const { data, error } = await rufe(true);
      if (abbruch) return;
      if (error) setFehler(await fehlerText(error));
      else setVorschau(vorschauZeilen(data?.ergebnis ?? {}));
      setPrueft(false);
    })();
    return () => {
      abbruch = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, haupt, dublette]);

  const zusammenfuehren = async () => {
    if (!haupt || !dublette) return;
    setLaeuft(true);
    const { error } = await rufe(false);
    setLaeuft(false);
    if (error) {
      setFehler(await fehlerText(error));
      return;
    }
    toast({ title: "Kontakte zusammengeführt", description: `„${dublK?.name ?? ""}“ ist jetzt Teil von „${hauptK?.name ?? ""}“.` });
    onOpenChange(false);
    onFertig(haupt);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5" /> Kontakte zusammenführen
          </DialogTitle>
          <DialogDescription>
            Für doppelte Einträge: Alles vom einen Kontakt (Personen, Telefon, E-Mail, Bank, Gebäude, E-Mails, Vorgänge …)
            wird an den anderen gehängt. Danach gibt es nur noch einen Kontakt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Doppelter Kontakt</Label>
            <KontaktAuswahl
              value={andererId}
              onChange={(id) => setAndererId(id)}
              placeholder="Anderen Kontakt suchen …"
              neuAnlegen={false}
              ausschliessen={[startKontaktId]}
            />
          </div>

          {andererId && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Welcher Kontakt soll bleiben? (antippen)</Label>
                <div className="flex items-stretch gap-2">
                  <KontaktKarte k={start} haupt={startIstHaupt} onWaehlen={() => setStartIstHaupt(true)} />
                  <div className="flex items-center">
                    <ArrowRight className={cn("h-4 w-4 text-muted-foreground transition-transform", startIstHaupt && "rotate-180")} />
                  </div>
                  <KontaktKarte k={anderer} haupt={!startIstHaupt} onWaehlen={() => setStartIstHaupt(false)} />
                </div>
              </div>

              <div className="rounded-lg border border-border p-3">
                <p className="mb-2 text-sm font-medium">Vorschau</p>
                {prueft ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Wird geprüft …
                  </div>
                ) : fehler ? (
                  <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-2.5 text-sm text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{fehler}</span>
                  </div>
                ) : vorschau ? (
                  <ul className="space-y-1 text-sm">
                    {vorschau.length === 0 && (
                      <li className="text-muted-foreground">Der Kontakt hat keine weiteren Daten – er wird nur entfernt.</li>
                    )}
                    {vorschau.map((z, i) => (
                      <li key={i} className="flex items-baseline gap-2">
                        <span
                          className={cn(
                            "w-8 shrink-0 text-right font-mono text-xs",
                            z.art === "dazu" && "text-primary",
                            z.art === "weg" && "text-muted-foreground",
                          )}
                        >
                          {z.anzahl != null ? (z.art === "weg" ? `−${z.anzahl}` : z.art === "dazu" ? `+${z.anzahl}` : `${z.anzahl}`) : "•"}
                        </span>
                        <span className={cn(z.art === "weg" && "text-muted-foreground")}>{z.text}</span>
                      </li>
                    ))}
                    <li className="flex items-baseline gap-2 pt-1 text-muted-foreground">
                      <span className="w-8 shrink-0 text-right text-xs">•</span>
                      <span>
                        Leere Felder bei „{hauptK?.name}“ werden ergänzt, nichts wird überschrieben. „{dublK?.name}“ wird danach
                        gelöscht.
                      </span>
                    </li>
                  </ul>
                ) : null}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={zusammenfuehren} disabled={!vorschau || !!fehler || prueft || laeuft}>
            {laeuft ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitMerge className="mr-2 h-4 w-4" />}
            Zusammenführen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
