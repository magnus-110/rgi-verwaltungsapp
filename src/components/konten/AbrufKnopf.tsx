import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cleanIban, ibanFormatiert } from "@/lib/bankInfo";
import { kontenNeuLaden } from "./BewegungsListe";

type Zeitraum = "neu" | "30" | "85" | "datum";

/** Bis so weit zurück gibt die Bank Umsätze mit EINER Freigabe heraus. */
export const TAGE_EINE_FREIGABE = 85;

/** Abruf von Hand; wartet bei Bedarf auf die Freigabe in der App. */
export async function bankAbrufStarten(opts: { id?: string; ab?: string; iban?: string } = {}) {
  const { data, error } = await supabase.functions.invoke("fints", { body: { aktion: "abrufen", ...opts } });
  if (error) throw new Error(data?.error || error.message);
  if (data?.error) throw new Error(data.error);
  return data as { ok: boolean; ergebnisse: any[] };
}

export function abrufMeldung(ergebnisse: any[]) {
  const teile: string[] = [];
  for (const e of ergebnisse ?? []) {
    if (e.ok) teile.push(`${e.bank}: ${e.neu ?? 0} neue Bewegungen${e.zugeordnet ? `, ${e.zugeordnet} zugeordnet` : ""}`);
    else if (e.teilweise && e.neu) teile.push(`${e.bank}: ${e.neu} neue Bewegungen gespeichert, ${e.offen ?? 0} Konten fehlen noch (${e.fehler})`);
    else teile.push(`${e.bank ?? "Bank"}: ${e.tanNoetig ? "Freigabe per TAN nötig" : e.fehler || "Fehler"}`);
  }
  return teile.join(" · ") || "Kein Bankzugang aktiv";
}

interface Props extends Omit<ButtonProps, "onClick"> {
  /** nur dieser Bankzugang */
  zugangId?: string;
  /** nur Konten „RGI intern" zur Auswahl */
  nurRgi?: boolean;
}

/**
 * „Jetzt abrufen" mit Auswahl: welcher Zeitraum und welche Konten.
 * Standard ist „nur Neues seit dem letzten Abruf".
 */
export function AbrufKnopf({ zugangId, nurRgi, disabled, children, ...knopf }: Props) {
  const queryClient = useQueryClient();
  const [offen, setOffen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [zeitraum, setZeitraum] = useState<Zeitraum>("neu");
  const [datum, setDatum] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [konto, setKonto] = useState("alle");

  const { data: auswahl = [] } = useQuery({
    queryKey: ["bank-connections", "abruf-konten", zugangId ?? "alle", !!nurRgi],
    enabled: offen,
    queryFn: async () => {
      let q = (supabase as any).from("bank_connections").select("id, bank_name, konten, status");
      if (zugangId) q = q.eq("id", zugangId);
      const [{ data: zugaenge, error }, { data: bba }] = await Promise.all([
        q,
        supabase.from("building_bank_accounts").select("iban, building_id, buildings(name)"),
      ]);
      if (error) throw error;
      const liegenschaft = new Map<string, string>();
      (bba ?? []).forEach((b: any) => b.iban && liegenschaft.set(cleanIban(b.iban), b.buildings?.name ?? "Liegenschaft"));
      return (zugaenge ?? []).flatMap((z: any) =>
        (z.konten ?? [])
          .filter((k: any) => k.iban && !k.ausgeblendet)
          .map((k: any) => ({ ...k, iban: cleanIban(k.iban), zugang: z.id, bank: z.bank_name }))
          .filter((k: any) => (nurRgi ? k.rgi : k.rgi || liegenschaft.has(k.iban)))
          .map((k: any) => ({ ...k, ziel: k.rgi ? "RGI intern" : liegenschaft.get(k.iban) })),
      );
    },
  });
  const sortiert = useMemo(() => [...auswahl].sort((a: any, b: any) => (a.ziel ?? "").localeCompare(b.ziel ?? "")), [auswahl]);

  const ab: string | undefined =
    zeitraum === "30" ? format(subDays(new Date(), 30), "yyyy-MM-dd")
    : zeitraum === "85" ? format(subDays(new Date(), TAGE_EINE_FREIGABE), "yyyy-MM-dd")
    : zeitraum === "datum" ? datum
    : undefined;
  const heute = format(new Date(), "yyyy-MM-dd");
  const grenze = format(subDays(new Date(), TAGE_EINE_FREIGABE), "yyyy-MM-dd");
  const weitZurueck = !!ab && ab < grenze;
  const datumFalsch = zeitraum === "datum" && (!datum || datum > heute);

  const starten = async () => {
    const gewaehlt = konto === "alle" ? null : auswahl.find((k: any) => k.iban === konto);
    setOffen(false);
    setLaeuft(true);
    const t = toast.loading(
      weitZurueck && !gewaehlt
        ? "Abruf läuft … Die Bank fragt eventuell für jedes Konto einzeln – bitte jede Anfrage in der App freigeben."
        : "Abruf läuft … Falls die Bank fragt: bitte in der App freigeben.",
    );
    try {
      const r = await bankAbrufStarten({
        id: gewaehlt?.zugang ?? zugangId,
        ab,
        iban: gewaehlt?.iban,
      });
      toast.dismiss(t);
      if (r.ok) toast.success(abrufMeldung(r.ergebnisse), { duration: 10000 });
      else toast.warning(abrufMeldung(r.ergebnisse), { duration: 10000 });
    } catch (e: any) {
      toast.dismiss(t);
      toast.error(e?.message || "Abruf fehlgeschlagen");
    } finally {
      setLaeuft(false);
      kontenNeuLaden(queryClient);
      queryClient.invalidateQueries({ queryKey: ["bank-connections"] });
    }
  };

  return (
    <>
      <Button {...knopf} disabled={disabled || laeuft} onClick={() => setOffen(true)}>
        {laeuft ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
        {children ?? "Jetzt abrufen"}
      </Button>

      <Dialog open={offen} onOpenChange={setOffen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Umsätze abrufen</DialogTitle>
            <DialogDescription>Was soll die App bei der Bank holen?</DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Zeitraum</Label>
              <RadioGroup value={zeitraum} onValueChange={(v) => setZeitraum(v as Zeitraum)} className="gap-2">
                {[
                  ["neu", "Nur Neues seit dem letzten Abruf", "empfohlen"],
                  ["30", "Die letzten 30 Tage", null],
                  ["85", `Die letzten ${TAGE_EINE_FREIGABE} Tage`, "das Maximum mit einer Freigabe"],
                  ["datum", "Ab einem bestimmten Tag", null],
                ].map(([wert, text, zusatz]) => (
                  <label key={wert} className="flex cursor-pointer items-center gap-2 text-sm">
                    <RadioGroupItem value={wert!} />
                    <span>
                      {text}
                      {zusatz && <span className="text-muted-foreground"> ({zusatz})</span>}
                    </span>
                  </label>
                ))}
              </RadioGroup>
              {zeitraum === "datum" && (
                <Input type="date" value={datum} max={heute} onChange={(e) => setDatum(e.target.value)} className="ml-6 w-44" />
              )}
            </div>

            <div className="space-y-2">
              <Label>Konten</Label>
              <Select value={konto} onValueChange={setKonto}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle zugeordneten Konten ({auswahl.length})</SelectItem>
                  {sortiert.length > 0 && <SelectSeparator />}
                  {sortiert.map((k: any) => (
                    <SelectItem key={k.iban} value={k.iban}>
                      {k.ziel} · {ibanFormatiert(k.iban)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {weitZurueck && (
              <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Weiter als {TAGE_EINE_FREIGABE} Tage zurück will die Bank für <b>jedes Konto eine eigene Freigabe</b>.
                  {konto === "alle"
                    ? " Tipp: oben ein einzelnes Konto auswählen – dann ist es nur eine Freigabe."
                    : " Bei einem Konto ist das nur eine Freigabe."}{" "}
                  Wie weit die Bank zurückreicht, entscheidet sie selbst (oft ein bis zwei Jahre).
                </span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOffen(false)}>
              Abbrechen
            </Button>
            <Button onClick={starten} disabled={datumFalsch || auswahl.length === 0}>
              Abrufen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
