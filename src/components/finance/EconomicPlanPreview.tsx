import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface OwnerPlan {
  name: string;
  unitNumber: string;
  meaValue: number;
  annualCosts: number;
  annualReserve: number;
  annualTotal: number;
  monthlyHausgeld: number;
  currentHausgeld: number;
}

interface BuildingInfo {
  name: string;
  address: string;
  manager_name: string | null;
}

interface EconomicPlanPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "gesamt" | "einzel";
  planYear: number;
  fiscalYear: number;
  building: BuildingInfo | null;
  categoryGroups: Record<string, { id: string; account_number: string; account_name: string; previousAmount: number }[]>;
  getPlannedAmount: (id: string, prev: number) => number;
  totalPrevious: number;
  totalPlanned: number;
  plannedReserve: number;
  totalWithReserve: number;
  ownerPlans: OwnerPlan[];
}

const fmt = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

const fmtDate = () => new Date().toLocaleDateString("de-DE");

function generateGesamtHtml(props: EconomicPlanPreviewProps): string {
  const { planYear, fiscalYear, building, categoryGroups, getPlannedAmount, totalPrevious, totalPlanned, plannedReserve, totalWithReserve } = props;

  const accountRows = Object.entries(categoryGroups).map(([category, accs]) => {
    const catHeader = `<tr><td colspan="5" style="background:#f5f5f5;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;padding:6px 8px;color:#666;">${category}</td></tr>`;
    const rows = accs.map((acc) => {
      const planned = getPlannedAmount(acc.id, acc.previousAmount);
      const delta = acc.previousAmount > 0 ? ((planned - acc.previousAmount) / acc.previousAmount) * 100 : 0;
      const deltaStr = delta !== 0 ? `<span style="color:${delta > 0 ? '#dc2626' : '#16a34a'}">${delta > 0 ? '+' : ''}${delta.toFixed(1)}%</span>` : '';
      return `<tr>
        <td style="font-family:'Courier New',monospace;font-size:10px;padding:4px 8px;">${acc.account_number}</td>
        <td style="padding:4px 8px;">${acc.account_name}</td>
        <td style="text-align:right;font-family:'Courier New',monospace;padding:4px 8px;">${fmt(acc.previousAmount)}</td>
        <td style="text-align:right;font-family:'Courier New',monospace;padding:4px 8px;">${fmt(planned)}</td>
        <td style="text-align:right;font-size:10px;padding:4px 8px;">${deltaStr}</td>
      </tr>`;
    }).join("");
    return catHeader + rows;
  }).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; margin: 20mm 15mm; color: #333; }
  h1 { font-size: 16px; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th, td { border-bottom: 1px solid #ddd; }
  th { background: #f0f0f0; font-weight: 600; text-align: left; padding: 6px 8px; }
  .total { font-weight: bold; border-top: 2px solid #333; }
  .footer { margin-top: 24px; font-size: 9px; color: #888; border-top: 1px solid #ddd; padding-top: 8px; }
</style></head><body>
  <div style="font-size:9px;color:#888;margin-bottom:16px;">${building?.manager_name || "Hausverwaltung"} · ${building?.address || ""}</div>
  <h1>Gesamtwirtschaftsplan ${planYear}</h1>
  <p><strong>${building?.name || ""}</strong> · ${building?.address || ""}</p>
  <p style="color:#666;">Basierend auf Ist-Werten ${fiscalYear}</p>

  <h2 style="font-size:13px;color:#555;margin-top:20px;">Kostenaufstellung</h2>
  <table>
    <tr><th style="width:80px">Konto</th><th>Bezeichnung</th><th style="text-align:right">Ist ${fiscalYear}</th><th style="text-align:right">Plan ${planYear}</th><th style="text-align:right;width:70px">Δ %</th></tr>
    ${accountRows}
    <tr class="total"><td></td><td style="padding:6px 8px;"><strong>Bewirtschaftungskosten gesamt</strong></td><td style="text-align:right;font-family:'Courier New',monospace;padding:6px 8px;"><strong>${fmt(totalPrevious)}</strong></td><td style="text-align:right;font-family:'Courier New',monospace;padding:6px 8px;"><strong>${fmt(totalPlanned)}</strong></td><td style="text-align:right;font-size:10px;padding:6px 8px;">${totalPrevious > 0 ? `<span style="color:${totalPlanned > totalPrevious ? '#dc2626' : '#16a34a'}">${((totalPlanned - totalPrevious) / totalPrevious * 100).toFixed(1)}%</span>` : ''}</td></tr>
  </table>

  <h2 style="font-size:13px;color:#555;margin-top:20px;">Erhaltungsrücklage</h2>
  <table>
    <tr><td style="padding:6px 8px;">Zuführung zur Erhaltungsrücklage gem. §19 Abs. 2 Nr. 4 WEG</td><td style="text-align:right;font-family:'Courier New',monospace;padding:6px 8px;font-weight:bold;">${fmt(plannedReserve)}</td></tr>
  </table>

  <table style="margin-top:12px;">
    <tr class="total"><td style="padding:8px;font-size:13px;"><strong>Gesamtbetrag Wirtschaftsplan ${planYear}</strong></td><td style="text-align:right;font-family:'Courier New',monospace;padding:8px;font-size:13px;"><strong>${fmt(totalWithReserve)}</strong></td></tr>
  </table>

  <div class="footer">Erstellt am ${fmtDate()} · ${building?.manager_name || "Hausverwaltung"}</div>
</body></html>`;
}

function generateEinzelHtml(props: EconomicPlanPreviewProps, owner?: OwnerPlan): string {
  const { planYear, building, ownerPlans, totalWithReserve } = props;

  if (owner) {
    const diff = owner.monthlyHausgeld - owner.currentHausgeld;
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; margin: 20mm 15mm; color: #333; }
  h1 { font-size: 16px; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th, td { padding: 5px 8px; border-bottom: 1px solid #ddd; }
  th { background: #f0f0f0; font-weight: 600; text-align: left; }
  .total { font-weight: bold; border-top: 2px solid #333; }
  .result { font-size: 14px; padding: 10px; margin: 12px 0; background: #f0f9ff; border-radius: 4px; border: 1px solid #bae6fd; }
  .footer { margin-top: 24px; font-size: 9px; color: #888; border-top: 1px solid #ddd; padding-top: 8px; }
</style></head><body>
  <div style="font-size:9px;color:#888;margin-bottom:16px;">${building?.manager_name || "Hausverwaltung"} · ${building?.address || ""}</div>
  <h1>Einzelwirtschaftsplan ${planYear}</h1>
  <p><strong>${building?.name || ""}</strong></p>
  <p>Eigentümer: <strong>${owner.name}</strong> · Einheit: ${owner.unitNumber} · MEA: ${owner.meaValue.toFixed(2)}</p>

  <table style="margin-top:16px;">
    <tr><th>Position</th><th style="text-align:right">Jahresbetrag</th><th style="text-align:right">Monatlich</th></tr>
    <tr><td>Anteil Bewirtschaftungskosten</td><td style="text-align:right;font-family:'Courier New',monospace;">${fmt(owner.annualCosts)}</td><td style="text-align:right;font-family:'Courier New',monospace;">${fmt(owner.annualCosts / 12)}</td></tr>
    <tr><td>Anteil Erhaltungsrücklage</td><td style="text-align:right;font-family:'Courier New',monospace;">${fmt(owner.annualReserve)}</td><td style="text-align:right;font-family:'Courier New',monospace;">${fmt(owner.annualReserve / 12)}</td></tr>
    <tr class="total"><td><strong>Hausgeld-Vorschuss gem. §28 WEG</strong></td><td style="text-align:right;font-family:'Courier New',monospace;"><strong>${fmt(owner.annualTotal)}</strong></td><td style="text-align:right;font-family:'Courier New',monospace;"><strong>${fmt(owner.monthlyHausgeld)}</strong></td></tr>
  </table>

  <div class="result">
    <strong>Monatliches Hausgeld: ${fmt(owner.monthlyHausgeld)}</strong>
    ${owner.currentHausgeld > 0 ? `<br><span style="font-size:11px;color:#666;">Bisheriges Hausgeld: ${fmt(owner.currentHausgeld)} · Differenz: <span style="color:${diff > 0 ? '#dc2626' : '#16a34a'}">${diff > 0 ? '+' : ''}${fmt(diff)}</span></span>` : ''}
  </div>

  <div class="footer">Erstellt am ${fmtDate()} · ${building?.manager_name || "Hausverwaltung"}</div>
</body></html>`;
  }

  // All owners overview
  const rows = ownerPlans.map((o) => {
    const diff = o.monthlyHausgeld - o.currentHausgeld;
    return `<tr>
      <td style="padding:4px 8px;">${o.unitNumber}</td>
      <td style="padding:4px 8px;font-weight:500;">${o.name}</td>
      <td style="text-align:right;font-family:'Courier New',monospace;padding:4px 8px;">${o.meaValue.toFixed(2)}</td>
      <td style="text-align:right;font-family:'Courier New',monospace;padding:4px 8px;">${fmt(o.annualCosts)}</td>
      <td style="text-align:right;font-family:'Courier New',monospace;padding:4px 8px;">${fmt(o.annualReserve)}</td>
      <td style="text-align:right;font-family:'Courier New',monospace;padding:4px 8px;">${fmt(o.annualTotal)}</td>
      <td style="text-align:right;font-family:'Courier New',monospace;padding:4px 8px;font-weight:bold;">${fmt(o.monthlyHausgeld)}</td>
      <td style="text-align:right;font-family:'Courier New',monospace;padding:4px 8px;font-size:10px;color:${diff > 0 ? '#dc2626' : diff < 0 ? '#16a34a' : '#666'}">${diff !== 0 ? `${diff > 0 ? '+' : ''}${fmt(diff)}` : '–'}</td>
    </tr>`;
  }).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; margin: 20mm 15mm; color: #333; }
  h1 { font-size: 16px; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th, td { border-bottom: 1px solid #ddd; }
  th { background: #f0f0f0; font-weight: 600; text-align: left; padding: 6px 8px; }
  .total { font-weight: bold; border-top: 2px solid #333; }
  .footer { margin-top: 24px; font-size: 9px; color: #888; border-top: 1px solid #ddd; padding-top: 8px; }
</style></head><body>
  <div style="font-size:9px;color:#888;margin-bottom:16px;">${building?.manager_name || "Hausverwaltung"} · ${building?.address || ""}</div>
  <h1>Einzelwirtschaftspläne ${planYear}</h1>
  <p><strong>${building?.name || ""}</strong> · Gesamtvolumen: ${fmt(totalWithReserve)}</p>

  <table style="margin-top:16px;">
    <tr><th>Einheit</th><th>Eigentümer</th><th style="text-align:right">MEA</th><th style="text-align:right">Bewirt./Jahr</th><th style="text-align:right">Rücklage/Jahr</th><th style="text-align:right">Gesamt/Jahr</th><th style="text-align:right">Hausgeld/Mon.</th><th style="text-align:right">Differenz</th></tr>
    ${rows}
    <tr class="total">
      <td style="padding:6px 8px;" colspan="3">Gesamt</td>
      <td style="text-align:right;font-family:'Courier New',monospace;padding:6px 8px;">${fmt(ownerPlans.reduce((s, o) => s + o.annualCosts, 0))}</td>
      <td style="text-align:right;font-family:'Courier New',monospace;padding:6px 8px;">${fmt(ownerPlans.reduce((s, o) => s + o.annualReserve, 0))}</td>
      <td style="text-align:right;font-family:'Courier New',monospace;padding:6px 8px;">${fmt(ownerPlans.reduce((s, o) => s + o.annualTotal, 0))}</td>
      <td style="text-align:right;font-family:'Courier New',monospace;padding:6px 8px;font-weight:bold;">${fmt(ownerPlans.reduce((s, o) => s + o.monthlyHausgeld, 0))}</td>
      <td></td>
    </tr>
  </table>

  <div class="footer">Erstellt am ${fmtDate()} · ${building?.manager_name || "Hausverwaltung"}</div>
</body></html>`;
}

export function EconomicPlanPreview(props: EconomicPlanPreviewProps) {
  const { open, onOpenChange, mode, ownerPlans } = props;
  const [selectedOwner, setSelectedOwner] = useState<string>("all");

  const html = mode === "gesamt"
    ? generateGesamtHtml(props)
    : selectedOwner === "all"
      ? generateEinzelHtml(props)
      : generateEinzelHtml(props, ownerPlans[Number(selectedOwner)]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-4">
            <span>{mode === "gesamt" ? "Gesamtwirtschaftsplan" : "Einzelwirtschaftsplan"} {props.planYear}</span>
            {mode === "einzel" && (
              <Select value={selectedOwner} onValueChange={setSelectedOwner}>
                <SelectTrigger className="w-[220px] h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Eigentümer</SelectItem>
                  {ownerPlans.map((o, i) => (
                    <SelectItem key={i} value={String(i)}>{o.unitNumber} – {o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 border rounded-md bg-white overflow-hidden">
          <iframe
            srcDoc={html}
            className="w-full h-full border-0"
            title="Wirtschaftsplan Vorschau"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
