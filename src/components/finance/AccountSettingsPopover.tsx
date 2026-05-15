import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { MoreHorizontal, Info } from "lucide-react";

const SETTLEMENT_SECTIONS = [
  { value: "none", label: "– Keine –" },
  { value: "income", label: "Einnahmen" },
  { value: "operating_distributable", label: "Umlagefähige Ausgaben" },
  { value: "operating_non_distributable", label: "Nicht umlagefähig" },
  { value: "heating_prepayment", label: "Heizkosten-Vorauszahlung (Durchlauf)" },
  { value: "accrual", label: "Abgrenzungen" },
  { value: "reserve", label: "Rücklage (IHR)" },
  { value: "reserve_withdrawal", label: "RL-Entnahme" },
  { value: "bank", label: "Bankkonto" },
  { value: "opening", label: "Eröffnungsbuchung" },
];

const SETTLEMENT_35A_TYPES = [
  { value: "none", label: "– Keine –" },
  { value: "dienste", label: "Haushaltsnahe Dienstleistungen" },
  { value: "handwerker", label: "Handwerkerleistungen" },
];

const VAT_OPTIONS = [
  { value: "0", label: "0 %" },
  { value: "7", label: "7 %" },
  { value: "19", label: "19 %" },
];

interface SettingsField {
  key: string;
  label: string;
  info: string;
  type: "checkbox" | "select" | "vat";
  options?: { value: string; label: string }[];
}

const SETTINGS_FIELDS: SettingsField[] = [
  {
    key: "default_vat_rate",
    label: "Standard-MwSt",
    info: "Der voreingestellte MwSt-Satz, wenn dieses Konto bei einer Buchung ausgewählt wird. Beispiel: Handwerkerrechnungen → 19%, Personenkonten → 0%.",
    type: "vat",
  },
  {
    key: "settlement_section",
    label: "Abrechnungssektion",
    info: "Bestimmt, in welchem Abschnitt der Jahresabrechnung dieses Konto erscheint. Beispiel: Hausmeisterkosten → 'Umlagefähige Ausgaben', Bankkonto → 'Bankkonto'. WICHTIG: 'Rücklage (IHR)' setzen für Konten der planmäßigen IHR-Zuführung (z. B. 1930) — sonst wird der Betrag im Wirtschaftsplan fälschlich als Vorschuss zur Kostendeckung statt als Erhaltungsrücklage ausgewiesen.",
    type: "select",
    options: SETTLEMENT_SECTIONS,
  },
  {
    key: "settlement_35a_type",
    label: "§35a Typ",
    info: "Art der §35a-Leistung für die Steuerbescheinigung. 'Dienstleistungen' = Reinigung, Gartenpflege, Hausmeister. 'Handwerkerleistungen' = Reparaturen, Wartung, Sanierung.",
    type: "select",
    options: SETTLEMENT_35A_TYPES,
  },
  {
    key: "is_distributable",
    label: "Verteilungsrelevant (VR)",
    info: "Wird in der Einzelabrechnung auf die Eigentümer verteilt. Beispiel: Müllgebühren nach MEA, Wasserkosten nach Verbrauch.",
    type: "checkbox",
  },
  {
    key: "is_billing_relevant",
    label: "Abrechnungsrelevant (Abr.)",
    info: "Erscheint in der Gesamtabrechnung / Einnahmen-Ausgaben-Übersicht. Beispiel: Alle Kosten- und Ertragskonten.",
    type: "checkbox",
  },
  {
    key: "is_heating_relevant",
    label: "Heizkosten-relevant (HK)",
    info: "Wird über die Heizkostenverordnung (HeizkV) abgerechnet. Beispiel: Gas, Fernwärme, Heizöl, Wartung Heizanlage.",
    type: "checkbox",
  },
  {
    key: "is_wirtschaftsplan_relevant",
    label: "Wirtschaftsplan-relevant (WP)",
    info: "Erscheint im Wirtschaftsplan/Budget für das kommende Jahr. Beispiel: Alle wiederkehrenden Kosten wie Versicherungen, Wartungen.",
    type: "checkbox",
  },
  {
    key: "is_asset_report_relevant",
    label: "Vermögensbericht-relevant (VB)",
    info: "Erscheint im Vermögensbericht (Vermögensstand zum Stichtag). Beispiel: Bankkonten, Rücklagen, Vorauszahlungen Versorger, Abgrenzungskonten 4100/4120/4160/4180.",
    type: "checkbox",
  },
  {
    key: "carry_forward_balance",
    label: "Saldovortrag (SV)",
    info: "Der Saldo wird ins nächste Geschäftsjahr übertragen. Beispiel: Bankkonten, Vorauszahlungskonten, Rücklagen.",
    type: "checkbox",
  },
  {
    key: "is_35a_relevant",
    label: "§35a relevant",
    info: "Enthält haushaltsnahe Dienstleistungen oder Handwerkerleistungen nach §35a EStG. 20% der Arbeitskosten können Eigentümer steuerlich geltend machen.",
    type: "checkbox",
  },
  {
    key: "is_reserve_funded",
    label: "Aus Rücklage finanziert (RL)",
    info: "Aufwandskonto, dessen Kosten aus der Erhaltungsrücklage bezahlt werden (z. B. 1920 Reparatur aus Rücklage). In der Einzelabrechnung erscheint der Betrag als Aufwand UND als Negativposten im IHR-Block — neutralisiert sich, sodass der Eigentümer nicht doppelt belastet wird.",
    type: "checkbox",
  },
];

interface AccountSettings {
  is_distributable: boolean;
  is_billing_relevant: boolean;
  is_heating_relevant: boolean;
  is_wirtschaftsplan_relevant: boolean;
  carry_forward_balance: boolean;
  is_35a_relevant: boolean;
  is_reserve_funded?: boolean;
  settlement_section: string | null;
  settlement_35a_type: string | null;
  default_vat_rate: number | null;
}

interface Props {
  account: AccountSettings;
  onUpdate: (field: string, value: any) => void;
  /** If true, changes are saved immediately per field (BuildingDistributionKeysTab style) */
  immediate?: boolean;
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help shrink-0" />
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-[280px] text-xs leading-relaxed">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function AccountSettingsPopover({ account, onUpdate }: Props) {
  const [open, setOpen] = useState(false);

  const getVal = (key: string) => {
    return (account as any)[key];
  };

  const activeCount = SETTINGS_FIELDS.filter(f => {
    if (f.type === "checkbox") return getVal(f.key) === true;
    if (f.key === "settlement_section") return !!account.settlement_section;
    if (f.key === "settlement_35a_type") return !!account.settlement_35a_type;
    return false;
  }).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 relative">
          <MoreHorizontal className="h-4 w-4" />
          {activeCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary text-[10px] text-primary-foreground flex items-center justify-center font-medium">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0" align="end" side="left">
        <div className="px-4 py-3 border-b">
          <p className="text-sm font-semibold">Kontoeinstellungen</p>
          <p className="text-xs text-muted-foreground">Flags für Abrechnung, Steuern & Berichte</p>
        </div>
        <div className="p-3 space-y-3 max-h-[400px] overflow-y-auto">
          {SETTINGS_FIELDS.map(field => (
            <div key={field.key}>
              {field.type === "checkbox" && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`setting-${field.key}`}
                    checked={!!getVal(field.key)}
                    onCheckedChange={c => onUpdate(field.key, !!c)}
                    className="h-4 w-4"
                  />
                  <Label htmlFor={`setting-${field.key}`} className="text-sm cursor-pointer flex-1">
                    {field.label}
                  </Label>
                  <InfoTooltip text={field.info} />
                </div>
              )}
              {field.type === "select" && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm flex-1">{field.label}</Label>
                    <InfoTooltip text={field.info} />
                  </div>
                  <Select
                    value={getVal(field.key) || "none"}
                    onValueChange={v => onUpdate(field.key, v === "none" ? null : v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options!.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {field.type === "vat" && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm flex-1">{field.label}</Label>
                    <InfoTooltip text={field.info} />
                  </div>
                  <Select
                    value={String(getVal(field.key) ?? 19)}
                    onValueChange={v => onUpdate(field.key, parseFloat(v))}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VAT_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
