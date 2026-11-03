import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Info, Loader2, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ibanFormatiert } from "@/lib/bankInfo";
import { blzAusEingabe, blzPasstZuMuster, useFintsBanken } from "@/lib/fintsBanken";

/** Meldung der Funktion auch bei Fehlerstatus (500 usw.) lesen. */
export async function fintsFehler(data: any, error: any, ersatz: string): Promise<string> {
  if (data?.error) return String(data.error);
  try {
    const body = await error?.context?.json?.();
    if (body?.error) return String(body.error);
  } catch {
    // kein JSON
  }
  return ersatz;
}

type Schritt = "zugang" | "verfahren" | "freigabe" | "fertig";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Eigener Zugang des Nutzers für Überweisungen und Einzüge */
  persoenlich?: boolean;
}

/**
 * Assistent „Bankzugang hinzufügen": Bank und Anmeldedaten → TAN-Verfahren
 * → Freigabe in der Banking-App → Konten. Die PIN geht nur an die
 * Edge-Funktion und wird dort verschlüsselt abgelegt.
 */
export function BankzugangAssistent({ open, onOpenChange, persoenlich = false }: Props) {
  const queryClient = useQueryClient();
  const [schritt, setSchritt] = useState<Schritt>("zugang");
  const { data: bankDaten } = useFintsBanken();
  const banken = useMemo(() => (bankDaten?.banken ?? []).filter((b) => b.aktiv), [bankDaten]);
  const [blz, setBlz] = useState("");
  const [filialBlz, setFilialBlz] = useState("");
  const [anmeldename, setAnmeldename] = useState("");
  const [pin, setPin] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [zugangId, setZugangId] = useState<string | null>(null);
  const [verfahren, setVerfahren] = useState<{ id: number; name: string; appFreigabe: boolean }[]>([]);
  const [gewaehlt, setGewaehlt] = useState<string>("");
  const [konten, setKonten] = useState<any[]>([]);
  const bank = banken.find((b) => b.blz === blz) ?? banken[0];
  useEffect(() => {
    if (!blz && banken.length) setBlz(banken[0].blz);
  }, [blz, banken]);
  // Banken mit vielen Filialen (z. B. Commerzbank): eigene BLZ eingeben
  const mitFiliale = !!bank?.blz_muster;
  const filiale = blzAusEingabe(filialBlz);
  const filialeFalsch = mitFiliale && filialBlz.trim() !== "" && (!filiale || (filiale !== bank.blz && !blzPasstZuMuster(filiale, bank.blz_muster)));
  const blzSenden = mitFiliale ? filiale : bank?.blz;
  const bereit = !!bank && !!anmeldename && !!pin && !!blzSenden && !filialeFalsch;

  const zuruecksetzen = () => {
    setSchritt("zugang");
    setAnmeldename("");
    setPin("");
    setFilialBlz("");
    setFehler(null);
    setHinweis(null);
    setZugangId(null);
    setVerfahren([]);
    setGewaehlt("");
    setKonten([]);
  };

  const schliessen = (o: boolean) => {
    if (laeuft) return;
    onOpenChange(o);
    if (!o) {
      queryClient.invalidateQueries({ queryKey: ["bank-connections"] });
      queryClient.invalidateQueries({ queryKey: ["konten-uebersicht"] });
      setTimeout(zuruecksetzen, 200);
    }
  };

  const anlegen = async () => {
    setLaeuft(true);
    setFehler(null);
    const { data, error } = await supabase.functions.invoke("fints", {
      body: { aktion: "anlegen", blz: blzSenden, anmeldename: anmeldename.trim(), pin, persoenlich },
    });
    setLaeuft(false);
    setPin("");
    if (error || data?.error) {
      setFehler(await fintsFehler(data, error, "Die Verbindung zur Bank ist fehlgeschlagen."));
      return;
    }
    setZugangId(data.id);
    setHinweis(data.hinweis ?? null);
    setVerfahren(data.tanVerfahren ?? []);
    const app = (data.tanVerfahren ?? []).filter((v: any) => v.appFreigabe);
    setGewaehlt(app.length === 1 ? String(app[0].id) : "");
    setSchritt("verfahren");
  };

  const verbinden = async () => {
    if (!zugangId || !gewaehlt) return;
    setSchritt("freigabe");
    setLaeuft(true);
    setFehler(null);
    const { data, error } = await supabase.functions.invoke("fints", {
      body: { aktion: "tan_waehlen", id: zugangId, tanMethodId: Number(gewaehlt) },
    });
    setLaeuft(false);
    if (error || data?.error) {
      setFehler(await fintsFehler(data, error, "Die Freigabe hat nicht geklappt."));
      setSchritt("verfahren");
      return;
    }
    setKonten(data.konten ?? []);
    setSchritt("fertig");
    toast.success(`${bank?.name ?? "Die Bank"} ist verbunden`);
  };

  const zugeordnet = konten.filter((k) => k.buildingId).length;

  return (
    <Dialog open={open} onOpenChange={schliessen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{persoenlich ? "Meinen Bankzugang einrichten" : "Büro-Zugang hinzufügen"}</DialogTitle>
          <DialogDescription>
            {schritt === "zugang" &&
              (persoenlich
                ? "Mit deinem eigenen Online-Banking-Zugang (eigener VR-NetKey bzw. Anmeldename). Damit gibst du Überweisungen und Einzüge frei."
                : "Mit denselben Daten wie im Online-Banking.")}
            {schritt === "verfahren" && "Wie soll die Bank Freigaben anfragen?"}
            {schritt === "freigabe" && "Bitte jetzt in der Banking-App freigeben."}
            {schritt === "fertig" &&
              (persoenlich ? "Fertig – Zahlungen gibst du ab jetzt mit deinem eigenen Zugang per TAN frei." : "Fertig – ab jetzt holt die App die Umsätze selbst ab.")}
          </DialogDescription>
        </DialogHeader>

        {schritt === "zugang" && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (bereit) anlegen();
            }}
          >
            <div className="space-y-2">
              <Label>Bank</Label>
              <RadioGroup value={blz} onValueChange={(v) => (setBlz(v), setFilialBlz(""))} className="grid gap-2">
                {banken.map((b) => (
                  <label key={b.blz} className="flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer hover:bg-muted/40">
                    <RadioGroupItem value={b.blz} />
                    <span className="font-medium">{b.name}</span>
                  </label>
                ))}
              </RadioGroup>
              <p className="text-xs text-muted-foreground">
                Bank fehlt? Ein Admin kann sie unter Einstellungen › Kontoauszüge abrufen › Banken hinzufügen.
              </p>
            </div>
            {mitFiliale && (
              <div className="space-y-1.5">
                <Label htmlFor="fints-filiale">Bankleitzahl oder IBAN deines Kontos</Label>
                <Input
                  id="fints-filiale"
                  value={filialBlz}
                  onChange={(e) => setFilialBlz(e.target.value)}
                  placeholder={`z. B. ${bank.blz}`}
                  autoComplete="off"
                  className="h-11"
                />
                {filialeFalsch ? (
                  <p className="text-xs text-destructive">Diese Bankleitzahl gehört nicht zu {bank.name}.</p>
                ) : (
                  <p className="text-xs text-muted-foreground">{bank.name} hat je Filiale eine eigene Bankleitzahl. Sie steht in der IBAN (Stelle 5–12).</p>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="fints-anmeldename">Anmeldename</Label>
              <Input
                id="fints-anmeldename"
                value={anmeldename}
                onChange={(e) => setAnmeldename(e.target.value)}
                placeholder={bank?.anmeldename_hinweis ?? "Anmeldename"}
                autoComplete="off"
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fints-pin">PIN</Label>
              <Input
                id="fints-pin"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                autoComplete="new-password"
                className="h-11"
              />
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                Die PIN wird verschlüsselt gespeichert. Niemand kann sie in der App sehen.
              </p>
            </div>
            <p className="flex items-start gap-1.5 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Die App braucht ein Verfahren mit Freigabe in der Banking-App{bank?.tan_app ? ` (${bank.tan_app})` : ""}. Ob die Bank das für deinen Zugang anbietet, zeigt sich erst beim ersten Verbinden.
            </p>
            {fehler && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{fehler}</p>}
            <DialogFooter>
              <Button type="submit" disabled={!bereit || laeuft} className="h-11">
                {laeuft && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Weiter
              </Button>
            </DialogFooter>
          </form>
        )}

        {schritt === "verfahren" && (
          <div className="space-y-4">
            <RadioGroup value={gewaehlt} onValueChange={setGewaehlt} className="grid gap-2">
              {verfahren.map((v) => (
                <label
                  key={v.id}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${v.appFreigabe ? "cursor-pointer hover:bg-muted/40" : "opacity-50"}`}
                >
                  <RadioGroupItem value={String(v.id)} disabled={!v.appFreigabe} />
                  <span className="flex-1">
                    <span className="font-medium">{v.name}</span>
                    {!v.appFreigabe && <span className="block text-xs text-muted-foreground">Geht hier nicht – TAN müsste eingetippt werden</span>}
                  </span>
                </label>
              ))}
            </RadioGroup>
            {verfahren.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Die Bank hat keine TAN-Verfahren gemeldet. Bitte im Online-Banking prüfen, ob {bank?.tan_app || "die TAN-App"} eingerichtet ist.
              </p>
            )}
            {verfahren.length > 0 && hinweis && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">{hinweis}</p>
            )}
            {fehler && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{fehler}</p>}
            <DialogFooter>
              <Button onClick={verbinden} disabled={!gewaehlt} className="h-11">
                Verbinden
              </Button>
            </DialogFooter>
          </div>
        )}

        {schritt === "freigabe" && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="relative">
              <Smartphone className="h-12 w-12 text-primary" />
              <Loader2 className="absolute -right-3 -top-3 h-6 w-6 animate-spin text-primary" />
            </div>
            <div>
              <div className="font-medium">Öffne die App {bank?.tan_app || "deiner Bank"} und gib die Anfrage frei.</div>
              <div className="mt-1 text-sm text-muted-foreground">Die App wartet bis zu zwei Minuten. Dieses Fenster bitte offen lassen.</div>
            </div>
          </div>
        )}

        {schritt === "fertig" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">
                {persoenlich
                  ? `Zugriff auf ${konten.length} Konten`
                  : `${konten.length} Konten gefunden, ${zugeordnet} davon einer Liegenschaft zugeordnet`}
              </span>
            </div>
            <ul className="max-h-64 overflow-y-auto divide-y rounded-lg border text-sm">
              {konten.map((k) => (
                <li key={`${k.iban}-${k.kontonummer}`} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{k.inhaber || k.name || "Konto"}</span>
                    <span className="block font-mono text-xs text-muted-foreground">{k.iban ? ibanFormatiert(k.iban) : k.kontonummer}</span>
                  </span>
                  <span className={`text-xs ${k.buildingId ? "text-green-700 dark:text-green-400" : "text-muted-foreground"}`}>
                    {k.buildingId ? k.kontoName || "zugeordnet" : "keiner Liegenschaft zugeordnet"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              {persoenlich
                ? "Von diesen Konten kannst du Überweisungen und Einzüge freigeben. Fehlt ein Konto, kann die Bank es für deinen Zugang freischalten."
                : "Konten ohne Liegenschaft werden nicht abgerufen. Zuordnen kannst du gleich in der Liste des Bankzugangs."}
            </p>
            <DialogFooter>
              <Button onClick={() => schliessen(false)} className="h-11">
                Fertig
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
