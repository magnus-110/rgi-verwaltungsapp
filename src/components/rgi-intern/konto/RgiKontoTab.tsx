import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Landmark, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { cleanIban, euro, ibanFormatiert } from "@/lib/bankInfo";
import { BewegungsListe } from "@/components/konten/BewegungsListe";
import { BEWEGUNG_SELECT } from "@/components/konten/kontenTypes";
import { AbrufKnopf } from "@/components/konten/AbrufKnopf";

const JETZT = new Date().getFullYear();

/**
 * RGI Intern › Bankkonto: die Konten der RGI Immobilien, die unter
 * Einstellungen › Bankzugänge auf „RGI intern" gestellt sind. Nur zum
 * Ansehen – gebucht wird bei RGI in DATEV, Rechnungen werden verknüpft.
 */
export function RgiKontoTab() {
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [jahr, setJahr] = useState(JETZT);

  const { data: konten = [], isLoading } = useQuery({
    queryKey: ["bank-connections", "rgi"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("bank_connections").select("id, bank_name, konten");
      if (error) throw error;
      return (data ?? []).flatMap((z: any) =>
        (z.konten ?? []).filter((k: any) => k.rgi && !k.ausgeblendet).map((k: any) => ({ ...k, bank: z.bank_name, iban: cleanIban(k.iban) })),
      );
    },
  });
  const konto = konten.find((k: any) => k.iban === gewaehlt) ?? konten[0] ?? null;

  const { data: txns = [], isLoading: laedt } = useQuery({
    queryKey: ["konten-bewegungen", "rgi", konto?.iban, jahr],
    enabled: !!konto,
    queryFn: async () => {
      const { data: auszuege, error } = await supabase
        .from("bank_statements")
        .select("id, account_iban")
        .is("building_id", null);
      if (error) throw error;
      const ids = (auszuege ?? []).filter((s: any) => cleanIban(s.account_iban) === konto.iban).map((s: any) => s.id);
      if (!ids.length) return [];
      const alle: any[] = [];
      for (let i = 0; i < ids.length; i += 80) {
        const { data, error: e2 } = await supabase
          .from("bank_transactions")
          .select(BEWEGUNG_SELECT)
          .in("statement_id", ids.slice(i, i + 80))
          .gte("booking_date", `${jahr}-01-01`)
          .lte("booking_date", `${jahr}-12-31`)
          .order("booking_date", { ascending: false });
        if (e2) throw e2;
        alle.push(...(data ?? []));
      }
      return alle.sort((a, b) => (a.booking_date < b.booking_date ? 1 : -1));
    },
  });

  const summen = useMemo(() => {
    const ein = txns.filter((t: any) => Number(t.amount) > 0).reduce((s: number, t: any) => s + Number(t.amount), 0);
    const aus = txns.filter((t: any) => Number(t.amount) < 0).reduce((s: number, t: any) => s + Number(t.amount), 0);
    return { ein, aus };
  }, [txns]);



  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!konto) {
    return (
      <Card className="p-8 text-center">
        <Landmark className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <div className="font-medium">Noch kein RGI-Konto verbunden</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Unter <Link to="/settings?tab=bankzugaenge" className="text-primary hover:underline">Einstellungen › Bankzugänge</Link> beim
          gewünschten Konto „RGI intern" wählen.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {konten.length > 1 ? (
          <Select value={konto.iban} onValueChange={setGewaehlt}>
            <SelectTrigger className="h-10 w-80">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {konten.map((k: any) => (
                <SelectItem key={k.iban} value={k.iban}>
                  {(k.name || "Konto") + " · " + ibanFormatiert(k.iban)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Select value={String(jahr)} onValueChange={(v) => setJahr(Number(v))}>
          <SelectTrigger className="h-10 w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[0, 1, 2].map((i) => (
              <SelectItem key={i} value={String(JETZT - i)}>
                {JETZT - i}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <AbrufKnopf variant="outline" className="ml-auto" nurRgi />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap gap-x-8 gap-y-2 border-b px-4 py-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Konto</div>
            <div className="font-medium">{konto.inhaber || konto.name || "RGI"}</div>
            <div className="font-mono text-xs text-muted-foreground">{ibanFormatiert(konto.iban)} · {konto.bank}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Kontostand</div>
            <div className="font-semibold tabular-nums">{konto.saldo != null ? euro(konto.saldo) : "–"}</div>
            {konto.saldoAm && <div className="text-xs text-muted-foreground">Stand {format(new Date(konto.saldoAm), "dd.MM.yyyy")}</div>}
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Eingänge {jahr}</div>
            <div className="tabular-nums text-green-700 dark:text-green-400">{euro(summen.ein)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Ausgänge {jahr}</div>
            <div className={cn("tabular-nums")}>{euro(summen.aus)}</div>
          </div>
        </div>
        {laedt ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <BewegungsListe txns={txns} ohneBuchung leerText={`Keine Bewegungen in ${jahr}. Nach dem ersten Abruf erscheinen sie hier.`} />
        )}
      </Card>
    </div>
  );
}
