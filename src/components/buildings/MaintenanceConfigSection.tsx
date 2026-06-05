import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ChevronDown, ChevronRight, Settings2, Wrench, ShieldAlert, CalendarIcon } from "lucide-react";
import { MAINTENANCE_TYPES, formatInterval, formatLeadTime, type MaintenanceType } from "@/lib/maintenanceTypes";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

export interface MaintenanceConfig {
  maintenance_type: string;
  is_active: boolean;
  custom_interval_months?: number;
  custom_lead_time_days?: number;
  last_maintenance_date?: string;
}

interface MaintenanceConfigSectionProps {
  configs: MaintenanceConfig[];
  onChange: (configs: MaintenanceConfig[]) => void;
}

export const MaintenanceConfigSection = ({ configs, onChange }: MaintenanceConfigSectionProps) => {
  // Always open, no collapsible state needed
  const [editingType, setEditingType] = useState<string | null>(null);

  const getConfig = (key: string): MaintenanceConfig => {
    return configs.find(c => c.maintenance_type === key) || {
      maintenance_type: key,
      is_active: false,
    };
  };

  const toggleType = (key: string, checked: boolean) => {
    const existing = configs.filter(c => c.maintenance_type !== key);
    if (checked) {
      existing.push({ maintenance_type: key, is_active: true });
    }
    onChange(existing);
  };

  const updateConfig = (key: string, updates: Partial<MaintenanceConfig>) => {
    const exists = configs.some(c => c.maintenance_type === key);
    if (!exists) return;
    const updated = configs.map(c =>
      c.maintenance_type === key ? { ...c, ...updates } : c
    );
    onChange(updated);
  };

  const categoryA = MAINTENANCE_TYPES.filter(t => t.category === 'A');
  const categoryB = MAINTENANCE_TYPES.filter(t => t.category === 'B');

  const renderTypeRow = (type: MaintenanceType) => {
    const config = getConfig(type.key);
    const isEditing = editingType === type.key;
    const effectiveInterval = config.custom_interval_months || type.defaultIntervalMonths;
    const effectiveLeadTime = config.custom_lead_time_days || type.defaultLeadTimeDays;
    const lastDate = config.last_maintenance_date ? new Date(config.last_maintenance_date) : undefined;

    return (
      <div key={type.key} className="py-2">
        <div className="flex items-start gap-3">
          <Checkbox
            id={`maint-${type.key}`}
            checked={config.is_active}
            onCheckedChange={(checked) => toggleType(type.key, !!checked)}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Label htmlFor={`maint-${type.key}`} className="cursor-pointer font-medium text-sm">
                {type.label}
              </Label>
              <span className="text-xs text-muted-foreground">
                ({formatInterval(effectiveInterval)} · {formatLeadTime(effectiveLeadTime)} Vorlauf)
              </span>
              {config.is_active && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 opacity-40 hover:opacity-100"
                  onClick={(e) => {
                    e.preventDefault();
                    setEditingType(isEditing ? null : type.key);
                  }}
                  title="Intervall anpassen"
                >
                  <Settings2 className="h-3 w-3" />
                </Button>
              )}
            </div>
            {type.seasonal && (
              <p className="text-xs text-muted-foreground mt-0.5">
                ⚠ Nur Oktober/Februar (Vogelschutz)
              </p>
            )}

            {/* Last maintenance date picker */}
            {config.is_active && (
              <div className="mt-1.5">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-7 text-xs gap-1.5 font-normal",
                        !lastDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="h-3 w-3" />
                      {lastDate
                        ? `Letzte Wartung: ${format(lastDate, "dd.MM.yyyy", { locale: de })}`
                        : "Letzte Wartung eintragen"
                      }
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={lastDate}
                      defaultMonth={lastDate ?? new Date()}
                      captionLayout="dropdown-buttons"
                      fromYear={new Date().getFullYear() - 20}
                      toYear={new Date().getFullYear()}
                      onSelect={(date) => {
                        updateConfig(type.key, {
                          last_maintenance_date: date ? format(date, "yyyy-MM-dd") : undefined,
                        });
                      }}
                      disabled={(date) => date > new Date()}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {/* Custom interval/lead time editor */}
            {isEditing && config.is_active && (
              <div className="flex gap-3 mt-2 p-2 rounded-md bg-muted/50">
                <div className="flex-1">
                  <Label className="text-xs">Intervall (Monate)</Label>
                  <Input
                    type="number"
                    min="1"
                    className="h-8 mt-1"
                    value={config.custom_interval_months || type.defaultIntervalMonths}
                    onChange={(e) => updateConfig(type.key, {
                      custom_interval_months: parseInt(e.target.value) || undefined,
                    })}
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-xs">Vorlaufzeit (Tage)</Label>
                  <Input
                    type="number"
                    min="1"
                    className="h-8 mt-1"
                    value={config.custom_lead_time_days || type.defaultLeadTimeDays}
                    onChange={(e) => updateConfig(type.key, {
                      custom_lead_time_days: parseInt(e.target.value) || undefined,
                    })}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
        {/* Kategorie A */}
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            <h4 className="text-base font-bold text-destructive">
              Kategorie A: Gesetzlich / Pflicht
            </h4>
          </div>
          <div className="space-y-0.5">
            {categoryA.map(renderTypeRow)}
          </div>
        </div>

        <Separator />

        {/* Kategorie B */}
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center gap-2 mb-3">
            <Wrench className="h-5 w-5 text-primary" />
            <h4 className="text-base font-bold text-primary">
              Kategorie B: Empfohlen / Intern
            </h4>
          </div>
          <div className="space-y-0.5">
            {categoryB.map(renderTypeRow)}
          </div>
        </div>
    </div>
  );
};
