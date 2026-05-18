import { useEffect, useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Wrench, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const formatCurrency = (amount: number | null) =>
  amount != null ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount) : "–";

export type Type35a = "dienste" | "handwerker";

export interface LineItemDetail {
  index: number;
  description: string;
  amount: number;
  is_35a: boolean;
  type_35a?: Type35a;
  is_custom?: boolean;
  /** Set true if this position was picked by AI from invoice line items */
  ai_picked?: boolean;
  /** Short justification from the AI, shown as tooltip */
  ai_reason?: string;
  _vat_meta?: { apply_vat: boolean; rate: number };
}

interface Props {
  is35aRelevant: boolean;
  onIs35aRelevantChange: (v: boolean) => void;

  invoiceLineItems: any[];
  lineItemsDetail: LineItemDetail[];
  onLineItemsDetailChange: (items: LineItemDetail[]) => void;

  onAmount35aChange: (val: string) => void;

  /** Default VAT rate from the invoice/booking (in %) */
  defaultVatRate: number;
  /** Default §35a type from the linked account */
  defaultType35a?: Type35a;
  /** Currently stored amount_35a (gross), used for fallback custom item if list is empty */
  currentAmount35a?: number;

  toggleIdSuffix?: string;
}

const META_INDEX = -1;

function getVatMeta(items: LineItemDetail[]): { apply_vat: boolean; rate: number } | null {
  const meta = items.find(i => i.index === META_INDEX);
  return meta?._vat_meta ?? null;
}

function setVatMeta(items: LineItemDetail[], meta: { apply_vat: boolean; rate: number }): LineItemDetail[] {
  const without = items.filter(i => i.index !== META_INDEX);
  return [...without, { index: META_INDEX, description: "_vat_meta", amount: 0, is_35a: false, _vat_meta: meta }];
}

function effectiveItems(items: LineItemDetail[]): LineItemDetail[] {
  return items.filter(i => i.index !== META_INDEX);
}

export function calc35aGross(items: LineItemDetail[], defaultVatRate: number): number {
  const meta = getVatMeta(items);
  const applyVat = meta?.apply_vat ?? defaultVatRate > 0;
  const rate = meta?.rate ?? defaultVatRate;
  const selected = effectiveItems(items).filter(i => i.is_35a);
  const net = selected.reduce((s, d) => s + (parseFloat(String(d.amount)) || 0), 0);
  return applyVat && rate > 0 ? net * (1 + rate / 100) : net;
}

export function Section35aEditor({
  is35aRelevant,
  onIs35aRelevantChange,
  invoiceLineItems,
  lineItemsDetail,
  onLineItemsDetailChange,
  onAmount35aChange,
  defaultVatRate,
  defaultType35a = "dienste",
  currentAmount35a = 0,
  toggleIdSuffix = "",
}: Props) {
  const meta = getVatMeta(lineItemsDetail);
  const applyVat = meta?.apply_vat ?? defaultVatRate > 0;
  const vatRate = meta?.rate ?? defaultVatRate;

  const items = effectiveItems(lineItemsDetail);

  // Mount fallback: if §35a is active, no items selected, and no OCR positions exist,
  // create a custom entry from currentAmount35a so the user always sees a valid selection.
  useEffect(() => {
    if (!is35aRelevant) return;
    if (items.length > 0) return;
    if ((invoiceLineItems?.length || 0) > 0) return;
    if (!currentAmount35a || currentAmount35a <= 0) return;
    const factor = applyVat && vatRate > 0 ? 1 + vatRate / 100 : 1;
    const net = currentAmount35a / factor;
    const fallback: LineItemDetail[] = [{
      index: 0,
      description: "Lohnanteil lt. KI-Vorschlag",
      amount: parseFloat(net.toFixed(2)),
      is_35a: true,
      type_35a: defaultType35a,
      is_custom: true,
    }];
    const withMeta = meta ? setVatMeta(fallback, meta) : fallback;
    onLineItemsDetailChange(withMeta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [is35aRelevant]);
  const customItems = items.filter(i => i.is_custom);
  const nextCustomIndex = invoiceLineItems.length + customItems.length;

  const update = (next: LineItemDetail[]) => {
    onLineItemsDetailChange(next);
    const gross = calc35aGross(next, defaultVatRate);
    onAmount35aChange(gross.toFixed(2));
    const anySelected = effectiveItems(next).some(i => i.is_35a);
    if (anySelected && !is35aRelevant) onIs35aRelevantChange(true);
  };

  const setItemField = (idx: number, patch: Partial<LineItemDetail>) => {
    const exists = items.find(i => i.index === idx);
    let nextItems: LineItemDetail[];
    if (exists) {
      nextItems = items.map(i => (i.index === idx ? { ...i, ...patch } : i));
    } else {
      nextItems = [...items, { index: idx, description: "", amount: 0, is_35a: false, ...patch } as LineItemDetail];
    }
    const withMeta = meta ? setVatMeta(nextItems, meta) : nextItems;
    update(withMeta);
  };

  const toggleSelect = (i: number, item: any, checked: boolean) => {
    const existing = items.find(d => d.index === i);
    let nextItems: LineItemDetail[];
    if (checked) {
      if (existing) {
        nextItems = items.map(d => (d.index === i ? { ...d, is_35a: true, type_35a: d.type_35a ?? defaultType35a } : d));
      } else {
        nextItems = [
          ...items,
          {
            index: i,
            description: item.description || item.name || `Position ${i + 1}`,
            amount: parseFloat(item.amount ?? item.total ?? 0) || 0,
            is_35a: true,
            type_35a: defaultType35a,
          },
        ];
      }
    } else {
      const target = items.find(d => d.index === i);
      if (target?.is_custom) {
        nextItems = items.map(d => (d.index === i ? { ...d, is_35a: false } : d));
      } else {
        nextItems = items.filter(d => d.index !== i);
      }
    }
    const withMeta = meta ? setVatMeta(nextItems, meta) : nextItems;
    update(withMeta);
  };

  const addCustom = () => {
    const newItem: LineItemDetail = {
      index: nextCustomIndex,
      description: "",
      amount: 0,
      is_35a: true,
      type_35a: defaultType35a,
      is_custom: true,
    };
    const nextItems = [...items, newItem];
    const withMeta = meta ? setVatMeta(nextItems, meta) : nextItems;
    update(withMeta);
  };

  const removeCustom = (idx: number) => {
    const nextItems = items.filter(d => d.index !== idx);
    const withMeta = meta ? setVatMeta(nextItems, meta) : nextItems;
    update(withMeta);
  };

  const setVat = (patch: { apply_vat?: boolean; rate?: number }) => {
    const newMeta = { apply_vat: patch.apply_vat ?? applyVat, rate: patch.rate ?? vatRate };
    update(setVatMeta(items, newMeta));
  };

  const totals = useMemo(() => {
    const selected = items.filter(i => i.is_35a);
    const factor = applyVat && vatRate > 0 ? 1 + vatRate / 100 : 1;
    const dienste = selected
      .filter(i => (i.type_35a ?? defaultType35a) === "dienste")
      .reduce((s, i) => s + (parseFloat(String(i.amount)) || 0), 0) * factor;
    const handwerker = selected
      .filter(i => (i.type_35a ?? defaultType35a) === "handwerker")
      .reduce((s, i) => s + (parseFloat(String(i.amount)) || 0), 0) * factor;
    const netSum = selected.reduce((s, i) => s + (parseFloat(String(i.amount)) || 0), 0);
    return { dienste, handwerker, total: dienste + handwerker, netSum };
  }, [items, applyVat, vatRate, defaultType35a]);

  const renderItemRow = (i: number, item: any, isCustom: boolean) => {
    const detail = items.find(d => d.index === i);
    const isSelected = !!detail?.is_35a;
    const type = detail?.type_35a ?? defaultType35a;
    const description = detail?.description ?? (item?.description || item?.name || `Position ${i + 1}`);
    const amount = detail?.amount ?? parseFloat(item?.amount ?? item?.total ?? 0) ?? 0;

    return (
      <div
        key={i}
        className={cn(
          "rounded-md border p-2 text-xs space-y-2",
          isSelected && "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-700"
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Checkbox checked={isSelected} onCheckedChange={(v) => toggleSelect(i, item, !!v)} />
          {detail?.ai_picked && (
            <span
              title={detail.ai_reason || "Von KI als §35a-relevant erkannt"}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border border-violet-300 dark:border-violet-700 shrink-0"
            >
              <Sparkles className="h-2.5 w-2.5" /> KI
            </span>
          )}
          {isSelected ? (
            <Input
              value={description}
              onChange={(e) => setItemField(i, { description: e.target.value })}
              placeholder="Beschreibung"
              className="h-7 text-xs flex-1 min-w-0"
            />
          ) : (
            <span className="flex-1 min-w-0 truncate">{description}</span>
          )}
          {isSelected ? (
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setItemField(i, { amount: parseFloat(e.target.value) || 0 })}
              className="h-7 text-xs w-24 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          ) : (
            <span className="font-medium shrink-0 pl-1 tabular-nums">{formatCurrency(amount || null)}</span>
          )}
          {isCustom && (
            <Button type="button" size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => removeCustom(i)}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          )}
        </div>
        {isSelected && (
          <div className="flex items-center gap-1 pl-6">
            <button
              type="button"
              onClick={() => setItemField(i, { type_35a: "handwerker" })}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors",
                type === "handwerker"
                  ? "bg-blue-100 dark:bg-blue-950/40 border-blue-400 text-blue-700 dark:text-blue-300"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              <Wrench className="h-3 w-3" /> Handwerker
            </button>
            <button
              type="button"
              onClick={() => setItemField(i, { type_35a: "dienste" })}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors",
                type === "dienste"
                  ? "bg-emerald-100 dark:bg-emerald-950/40 border-emerald-400 text-emerald-700 dark:text-emerald-300"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              <Sparkles className="h-3 w-3" /> Dienstleistung
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 w-full min-w-0">
      <div className="flex items-center gap-3">
        <Checkbox id={`35a-toggle-${toggleIdSuffix}`} checked={is35aRelevant} onCheckedChange={v => onIs35aRelevantChange(!!v)} />
        <label htmlFor={`35a-toggle-${toggleIdSuffix}`} className="text-sm font-medium">§35a-relevant</label>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">Positionen</label>
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={addCustom}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Position hinzufügen
          </Button>
        </div>
        <div className="space-y-1.5 max-h-[40vh] overflow-y-auto overflow-x-hidden">
          {invoiceLineItems.map((item, i) => renderItemRow(i, item, false))}
          {customItems.map(c => renderItemRow(c.index, c, true))}
          {invoiceLineItems.length === 0 && customItems.length === 0 && (
            <p className="text-xs text-muted-foreground italic py-2">Keine Positionen vorhanden – mit „Position hinzufügen" anlegen.</p>
          )}
        </div>
      </div>

      {/* MwSt – kompakt einzeilig */}
      <div className="flex items-center justify-between gap-3 rounded-md border p-2 bg-muted/30">
        <label className="text-xs font-medium">MwSt. auf Lohnanteil</label>
        <Select
          value={applyVat ? String(vatRate) : "off"}
          onValueChange={(v) => {
            if (v === "off") setVat({ apply_vat: false });
            else setVat({ apply_vat: true, rate: parseFloat(v) || 0 });
          }}
        >
          <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="off">Keine MwSt.</SelectItem>
            <SelectItem value="0">0%</SelectItem>
            <SelectItem value="7">7%</SelectItem>
            <SelectItem value="19">19%</SelectItem>
            {applyVat && ![0, 7, 19].includes(vatRate) && (
              <SelectItem value={String(vatRate)}>{vatRate}% (Rechnung)</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border p-3 space-y-1 bg-primary/5">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1 text-blue-700 dark:text-blue-300"><Wrench className="h-3 w-3" /> Handwerker</span>
          <span className="font-semibold tabular-nums">{formatCurrency(totals.handwerker)}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300"><Sparkles className="h-3 w-3" /> Dienstleistung</span>
          <span className="font-semibold tabular-nums">{formatCurrency(totals.dienste)}</span>
        </div>
        <div className="flex items-center justify-between pt-1 border-t">
          <span className="text-xs font-medium">Lohnanteil gesamt</span>
          <span className="text-base font-bold tabular-nums">{formatCurrency(totals.total)}</span>
        </div>
        {(() => {
          const selectedCount = items.filter(i => i.is_35a).length;
          const totalPositions = (invoiceLineItems?.length || 0) + customItems.length;
          if (selectedCount > 0 && totalPositions > 0) {
            return (
              <p className="text-[10px] text-muted-foreground">
                Aus {selectedCount} von {totalPositions} Position{totalPositions === 1 ? "" : "en"}
                {applyVat && vatRate > 0 && totals.netSum > 0 ? ` · netto ${formatCurrency(totals.netSum)} + ${vatRate}% MwSt.` : ""}
              </p>
            );
          }
          if (applyVat && vatRate > 0 && totals.netSum > 0) {
            return <p className="text-[10px] text-muted-foreground">Netto {formatCurrency(totals.netSum)} + {vatRate}% MwSt.</p>;
          }
          return null;
        })()}
      </div>
    </div>
  );
}
