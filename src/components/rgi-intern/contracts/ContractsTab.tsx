import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, Pencil, Trash2, Search, AlertTriangle, FileWarning, ChevronDown, Eye } from "lucide-react";
import {
  useManagementContracts, useBuildingsWithoutContract, useDeleteContract,
} from "@/hooks/useManagementContracts";
import { ContractWizard } from "./ContractWizard";
import { ContractDetailDialog } from "./ContractDetailDialog";
import {
  CONTRACT_STATUS_LABEL, contractWarnings, formatDate, formatEur, monthlyNet, monthsUntil,
  type ContractWithDetails,
} from "@/types/rgiContracts";

type ModeFilter = "all" | "weg" | "rent";

export function ContractsTab() {
  const { data: contracts, isLoading } = useManagementContracts();
  const { data: missing } = useBuildingsWithoutContract();
  const del = useDeleteContract();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ContractWithDetails | null>(null);
  const [presetBuilding, setPresetBuilding] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ContractWithDetails | null>(null);
  const [detail, setDetail] = useState<ContractWithDetails | null>(null);
  const [search, setSearch] = useState("");
  const [modeFilter, setModeFilter] = useState<ModeFilter>("all");
  // Eingeklappt, damit die Vertragsliste nicht von der Lückenliste
  // verdeckt wird — es sind über fünfzig Objekte.
  const [missingOpen, setMissingOpen] = useState(false);

  const rows = useMemo(() => {
    const list = (contracts ?? []).filter((c) => {
      if (modeFilter !== "all" && c.building?.management_mode !== modeFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (c.building?.name ?? "").toLowerCase().includes(q) ||
        (c.building?.building_code ?? "").toLowerCase().includes(q) ||
        (c.building?.city ?? "").toLowerCase().includes(q)
      );
    });
    return list.map((c) => {
      const monthly = monthlyNet(c.fees);
      const apartments = c.units_apartment ?? 0;
      return {
        contract: c,
        monthly,
        perApartment: apartments > 0 ? monthly / apartments : null,
        warnings: contractWarnings(c),
      };
    });
  }, [contracts, search, modeFilter]);

  const totals = useMemo(() => {
    const monthly = rows.reduce((s, r) => s + r.monthly, 0);
    const apartments = rows.reduce((s, r) => s + (r.contract.units_apartment ?? 0), 0);
    const parking = rows.reduce((s, r) => s + (r.contract.units_parking ?? 0), 0);
    return { monthly, yearly: monthly * 12, apartments, parking };
  }, [rows]);

  const openNew = (buildingId?: string | null) => {
    setEditing(null);
    setPresetBuilding(buildingId ?? null);
    setDialogOpen(true);
  };

  const openEdit = (c: ContractWithDetails) => {
    setEditing(c);
    setPresetBuilding(null);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Kopfzeile */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Objekt suchen…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={modeFilter} onValueChange={(v) => setModeFilter(v as ModeFilter)}>
          <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Verwaltungsarten</SelectItem>
            <SelectItem value="weg">WEG-Verwaltung</SelectItem>
            <SelectItem value="rent">Mietverwaltung</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button onClick={() => openNew()} className="gap-1.5">
          <Plus className="w-4 h-4" />Neuer Vertrag
        </Button>
      </div>

      {/* Summenzeile */}
      {!isLoading && rows.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Summary label="Honorar netto / Monat" value={formatEur(totals.monthly)} accent />
          <Summary label="Honorar netto / Jahr" value={formatEur(totals.yearly)} accent />
          <Summary label="Wohneinheiten" value={String(totals.apartments)} />
          <Summary label="Stellplätze separat" value={String(totals.parking)} />
        </div>
      )}

      {/* Objekte ohne Vertrag — standardmäßig eingeklappt */}
      {(missing ?? []).length > 0 && (
        <Collapsible open={missingOpen} onOpenChange={setMissingOpen}>
          <Card className="px-4 py-3">
            <CollapsibleTrigger asChild>
              <button type="button" className="w-full flex items-center gap-2 text-left">
                <FileWarning className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium">Objekte ohne erfassten Vertrag</span>
                <Badge variant="secondary" className="shrink-0">{(missing ?? []).length}</Badge>
                <div className="flex-1" />
                <ChevronDown
                  className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${missingOpen ? "rotate-180" : ""}`}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <p className="text-xs text-muted-foreground mt-2.5">
                Hinweis, keine Sperre. Objekte in Anbahnung gehören in die Angebotsstrecke.
                Klick auf ein Objekt legt den Vertrag dafür an.
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {(missing ?? []).map((b: any) => (
                  <Button key={b.id} variant="outline" size="sm" className="gap-1.5" onClick={() => openNew(b.id)}>
                    <Plus className="w-3.5 h-3.5" />
                    {b.name}
                    <span className="text-xs text-muted-foreground">
                      {b.management_mode === "weg" ? "WEG" : "Miete"}
                    </span>
                  </Button>
                ))}
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Tabelle */}
      {isLoading ? (
        <Skeleton className="h-64" />
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Noch kein Vertrag erfasst. Klick auf „Neuer Vertrag“ oder wähle oben ein Objekt.
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Objekt</TableHead>
                <TableHead>Art</TableHead>
                <TableHead className="text-right">Einheiten</TableHead>
                <TableHead className="text-right">Stellplätze</TableHead>
                <TableHead className="text-right">netto / Monat</TableHead>
                <TableHead className="text-right">je WE</TableHead>
                <TableHead>Bestellung bis</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ contract: c, monthly, perApartment, warnings }) => {
                const months = monthsUntil(c.appointed_until);
                const crit = warnings.filter((w) => w.level === "crit");
                const warn = warnings.filter((w) => w.level === "warn");
                return (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer"
                    onClick={() => setDetail(c)}
                  >
                    <TableCell>
                      <div className="font-medium">{c.building?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {[c.building?.building_code, c.building?.city].filter(Boolean).join(" · ")}
                        {c.label ? ` · ${c.label}` : ""}
                      </div>
                      {(crit.length > 0 || warn.length > 0) && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {crit.map((w, i) => (
                            <Badge key={`c${i}`} variant="destructive" className="text-[11px] font-normal gap-1">
                              <AlertTriangle className="w-3 h-3" />{w.text}
                            </Badge>
                          ))}
                          {warn.map((w, i) => (
                            <Badge key={`w${i}`} variant="secondary" className="text-[11px] font-normal">
                              {w.text}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.building?.management_mode === "weg" ? "WEG" : "Miete"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.units_apartment ?? "—"}
                      {c.units_commercial ? ` + ${c.units_commercial} TE` : ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.parking_billed_separately ? (c.units_parking ?? "—") : (
                        <span className="text-xs text-muted-foreground">im Satz enthalten</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatEur(monthly)}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {perApartment != null ? formatEur(perApartment) : "—"}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {c.appointed_until ? (
                        <>
                          {formatDate(c.appointed_until)}
                          {months !== null && (
                            <span className={`block text-xs ${months < 0 ? "text-destructive" : months <= 12 ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground"}`}>
                              {months < 0 ? "abgelaufen" : `${months} Mon.`}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">unbefristet</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.status === "active" ? "default" : "secondary"}>
                        {CONTRACT_STATUS_LABEL[c.status]}
                      </Badge>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" title="Details ansehen" onClick={() => setDetail(c)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" title="Bearbeiten" onClick={() => openEdit(c)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" title="Löschen" onClick={() => setConfirmDelete(c)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <ContractDetailDialog
        open={!!detail}
        onOpenChange={(v) => !v && setDetail(null)}
        contract={detail}
        onEdit={(c) => { setDetail(null); openEdit(c); }}
      />

      <ContractWizard
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        contract={editing}
        presetBuildingId={presetBuilding}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vertrag löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Der Vertrag für „{confirmDelete?.building?.name}“ wird mit allen Honorarbausteinen
              entfernt. Das Dokument im DMS bleibt bestehen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete) del.mutate(confirmDelete.id);
                setConfirmDelete(null);
              }}
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Summary({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold mt-1 tabular-nums ${accent ? "text-primary" : ""}`}>{value}</div>
    </Card>
  );
}
