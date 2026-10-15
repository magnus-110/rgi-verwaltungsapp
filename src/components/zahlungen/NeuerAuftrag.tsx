import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useManagementMode } from "@/hooks/useManagementMode";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { bankName, cleanIban, euro, ibanFormatiert } from "@/lib/bankInfo";
import { ibanGueltig } from "@/lib/sepa";
import { ladeEigentuemer, mandatBereit, mandatVerfallen, type Eigentuemer } from "@/lib/eigentuemer";
import { fruehesterEinzug, heuteIso, plusMonate, type AuftragsArt, type Betragsquelle, type Rhythmus } from "@/lib/auftraege";
import type { KontoZeile } from "@/components/konten/kontenTypes";

interface Empfaenger {
  name: string;
  iban: string;
  betrag: string;
  zweck: string;
}

const zahl = (t: string) => {
  const v = Number(String(t).replace(/\s/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(v) ? v : NaN;
};
const leerEmpfaenger = (): Empfaenger => ({ name: "", iban: "", betrag: "", zweck: "" });

/**
 * Neuer Auftrag: Überweisung (einmalig an einen oder mehrere Empfänger),
 * Einzug (einmalige Lastschrift von Eigentümern) oder Dauerlastschrift
 * (z. B. Hausgeld jeden Monat aus dem Wirtschaftsplan). Alles landet in der
 * Freigabe und geht erst mit TAN raus.
 */
export function NeuerAuftrag({ onFertig, onAbbrechen }: { onFertig: () => void; onAbbrechen: () => void }) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { managementMode } = useManagementMode();
  const [art, setArt] = useState<AuftragsArt>("ueberweisung");
  const [quelle, setQuelle] = useState<Betragsquelle>("fest");
  const [buildingId, setBuildingId] = useState<string>("");
  const [kontoIban, setKontoIban] = useState<string>("");
  const [titel, setTitel] = useState("");
  const [zweck, setZweck] = useState("");
  const [faellig, setFaellig] = useState(heuteIso());
  const [empfaenger, setEmpfaenger] = useState<Empfaenger[]>([leerEmpfaenger()]);
  const [festBetrag, setFestBetrag] = useState("");
  const [auswahl, setAuswahl] = useState<Record<string, boolean>>({});
  const [ergebnis, setErgebnis] = useState<Record<string, string>>({}); // Abrechnungsspitze je Eigentümer
  const [guthabenAuszahlen, setGuthabenAuszahlen] = useState(true);
  const [rhythmus, setRhythmus] = useState<Rhythmus>("monatlich");
  const [tag, setTag] = useState("1");
  const [erster, setErster] = useState(() => plusMonate(heuteIso().slice(0, 8) + "01", 1));
  const [speichert, setSpeichert] = useState(false);

  const { data: gebaeude = [] } = useQuery({
    queryKey: ["konten-liegenschaften"],
    queryFn: async () => {
      const { data, error } = await supabase.from("buildings").select("id, name, management_mode").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: konten = [] } = useQuery({
    queryKey: ["konten-uebersicht"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("v_konten_uebersicht").select("*");
      if (error) throw error;
      return (data ?? []) as KontoZeile[];
    },
  });
  const { data: eigentuemer = [], isFetching: ladeEig } = useQuery({
    queryKey: ["mandate", buildingId],
    enabled: !!buildingId && art !== "ueberweisung" || (!!buildingId && quelle === "abrechnung"),
    queryFn: () => ladeEigentuemer(buildingId),
  });

  const auswahlListe = useMemo(
    () =>
      konten
        .filter((k) => gebaeude.some((g: any) => g.id === k.building_id && (g.management_mode ?? "weg") === managementMode))
        .map((k) => ({ ...k, haus: gebaeude.find((g: any) => g.id === k.building_id)?.name ?? "" }))
        .sort((a, b) => a.haus.localeCompare(b.haus) || Number(/r[üu]cklage/i.test(a.display_name ?? "")) - Number(/r[üu]cklage/i.test(b.display_name ?? ""))),
    [konten, gebaeude, managementMode],
  );

  // Art wechselt → passende Betragsquelle und Datum
  useEffect(() => {
    if (art === "dauerlastschrift") setQuelle("wirtschaftsplan");
    else if (quelle === "wirtschaftsplan") setQuelle("fest");
    if (art === "einzug") setFaellig(fruehesterEinzug());
    if (art === "ueberweisung") setFaellig(heuteIso());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [art]);

  // Abrechnungsspitze: zuletzt beschlossenes Ergebnis der Jahresabrechnung
  const { data: beschluss } = useQuery({
    queryKey: ["settlement-results-auftrag", buildingId],
    enabled: !!buildingId && quelle === "abrechnung",
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("settlement_results")
        .select("assignment_id, nachzahlung, beschlossen_am, geschaeftsjahr, billing_period_id")
        .eq("building_id", buildingId)
        .order("beschlossen_am", { ascending: false })
        .limit(2000);
      if (error) throw error;
      const erste = data?.[0];
      if (!erste) return null;
      return { jahr: erste.geschaeftsjahr as number | null, am: erste.beschlossen_am as string, zeilen: (data ?? []).filter((z: any) => z.billing_period_id === erste.billing_period_id) };
    },
  });
  useEffect(() => {
    if (!beschluss) return;
    setErgebnis(Object.fromEntries(beschluss.zeilen.map((z: any) => [z.assignment_id, Number(z.nachzahlung) ? String(Number(z.nachzahlung).toFixed(2)).replace(".", ",") : ""])));
    if (beschluss.jahr && !titel) setTitel(`Abrechnung ${beschluss.jahr}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beschluss]);

  // Eigentümer mit Mandat vorauswählen
  useEffect(() => {
    setAuswahl(Object.fromEntries(eigentuemer.map((e) => [e.assignmentId, mandatBereit(e.mandat)])));
  }, [eigentuemer]);

  const istEinzug = art !== "ueberweisung";
  const ausgewaehlt = eigentuemer.filter((e) => auswahl[e.assignmentId]);

  // Vorschau der Posten
  const posten = useMemo(() => {
    if (quelle === "fest" && art === "ueberweisung") {
      return empfaenger
        .filter((e) => e.name.trim() || e.iban.trim() || e.betrag.trim())
        .map((e) => ({ name: e.name.trim(), iban: cleanIban(e.iban), betrag: zahl(e.betrag), zweck: e.zweck.trim(), e: null as Eigentuemer | null, art: "ueberweisung" as const }));
    }
    if (quelle === "fest") {
      return ausgewaehlt.map((e) => ({ name: e.name, iban: e.mandat?.iban ?? e.iban, betrag: zahl(festBetrag), zweck: "", e, art: "einzug" as const }));
    }
    if (quelle === "abrechnung") {
      return eigentuemer
        .map((e) => ({ e, v: zahl(ergebnis[e.assignmentId] ?? "") }))
        .filter(({ v }) => Number.isFinite(v) && v !== 0)
        .filter(({ v }) => v > 0 || guthabenAuszahlen)
        .map(({ e, v }) => ({
          name: e.name,
          iban: v > 0 ? e.mandat?.iban ?? e.iban : e.iban,
          betrag: Math.abs(v),
          zweck: "",
          e,
          art: v > 0 ? ("einzug" as const) : ("ueberweisung" as const),
        }));
    }
    // Wirtschaftsplan
    const monate = { monatlich: 1, quartal: 3, halbjahr: 6, jahr: 12 }[rhythmus];
    return ausgewaehlt.map((e) => ({ name: e.name, iban: e.mandat?.iban ?? e.iban, betrag: Math.round(e.hausgeldMonat * monate * 100) / 100, zweck: "", e, art: "einzug" as const }));
  }, [quelle, art, empfaenger, ausgewaehlt, festBetrag, eigentuemer, ergebnis, guthabenAuszahlen, rhythmus]);

  const summeEin = posten.filter((p) => p.art === "einzug").reduce((s, p) => s + (Number.isFinite(p.betrag) ? p.betrag : 0), 0);
  const summeAus = posten.filter((p) => p.art === "ueberweisung").reduce((s, p) => s + (Number.isFinite(p.betrag) ? p.betrag : 0), 0);

  const fehler = (): string | null => {
    if (!buildingId || !kontoIban) return "Bitte Liegenschaft und Konto wählen.";
    if (!posten.length) return "Bitte mindestens eine Zahlung eintragen.";
    for (const p of posten) {
      if (!p.name) return "Bei jeder Zahlung bitte einen Namen eintragen.";
      if (!Number.isFinite(p.betrag) || p.betrag <= 0) return `Betrag bei ${p.name} fehlt.`;
      if (p.art === "ueberweisung" && !ibanGueltig(p.iban)) return `IBAN bei ${p.name} fehlt oder ist falsch.`;
      if (p.art === "einzug" && !mandatBereit(p.e?.mandat)) return `Für ${p.name} gibt es kein vollständiges Mandat.`;
    }
    if (art === "einzug" && faellig < fruehesterEinzug()) return `Einzug frühestens am ${fruehesterEinzug().split("-").reverse().join(".")}.`;
    if (art === "dauerlastschrift" && !erster) return "Bitte den ersten Einzug angeben.";
    return null;
  };

  const anlegen = async () => {
    const f = fehler();
    if (f) {
      toast.error(f);
      return;
    }
    setSpeichert(true);
    try {
      const gruppen: { art: AuftragsArt; liste: typeof posten }[] =
        quelle === "abrechnung"
          ? [
              { art: "einzug" as AuftragsArt, liste: posten.filter((p) => p.art === "einzug") },
              { art: "ueberweisung" as AuftragsArt, liste: posten.filter((p) => p.art === "ueberweisung") },
            ].filter((g) => g.liste.length)
          : [{ art, liste: posten }];
      for (const g of gruppen) {
        const ersterTag = art === "dauerlastschrift" ? `${erster.slice(0, 8)}${String(Math.min(28, Math.max(1, Number(tag) || 1))).padStart(2, "0")}` : faellig;
        const standardTitel =
          art === "dauerlastschrift" ? "Hausgeld" : quelle === "abrechnung" ? (g.art === "einzug" ? "Nachzahlung Jahresabrechnung" : "Guthaben Jahresabrechnung") : g.art === "einzug" ? "Einzug" : "Überweisung";
        const { data: auftrag, error } = await (supabase as any)
          .from("payment_orders")
          .insert({
            building_id: buildingId,
            konto_iban: kontoIban,
            art: g.art,
            betragsquelle: quelle,
            titel: titel.trim() || standardTitel,
            verwendungszweck: zweck.trim() || (art === "dauerlastschrift" ? "Hausgeld {monat}" : null),
            rhythmus: art === "dauerlastschrift" ? rhythmus : null,
            faellig_am: ersterTag,
            status: "aktiv",
            created_by: profile?.user_id ?? null,
          })
          .select("id")
          .single();
        if (error) throw error;
        const { error: e2 } = await (supabase as any).from("payment_order_items").insert(
          g.liste.map((p) => ({
            order_id: auftrag.id,
            assignment_id: p.e?.assignmentId ?? null,
            mandate_id: g.art !== "ueberweisung" ? p.e?.mandat?.id ?? null : null,
            name: p.name,
            iban: p.iban,
            bic: g.art !== "ueberweisung" ? p.e?.mandat?.bic ?? null : null,
            betrag: quelle === "wirtschaftsplan" ? null : Math.round(p.betrag * 100) / 100,
            verwendungszweck: p.zweck || null,
          })),
        );
        if (e2) {
          await (supabase as any).from("payment_orders").delete().eq("id", auftrag.id);
          throw e2;
        }
      }
      toast.success(art === "dauerlastschrift" ? "Dauerlastschrift angelegt – die Einzüge erscheinen rechtzeitig in der Freigabe" : "Auftrag angelegt – er liegt jetzt in der Freigabe");
      queryClient.invalidateQueries({ queryKey: ["auftraege"] });
      queryClient.invalidateQueries({ queryKey: ["freigabe-auftraege"] });
      onFertig();
    } catch (e: any) {
      toast.error(e?.message || "Auftrag konnte nicht angelegt werden");
    } finally {
      setSpeichert(false);
    }
  };

  const typKarte = (wert: AuftragsArt, t: string, u: string) => (
    <button
      type="button"
      onClick={() => setArt(wert)}
      className={cn(
        "flex-1 basis-56 rounded-xl border bg-card p-4 text-left transition-colors",
        art === wert ? "border-primary ring-2 ring-primary/20" : "hover:border-foreground/30",
      )}
    >
      <div className="text-base font-bold">{t}</div>
      <div className="mt-1 text-sm text-muted-foreground">{u}</div>
    </button>
  );

  const quelleKnopf = (wert: Betragsquelle, t: string) => (
    <button
      type="button"
      onClick={() => setQuelle(wert)}
      className={cn("min-h-[40px] rounded-lg px-4 text-sm font-medium", quelle === wert ? "bg-background font-semibold shadow-sm" : "text-muted-foreground")}
    >
      {t}
    </button>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <button type="button" onClick={onAbbrechen} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> Zahlungen
      </button>
      <h1 className="text-2xl font-bold md:text-3xl">Neuer Auftrag</h1>

      <div className="flex flex-wrap gap-3" role="group" aria-label="Art des Auftrags">
        {typKarte("ueberweisung", "Überweisung", "einmalig an einen oder mehrere Empfänger")}
        {typKarte("einzug", "Einzug", "einmalige Lastschrift von einem oder mehreren Eigentümern")}
        {typKarte("dauerlastschrift", "Dauerlastschrift", "regelmäßig, z. B. Hausgeld jeden Monat")}
      </div>

      <section className="space-y-5 rounded-xl border bg-card p-5 md:p-6">
        <label className="block space-y-1.5 text-sm font-medium">
          Liegenschaft und Konto
          <Select
            value={kontoIban ? `${buildingId}|${kontoIban}` : ""}
            onValueChange={(v) => {
              const [b, i] = v.split("|");
              setBuildingId(b);
              setKontoIban(i);
            }}
          >
            <SelectTrigger className="h-11">
              <SelectValue placeholder="Konto wählen …" />
            </SelectTrigger>
            <SelectContent>
              {auswahlListe.map((k) => (
                <SelectItem key={`${k.building_id}|${k.iban}`} value={`${k.building_id}|${k.iban}`}>
                  {k.haus} · {k.display_name || "Konto"} ({bankName(k.iban, null)}) · {ibanFormatiert(k.iban)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <div className="space-y-1.5 text-sm font-medium">
          Betrag
          <div className="inline-flex flex-wrap gap-0.5 rounded-xl bg-muted p-1" role="group" aria-label="Betrag">
            {art !== "dauerlastschrift" && quelleKnopf("fest", "Fester Betrag")}
            {art !== "dauerlastschrift" && quelleKnopf("abrechnung", "Abrechnungsspitze je Eigentümer")}
            {art === "dauerlastschrift" && quelleKnopf("wirtschaftsplan", "Hausgeld aus Wirtschaftsplan")}
          </div>
        </div>

        {/* Überweisung, fester Betrag: Empfänger frei eintragen */}
        {quelle === "fest" && art === "ueberweisung" && (
          <div className="space-y-3">
            {empfaenger.map((e, i) => (
              <div key={i} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1.3fr_1.5fr_0.7fr_auto]">
                <Input placeholder="Empfänger" value={e.name} onChange={(ev) => setEmpfaenger((l) => l.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)))} />
                <Input placeholder="IBAN" value={e.iban} onChange={(ev) => setEmpfaenger((l) => l.map((x, j) => (j === i ? { ...x, iban: ev.target.value } : x)))} className="tabular-nums" />
                <Input placeholder="Betrag €" inputMode="decimal" value={e.betrag} onChange={(ev) => setEmpfaenger((l) => l.map((x, j) => (j === i ? { ...x, betrag: ev.target.value } : x)))} className="text-right tabular-nums" />
                <Button variant="ghost" size="icon" aria-label="Empfänger entfernen" disabled={empfaenger.length === 1} onClick={() => setEmpfaenger((l) => l.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Input placeholder="Verwendungszweck (sonst der gemeinsame unten)" value={e.zweck} onChange={(ev) => setEmpfaenger((l) => l.map((x, j) => (j === i ? { ...x, zweck: ev.target.value } : x)))} className="md:col-span-3" />
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setEmpfaenger((l) => [...l, leerEmpfaenger()])}>
              <Plus className="h-4 w-4 mr-1" /> Weiterer Empfänger
            </Button>
          </div>
        )}

        {/* Einzug, fester Betrag: Eigentümer wählen */}
        {quelle === "fest" && istEinzug && (
          <div className="space-y-3">
            <label className="block max-w-xs space-y-1.5 text-sm font-medium">
              Betrag je Eigentümer (€)
              <Input inputMode="decimal" placeholder="0,00" value={festBetrag} onChange={(e) => setFestBetrag(e.target.value)} className="text-right tabular-nums" />
            </label>
            <EigentuemerTabelle liste={eigentuemer} laedt={ladeEig} auswahl={auswahl} setAuswahl={setAuswahl} spalte="Wird eingezogen" wert={() => (Number.isFinite(zahl(festBetrag)) ? euro(zahl(festBetrag)) : "–")} />
          </div>
        )}

        {/* Abrechnungsspitze je Eigentümer */}
        {quelle === "abrechnung" && (
          <div className="space-y-3">
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
              Ergebnis der Jahresabrechnung je Eigentümer eintragen: <b>Nachzahlung positiv</b>, <b>Guthaben negativ</b> (mit Minus). Nachzahlungen werden per Lastschrift eingezogen.
              {beschluss
                ? <> Übernommen aus der Abrechnung{beschluss.jahr ? ` ${beschluss.jahr}` : ""}, beschlossen am {beschluss.am.split("-").reverse().join(".")} – bei Bedarf hier anpassen.</>
                : buildingId ? " Noch keine Abrechnung als beschlossen gespeichert (Finanzen › Abrechnung › „Als beschlossen speichern“) – bis dahin bitte von Hand eintragen." : ""}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={guthabenAuszahlen} onCheckedChange={(v) => setGuthabenAuszahlen(!!v)} />
              Guthaben auszahlen (sonst mit dem nächsten Hausgeld verrechnen)
            </label>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Eigentümer</th>
                    <th className="px-3 py-2 font-medium">Mandat / IBAN</th>
                    <th className="w-40 px-3 py-2 text-right font-medium">Ergebnis (€)</th>
                  </tr>
                </thead>
                <tbody>
                  {eigentuemer.map((e) => (
                    <tr key={e.assignmentId} className="border-b last:border-0">
                      <td className="px-3 py-1.5">
                        <b>{e.name}</b> <span className="text-muted-foreground">· {e.einheit}</span>
                      </td>
                      <td className="px-3 py-1.5">
                        <MandatChip e={e} />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          inputMode="decimal"
                          placeholder="0,00"
                          value={ergebnis[e.assignmentId] ?? ""}
                          onChange={(ev) => setErgebnis((x) => ({ ...x, [e.assignmentId]: ev.target.value }))}
                          className="h-9 text-right tabular-nums"
                        />
                      </td>
                    </tr>
                  ))}
                  {!eigentuemer.length && (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                        {buildingId ? (ladeEig ? "Lädt …" : "Keine Eigentümer hinterlegt") : "Bitte zuerst das Konto wählen"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Dauerlastschrift: Hausgeld aus dem Wirtschaftsplan */}
        {quelle === "wirtschaftsplan" && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1.5 text-sm font-medium">
                Rhythmus
                <Select value={rhythmus} onValueChange={(v) => setRhythmus(v as Rhythmus)}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monatlich">monatlich</SelectItem>
                    <SelectItem value="quartal">vierteljährlich</SelectItem>
                    <SelectItem value="halbjahr">halbjährlich</SelectItem>
                    <SelectItem value="jahr">jährlich</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                Einzug am Tag
                <Select value={tag} onValueChange={setTag}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 28 }, (_, i) => String(i + 1)).map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}. des Monats
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                Erster Einzug im Monat
                <Input type="month" value={erster.slice(0, 7)} onChange={(e) => setErster(`${e.target.value}-01`)} className="h-11" />
              </label>
            </div>
            <EigentuemerTabelle
              liste={eigentuemer}
              laedt={ladeEig}
              auswahl={auswahl}
              setAuswahl={setAuswahl}
              spalte="Hausgeld / Einzug"
              wert={(e) => euro(e.hausgeldMonat * { monatlich: 1, quartal: 3, halbjahr: 6, jahr: 12 }[rhythmus])}
            />
            <p className="text-sm text-muted-foreground">
              Der Betrag kommt zu jedem Einzug aus dem dann gültigen Hausgeld (Wirtschaftsplan). Wird ein neuer Plan beschlossen und aktiviert, übernimmt der Auftrag die neuen Beträge von
              selbst. Eigentümer ohne Mandat zahlen selbst und sind nicht ausgewählt.
            </p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm font-medium">
            Bezeichnung
            <Input
              placeholder={art === "dauerlastschrift" ? "Hausgeld" : art === "einzug" ? "z. B. Sonderumlage Dach" : "z. B. Erstattung Auslagen Beirat"}
              value={titel}
              onChange={(e) => setTitel(e.target.value)}
              className="h-11"
            />
          </label>
          {art !== "dauerlastschrift" && (
            <label className="space-y-1.5 text-sm font-medium">
              {istEinzug ? "Einzug am" : "Ausführen am"}
              <Input type="date" value={faellig} min={istEinzug ? fruehesterEinzug() : heuteIso()} onChange={(e) => setFaellig(e.target.value)} className="h-11" />
            </label>
          )}
          <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
            Verwendungszweck
            <Input
              placeholder={art === "dauerlastschrift" ? "Hausgeld {monat} – {monat} wird z. B. zu 11/2026" : "Text für den Kontoauszug"}
              value={zweck}
              onChange={(e) => setZweck(e.target.value)}
              className="h-11"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          <div className="flex-1 basis-60 text-base">
            <b>
              {posten.length} {posten.length === 1 ? "Posten" : "Posten"}
              {summeAus > 0 && ` · ${euro(summeAus)} raus`}
              {summeEin > 0 && ` · ${euro(summeEin)} Einzug`}
              {art === "dauerlastschrift" && ` je ${{ monatlich: "Monat", quartal: "Quartal", halbjahr: "Halbjahr", jahr: "Jahr" }[rhythmus]}`}
            </b>
          </div>
          <Button variant="outline" onClick={onAbbrechen}>
            Abbrechen
          </Button>
          <Button onClick={anlegen} disabled={speichert}>
            {speichert && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {art === "dauerlastschrift" ? "Dauerlastschrift anlegen" : "In die Freigabe"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function MandatChip({ e }: { e: Eigentuemer }) {
  return mandatBereit(e.mandat) ? (
    <span className="rounded bg-green-50 px-1.5 py-0.5 text-xs text-green-800 dark:bg-green-950 dark:text-green-200">Mandat · {ibanFormatiert(e.mandat!.iban)}</span>
  ) : e.mandat ? (
    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
      {mandatVerfallen(e.mandat) ? "Mandat verfallen (36 Monate)" : "Mandat unvollständig"} – unter Gebäude › Mandate ergänzen
    </span>
  ) : e.iban ? (
    <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">kein Mandat · {ibanFormatiert(e.iban)}</span>
  ) : (
    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">keine IBAN</span>
  );
}

function EigentuemerTabelle({
  liste,
  laedt,
  auswahl,
  setAuswahl,
  spalte,
  wert,
}: {
  liste: Eigentuemer[];
  laedt: boolean;
  auswahl: Record<string, boolean>;
  setAuswahl: (f: (x: Record<string, boolean>) => Record<string, boolean>) => void;
  spalte: string;
  wert: (e: Eigentuemer) => string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
            <th className="w-10 px-3 py-2" />
            <th className="px-3 py-2 font-medium">Eigentümer</th>
            <th className="px-3 py-2 font-medium">Mandat / IBAN</th>
            <th className="px-3 py-2 text-right font-medium">{spalte}</th>
          </tr>
        </thead>
        <tbody>
          {liste.map((e) => {
            const ok = mandatBereit(e.mandat);
            const an = !!auswahl[e.assignmentId] && ok;
            return (
              <tr key={e.assignmentId} className={cn("border-b last:border-0", !an && "text-muted-foreground")}>
                <td className="px-3 py-1.5">
                  <Checkbox checked={an} disabled={!ok} onCheckedChange={(v) => setAuswahl((x) => ({ ...x, [e.assignmentId]: !!v }))} aria-label={`${e.name} auswählen`} />
                </td>
                <td className="px-3 py-1.5">
                  <b>{e.name}</b> <span className="text-muted-foreground">· {e.einheit}</span>
                </td>
                <td className="px-3 py-1.5">
                  <MandatChip e={e} />
                </td>
                <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{an ? wert(e) : "–"}</td>
              </tr>
            );
          })}
          {!liste.length && (
            <tr>
              <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                {laedt ? "Lädt …" : "Bitte zuerst das Konto wählen (oder keine Eigentümer hinterlegt)"}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
