import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Landmark, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { bankName, ibanFormatiert } from "@/lib/bankInfo";
import { AuszugImport } from "./AuszugImport";
import type { KontoZeile } from "./kontenTypes";

/**
 * Einstellungen › Bankzugänge
 *
 * Hier landen die Zugänge zum Online-Banking (FinTS) für den täglichen
 * Abruf. Bis dahin: Übersicht aller Konten mit letztem Auszug und der
 * Datei-Import als Notlösung.
 */
export function BankzugaengeEinstellungen() {
  const { data: konten = [] } = useQuery({
    queryKey: ["konten-uebersicht"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("v_konten_uebersicht").select("*");
      if (error) throw error;
      return (data ?? []) as KontoZeile[];
    },
  });
  const { data: gebaeude = [] } = useQuery({
    queryKey: ["konten-liegenschaften"],
    queryFn: async () => {
      const { data, error } = await supabase.from("buildings").select("id, name, management_mode").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const namen: Record<string, string> = useMemo(() => Object.fromEntries(gebaeude.map((g: any) => [g.id, g.name])), [gebaeude]);
  const zeilen = useMemo(
    () => [...konten].sort((a, b) => (namen[a.building_id] ?? "").localeCompare(namen[b.building_id] ?? "") || (a.display_name ?? "").localeCompare(b.display_name ?? "")),
    [konten, namen],
  );
  const jeBank = useMemo(() => {
    const m = new Map<string, number>();
    konten.forEach((k) => m.set(bankName(k.iban, null), (m.get(bankName(k.iban, null)) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [konten]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-primary" /> Bankzugänge
          </CardTitle>
          <CardDescription>
            Über einen Bankzugang holt die App die Umsätze jeden Tag selbst ab (06:00 und 13:00 Uhr). Pro Bank genügt ein Zugang für alle Konten, die RGI dort führt.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border border-dashed px-4 py-5 text-sm">
            <div className="font-medium">Noch kein Bankzugang verbunden</div>
            <div className="text-muted-foreground mt-1">
              Der Abruf über die Bank wird gerade eingerichtet. Bis dahin Auszüge unten als Datei einlesen.
            </div>
          </div>
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
            Die Bank-PIN wird nur verschlüsselt gespeichert und ist für niemanden lesbar. Geld bewegt die App nie ohne TAN.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Konten</CardTitle>
          <CardDescription>
            {konten.length} Konten
            {jeBank.length ? ` · ${jeBank.map(([b, n]) => `${n} ${b}`).join(" · ")}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Liegenschaft</th>
                  <th className="px-4 py-2 font-medium">Konto</th>
                  <th className="px-4 py-2 font-medium">Bank</th>
                  <th className="px-4 py-2 font-medium">IBAN</th>
                  <th className="px-4 py-2 font-medium">Letzter Auszug</th>
                  <th className="px-4 py-2 font-medium">Abruf</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {zeilen.map((k) => (
                  <tr key={`${k.building_id}-${k.iban}`}>
                    <td className="px-4 py-2">{namen[k.building_id] ?? "–"}</td>
                    <td className="px-4 py-2">{k.display_name || "–"}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{bankName(k.iban, k.bank_name)}</td>
                    <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">{ibanFormatiert(k.iban)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{k.saldo_stand ? format(new Date(k.saldo_stand), "dd.MM.yyyy") : "–"}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">Datei</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Datei-Import</CardTitle>
          <CardDescription>Notlösung: Auszug aus dem Online-Banking als Datei einlesen.</CardDescription>
        </CardHeader>
        <CardContent>
          <AuszugImport />
        </CardContent>
      </Card>
    </div>
  );
}
