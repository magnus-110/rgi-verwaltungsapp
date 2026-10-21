/**
 * Hausgeld aus dem aktiven Wirtschaftsplan je Eigentümer übernehmen.
 *
 * Schreibt die monatlichen Vorschüsse in die Kostenzeilen der Eigentümer
 * (contact_building_costs, cost_type „Hausgeld“): bisherige Zeile endet am
 * Vortag, neue Zeile gilt ab dem gewählten Datum. Danach rechnen die
 * Dauerlastschrift und die Hausgeld-Kontrolle automatisch mit dem neuen Betrag.
 * Läuft nur auf Knopfdruck – nach dem Beschluss in der Versammlung.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface HausgeldWert {
  assignmentId: string;
  name: string;
  einheit: string;
  monatlich: number; // gesamter Vorschuss je Monat
  ruecklage: number; // davon Rücklage je Monat
}

const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n || 0);
const r2 = (n: number) => Math.round(n * 100) / 100;
const vortag = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

function standardDatum(fiscalYear: number) {
  const heute = new Date();
  const jahresbeginn = `${fiscalYear}-01-01`;
  const naechster = new Date(heute.getFullYear(), heute.getMonth() + 1, 1);
  const n = `${naechster.getFullYear()}-${String(naechster.getMonth() + 1).padStart(2, "0")}-01`;
  return n > jahresbeginn ? n : jahresbeginn;
}

export function HausgeldUebernehmen({
  werte,
  fiscalYear,
  knopfText = "Hausgeld übernehmen",
  onFertig,
}: {
  werte: HausgeldWert[];
  fiscalYear: number;
  knopfText?: string;
  onFertig?: () => void;
}) {
  const qc = useQueryClient();
  const [offen, setOffen] = useState(false);
  const [ab, setAb] = useState(() => standardDatum(fiscalYear));
  const [laeuft, setLaeuft] = useState(false);
  const ids = werte.map((w) => w.assignmentId);

  const { data: bestand = [], isLoading } = useQuery({
    queryKey: ["hausgeld-bestand", ids.join(",")],
    enabled: offen && ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_building_costs")
        .select("id, assignment_id, amount, reserve_share_monthly, valid_from, valid_to")
        .in("assignment_id", ids)
        .eq("cost_type", "Hausgeld");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Je Eigentümer: was gilt am Stichtag bisher, was kommt neu
  const zeilen = useMemo(
    () =>
      werte.map((w) => {
        const eigene = (bestand as any[]).filter((b) => b.assignment_id === w.assignmentId);
        const bisher = eigene
          .filter((b) => (!b.valid_from || b.valid_from <= ab) && (!b.valid_to || b.valid_to >= ab))
          .sort((a, b) => String(b.valid_from ?? "").localeCompare(String(a.valid_from ?? "")))[0];
        const spaeter = eigene.filter((b) => b.valid_from && b.valid_from > ab);
        const neu = r2(w.monatlich);
        const gleich = !!bisher && Math.abs(Number(bisher.amount) - neu) < 0.005 && Math.abs(Number(bisher.reserve_share_monthly ?? 0) - r2(w.ruecklage)) < 0.005;
        return { w, bisher, spaeter, neu, gleich };
      }),
    [werte, bestand, ab],
  );
  const aenderungen = zeilen.filter((z) => !z.gleich && z.neu > 0);

  const uebernehmen = async () => {
    setLaeuft(true);
    try {
      for (const z of aenderungen) {
        // Zeilen, die erst nach dem Stichtag beginnen, ersetzt der neue Plan
        for (const s of z.spaeter) {
          const { error } = await supabase.from("contact_building_costs").delete().eq("id", s.id);
          if (error) throw error;
        }
        if (z.bisher && z.bisher.valid_from === ab) {
          const { error } = await supabase
            .from("contact_building_costs")
            .update({ amount: z.neu, reserve_share_monthly: r2(z.w.ruecklage), valid_to: null } as any)
            .eq("id", z.bisher.id);
          if (error) throw error;
          continue;
        }
        if (z.bisher) {
          const { error } = await supabase.from("contact_building_costs").update({ valid_to: vortag(ab) }).eq("id", z.bisher.id);
          if (error) throw error;
        }
        const { error } = await supabase.from("contact_building_costs").insert({
          assignment_id: z.w.assignmentId,
          cost_type: "Hausgeld",
          amount: z.neu,
          reserve_share_monthly: r2(z.w.ruecklage),
          interval: "monatlich",
          valid_from: ab,
        } as any);
        if (error) throw error;
      }
      toast.success(`Hausgeld für ${aenderungen.length} Eigentümer ab ${ab.split("-").reverse().join(".")} übernommen`);
      qc.invalidateQueries({ queryKey: ["hausgeld-bestand"] });
      qc.invalidateQueries({ queryKey: ["mandate"] });
      setOffen(false);
      onFertig?.();
    } catch (e: any) {
      toast.error("Übernahme fehlgeschlagen: " + (e?.message ?? "Unbekannter Fehler"));
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOffen(true)} disabled={!werte.length}>
        <ArrowRightLeft className="h-4 w-4 mr-1" />
        {knopfText}
      </Button>
      <Dialog open={offen} onOpenChange={setOffen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Hausgeld je Eigentümer übernehmen</DialogTitle>
            <DialogDescription>
              Die monatlichen Vorschüsse aus diesem Plan werden ab dem gewählten Datum beim Eigentümer hinterlegt. Die Dauerlastschrift zieht dann
              automatisch den neuen Betrag ein. Am besten erst nach dem Beschluss in der Versammlung.
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">Gilt ab</span>
            <Input type="date" value={ab} onChange={(e) => e.target.value && setAb(e.target.value)} className="w-44" />
            <span className="text-xs text-muted-foreground">Darf in der Zukunft liegen – bis dahin gilt der bisherige Betrag.</span>
          </label>
          <div className="max-h-[50vh] overflow-y-auto rounded-md border">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Lade bisherige Beträge…
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Eigentümer</th>
                    <th className="px-3 py-2 text-right font-medium">Bisher</th>
                    <th className="px-3 py-2 text-right font-medium">Neu</th>
                    <th className="px-3 py-2 text-right font-medium">davon Rücklage</th>
                  </tr>
                </thead>
                <tbody>
                  {zeilen.map((z) => (
                    <tr key={z.w.assignmentId} className="border-t">
                      <td className="px-3 py-2">
                        <span className="font-medium">{z.w.name}</span>
                        {z.w.einheit && <span className="text-muted-foreground"> · {z.w.einheit}</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{z.bisher ? eur(Number(z.bisher.amount)) : "—"}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{z.gleich ? <span className="font-normal text-muted-foreground">unverändert</span> : eur(z.neu)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{eur(z.w.ruecklage)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOffen(false)}>
              Abbrechen
            </Button>
            <Button onClick={uebernehmen} disabled={laeuft || isLoading || aenderungen.length === 0}>
              {laeuft && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {aenderungen.length ? `${aenderungen.length} Beträge übernehmen` : "Nichts zu ändern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
