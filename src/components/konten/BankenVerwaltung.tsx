import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, CheckCircle2, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  type BankVorschlag,
  type FintsBank,
  bankZurBlz,
  blzAusEingabe,
  fintsUrlFehler,
  fintsUrlNormal,
  useFintsBanken,
  vorschlagFuer,
} from "@/lib/fintsBanken";

/**
 * Einstellungen › Kontoauszüge abrufen › Banken (nur Admins).
 * Liste der Banken, mit denen Bankzugänge eingerichtet werden können.
 */
export function BankenVerwaltung() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useFintsBanken();
  const banken = data?.banken ?? [];
  const [neu, setNeu] = useState(false);
  const [bearbeiten, setBearbeiten] = useState<FintsBank | null>(null);

  const neuLaden = () => queryClient.invalidateQueries({ queryKey: ["fints-banken"] });

  const aktivSetzen = async (b: FintsBank, aktiv: boolean) => {
    const { error } = await (supabase as any).from("fints_banken").update({ aktiv }).eq("blz", b.blz);
    if (error) {
      toast.error("Konnte nicht gespeichert werden");
      return;
    }
    toast.success(aktiv ? `${b.name} ist wieder auswählbar` : `${b.name} ist abgeschaltet`);
    neuLaden();
  };

  const loeschen = async (b: FintsBank) => {
    const { data: benutzt } = await (supabase as any).rpc("fints_bank_in_benutzung", { p_blz: b.blz });
    if (benutzt) {
      toast.error(`${b.name} wird von Bankzugängen genutzt und kann nicht gelöscht werden. Bitte stattdessen abschalten.`);
      return;
    }
    if (!window.confirm(`${b.name} aus der Liste der Banken löschen?`)) return;
    const { data: weg, error } = await (supabase as any).from("fints_banken").delete().eq("blz", b.blz).select("blz");
    if (error || !weg?.length) {
      toast.error("Löschen nicht möglich – bitte stattdessen abschalten.");
      return;
    }
    toast.success(`${b.name} gelöscht`);
    neuLaden();
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" /> Banken
          </CardTitle>
          <CardDescription>Diese Banken stehen beim Einrichten eines Bankzugangs zur Auswahl – für Büro-Zugänge und eigene Zugänge.</CardDescription>
        </div>
        <Button onClick={() => setNeu(true)} className="shrink-0" variant="outline" disabled={!data?.ausTabelle}>
          <Plus className="h-4 w-4 mr-1.5" /> Bank hinzufügen
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {!data?.ausTabelle && (
              <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                Die Liste der Banken ist noch nicht eingerichtet. Bis dahin gelten die festen Banken unten.
              </div>
            )}
            <ul className="divide-y rounded-lg border">
              {banken.map((b) => (
                <li key={b.blz} className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3", !b.aktiv && "opacity-60")}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{b.name}</span>
                      {!b.aktiv && <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">abgeschaltet</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      BLZ {b.blz}
                      {b.bic ? ` · ${b.bic}` : ""}
                      {b.tan_app ? ` · ${b.tan_app}` : ""}
                    </div>
                    {b.blz_muster_text && <div className="text-xs text-muted-foreground">Gilt für {b.blz_muster_text}</div>}
                    <div className="truncate font-mono text-xs text-muted-foreground" title={b.fints_url}>
                      {b.fints_url}
                    </div>
                  </div>
                  {data?.ausTabelle && (
                    <div className="flex items-center gap-1">
                      <Switch checked={b.aktiv} onCheckedChange={(v) => aktivSetzen(b, v)} title={b.aktiv ? "Abschalten" : "Einschalten"} />
                      <Button variant="ghost" size="icon" title="Bearbeiten" onClick={() => setBearbeiten(b)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Löschen" className="text-muted-foreground hover:text-destructive" onClick={() => loeschen(b)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
      <BankDialog
        open={neu || !!bearbeiten}
        bank={bearbeiten}
        banken={banken}
        onOpenChange={(o) => {
          if (!o) {
            setNeu(false);
            setBearbeiten(null);
          }
        }}
        onGespeichert={neuLaden}
      />
    </Card>
  );
}

interface Felder {
  blz: string;
  name: string;
  bic: string;
  fints_url: string;
  anmeldename_hinweis: string;
  tan_app: string;
  blz_muster: string | null;
  blz_muster_text: string | null;
  fuerAlleFilialen: boolean;
}

const LEER: Felder = { blz: "", name: "", bic: "", fints_url: "", anmeldename_hinweis: "", tan_app: "", blz_muster: null, blz_muster_text: null, fuerAlleFilialen: false };

function BankDialog({
  open,
  bank,
  banken,
  onOpenChange,
  onGespeichert,
}: {
  open: boolean;
  bank: FintsBank | null;
  banken: FintsBank[];
  onOpenChange: (o: boolean) => void;
  onGespeichert: () => void;
}) {
  const [eingabe, setEingabe] = useState("");
  const [f, setF] = useState<Felder>(LEER);
  const [vorschlag, setVorschlag] = useState<BankVorschlag | null>(null);
  const [sucht, setSucht] = useState(false);
  const [unbekannt, setUnbekannt] = useState(false);
  const [speichert, setSpeichert] = useState(false);
  const [versucht, setVersucht] = useState(false);

  useEffect(() => {
    if (!open) return;
    setVorschlag(null);
    setUnbekannt(false);
    setVersucht(false);
    if (bank) {
      setEingabe(bank.blz);
      setF({
        blz: bank.blz,
        name: bank.name,
        bic: bank.bic ?? "",
        fints_url: bank.fints_url,
        anmeldename_hinweis: bank.anmeldename_hinweis ?? "",
        tan_app: bank.tan_app ?? "",
        blz_muster: bank.blz_muster,
        blz_muster_text: bank.blz_muster_text,
        fuerAlleFilialen: !!bank.blz_muster,
      });
    } else {
      setEingabe("");
      setF(LEER);
    }
  }, [open, bank]);

  // Eingabe IBAN/BLZ → Name, BIC und FinTS-Daten vorschlagen
  const blz = bank ? bank.blz : blzAusEingabe(eingabe);
  const schonDa = !bank && blz ? bankZurBlz(banken, blz) : null;
  useEffect(() => {
    if (bank || !blz) return;
    let aktuell = true;
    setSucht(true);
    vorschlagFuer(blz)
      .then((v) => {
        if (!aktuell) return;
        setVorschlag(v);
        setUnbekannt(!v);
        setF({
          blz,
          name: v?.name ?? "",
          bic: v?.bic ?? "",
          fints_url: v?.fints_url ?? "",
          anmeldename_hinweis: v?.anmeldename_hinweis ?? "",
          tan_app: v?.tan_app ?? "",
          blz_muster: v?.blz_muster ?? null,
          blz_muster_text: v?.blz_muster_text ?? null,
          fuerAlleFilialen: !!v?.blz_muster,
        });
      })
      .finally(() => aktuell && setSucht(false));
    return () => {
      aktuell = false;
    };
  }, [blz, bank]);

  const urlFehler = fintsUrlFehler(f.fints_url);
  const bicFehler = f.bic.trim() && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(f.bic.trim().toUpperCase()) ? "Die BIC hat 8 oder 11 Zeichen." : null;
  const nameFehler = f.name.trim().length < 2 ? "Bitte den Namen der Bank eintragen." : null;
  const kannSpeichern = !!blz && !schonDa && !urlFehler && !bicFehler && !nameFehler && !speichert;
  const zeigeFelder = !!bank || (!!blz && !sucht && !schonDa);

  const speichern = async () => {
    setVersucht(true);
    if (!kannSpeichern || !blz) return;
    setSpeichert(true);
    const zeile = {
      name: f.name.trim(),
      bic: f.bic.trim().toUpperCase() || null,
      fints_url: fintsUrlNormal(f.fints_url),
      anmeldename_hinweis: f.anmeldename_hinweis.trim() || null,
      tan_app: f.tan_app.trim() || null,
      blz_muster: f.fuerAlleFilialen ? f.blz_muster : null,
      blz_muster_text: f.fuerAlleFilialen ? f.blz_muster_text : null,
    };
    const { error } = bank
      ? await (supabase as any).from("fints_banken").update(zeile).eq("blz", bank.blz)
      : await (supabase as any).from("fints_banken").insert({ blz, ...zeile });
    setSpeichert(false);
    if (error) {
      toast.error(error.code === "23505" ? "Diese Bankleitzahl steht schon in der Liste." : "Konnte nicht gespeichert werden. Bitte die Angaben prüfen.");
      return;
    }
    toast.success(`${zeile.name} gespeichert`);
    onGespeichert();
    onOpenChange(false);
  };

  const feld = (k: keyof Felder) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={(o) => !speichert && onOpenChange(o)}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{bank ? `${bank.name} bearbeiten` : "Bank hinzufügen"}</DialogTitle>
          <DialogDescription>
            {bank ? `Bankleitzahl ${bank.blz}` : "IBAN eines Kontos oder die Bankleitzahl eingeben – Name, BIC und FinTS-Adresse werden vorgeschlagen."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!bank && (
            <div className="space-y-1.5">
              <Label htmlFor="bank-eingabe">IBAN oder Bankleitzahl</Label>
              <Input id="bank-eingabe" value={eingabe} onChange={(e) => setEingabe(e.target.value)} placeholder="DE.. oder 8 Ziffern" autoComplete="off" className="h-11 font-mono" autoFocus />
              {sucht && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Bank wird gesucht …
                </p>
              )}
              {eingabe.trim() && !blz && <p className="text-xs text-muted-foreground">Bitte eine deutsche IBAN (22 Zeichen) oder eine BLZ (8 Ziffern) eingeben.</p>}
              {schonDa && (
                <p className="flex items-start gap-1.5 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                  Schon in der Liste: {schonDa.name}
                  {schonDa.blz !== blz && schonDa.blz_muster_text ? ` (gilt für ${schonDa.blz_muster_text})` : ""}
                  {!schonDa.aktiv ? " – derzeit abgeschaltet" : ""}.
                </p>
              )}
              {unbekannt && !sucht && !schonDa && (
                <p className="text-xs text-muted-foreground">Diese Bankleitzahl steht nicht in der Liste der Bundesbank. Bitte die Angaben selbst eintragen.</p>
              )}
            </div>
          )}

          {zeigeFelder && (
            <>
              <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
                <div className="space-y-1.5">
                  <Label htmlFor="bank-name">Name</Label>
                  <Input id="bank-name" value={f.name} onChange={feld("name")} className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bank-bic">BIC</Label>
                  <Input id="bank-bic" value={f.bic} onChange={feld("bic")} className="h-10 font-mono uppercase" />
                </div>
              </div>
              {vorschlag?.ort && !bank && <p className="-mt-2 text-xs text-muted-foreground">Sitz laut Bundesbank: {vorschlag.ort}</p>}
              <div className="space-y-1.5">
                <Label htmlFor="bank-url">FinTS-Adresse (PIN/TAN)</Label>
                <Input id="bank-url" value={f.fints_url} onChange={feld("fints_url")} placeholder="https://…" className="h-10 font-mono text-sm" autoComplete="off" />
                {vorschlag && !bank && (
                  <p className={cn("text-xs", vorschlag.url_sicher ? "text-muted-foreground" : "text-amber-700 dark:text-amber-400")}>
                    {vorschlag.url_sicher ? `Quelle: ${vorschlag.url_hinweis}` : vorschlag.url_hinweis}
                  </p>
                )}
                {(versucht || f.fints_url) && urlFehler && <p className="text-xs text-destructive">{urlFehler}</p>}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="bank-anmeldename">Anmeldename heißt bei der Bank</Label>
                  <Input id="bank-anmeldename" value={f.anmeldename_hinweis} onChange={feld("anmeldename_hinweis")} placeholder="z. B. Teilnehmernummer" className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bank-app">TAN-App</Label>
                  <Input id="bank-app" value={f.tan_app} onChange={feld("tan_app")} placeholder="z. B. photoTAN" className="h-10" />
                </div>
              </div>
              {f.blz_muster && (
                <label className="flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm cursor-pointer">
                  <Checkbox checked={f.fuerAlleFilialen} onCheckedChange={(v) => setF((x) => ({ ...x, fuerAlleFilialen: v === true }))} className="mt-0.5" />
                  <span>
                    Gilt für {f.blz_muster_text ?? "alle Filialen"}
                    <span className="block text-xs text-muted-foreground">Dann genügt ein Eintrag; beim Einrichten gibt jeder die Bankleitzahl seines Kontos an.</span>
                  </span>
                </label>
              )}
              {(versucht || f.bic) && bicFehler && <p className="text-xs text-destructive">{bicFehler}</p>}
              {versucht && nameFehler && <p className="text-xs text-destructive">{nameFehler}</p>}
              <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                Ob die Bank die Freigabe in der App (ohne TAN-Eingabe) unterstützt, zeigt sich erst beim ersten Verbinden eines Bankzugangs. Klappt es
                nicht, nennt die App dort den Grund.
              </p>
            </>
          )}
        </div>

        <DialogFooter>
          <Button onClick={speichern} disabled={!zeigeFelder || speichert} className="h-11">
            {speichert && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
