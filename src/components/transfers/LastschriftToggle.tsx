import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";

/**
 * „Wird per Lastschrift eingezogen": Solche Rechnungen werden nicht
 * überwiesen und erscheinen nicht in der Freigabe. Kommt die Abbuchung auf
 * dem Konto an, steht die Rechnung von selbst auf „bezahlt".
 * Die KI setzt den Schalter beim Auslesen, von Hand jederzeit änderbar.
 */
export function LastschriftToggle({ invoiceId, an, onChanged }: { invoiceId: string; an: boolean; onChanged?: () => void }) {
  const [wert, setWert] = useState(an);
  const [speichert, setSpeichert] = useState(false);

  const umschalten = async (neu: boolean) => {
    setWert(neu);
    setSpeichert(true);
    const { error } = await supabase.from("invoices").update({ lastschrift: neu } as any).eq("id", invoiceId);
    setSpeichert(false);
    if (error) {
      setWert(!neu);
      toast.error("Konnte nicht gespeichert werden");
      return;
    }
    toast.success(neu ? "Wird per Lastschrift eingezogen – nicht überweisen" : "Wird überwiesen");
    onChanged?.();
  };

  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2">
      <Switch checked={wert} onCheckedChange={umschalten} disabled={speichert} className="mt-0.5" />
      <span className="text-sm">
        <span className="font-medium">Wird per Lastschrift eingezogen</span>
        <span className="block text-xs text-muted-foreground">
          {wert ? "Nicht überweisen. Kommt die Abbuchung, ist die Rechnung bezahlt." : "Die Rechnung wird überwiesen."}
        </span>
      </span>
    </label>
  );
}
