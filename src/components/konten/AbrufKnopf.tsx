import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [vorhandeneUeberspringen, setVorhandeneUeberspringen] = useState(true);
  const stopp = useRef(false);

  // Bis wann zurück ist jedes Konto schon abgerufen? (aus dem Protokoll)
  const { data: abgedeckt = new Map<string, string>() } = useQuery({
    queryKey: ["bank-connections", "abruf-abdeckung"],
    enabled: offen,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("bank_fetch_log")
        .select("ergebnis")
        .not("ergebnis", "is", null)
        .order("gestartet", { ascending: false })
        .limit(200);
      const m = new Map<string, string>();
      (data ?? []).forEach((l: any) =>
        (l.ergebnis?.jeKonto ?? []).forEach((k: any) => {
          if (!k.iban || !k.ab) return;
          const i = cleanIban(k.iban);
          if (!m.has(i) || k.ab < m.get(i)!) m.set(i, k.ab);
        }),
      );
      return m;
    },
  });

  const { data: auswahl = [] } = useQuery({
    queryKey: ["bank-connections", "abruf-konten", zugangId ?? "alle", !!nurRgi],
    enabled: offen,
    queryFn: async () => {
      let q = (supabase as any).from("bank_connections").select("id, bank_name, konten, status");
      if (zugangId) q = q.eq("id", zugangId);
      const [{ data: zugaenge, error }, { data: bba }] = await Promise.all([
        q,
        supabase.from("building_bank_accounts").select("iban, building_id, display_name, buildings(name)"),
      ]);
      if (error) throw error;
      const liegenschaft = new Map<string, string>();
      const kontoName = new Map<string, string>();
      (bba ?? []).forEach((b: any) => {
        if (!b.iban) return;
        liegenschaft.set(cleanIban(b.iban), b.buildings?.name ?? "Liegenschaft");
        if (b.display_name) kontoName.set(cleanIban(b.iban), b.display_name);
      });
      return (zugaenge ?? []).flatMap((z: any) =>
        (z.konten ?? [])
          .filter((k: any) => k.iban && !k.ausgeblendet)
          .map((k: any) => ({ ...k, iban: cleanIban(k.iban), zugang: z.id, bank: z.bank_name }))
          .filter((k: any) => (nurRgi ? k.rgi : k.rgi || liegenschaft.has(k.iban)))
          .map((k: any) => ({ ...k, ziel: k.rgi ? "RGI intern" : liegenschaft.get(k.iban), kontoName: kontoName.get(k.iban) ?? null })),
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

  /** Weiter als 85 Tage: Konto für Konto, je eine Freigabe in der App. */
  const einzeln = weitZurueck && konto === "alle";
  const reihe = useMemo(
    () => (einzeln ? sortiert.filter((k: any) => !(vorhandeneUeberspringen && ab && abgedeckt.get(k.iban) && abgedeckt.get(k.iban)! <= ab)) : []),
    [einzeln, sortiert, vorhandeneUeberspringen, ab, abgedeckt],
  );

  const nacheinander = async () => {
    stopp.current = false;
    const liste = [...reihe];
    let neu = 0;
    let zugeordnet = 0;
    const fehlt: string[] = [];
    const t = toast.loading("Abruf startet …", {
      action: { label: "Anhalten", onClick: () => (stopp.current = true) },
      duration: Infinity,
    });
    for (let i = 0; i < liste.length; i++) {
      const k = liste[i];
      if (stopp.current) {
        fehlt.push(...liste.slice(i).map((x: any) => x.ziel + (x.kontoName ? ` (${x.kontoName})` : "")));
        break;
      }
      toast.loading(`Konto ${i + 1} von ${liste.length}: ${k.ziel}${k.kontoName ? ` · ${k.kontoName}` : ""} – bitte in der App freigeben`, {
        id: t,
        action: { label: "Anhalten", onClick: () => (stopp.current = true) },
        duration: Infinity,
      });
      try {
        const r = await bankAbrufStarten({ id: k.zugang, ab, iban: k.iban });
        const e = r.ergebnisse?.[0];
        if (e?.ok) {
          neu += e.neu ?? 0;
          zugeordnet += e.zugeordnet ?? 0;
        } else {
          neu += e?.neu ?? 0;
          fehlt.push(`${k.ziel}${k.kontoName ? ` (${k.kontoName})` : ""}`);
        }
      } catch {
        fehlt.push(`${k.ziel}${k.kontoName ? ` (${k.kontoName})` : ""}`);
      }
      kontenNeuLaden(queryClient);
    }
    toast.dismiss(t);
    const text = `${neu} neue Bewegungen${zugeordnet ? `, ${zugeordnet} zugeordnet` : ""}.`;
    if (fehlt.length) toast.warning(`${text} Noch nicht abgerufen: ${fehlt.join(", ")}. Einfach noch einmal starten – fertige Konten werden übersprungen.`, { duration: 20000 });
    else toast.success(`Fertig: ${text}`, { duration: 10000 });
  };

  const starten = async () => {
    const gewaehlt = konto === "alle" ? null : auswahl.find((k: any) => k.iban === konto);
    setOffen(false);
    setLaeuft(true);
    if (einzeln) {
      try {
        await nacheinander();
      } finally {
        setLaeuft(false);
        kontenNeuLaden(queryClient);
        queryClient.invalidateQueries({ queryKey: ["bank-connections"] });
      }
      return;
    }
    const t = toast.loading("Abruf läuft … Falls die Bank fragt: bitte in der App freigeben.");
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
                      {k.ziel}{k.kontoName ? ` · ${k.kontoName}` : ""} · {ibanFormatiert(k.iban)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {weitZurueck && (
              <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                <div className="flex gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Weiter als {TAGE_EINE_FREIGABE} Tage zurück will die Bank für <b>jedes Konto eine eigene Freigabe</b>.
                    {konto === "alle"
                      ? ` Die App geht die Konten deshalb einzeln nacheinander durch (${reihe.length} Konten) – bitte jede Anfrage in der App freigeben. Sie können jederzeit anhalten.`
                      : " Bei einem Konto ist das nur eine Freigabe."}
                  </span>
                </div>
                {konto === "alle" && (
                  <label className="ml-6 flex cursor-pointer items-center gap-2">
                    <Checkbox checked={vorhandeneUeberspringen} onCheckedChange={(v) => setVorhandeneUeberspringen(!!v)} />
                    Konten überspringen, die schon ab diesem Tag abgerufen sind
                  </label>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Schon vorhandene Bewegungen – auch aus hochgeladenen Dateien – werden erkannt und nicht doppelt angelegt.
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOffen(false)}>
              Abbrechen
            </Button>
            <Button onClick={starten} disabled={datumFalsch || auswahl.length === 0 || (einzeln && reihe.length === 0)}>
              Abrufen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
