// Zwei kleine Dialoge des Abrechnungsblatts:
//
//  BillingRowDialog   – freie Position anlegen oder eine Zeile im
//                       Detail bearbeiten
//  PercentBaseDialog  – Bemessungsgrundlage für prozentuale
//                       Bausteine eingeben (Versicherungsschaden,
//                       Baubetreuung mit Staffel) und den Betrag
//                       daraus ausrechnen lassen

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator } from "lucide-react";
import type { BillingRow } from "@/types/rgiBilling";
import { computePercentFee, computeTieredFee } from "@/types/rgiBilling";
import { type ContractFee, type FeeDebtor, FEE_DEBTOR_LABEL, formatEur } from "@/types/rgiContracts";

// ---------------------------------------------------------------
// Freie Position / Zeile bearbeiten
// ---------------------------------------------------------------

interface RowDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** null = neue freie Position */
  row: BillingRow | null;
  contractId: string | null;
  onSave: (row: BillingRow) => void;
}

export function BillingRowDialog({ open, onOpenChange, row, contractId, onSave }: RowDialogProps) {
  const [label, setLabel] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState("Stück");
  const [price, setPrice] = useState(0);
  const [vat, setVat] = useState(19);
  const [debtor, setDebtor] = useState<FeeDebtor>("community");
  const [occurredOn, setOccurredOn] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setLabel(row?.label ?? "");
    setQuantity(row?.quantity ?? 1);
    setUnit(row?.unit ?? "Stück");
    setPrice(row?.unitPriceNet ?? 0);
    setVat(row?.vatRate ?? 19);
    setDebtor(row?.debtor ?? "community");
    setOccurredOn(row?.occurredOn ?? new Date().toISOString().slice(0, 10));
    setNote(row?.hint ?? "");
  }, [open, row]);

  const net = Math.round(quantity * price * 100) / 100;

  const save = () => {
    if (!label.trim()) return;
    onSave({
      key: row?.key ?? `manual:${Date.now()}`,
      origin: row?.origin ?? "manual",
      eventId: row?.eventId ?? null,
      status: row?.status ?? "suggested",
      label: label.trim(),
      quantity,
      unit,
      unitPriceNet: price,
      vatRate: vat,
      debtor,
      feeId: row?.feeId ?? null,
      contractId: row?.contractId ?? contractId,
      periodKey: row?.periodKey ?? null,
      sourceKind: row?.sourceKind ?? "manual",
      sourceId: row?.sourceId ?? null,
      occurredOn,
      hint: note.trim() || undefined,
      timeEntryIds: row?.timeEntryIds,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{row ? "Position bearbeiten" : "Freie Position"}</DialogTitle>
          <DialogDescription>
            Alle Werte sind frei überschreibbar — auch bei Positionen, die aus dem Vertrag stammen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Beschreibung</Label>
            <Textarea rows={2} value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder="Was wird berechnet?" />
          </div>

          <div className="grid grid-cols-4 gap-2">
            <div>
              <Label className="text-xs">Menge</Label>
              <Input type="number" step="0.01" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">Einheit</Label>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">€ netto</Label>
              <Input type="number" step="0.01" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">USt</Label>
              <Select value={String(vat)} onValueChange={(v) => setVat(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0 %</SelectItem>
                  <SelectItem value="7">7 %</SelectItem>
                  <SelectItem value="19">19 %</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Wer zahlt</Label>
              <Select value={debtor} onValueChange={(v) => setDebtor(v as FeeDebtor)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(FEE_DEBTOR_LABEL) as FeeDebtor[]).map((d) => (
                    <SelectItem key={d} value={d}>{FEE_DEBTOR_LABEL[d]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Angefallen am</Label>
              <Input type="date" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} />
            </div>
          </div>

          <div>
            <Label className="text-xs">Notiz (nur intern)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="z. B. Vertragsstelle oder Beschluss" />
          </div>

          <div className="flex justify-between items-center pt-2 border-t text-sm">
            <span className="text-muted-foreground">Betrag netto</span>
            <span className="font-mono font-semibold text-base">{formatEur(net)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={save} disabled={!label.trim()}>Übernehmen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------
// Bemessungsgrundlage für Prozentbausteine
// ---------------------------------------------------------------

interface PercentDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  row: BillingRow | null;
  fees: ContractFee[];
  onApply: (amount: number, note: string) => void;
}

export function PercentBaseDialog({ open, onOpenChange, row, fees, onApply }: PercentDialogProps) {
  const [base, setBase] = useState(0);
  const [supervised, setSupervised] = useState(false);

  useEffect(() => {
    if (open) { setBase(0); setSupervised(false); }
  }, [open]);

  // Alle Stufen desselben Bausteintyps zusammensuchen.
  const relevant = useMemo(() => {
    if (!row?.feeId) return [];
    const self = fees.find((f) => f.id === row.feeId);
    if (!self) return [];
    return fees.filter((f) => f.fee_type === self.fee_type && f.is_active);
  }, [fees, row]);

  const isTiered = relevant.length > 1 || relevant.some((f) => f.tier_from != null || f.tier_to != null);

  const result = useMemo(() => {
    if (!relevant.length) return { amount: 0, steps: [] as string[] };
    return isTiered
      ? computeTieredFee(relevant, base, supervised)
      : computePercentFee(relevant[0], base);
  }, [relevant, base, supervised, isTiered]);

  const baseLabel = relevant[0]?.basis === "claim_payout"
    ? "Entschädigungssumme"
    : relevant[0]?.basis === "net_rent_percent"
      ? "Nettomiete"
      : "Bruttobausumme";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="w-4 h-4" />Betrag berechnen
          </DialogTitle>
          <DialogDescription>{row?.label}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">{baseLabel} in €</Label>
            <Input
              type="number" step="0.01" autoFocus
              value={base || ""}
              onChange={(e) => setBase(Number(e.target.value))}
              placeholder="0,00"
            />
          </div>

          {relevant.some((f) => f.halved_if_supervised) && (
            <label className="flex items-center justify-between gap-3 text-sm border rounded-md px-3 py-2 cursor-pointer">
              <span>
                Ein Architekt oder Sonderfachmann führt die Objektüberwachung
                <span className="block text-xs text-muted-foreground">halbiert die Vergütung laut Vertrag</span>
              </span>
              <Switch checked={supervised} onCheckedChange={setSupervised} />
            </label>
          )}

          {base > 0 && (
            <div className="rounded-md border bg-muted/40 p-3 space-y-1">
              {result.steps.map((s, i) => (
                <div key={i} className="text-xs text-muted-foreground font-mono">{s}</div>
              ))}
              <div className="flex justify-between items-center pt-2 mt-1 border-t text-sm">
                <span className="text-muted-foreground">Honorar netto</span>
                <span className="font-mono font-semibold text-base">{formatEur(result.amount)}</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button
            disabled={!base || result.amount <= 0}
            onClick={() => onApply(result.amount, `${baseLabel} ${formatEur(base)}`)}
          >
            Übernehmen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
