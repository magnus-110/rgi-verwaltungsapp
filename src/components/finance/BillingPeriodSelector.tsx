import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { de } from "date-fns/locale";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "Entwurf", color: "bg-muted text-muted-foreground" },
  in_progress: { label: "In Bearbeitung", color: "bg-amber-100 text-amber-800" },
  completed: { label: "Abgeschlossen", color: "bg-green-100 text-green-800" },
  closed: { label: "Gesperrt", color: "bg-red-100 text-red-800" },
};

interface BillingPeriodSelectorProps {
  selectedBuildingId: string | null;
  onBuildingChange: (id: string | null) => void;
  selectedPeriodId: string | null;
  onPeriodChange: (id: string | null) => void;
  showPeriod?: boolean;
}

export function BillingPeriodSelector({
  selectedBuildingId,
  onBuildingChange,
  selectedPeriodId,
  onPeriodChange,
  showPeriod = true,
}: BillingPeriodSelectorProps) {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newYear, setNewYear] = useState(new Date().getFullYear().toString());
  const [newPeriodFrom, setNewPeriodFrom] = useState("");
  const [newPeriodTo, setNewPeriodTo] = useState("");
  const [newProvider, setNewProvider] = useState("");

  const { data: buildings = [] } = useQuery({
    queryKey: ["buildings-billing"],
    queryFn: async () => {
      const { data, error } = await supabase.from("buildings").select("id, name, building_code").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: periods = [] } = useQuery({
    queryKey: ["billing-periods", selectedBuildingId],
    queryFn: async () => {
      if (!selectedBuildingId) return [];
      const { data, error } = await supabase
        .from("billing_periods")
        .select("*")
        .eq("building_id", selectedBuildingId)
        .order("fiscal_year", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedBuildingId,
  });

  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId);

  // Auto-fill dates when year changes
  const handleYearChange = (val: string) => {
    setNewYear(val);
    const year = parseInt(val);
    if (!isNaN(year)) {
      // Only auto-fill if dates are empty or still match the old auto-fill
      if (!newPeriodFrom || newPeriodFrom.match(/^\d{4}-01-01$/)) {
        setNewPeriodFrom(`${year}-01-01`);
      }
      if (!newPeriodTo || newPeriodTo.match(/^\d{4}-12-31$/)) {
        setNewPeriodTo(`${year}-12-31`);
      }
    }
  };

  const openCreateDialog = () => {
    const year = new Date().getFullYear();
    setNewYear(year.toString());
    setNewPeriodFrom(`${year}-01-01`);
    setNewPeriodTo(`${year}-12-31`);
    setNewProvider("");
    setIsCreateOpen(true);
  };

  const createPeriod = async () => {
    if (!selectedBuildingId) return;
    const year = parseInt(newYear);
    if (isNaN(year)) { toast.error("Ungültiges Jahr"); return; }
    if (!newPeriodFrom || !newPeriodTo) { toast.error("Bitte Zeitraum angeben"); return; }

    const { data, error } = await supabase.from("billing_periods").insert({
      building_id: selectedBuildingId,
      fiscal_year: year,
      period_from: newPeriodFrom,
      period_to: newPeriodTo,
      heating_provider: newProvider || null,
      status: "draft",
    }).select().single();

    if (error) {
      if (error.code === "23505") toast.error("Abrechnungszeitraum für dieses Jahr existiert bereits");
      else toast.error("Fehler: " + error.message);
      return;
    }
    toast.success(`Abrechnungszeitraum ${year} erstellt`);
    setIsCreateOpen(false);
    queryClient.invalidateQueries({ queryKey: ["billing-periods"] });
    onPeriodChange(data.id);
  };

  const statusInfo = selectedPeriod ? STATUS_LABELS[selectedPeriod.status] || STATUS_LABELS.draft : null;

  const formatPeriodLabel = (p: any) => {
    const from = p.period_from;
    const to = p.period_to;
    // Check if it's a standard calendar year
    if (from === `${p.fiscal_year}-01-01` && to === `${p.fiscal_year}-12-31`) {
      return `${p.fiscal_year}`;
    }
    return `${p.fiscal_year} (${format(new Date(from), "dd.MM.yy", { locale: de })} – ${format(new Date(to), "dd.MM.yy", { locale: de })})`;
  };

  return (
    <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
      <Select value={selectedBuildingId || ""} onValueChange={(v) => { onBuildingChange(v || null); onPeriodChange(null); }}>
        <SelectTrigger className="w-full md:w-72">
          <SelectValue placeholder="Liegenschaft wählen..." />
        </SelectTrigger>
        <SelectContent>
          {buildings.map((b) => (
            <SelectItem key={b.id} value={b.id}>{b.name} ({b.building_code})</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {showPeriod && selectedBuildingId && (
        <Select value={selectedPeriodId || ""} onValueChange={(v) => onPeriodChange(v || null)}>
          <SelectTrigger className="w-full md:w-56">
            <SelectValue placeholder="Zeitraum wählen..." />
          </SelectTrigger>
          <SelectContent>
            {periods.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {formatPeriodLabel(p)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {showPeriod && selectedBuildingId && (
        <Button size="sm" variant="outline" onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-1" /> Neues Jahr
        </Button>
      )}

      {statusInfo && (
        <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
      )}

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neuen Abrechnungszeitraum erstellen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Wirtschaftsjahr</Label>
              <Input type="number" value={newYear} onChange={(e) => handleYearChange(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Zeitraum von</Label>
                <Input type="date" value={newPeriodFrom} onChange={(e) => setNewPeriodFrom(e.target.value)} />
              </div>
              <div>
                <Label>Zeitraum bis</Label>
                <Input type="date" value={newPeriodTo} onChange={(e) => setNewPeriodTo(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Standard: 01.01.–31.12. Bei verschobenem Wirtschaftsjahr (z.B. 01.07.–30.06.) die Daten entsprechend anpassen.
            </p>
            <div>
              <Label>Ablesefirma (optional)</Label>
              <Input value={newProvider} onChange={(e) => setNewProvider(e.target.value)} placeholder="z.B. Brunata, Techem, ista..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Abbrechen</Button>
            <Button onClick={createPeriod}>Erstellen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
