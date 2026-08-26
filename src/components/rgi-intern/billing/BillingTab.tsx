// Ebene 1 des Abrechnungsblatts: die Objektliste.
//
// Beantwortet die Frage „wo liegt etwas an?“ auf einen Blick.
// Ein Klick auf eine Zeile öffnet das Abrechnungsblatt der
// Liegenschaft.

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ChevronRight, CircleDot, FileWarning } from "lucide-react";
import { useBillingOverview } from "@/hooks/useRgiBilling";
import { formatDate, formatEur } from "@/types/rgiContracts";
import { BuildingBillingSheet } from "./BuildingBillingSheet";

type Filter = "open" | "all" | "no_contract";

export function BillingTab() {
  const { data, isLoading } = useBillingOverview();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("open");
  const [openBuilding, setOpenBuilding] = useState<{ id: string; name: string } | null>(null);

  const rows = useMemo(() => {
    const list = (data ?? []).filter((r) => {
      if (filter === "open" && r.open_count === 0) return false;
      if (filter === "no_contract" && r.contract_id) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        r.building_name.toLowerCase().includes(q) ||
        (r.building_code ?? "").toLowerCase().includes(q) ||
        (r.city ?? "").toLowerCase().includes(q)
      );
    });
    // Objekte mit offenen Posten zuerst, danach nach Betrag.
    return [...list].sort(
      (a, b) => b.open_count - a.open_count || Number(b.open_net) - Number(a.open_net),
    );
  }, [data, search, filter]);

  const totals = useMemo(() => {
    const all = data ?? [];
    return {
      objects: all.filter((r) => r.open_count > 0).length,
      posten: all.reduce((s, r) => s + r.open_count, 0),
      netto: all.reduce((s, r) => s + Number(r.open_net), 0),
    };
  }, [data]);

  return (
    <div className="space-y-4 mt-4">
      {/* Kopfzahlen */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Objekte mit offenen Posten</div>
          <div className="text-2xl font-semibold">{totals.objects}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Offene Posten insgesamt</div>
          <div className="text-2xl font-semibold">{totals.posten}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Noch nicht abgerechnet</div>
          <div className="text-2xl font-semibold font-mono">{formatEur(totals.netto)}</div>
          <div className="text-[11px] text-muted-foreground">netto</div>
        </Card>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Objekt, Kürzel oder Ort suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Nur mit offenen Posten</SelectItem>
            <SelectItem value="all">Alle Objekte</SelectItem>
            <SelectItem value="no_contract">Ohne Verwaltervertrag</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-72" />
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          <CircleDot className="w-10 h-10 mx-auto mb-3 opacity-25" />
          {filter === "open"
            ? "Aktuell ist bei keinem Objekt etwas offen."
            : "Keine Objekte gefunden."}
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Objekt</TableHead>
                <TableHead className="text-right">Honorar / Monat</TableHead>
                <TableHead className="text-right">Offen</TableHead>
                <TableHead className="text-right">Betrag netto</TableHead>
                <TableHead>Zuletzt abgerechnet</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.building_id}
                  className="cursor-pointer"
                  onClick={() => setOpenBuilding({ id: r.building_id, name: r.building_name })}
                >
                  <TableCell>
                    <div className="font-medium">{r.building_name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                      {r.building_code && <span className="font-mono">{r.building_code}</span>}
                      {r.city && <span>· {r.city}</span>}
                      <span>· {r.management_mode === "weg" ? "WEG" : "Miete"}</span>
                      {!r.contract_id && (
                        <Badge variant="outline" className="gap-1 text-[10px] h-4 px-1.5">
                          <FileWarning className="w-3 h-3" />kein Vertrag
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {Number(r.base_monthly_net) > 0 ? formatEur(Number(r.base_monthly_net)) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.open_count > 0 ? (
                      <Badge>{r.open_count}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {Number(r.open_net) > 0 ? formatEur(Number(r.open_net)) : "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.last_invoice_number ? (
                      <>
                        <span className="font-mono">{r.last_invoice_number}</span>
                        <span className="text-muted-foreground"> · {formatDate(r.last_invoice_date)}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">noch nie</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <BuildingBillingSheet
        open={!!openBuilding}
        onOpenChange={(v) => !v && setOpenBuilding(null)}
        buildingId={openBuilding?.id ?? null}
        buildingName={openBuilding?.name ?? ""}
      />
    </div>
  );
}
