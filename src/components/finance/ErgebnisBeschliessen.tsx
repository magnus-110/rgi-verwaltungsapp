/**
 * „Als beschlossen speichern": hält das Ergebnis der Jahresabrechnung je
 * Eigentümer fest (settlement_results). Der Zahlungsauftrag
 * „Abrechnungsspitze" übernimmt die Beträge dann automatisch.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n || 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

interface Props {
  buildingId: string;
  periodId: string;
  fiscalYear: number;
  // result > 0 = Guthaben, result < 0 = Nachzahlung (wie in der Einzelabrechnung)
  ownerResults: Array<{ assignmentId: string; name: string; unitNumber: string; result: number }>;
}

export function ErgebnisBeschliessen({ buildingId, periodId, fiscalYear, ownerResults }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [offen, setOffen] = useState(false);
  const [datum, setDatum] = useState(() => new Date().toISOString().slice(0, 10));
  const [laeuft, setLaeuft] = useState(false);

  const { data: gespeichert } = useQuery({
    queryKey: ["settlement-results", periodId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("settlement_results").select("beschlossen_am").eq("billing_period_id", periodId).limit(1);
      return data?.[0] ?? null;
    },
  });

  const nach = ownerResults.filter((o) => r2(o.result) < 0);
  const gut = ownerResults.filter((o) => r2(o.result) > 0);

  const speichern = async () => {
    setLaeuft(true);
    try {
      const zeilen = ownerResults.map((o) => ({
        building_id: buildingId,
        billing_period_id: periodId,
        assignment_id: o.assignmentId,
        geschaeftsjahr: fiscalYear,
        nachzahlung: r2(-o.result),
        beschlossen_am: datum,
        created_by: user?.id ?? null,
      }));
      const { error } = await (supabase as any).from("settlement_results").upsert(zeilen, { onConflict: "billing_period_id,assignment_id" });
      if (error) throw error;
      toast.success("Ergebnisse gespeichert – unter Zahlungen › Neuer Auftrag › Abrechnungsspitze sind sie vorausgefüllt");
      qc.invalidateQueries({ queryKey: ["settlement-results"] });
      setOffen(false);
    } catch (e: any) {
      toast.error("Speichern fehlgeschlagen: " + (e?.message ?? "Unbekannter Fehler"));
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOffen(true)} disabled={!ownerResults.length}>
        <CheckCircle2 className={gespeichert ? "h-4 w-4 text-emerald-600" : "h-4 w-4"} />
        {gespeichert ? `Beschlossen ${String(gespeichert.beschlossen_am).split("-").reverse().join(".")}` : "Als beschlossen speichern"}
      </Button>
      <Dialog open={offen} onOpenChange={setOffen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Abrechnung {fiscalYear} als beschlossen speichern</DialogTitle>
            <DialogDescription>
              Das Ergebnis je Eigentümer wird festgehalten. Beim Zahlungsauftrag „Abrechnungsspitze" stehen die Beträge dann schon drin – Nachzahlungen
              werden per Lastschrift eingezogen, Guthaben überwiesen. Geld bewegt sich erst nach deiner Freigabe per TAN.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md border p-3">
              <div className="text-muted-foreground">Nachzahlungen</div>
              <div className="text-lg font-semibold tabular-nums">{eur(nach.reduce((s, o) => s - o.result, 0))}</div>
              <div className="text-xs text-muted-foreground">{nach.length} Eigentümer</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-muted-foreground">Guthaben</div>
              <div className="text-lg font-semibold tabular-nums">{eur(gut.reduce((s, o) => s + o.result, 0))}</div>
              <div className="text-xs text-muted-foreground">{gut.length} Eigentümer</div>
            </div>
          </div>
          <label className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">Beschluss vom</span>
            <Input type="date" value={datum} onChange={(e) => e.target.value && setDatum(e.target.value)} className="w-44" />
          </label>
          {gespeichert && <p className="text-xs text-muted-foreground">Schon gespeichert – erneutes Speichern überschreibt die Beträge mit dem aktuellen Stand.</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOffen(false)}>
              Abbrechen
            </Button>
            <Button onClick={speichern} disabled={laeuft}>
              {laeuft && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
