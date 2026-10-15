import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BankReconciliationTab } from "@/components/finance/BankReconciliationTab";
import { BankAccountMappingDialog } from "@/components/finance/BankAccountMappingDialog";
import { bankName, cleanIban, euro, ibanFormatiert } from "@/lib/bankInfo";
import { BewegungsListe } from "./BewegungsListe";
import { BEWEGUNG_SELECT, type KontoZeile } from "./kontenTypes";

interface Props {
  konto: KontoZeile;
  buildingName: string;
}

const AKTUELLES_JAHR = new Date().getFullYear();

/**
 * Ein Bankkonto einer Liegenschaft: Kopf mit Bank, IBAN, Saldo und Stand,
 * darunter die Kontobewegungen des gewählten Jahres (neueste zuerst).
 */
export function KontoAnsicht({ konto, buildingName }: Props) {
  const startJahr = konto.letzte_bewegung ? new Date(konto.letzte_bewegung).getFullYear() : AKTUELLES_JAHR;
  const [jahr, setJahr] = useState<number>(startJahr);
  const queryClient = useQueryClient();
  const [nurOffene, setNurOffene] = useState(false);
  const [abgleichOffen, setAbgleichOffen] = useState(false);
  const [zuordnungOffen, setZuordnungOffen] = useState(false);

  const { data: txns = [], isLoading } = useQuery({
    queryKey: ["konten-bewegungen", konto.building_id, konto.iban, jahr],
    queryFn: async () => {
      // Die Bewegung kennt ihr Konto nur über den Auszug.
      const { data: auszuege, error: e1 } = await supabase
        .from("bank_statements")
        .select("id, account_iban")
        .eq("building_id", konto.building_id);
      if (e1) throw e1;
      const ids = (auszuege ?? []).filter((s: any) => cleanIban(s.account_iban) === konto.iban).map((s: any) => s.id);
      if (ids.length === 0) return [];
      const alle: any[] = [];
      // in Blöcken, damit die URL nicht zu lang wird
      for (let i = 0; i < ids.length; i += 80) {
        const { data, error } = await supabase
          .from("bank_transactions")
          .select(BEWEGUNG_SELECT)
          .in("statement_id", ids.slice(i, i + 80))
          .gte("booking_date", `${jahr}-01-01`)
          .lte("booking_date", `${jahr}-12-31`)
          .order("booking_date", { ascending: false })
          .order("id", { ascending: false });
        if (error) throw error;
        alle.push(...(data ?? []));
      }
      return alle.sort((a, b) => (a.booking_date === b.booking_date ? String(b.id).localeCompare(String(a.id)) : a.booking_date < b.booking_date ? 1 : -1));
    },
  });

  const sichtbar = useMemo(
    () => (nurOffene ? txns.filter((t: any) => !t.booked_at && t.match_status !== "ignored") : txns),
    [txns, nurOffene],
  );
  const offenImJahr = txns.filter((t: any) => !t.booked_at && t.match_status !== "ignored").length;

  const jahre = useMemo(() => {
    const bis = Math.max(AKTUELLES_JAHR, startJahr);
    return Array.from({ length: 6 }, (_, i) => bis - i);
  }, [startJahr]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b px-4 py-3 text-sm">
        <div>
          <div className="text-muted-foreground text-xs">Bank</div>
          <div className="font-medium">{bankName(konto.iban, konto.bank_name)}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">IBAN</div>
          <div className="font-mono text-xs">{ibanFormatiert(konto.iban)}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">Saldo</div>
          <div className="font-semibold tabular-nums">
            {konto.saldo != null ? euro(konto.saldo) : "–"}
            {konto.saldo_stand && (
              <span className="ml-1 font-normal text-muted-foreground">
                Stand {format(new Date(konto.saldo_stand), "dd.MM.yyyy")}
              </span>
            )}
          </div>
        </div>
        {!konto.coa_account_id && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 border-orange-300 text-orange-800 hover:bg-orange-50 dark:text-orange-300"
            onClick={() => setZuordnungOffen(true)}
            title="Dieses Konto ist noch keinem Konto im Kontenrahmen zugeordnet"
          >
            Kontenrahmen zuordnen
          </Button>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch id={`offen-${konto.iban}`} checked={nurOffene} onCheckedChange={setNurOffene} />
            <Label htmlFor={`offen-${konto.iban}`} className="text-sm font-normal">
              Nur nicht gebuchte{offenImJahr > 0 ? ` (${offenImJahr})` : ""}
            </Label>
          </div>
          <Select value={String(jahr)} onValueChange={(v) => setJahr(Number(v))}>
            <SelectTrigger className="h-9 w-[92px]" aria-label="Jahr">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {jahre.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-9" onClick={() => setAbgleichOffen(true)}>
            <CalendarCheck className="h-4 w-4 mr-1.5" /> Monatsabgleich
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <BewegungsListe
          txns={sichtbar}
          liegenschaftsNamen={{ [konto.building_id]: buildingName }}
          leerText={nurOffene ? `Alles gebucht in ${jahr}.` : `Keine Kontobewegungen in ${jahr}.`}
        />
      )}

      {zuordnungOffen && (
        <BankAccountMappingDialog
          open={zuordnungOffen}
          onOpenChange={(o) => {
            setZuordnungOffen(o);
            if (!o) queryClient.invalidateQueries({ queryKey: ["konten-uebersicht"] });
          }}
          buildingId={konto.building_id}
          iban={konto.iban}
          bankNameFromStatement={konto.bank_name}
        />
      )}

      <Dialog open={abgleichOffen} onOpenChange={setAbgleichOffen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Monatsabgleich · {buildingName}</DialogTitle>
          </DialogHeader>
          <BankReconciliationTab sharedBuildingId={konto.building_id} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
