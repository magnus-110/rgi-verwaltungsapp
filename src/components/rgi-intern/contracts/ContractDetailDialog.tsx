// Vertragsdetails auf einen Blick.
//
// Der Wizard ist zum Erfassen da und dafür in Schritte zerlegt. Zum
// Nachschlagen — „was steht bei diesem Objekt eigentlich drin?“ —
// braucht es das Gegenteil: alles auf einer Seite, nach Themen
// sortiert, ohne Eingabefelder.

import type { ReactNode } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Building2, CalendarClock, Wallet, ListPlus, Repeat, ShieldCheck,
  StickyNote, FileText, AlertTriangle, Pencil, Users, Car, Store, Boxes,
  Gavel, Clock,
} from "lucide-react";
import {
  type ContractWithDetails, type ContractFee, type FeeBasis,
  CONTRACT_STATUS_LABEL, FEE_BASIS_LABEL, FEE_DEBTOR_LABEL, FEE_UNIT_KIND_LABEL,
  contractWarnings, formatDate, formatEur, isPercentBasis, monthlyNet, monthsUntil, toNet,
} from "@/types/rgiContracts";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contract: ContractWithDetails | null;
  onEdit: (c: ContractWithDetails) => void;
}

const BASE_BASES: FeeBasis[] = ["unit_month", "monthly_flat"];

export function ContractDetailDialog({ open, onOpenChange, contract, onEdit }: Props) {
  if (!contract) return null;

  const c = contract;
  const fees = (c.fees ?? []).filter((f) => f.is_active);
  const baseFees = fees.filter((f) => BASE_BASES.includes(f.basis));
  const extraFees = fees.filter((f) => !BASE_BASES.includes(f.basis));
  const monthly = monthlyNet(c.fees);
  const apartments = c.units_apartment ?? 0;
  const perApartment = apartments > 0 ? monthly / apartments : null;
  const months = monthsUntil(c.appointed_until);
  const warnings = contractWarnings(c);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-3 text-left">
            <span className="rounded-md bg-primary/10 text-primary p-2 shrink-0">
              <Building2 className="w-5 h-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-lg">{c.building?.name ?? "Ohne Objekt"}</span>
              <span className="block text-xs font-normal text-muted-foreground mt-0.5">
                {[
                  c.building?.building_code,
                  c.building?.city,
                  c.building?.management_mode === "weg" ? "WEG-Verwaltung" : "Mietverwaltung",
                  c.label,
                ].filter(Boolean).join(" · ")}
              </span>
            </span>
            <Badge variant={c.status === "active" ? "default" : "secondary"} className="ml-auto shrink-0">
              {CONTRACT_STATUS_LABEL[c.status]}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Was fehlt oder sich widerspricht */}
        {warnings.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3">
            <div className="flex items-center gap-2 text-sm font-medium mb-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Was noch zu klären ist
            </div>
            <ul className="space-y-0.5">
              {warnings.map((w, i) => (
                <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                  <span className={w.level === "crit" ? "text-destructive" : "text-amber-600"}>•</span>
                  {w.text}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Kennzahlen */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Kpi label="netto / Monat" value={formatEur(monthly)} accent />
          <Kpi label="netto / Jahr" value={formatEur(monthly * 12)} accent />
          <Kpi label="je Wohneinheit" value={perApartment != null ? formatEur(perApartment) : "—"} />
          <Kpi
            label="Bestellung"
            value={
              c.appointed_until
                ? months !== null && months < 0 ? "abgelaufen" : `noch ${months} Mon.`
                : "unbefristet"
            }
          />
        </div>

        {/* Bestellung */}
        <Section icon={CalendarClock} title="Bestellung">
          <Row label="Bestellt von" value={formatDate(c.appointed_from)} />
          <Row label="Bestellt bis" value={c.appointed_until ? formatDate(c.appointed_until) : "unbefristet"} />
          <Row label="Beschluss vom" value={formatDate(c.resolution_date)} />
          <Row label="Fundstelle" value={c.resolution_ref || "—"} />
        </Section>

        {/* Einheiten */}
        <Section icon={Boxes} title="Einheiten laut Vertrag">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <UnitBox icon={Users} label="Wohnungen" value={c.units_apartment} />
            <UnitBox icon={Store} label="Teileigentum" value={c.units_commercial} />
            <UnitBox icon={Car} label="Stellplätze" value={c.units_parking} />
            <UnitBox icon={Boxes} label="Sonstige" value={c.units_other} />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {c.parking_billed_separately
              ? "Garagen und Stellplätze werden separat vergütet."
              : "Garagen und Stellplätze sind im Satz je Wohneinheit enthalten."}
          </p>
        </Section>

        {/* Grundvergütung */}
        <Section icon={Wallet} title="Grundvergütung">
          {baseFees.length === 0 ? (
            <Empty>Keine Grundvergütung erfasst.</Empty>
          ) : (
            <div className="divide-y rounded-md border">
              {baseFees.map((f) => {
                const net = toNet(Number(f.amount ?? 0), f.is_gross, Number(f.vat_rate));
                const count = f.basis === "unit_month" ? Number(f.quantity ?? 0) : 1;
                return (
                  <div key={f.id} className="px-3 py-2 flex items-center gap-3 text-sm">
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">{f.label}</span>
                      <span className="block text-xs text-muted-foreground">
                        {f.unit_kind ? `${FEE_UNIT_KIND_LABEL[f.unit_kind]} · ` : ""}
                        {f.basis === "unit_month"
                          ? `${count} × ${formatEur(net)} je Monat`
                          : `${formatEur(net)} je Monat`}
                        {f.is_gross ? " (brutto vereinbart)" : ""}
                      </span>
                    </span>
                    <span className="font-mono whitespace-nowrap">{formatEur(net * count)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* Zusatzleistungen */}
        <Section icon={ListPlus} title="Zusatzleistungen" count={extraFees.length}>
          {extraFees.length === 0 ? (
            <Empty>Keine Zusatzleistungen vereinbart.</Empty>
          ) : (
            <div className="divide-y rounded-md border">
              {extraFees.map((f) => (
                <div key={f.id} className="px-3 py-2 flex items-start gap-3 text-sm">
                  <span className="flex-1 min-w-0">
                    <span className="block">{f.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {[
                        FEE_BASIS_LABEL[f.basis],
                        f.debtor !== "community" ? `zahlt: ${FEE_DEBTOR_LABEL[f.debtor]}` : null,
                        ...limitNotes(f),
                      ].filter(Boolean).join(" · ")}
                    </span>
                    {f.note && (
                      <span className="block text-xs text-muted-foreground italic mt-0.5">{f.note}</span>
                    )}
                  </span>
                  <span className="font-mono whitespace-nowrap text-right">
                    {isPercentBasis(f.basis)
                      ? `${Number(f.percent ?? 0).toLocaleString("de-DE")} %`
                      : formatEur(toNet(Number(f.amount ?? 0), f.is_gross, Number(f.vat_rate)))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Zahlung und Index */}
        <Section icon={Repeat} title="Zahlung und Indexanpassung">
          <Row label="Zahlungsintervall" value={c.payment_interval || "—"} />
          <Row
            label="Entnahme vom Objektkonto"
            value={c.self_debit_day ? `${c.self_debit_day}. Werktag` : "—"}
          />
          <Row
            label="Indexbasis"
            value={
              c.index_base_month
                ? `${formatDate(c.index_base_month)}${c.index_base_value ? ` · Stand ${c.index_base_value}` : ""}`
                : "keine Indexklausel erfasst"
            }
          />
          <Row
            label="Sperrfrist"
            value={c.index_lock_months ? `${c.index_lock_months} Monate` : "—"}
          />
          <Row label="Zuletzt angepasst" value={formatDate(c.index_last_applied)} />
        </Section>

        {/* Freigabe und Kündigung */}
        <Section icon={ShieldCheck} title="Freigabegrenze und Beendigung">
          <Row
            label="Freigabegrenze Eigenaufträge"
            value={c.approval_limit_amount != null ? formatEur(Number(c.approval_limit_amount)) : "—"}
          />
          {c.approval_limit_note && <Note>{c.approval_limit_note}</Note>}
          <Row label="Kündigung / Abberufung" value={c.termination_note ? "" : "—"} />
          {c.termination_note && <Note icon={Gavel}>{c.termination_note}</Note>}
        </Section>

        {/* Sonstiges */}
        {(c.notes || c.template_version || c.dms_file_id) && (
          <Section icon={StickyNote} title="Sonstiges">
            {c.template_version && <Row label="Vertragsfassung" value={c.template_version} />}
            {c.dms_file_id && (
              <Row label="Dokument" value="im DMS des Objekts hinterlegt" icon={FileText} />
            )}
            {c.notes && <Note>{c.notes}</Note>}
          </Section>
        )}

        <Separator />
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Zuletzt geändert {formatDate(c.updated_at?.slice(0, 10))}
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Schließen</Button>
            <Button onClick={() => onEdit(c)} className="gap-1.5">
              <Pencil className="w-4 h-4" />Bearbeiten
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------
// Bausteine der Darstellung
// ---------------------------------------------------------------

function Section({
  icon: Icon, title, count, children,
}: { icon: any; title: string; count?: number; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
        <h3 className="text-sm font-semibold">{title}</h3>
        {count !== undefined && count > 0 && (
          <Badge variant="secondary" className="h-5 px-1.5 text-[11px] font-normal">{count}</Badge>
        )}
      </div>
      <div className="pl-6 space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value, icon: Icon }: { label: string; value: string; icon?: any }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline gap-3 text-sm">
      <span className="text-muted-foreground w-[210px] shrink-0">{label}</span>
      <span className="flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
        {value}
      </span>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-md border p-2.5">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-base font-semibold tabular-nums mt-0.5 ${accent ? "text-primary" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function UnitBox({ icon: Icon, label, value }: { icon: any; label: string; value: number | null }) {
  return (
    <div className="rounded-md border px-2.5 py-2 flex items-center gap-2">
      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <div className="text-sm font-medium tabular-nums">{value ?? "—"}</div>
        <div className="text-[11px] text-muted-foreground truncate">{label}</div>
      </div>
    </div>
  );
}

function Note({ children, icon: Icon }: { children: ReactNode; icon?: any }) {
  return (
    <div className="flex gap-2 text-xs text-muted-foreground bg-muted/40 rounded-md px-2.5 py-2 mt-1">
      {Icon && <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
      <span className="whitespace-pre-wrap">{children}</span>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="text-sm text-muted-foreground">{children}</div>;
}

/** Schwellen, Mindest- und Höchstbeträge als Klartext hinter der Basis. */
function limitNotes(f: ContractFee): string[] {
  const out: string[] = [];
  if (f.threshold) out.push(`ab ${formatEur(Number(f.threshold))}`);
  if (f.tier_from != null || f.tier_to != null) {
    out.push(
      f.tier_to
        ? `Stufe ${formatEur(Number(f.tier_from ?? 0))} bis ${formatEur(Number(f.tier_to))}`
        : `Stufe ab ${formatEur(Number(f.tier_from ?? 0))}`,
    );
  }
  if (f.min_amount) out.push(`mindestens ${formatEur(Number(f.min_amount))}`);
  if (f.max_amount) out.push(`höchstens ${formatEur(Number(f.max_amount))}`);
  if (f.max_count) out.push(`höchstens ${f.max_count} ×`);
  if (f.halved_if_supervised) out.push("halbiert bei externer Objektüberwachung");
  return out;
}
