import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarIcon, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface RecurrenceSettingsProps {
  isRecurring: boolean;
  pattern: 'daily' | 'weekly' | 'monthly' | 'yearly' | null;
  interval: number;
  endDate: string | null;
  onIsRecurringChange: (value: boolean) => void;
  onPatternChange: (value: 'daily' | 'weekly' | 'monthly' | 'yearly') => void;
  onIntervalChange: (value: number) => void;
  onEndDateChange: (value: string | null) => void;
}

export function RecurrenceSettings({
  isRecurring,
  pattern,
  interval,
  endDate,
  onIsRecurringChange,
  onPatternChange,
  onIntervalChange,
  onEndDateChange,
}: RecurrenceSettingsProps) {
  const patternLabels: Record<string, { singular: string; plural: string }> = {
    daily: { singular: 'Tag', plural: 'Tagen' },
    weekly: { singular: 'Woche', plural: 'Wochen' },
    monthly: { singular: 'Monat', plural: 'Monaten' },
    yearly: { singular: 'Jahr', plural: 'Jahren' },
  };

  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button 
          type="button" 
          variant="ghost" 
          className="w-full justify-start text-muted-foreground hover:text-foreground p-0 h-auto"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Erweiterte Optionen
        </Button>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="mt-4 space-y-4 p-4 border rounded-lg bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">Wiederkehrende Aufgabe</Label>
            <p className="text-xs text-muted-foreground">
              Erstellt automatisch neue Aufgaben nach Abschluss
            </p>
          </div>
          <Switch
            checked={isRecurring}
            onCheckedChange={onIsRecurringChange}
          />
        </div>

        {isRecurring && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Alle</span>
              <Input
                type="number"
                min={1}
                max={99}
                value={interval}
                onChange={(e) => onIntervalChange(parseInt(e.target.value) || 1)}
                className="w-16"
              />
              <Select 
                value={pattern || 'weekly'} 
                onValueChange={(v) => onPatternChange(v as typeof pattern & string)}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">
                    {interval === 1 ? patternLabels.daily.singular : patternLabels.daily.plural}
                  </SelectItem>
                  <SelectItem value="weekly">
                    {interval === 1 ? patternLabels.weekly.singular : patternLabels.weekly.plural}
                  </SelectItem>
                  <SelectItem value="monthly">
                    {interval === 1 ? patternLabels.monthly.singular : patternLabels.monthly.plural}
                  </SelectItem>
                  <SelectItem value="yearly">
                    {interval === 1 ? patternLabels.yearly.singular : patternLabels.yearly.plural}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Enddatum (optional)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(new Date(endDate), "dd.MM.yyyy", { locale: de }) : "Kein Enddatum"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={endDate ? new Date(endDate) : undefined}
                    onSelect={(date) => onEndDateChange(date ? format(date, 'yyyy-MM-dd') : null)}
                    initialFocus
                    locale={de}
                  />
                </PopoverContent>
              </Popover>
              {endDate && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onEndDateChange(null)}
                  className="text-xs"
                >
                  Enddatum entfernen
                </Button>
              )}
            </div>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
