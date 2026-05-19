/**
 * EconomicPlanLayout — Single Source of Truth für die Darstellung
 * von Gesamt- und Einzelwirtschaftsplänen (HV-Office-konform).
 *
 * Spalten Gesamtplan:
 *   Konto | Bezeichnung (* = umlagefähig) | Umlage per | IST Vorjahr | Plan-Saldo | Änd. %
 * Spalten Einzelplan:
 *   Konto | Bezeichnung | Umlage per | Ges Anteil | Ihr Anteil | Ges Kosten | Ihre Kosten
 *
 * Footer (optional, via props):
 *   - davon umlagefähig
 *   - € pro QM und Monat
 *   - "auf Sie umlegbar" + monatliche Belastung mit EHR/Vorschuss-Split
 */
import { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getShareTypeLabel } from "@/lib/shareTypes";

export interface PlanRow {
  account_id: string;
  account_number: string;
  account_name: string;
  category?: string | null;
  distribution_key?: string | null;
  planned_amount: number;
  manually_overridden?: boolean;
  isReserve?: boolean;
  isDistributable?: boolean;
  previousAmount?: number | null;
  // Einzelplan-spezifisch
  totalShare?: number | null;   // Ges Anteil (z.B. 1000.000)
  yourShare?: number | null;    // Ihr Anteil (z.B. 127.000)
  totalAmount?: number | null;  // Ges Kosten (= Plan-Saldo Gesamt)
}

interface FooterExtras {
  /** Σ aller Konten mit isDistributable=true */
  distributableTotal?: number;
  /** Wohnfläche der Liegenschaft (m²) für €/qm/Monat */
  totalAreaSqm?: number;
  /** "auf Sie umlegbar" — Eigentümersumme */
  ownerTotal?: number;
  /** EHR-Anteil (Erhaltungsrücklage) */
  ownerReserveTotal?: number;
  /** Vorschuss-Anteil (Rest) */
  ownerAdvanceTotal?: number;
}

interface EconomicPlanLayoutProps {
  title: string;
  subtitle?: string;
  buildingName?: string;
  rows: PlanRow[];
  variant?: "gesamt" | "einzel";
  renderAmountCell?: (row: PlanRow) => ReactNode;
  renderActionCell?: (row: PlanRow) => ReactNode;
  renderDistKeyCell?: (row: PlanRow) => ReactNode;
  secondaryColumn?: { label: string; render: (row: PlanRow) => ReactNode };
  groupByCategory?: boolean;
  footer?: FooterExtras;
  className?: string;
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n || 0);

const formatNumber = (n: number, digits = 2) =>
  new Intl.NumberFormat("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n || 0);

const formatPercent = (n: number) =>
  (n > 0 ? "+" : "") + new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " %";

const SECTION_LABELS: Record<string, string> = {
  bewirtschaftung: "Bewirtschaftungskosten",
  heizkosten: "Heiz- und Warmwasserkosten",
  verwaltung: "Verwaltungskosten",
  ruecklage: "Erhaltungsrücklage",
  operating_distributable: "Bewirtschaftungskosten (umlagefähig)",
  operating_non_distributable: "Bewirtschaftungskosten (nicht umlagefähig)",
  heating: "Heiz- und Warmwasserkosten",
  administration: "Verwaltungskosten",
  reserve: "Erhaltungsrücklage",
  Sonstige: "Sonstige Kosten",
};

const formatDistKey = (k?: string | null) => getShareTypeLabel(k);

export function EconomicPlanLayout({
  title,
  subtitle,
  buildingName,
  rows,
  variant = "gesamt",
  renderAmountCell,
  renderActionCell,
  renderDistKeyCell,
  secondaryColumn,
  groupByCategory = true,
  footer,
  className,
}: EconomicPlanLayoutProps) {
  const total = rows.reduce((s, r) => s + (Number(r.planned_amount) || 0), 0);
  const totalPrev = rows.reduce((s, r) => s + (Number(r.previousAmount) || 0), 0);
  const isEinzel = variant === "einzel";

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

  // Spalten je Variante
  const colSpan = isEinzel
    ? 7 + (renderActionCell ? 1 : 0)
    : 6 + (secondaryColumn ? 1 : 0) + (renderActionCell ? 1 : 0);

  return (
    <Card className={cn("print:shadow-none print:border-0", className)}>
      <CardContent className="p-6 space-y-4 print:p-0">
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
              <TableHead className="w-32 text-xs">Umlage per</TableHead>
              {isEinzel ? (
                <>
                  <TableHead className="text-right w-24 text-xs">Ges Anteil</TableHead>
                  <TableHead className="text-right w-24 text-xs">Ihr Anteil</TableHead>
                  <TableHead className="text-right w-28">Ges Kosten</TableHead>
                  <TableHead className="text-right w-28">Ihre Kosten</TableHead>
                </>
              ) : (
                <>
                  <TableHead className="text-right w-28 text-xs">IST Vorjahr</TableHead>
                  <TableHead className="text-right w-28">Plan-Saldo</TableHead>
                  <TableHead className="text-right w-20 text-xs">Änd. %</TableHead>
                  {secondaryColumn && (
                    <TableHead className="text-right w-24 text-xs">{secondaryColumn.label}</TableHead>
                  )}
                </>
              )}
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
                      <TableCell colSpan={colSpan} className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                        {SECTION_LABELS[group.key] || group.key} · {formatCurrency(groupTotal)}
                      </TableCell>
                    </TableRow>
                  )}
                  {group.rows.map((row) => {
                    const prev = Number(row.previousAmount || 0);
                    const cur = Number(row.planned_amount || 0);
                    const changePct = prev > 0 ? ((cur - prev) / prev) * 100 : (cur > 0 ? 100 : 0);
                    return (
                      <TableRow key={row.account_id} className={cn(row.manually_overridden && "bg-amber-50/50 dark:bg-amber-950/20")}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{row.account_number}</TableCell>
                        <TableCell className="text-sm">
                          {row.isDistributable && <span className="text-muted-foreground mr-1">*</span>}
                          {row.account_name}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDistKey(row.distribution_key)}</TableCell>
                        {isEinzel ? (
                          <>
                            <TableCell className="text-right font-mono text-xs">{row.totalShare != null ? formatNumber(row.totalShare, 3) : "–"}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{row.yourShare != null ? formatNumber(row.yourShare, 3) : "–"}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{formatCurrency(row.totalAmount ?? 0)}</TableCell>
                            <TableCell className="text-right font-mono">
                              {renderAmountCell ? renderAmountCell(row) : formatCurrency(row.planned_amount)}
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell className="text-right font-mono text-xs text-muted-foreground">
                              {row.previousAmount != null ? formatCurrency(row.previousAmount) : "–"}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {renderAmountCell ? renderAmountCell(row) : formatCurrency(row.planned_amount)}
                            </TableCell>
                            <TableCell className={cn("text-right font-mono text-xs", changePct > 0 ? "text-amber-700 dark:text-amber-400" : changePct < 0 ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
                              {row.previousAmount != null && row.previousAmount !== 0 ? formatPercent(changePct) : "–"}
                            </TableCell>
                            {secondaryColumn && (
                              <TableCell className="text-right font-mono text-xs text-muted-foreground">
                                {secondaryColumn.render(row)}
                              </TableCell>
                            )}
                          </>
                        )}
                        {renderActionCell && <TableCell>{renderActionCell(row)}</TableCell>}
                      </TableRow>
                    );
                  })}
                </>
              );
            })}

            {/* Total row */}
            <TableRow className="border-t-2 border-foreground/40 font-bold">
              <TableCell />
              <TableCell className="uppercase text-xs tracking-wide">Gesamtsumme</TableCell>
              <TableCell />
              {isEinzel ? (
                <>
                  <TableCell />
                  <TableCell />
                  <TableCell className="text-right font-mono">{formatCurrency(footer?.ownerTotal != null ? rows.reduce((s, r) => s + (r.totalAmount || 0), 0) : total)}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(footer?.ownerTotal ?? total)}</TableCell>
                </>
              ) : (
                <>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">
                    {totalPrev > 0 ? formatCurrency(totalPrev) : "–"}
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(total)}</TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">
                    {totalPrev > 0 ? formatPercent(((total - totalPrev) / totalPrev) * 100) : "–"}
                  </TableCell>
                  {secondaryColumn && <TableCell className="text-right font-mono text-xs">{formatCurrency(total / 12)}</TableCell>}
                </>
              )}
              {renderActionCell && <TableCell />}
            </TableRow>

            {/* Footer-Zeilen Gesamtplan */}
            {!isEinzel && footer?.distributableTotal != null && (
              <TableRow className="text-xs">
                <TableCell />
                <TableCell className="italic text-muted-foreground">davon umlagefähig (*)</TableCell>
                <TableCell colSpan={colSpan - 3} />
                <TableCell className="text-right font-mono italic">{formatCurrency(footer.distributableTotal)}</TableCell>
                {renderActionCell && <TableCell />}
              </TableRow>
            )}
            {!isEinzel && footer?.totalAreaSqm != null && footer.totalAreaSqm > 0 && (
              <TableRow className="text-xs">
                <TableCell />
                <TableCell className="italic text-muted-foreground">EURO pro m² und Monat</TableCell>
                <TableCell colSpan={colSpan - 3} />
                <TableCell className="text-right font-mono italic">
                  {formatCurrency(total / footer.totalAreaSqm / 12)}
                </TableCell>
                {renderActionCell && <TableCell />}
              </TableRow>
            )}

            {/* Footer-Zeilen Einzelplan */}
            {isEinzel && footer?.ownerTotal != null && (
              <>
                <TableRow className="text-xs">
                  <TableCell />
                  <TableCell className="italic text-muted-foreground">Monatliche Belastung</TableCell>
                  <TableCell colSpan={colSpan - 3} />
                  <TableCell className="text-right font-mono italic font-semibold">
                    {formatCurrency(footer.ownerTotal / 12)}
                  </TableCell>
                  {renderActionCell && <TableCell />}
                </TableRow>
                {footer.ownerReserveTotal != null && footer.ownerAdvanceTotal != null && (
                  <TableRow className="text-xs">
                    <TableCell />
                    <TableCell colSpan={colSpan - 1} className="italic text-muted-foreground">
                      davon {formatCurrency(footer.ownerReserveTotal / 12)}/Mon. für Erhaltungsrücklage und {formatCurrency(footer.ownerAdvanceTotal / 12)}/Mon. für Vorschüsse zur Kostendeckung
                    </TableCell>
                    {renderActionCell && <TableCell />}
                  </TableRow>
                )}
              </>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
