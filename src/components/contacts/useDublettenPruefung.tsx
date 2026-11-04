/**
 * „Vor dem Anlegen prüfen“: sucht ähnliche Kontakte (public.aehnliche_kontakte) und fragt bei Treffern nach,
 * ob ein vorhandener Kontakt verwendet werden soll.
 *
 *   const { pruefe, dialog } = useDublettenPruefung();
 *   const erg = await pruefe({ name, telefon, email });
 *   if (erg === "abbruch") return;
 *   if (erg !== "neu") { … erg.contactId verwenden … }
 *   … sonst neu anlegen …
 *   return <>{…}{dialog}</>;
 */
import { useCallback, useRef, useState } from "react";
import { AlertTriangle, Building2, User } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { aehnlicheKontakte, type AehnlicherKontakt, type KontaktEingabe } from "@/lib/kontaktSuche";

export type DublettenErgebnis = "neu" | "abbruch" | { contactId: string; kontakt: AehnlicherKontakt };

export function DublettenListe({
  treffer,
  onWaehlen,
  knopf = "Diesen verwenden",
}: {
  treffer: AehnlicherKontakt[];
  onWaehlen: (k: AehnlicherKontakt) => void;
  knopf?: string;
}) {
  return (
    <div className="space-y-2">
      {treffer.map((k) => {
        const Icon = k.kontakt_typ === "person" ? User : Building2;
        return (
          <div key={k.contact_id} className="flex items-start gap-3 rounded-lg border border-border p-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{k.anzeige}</p>
              {(k.ort || (k.kurzname && k.kurzname !== k.anzeige)) && (
                <p className="truncate text-xs text-muted-foreground">
                  {[k.kurzname && k.kurzname !== k.anzeige ? k.kurzname : null, k.ort].filter(Boolean).join(" · ")}
                </p>
              )}
              <div className="mt-1 flex flex-wrap gap-1">
                {k.gruende.map((g) => (
                  <Badge key={g} variant={k.sicher ? "default" : "secondary"} className="px-1.5 py-0 text-[10px] font-normal">
                    {g}
                  </Badge>
                ))}
              </div>
            </div>
            <Button size="sm" variant="outline" className="shrink-0" onClick={() => onWaehlen(k)}>
              {knopf}
            </Button>
          </div>
        );
      })}
    </div>
  );
}

export function DublettenDialog({
  open,
  treffer,
  name,
  onEntscheidung,
}: {
  open: boolean;
  treffer: AehnlicherKontakt[];
  name?: string | null;
  onEntscheidung: (e: DublettenErgebnis) => void;
}) {
  const sicher = treffer.some((t) => t.sicher);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onEntscheidung("abbruch")}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            {sicher ? "Gibt es schon" : "Gibt es diesen Kontakt schon?"}
          </DialogTitle>
          <DialogDescription>
            {name ? <>Zu „{name}“ </> : "Dazu "}
            {treffer.length === 1 ? "gibt es in den Adressen einen ähnlichen Eintrag" : "gibt es in den Adressen ähnliche Einträge"}.
            Bitte einen vorhandenen verwenden, damit keine doppelten Kontakte entstehen.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-y-auto">
          <DublettenListe treffer={treffer} onWaehlen={(k) => onEntscheidung({ contactId: k.contact_id, kontakt: k })} />
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onEntscheidung("abbruch")}>
            Abbrechen
          </Button>
          <Button variant="outline" onClick={() => onEntscheidung("neu")}>
            Trotzdem neu anlegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function useDublettenPruefung() {
  const [zustand, setZustand] = useState<{ treffer: AehnlicherKontakt[]; name?: string | null } | null>(null);
  const [prueftGerade, setPrueftGerade] = useState(false);
  const aufloesen = useRef<((e: DublettenErgebnis) => void) | null>(null);

  const pruefe = useCallback(async (eingabe: KontaktEingabe): Promise<DublettenErgebnis> => {
    setPrueftGerade(true);
    let treffer: AehnlicherKontakt[] = [];
    try {
      treffer = await aehnlicheKontakte(eingabe, 6);
    } catch (e) {
      // Prüfung darf das Anlegen nicht blockieren
      console.warn("Dubletten-Prüfung fehlgeschlagen", e);
    } finally {
      setPrueftGerade(false);
    }
    if (!treffer.length) return "neu";
    return new Promise<DublettenErgebnis>((resolve) => {
      aufloesen.current = resolve;
      setZustand({ treffer, name: eingabe.name });
    });
  }, []);

  const entscheiden = (e: DublettenErgebnis) => {
    const r = aufloesen.current;
    aufloesen.current = null;
    setZustand(null);
    r?.(e);
  };

  const dialog = (
    <DublettenDialog
      open={!!zustand}
      treffer={zustand?.treffer ?? []}
      name={zustand?.name}
      onEntscheidung={entscheiden}
    />
  );

  return { pruefe, dialog, prueftGerade };
}
