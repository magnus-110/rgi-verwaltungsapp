import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useManagementMode } from "@/hooks/useManagementMode";
import { useFiscalYearContext } from "@/contexts/FiscalYearContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
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
  const { managementMode } = useManagementMode();
  const fyCtx = useFiscalYearContext();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editMode, setEditMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newYear, setNewYear] = useState(new Date().getFullYear().toString());
  const [newPeriodFrom, setNewPeriodFrom] = useState("");
  const [newPeriodTo, setNewPeriodTo] = useState("");
  const [newProvider, setNewProvider] = useState("");

  const { data: buildings = [] } = useQuery({
    queryKey: ["buildings-billing", managementMode],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("id, name, building_code")
        .eq("management_mode", managementMode)
        .order("name");
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
    setEditMode("create");
    setEditingId(null);
    setNewYear(year.toString());
    setNewPeriodFrom(`${year}-01-01`);
    setNewPeriodTo(`${year}-12-31`);
    setNewProvider("");
    setIsEditOpen(true);
  };

  const openEditDialog = () => {
    if (!selectedPeriod) return;
    setEditMode("edit");
    setEditingId(selectedPeriod.id);
    setNewYear(String(selectedPeriod.fiscal_year));
    setNewPeriodFrom(selectedPeriod.period_from);
    setNewPeriodTo(selectedPeriod.period_to);
    setNewProvider((selectedPeriod as any).heating_provider || "");
    setIsEditOpen(true);
  };

  const savePeriod = async () => {
    if (!selectedBuildingId) return;
    const year = parseInt(newYear);
    if (isNaN(year)) { toast.error("Ungültiges Jahr"); return; }
    if (!newPeriodFrom || !newPeriodTo) { toast.error("Bitte Zeitraum angeben"); return; }

    if (editMode === "edit" && editingId) {
      const { error } = await supabase.from("billing_periods").update({
        fiscal_year: year,
        period_from: newPeriodFrom,
        period_to: newPeriodTo,
        heating_provider: newProvider || null,
      }).eq("id", editingId);
      if (error) {
        if (error.code === "23505") toast.error("Abrechnungszeitraum für dieses Jahr existiert bereits");
        else toast.error("Fehler: " + error.message);
        return;
      }
      toast.success(`Wirtschaftsjahr ${year} aktualisiert`);
      setIsEditOpen(false);
      queryClient.invalidateQueries({ queryKey: ["billing-periods"] });
      return;
    }

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
    setIsEditOpen(false);
    queryClient.invalidateQueries({ queryKey: ["billing-periods"] });
    onPeriodChange(data.id);
  };

  const deletePeriod = async () => {
    if (!selectedPeriod) return;
    const ok = window.confirm(
      `Wirtschaftsjahr ${selectedPeriod.fiscal_year} wirklich löschen?\n\n` +
      `Verknüpfte Abrechnungsdaten (Heizkostenverteilungen, Validierungen, Kassenprüfungen) werden mitgelöscht. ` +
      `Buchungen, Rechnungen und Kontoauszüge bleiben unverändert erhalten.`
    );
    if (!ok) return;
    const { error } = await supabase.from("billing_periods").delete().eq("id", selectedPeriod.id);
    if (error) {
      if (error.code === "23503") {
        toast.error("Löschen nicht möglich: Es existieren noch Wirtschaftspläne, die auf dieses Jahr verweisen.");
      } else {
        toast.error("Fehler: " + error.message);
      }
      return;
    }
    toast.success(`Wirtschaftsjahr ${selectedPeriod.fiscal_year} gelöscht`);
    onPeriodChange(null);
    queryClient.invalidateQueries({ queryKey: ["billing-periods"] });
  };

  const statusInfo = selectedPeriod ? STATUS_LABELS[selectedPeriod.status] || STATUS_LABELS.draft : null;

  const formatPeriodLabel = (p: any) => {
    const from = p.period_from;
    const to = p.period_to;
    if (from === `${p.fiscal_year}-01-01` && to === `${p.fiscal_year}-12-31`) {
      return `${p.fiscal_year}`;
    }
    return `${p.fiscal_year} (${format(new Date(from), "dd.MM.yy", { locale: de })} – ${format(new Date(to), "dd.MM.yy", { locale: de })})`;
  };

  return (
    <div className="flex flex-col md:flex-row gap-2 md:gap-3 items-stretch md:items-center">
      <Select value={selectedBuildingId || ""} onValueChange={(v) => { onBuildingChange(v || null); onPeriodChange(null); }}>
        <SelectTrigger className="w-full md:w-72 h-11 md:h-10">
          <SelectValue placeholder="Liegenschaft wählen..." />
        </SelectTrigger>
        <SelectContent>
          {buildings.map((b) => (
            <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {showPeriod && selectedBuildingId && (
        <div className="flex gap-2 items-stretch">
          <Select value={selectedPeriodId || ""} onValueChange={(v) => onPeriodChange(v || null)}>
            <SelectTrigger className="flex-1 md:w-56 h-11 md:h-10">
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
          {selectedPeriod && (
            <>
              <Button size="sm" variant="outline" onClick={openEditDialog} className="h-11 md:h-10 px-3" title="Wirtschaftsjahr bearbeiten">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={deletePeriod}
                className="h-11 md:h-10 px-3 text-destructive hover:text-destructive hover:bg-destructive/10"
                title="Wirtschaftsjahr löschen"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" onClick={openCreateDialog} className="h-11 md:h-10 px-3">
            <Plus className="h-4 w-4 md:mr-1" /> <span className="hidden md:inline">Neues Jahr</span>
          </Button>
        </div>
      )}

      {statusInfo && (
        <Badge className={`${statusInfo.color} self-start md:self-auto`}>{statusInfo.label}</Badge>
      )}

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editMode === "edit" ? "Wirtschaftsjahr bearbeiten" : "Neuen Abrechnungszeitraum erstellen"}
            </DialogTitle>
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
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Abbrechen</Button>
            <Button onClick={savePeriod}>{editMode === "edit" ? "Speichern" : "Erstellen"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
