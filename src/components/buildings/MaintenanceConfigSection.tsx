import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Settings2, Wrench, Shield } from "lucide-react";
import { MAINTENANCE_TYPES, formatInterval, formatLeadTime, type MaintenanceType } from "@/lib/maintenanceTypes";

export interface MaintenanceConfig {
  maintenance_type: string;
  is_active: boolean;
  custom_interval_months?: number;
  custom_lead_time_days?: number;
}

interface MaintenanceConfigSectionProps {
  configs: MaintenanceConfig[];
  onChange: (configs: MaintenanceConfig[]) => void;
}

export const MaintenanceConfigSection = ({ configs, onChange }: MaintenanceConfigSectionProps) => {
  const [isOpen, setIsOpen] = useState(false);
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

  const updateCustomValues = (key: string, intervalMonths?: number, leadTimeDays?: number) => {
    const updated = configs.map(c => {
      if (c.maintenance_type === key) {
        return {
          ...c,
          custom_interval_months: intervalMonths,
          custom_lead_time_days: leadTimeDays,
        };
      }
      return c;
    });
    onChange(updated);
  };

  const categoryA = MAINTENANCE_TYPES.filter(t => t.category === 'A');
  const categoryB = MAINTENANCE_TYPES.filter(t => t.category === 'B');

  const renderTypeRow = (type: MaintenanceType) => {
    const config = getConfig(type.key);
    const isEditing = editingType === type.key;
    const effectiveInterval = config.custom_interval_months || type.defaultIntervalMonths;
    const effectiveLeadTime = config.custom_lead_time_days || type.defaultLeadTimeDays;

    return (
      <div key={type.key} className="flex items-start gap-3 py-2">
        <Checkbox
          id={`maint-${type.key}`}
          checked={config.is_active}
          onCheckedChange={(checked) => toggleType(type.key, !!checked)}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
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
          {isEditing && config.is_active && (
            <div className="flex gap-3 mt-2 p-2 rounded-md bg-muted/50">
              <div className="flex-1">
                <Label className="text-xs">Intervall (Monate)</Label>
                <Input
                  type="number"
                  min="1"
                  className="h-8 mt-1"
                  value={config.custom_interval_months || type.defaultIntervalMonths}
                  onChange={(e) => updateCustomValues(
                    type.key,
                    parseInt(e.target.value) || undefined,
                    config.custom_lead_time_days
                  )}
                />
              </div>
              <div className="flex-1">
                <Label className="text-xs">Vorlaufzeit (Tage)</Label>
                <Input
                  type="number"
                  min="1"
                  className="h-8 mt-1"
                  value={config.custom_lead_time_days || type.defaultLeadTimeDays}
                  onChange={(e) => updateCustomValues(
                    type.key,
                    config.custom_interval_months,
                    parseInt(e.target.value) || undefined
                  )}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button type="button" variant="outline" className="w-full justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            <span>Wartungskonfiguration</span>
            <span className="text-xs text-muted-foreground">
              ({configs.filter(c => c.is_active).length} aktiv)
            </span>
          </div>
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-4">
        {/* Kategorie A */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-4 w-4 text-destructive" />
            <h4 className="text-sm font-semibold">Kategorie A: Gesetzlich / Pflicht</h4>
          </div>
          <div className="space-y-1 ml-1">
            {categoryA.map(renderTypeRow)}
          </div>
        </div>

        {/* Kategorie B */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Wrench className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-semibold">Kategorie B: Empfohlen / Intern</h4>
          </div>
          <div className="space-y-1 ml-1">
            {categoryB.map(renderTypeRow)}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
