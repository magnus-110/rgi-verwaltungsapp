/**
 * EconomicPlanLayout — Single Source of Truth für die Darstellung
 * von Gesamt- und Einzelwirtschaftsplänen.
 *
 * Wird genutzt von:
 *  - ManualEconomicPlanEditor (Inline-Edit)
 *  - Vorschau-Modus (read-only)
 *  - PDF-Export (read-only, gleiche Tabelle)
 */
import { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface PlanRow {
  account_id: string;
  account_number: string;
  account_name: string;
  category?: string | null;
  distribution_key?: string | null;
  planned_amount: number;
  manually_overridden?: boolean;
  isReserve?: boolean;
}

interface EconomicPlanLayoutProps {
  title: string;
  subtitle?: string;
  buildingName?: string;
  rows: PlanRow[];
  /** Optional render-prop for the amount cell; falls back to formatted currency */
  renderAmountCell?: (row: PlanRow) => ReactNode;
  /** Optional render-prop for an action cell (reset, edit-icon …) */
  renderActionCell?: (row: PlanRow) => ReactNode;
  /** Optional second amount column (e.g. €/Monat) */
  secondaryColumn?: { label: string; render: (row: PlanRow) => ReactNode };
  /** Optional grouping by category */
  groupByCategory?: boolean;
  className?: string;
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n || 0);

const SECTION_LABELS: Record<string, string> = {
  bewirtschaftung: "Bewirtschaftungskosten",
  heizkosten: "Heiz- und Warmwasserkosten",
  verwaltung: "Verwaltungskosten",
  ruecklage: "Erhaltungsrücklage",
  Sonstige: "Sonstige Kosten",
};

export function EconomicPlanLayout({
  title,
  subtitle,
  buildingName,
  rows,
  renderAmountCell,
  renderActionCell,
  secondaryColumn,
  groupByCategory = true,
  className,
}: EconomicPlanLayoutProps) {
  const total = rows.reduce((s, r) => s + (Number(r.planned_amount) || 0), 0);

  // Group rows by category (preserve order of first appearance)
  const groups: { key: string; rows: PlanRow[] }[] = [];
  if (groupByCategory) {
    const map = new Map<string, PlanRow[]>();
    rows.forEach((r) => {
      const cat = r.category || "Sonstige";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(r);
    });
    map.forEach((rows, key) => groups.push({ key, rows }));
  } else {
    groups.push({ key: "all", rows });
  }

  return (
    <Card className={cn("print:shadow-none print:border-0", className)}>
      <CardContent className="p-6 space-y-4 print:p-0">
        {/* Header — like PDF */}
        <div className="space-y-1 border-b pb-3">
          <h2 className="text-xl font-bold tracking-tight">{title}</h2>
          {buildingName && <p className="text-sm font-medium">{buildingName}</p>}
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Konto</TableHead>
              <TableHead>Bezeichnung</TableHead>
              <TableHead className="text-right w-32">Betrag €</TableHead>
              {secondaryColumn && (
                <TableHead className="text-right w-32">{secondaryColumn.label}</TableHead>
              )}
              <TableHead className="w-32 text-xs">Schlüssel</TableHead>
              {renderActionCell && <TableHead className="w-12"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => {
              const groupTotal = group.rows.reduce((s, r) => s + (Number(r.planned_amount) || 0), 0);
              return (
                <>
                  {groupByCategory && (
                    <TableRow key={`hdr-${group.key}`} className="bg-muted/40">
                      <TableCell colSpan={2} className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                        {SECTION_LABELS[group.key] || group.key}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground font-medium">
                        {formatCurrency(groupTotal)}
                      </TableCell>
                      {secondaryColumn && <TableCell />}
                      <TableCell />
                      {renderActionCell && <TableCell />}
                    </TableRow>
                  )}
                  {group.rows.map((row) => (
                    <TableRow key={row.account_id} className={cn(row.manually_overridden && "bg-amber-50/50 dark:bg-amber-950/20")}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{row.account_number}</TableCell>
                      <TableCell className="text-sm">{row.account_name}</TableCell>
                      <TableCell className="text-right font-mono">
                        {renderAmountCell ? renderAmountCell(row) : formatCurrency(row.planned_amount)}
                      </TableCell>
                      {secondaryColumn && (
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">
                          {secondaryColumn.render(row)}
                        </TableCell>
                      )}
                      <TableCell className="text-xs text-muted-foreground capitalize">{row.distribution_key || "mea"}</TableCell>
                      {renderActionCell && <TableCell>{renderActionCell(row)}</TableCell>}
                    </TableRow>
                  ))}
                </>
              );
            })}

            {/* Total row */}
            <TableRow className="border-t-2 border-foreground/40 font-bold">
              <TableCell />
              <TableCell className="uppercase text-xs tracking-wide">Gesamtsumme</TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(total)}</TableCell>
              {secondaryColumn && <TableCell className="text-right font-mono text-xs">{formatCurrency(total / 12)}</TableCell>}
              <TableCell />
              {renderActionCell && <TableCell />}
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
