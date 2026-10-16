/**
 * „Für Zahlungen übernehmen": hält das Ergebnis der Jahresabrechnung je
 * Eigentümer fest (settlement_results) – ein Klick, kein Fenster, kein Datum.
 * Der Zahlungsauftrag „Abrechnungsspitze" übernimmt die Beträge dann
 * automatisch. Erneutes Klicken aktualisiert auf den aktuellen Stand.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

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
  const [laeuft, setLaeuft] = useState(false);

  const { data: gespeichert } = useQuery({
    queryKey: ["settlement-results", periodId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("settlement_results").select("nachzahlung").eq("billing_period_id", periodId);
      return data ?? [];
    },
  });

  // Stimmt der gespeicherte Stand noch mit der Abrechnung überein?
  const aktuell =
    !!gespeichert?.length &&
    Math.abs(gespeichert.reduce((s: number, z: any) => s + Number(z.nachzahlung), 0) - ownerResults.reduce((s, o) => s - o.result, 0)) < 0.01;

  const uebernehmen = async () => {
    setLaeuft(true);
    try {
      const zeilen = ownerResults.map((o) => ({
        building_id: buildingId,
        billing_period_id: periodId,
        assignment_id: o.assignmentId,
        geschaeftsjahr: fiscalYear,
        nachzahlung: r2(-o.result),
        beschlossen_am: new Date().toISOString().slice(0, 10),
        created_by: user?.id ?? null,
      }));
      const { error } = await (supabase as any).from("settlement_results").upsert(zeilen, { onConflict: "billing_period_id,assignment_id" });
      if (error) throw error;
      const nach = ownerResults.filter((o) => r2(o.result) < 0);
      const gut = ownerResults.filter((o) => r2(o.result) > 0);
      toast.success(
        `Übernommen: ${nach.length} Nachzahlungen (${eur(nach.reduce((s, o) => s - o.result, 0))}), ${gut.length} Guthaben (${eur(gut.reduce((s, o) => s + o.result, 0))}). ` +
          "Unter Zahlungen › Neuer Auftrag › Abrechnungsspitze stehen die Beträge schon drin.",
        { duration: 8000 },
      );
      qc.invalidateQueries({ queryKey: ["settlement-results"] });
    } catch (e: any) {
      toast.error("Übernehmen fehlgeschlagen: " + (e?.message ?? "Unbekannter Fehler"));
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={uebernehmen}
      disabled={!ownerResults.length || laeuft || aktuell}
      title={aktuell ? "Die Ergebnisse sind für Zahlungen übernommen" : "Ergebnis je Eigentümer für den Zahlungsauftrag „Abrechnungsspitze“ übernehmen"}
    >
      {laeuft ? <Loader2 className="h-4 w-4 animate-spin" /> : aktuell ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Send className="h-4 w-4" />}
      {aktuell ? "Für Zahlungen übernommen" : gespeichert?.length ? "Neuen Stand übernehmen" : "Für Zahlungen übernehmen"}
    </Button>
  );
}
