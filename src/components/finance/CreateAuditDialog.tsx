import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, FileText, Upload } from "lucide-react";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { useManagementMode } from "@/hooks/useManagementMode";

interface CreateAuditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface NoteDraft { title: string; body: string; }

export function CreateAuditDialog({ open, onOpenChange }: CreateAuditDialogProps) {
  const queryClient = useQueryClient();
  const { managementMode } = useManagementMode();
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>("");
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const [selectedContactId, setSelectedContactId] = useState<string>("");
  const [portalUntil, setPortalUntil] = useState(format(addDays(new Date(), 30), "yyyy-MM-dd"));
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [notes, setNotes] = useState<NoteDraft[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: buildings = [] } = useQuery({
    queryKey: ["buildings-audit", managementMode],
    queryFn: async () => {
      const { data } = await supabase
        .from("buildings")
        .select("id, name, address")
        .eq("management_mode", managementMode || "weg")
        .order("name");
      return data || [];
    },
  });

  const { data: periods = [] } = useQuery({
    queryKey: ["billing-periods-audit", selectedBuildingId],
    queryFn: async () => {
      if (!selectedBuildingId) return [];
      const { data } = await supabase
        .from("billing_periods")
        .select("id, fiscal_year, period_from, period_to")
        .eq("building_id", selectedBuildingId)
        .order("fiscal_year", { ascending: false });
      return data || [];
    },
    enabled: !!selectedBuildingId,
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts-audit", selectedBuildingId],
    queryFn: async () => {
      if (!selectedBuildingId) return [];
      const { data } = await supabase
        .from("contact_building_assignments")
        .select(`contact_id, role_in_building, contacts!inner(id, company_name, contact_persons(first_name, last_name, is_primary))`)
        .eq("building_id", selectedBuildingId)
        .eq("role_in_building", "eigentuemer");
      return (data || []).map((d: any) => ({
        id: d.contacts.id,
        name: d.contacts.contact_persons?.filter((p: any) => p.is_primary)?.[0]
          ? `${d.contacts.contact_persons.filter((p: any) => p.is_primary)[0].first_name} ${d.contacts.contact_persons.filter((p: any) => p.is_primary)[0].last_name}`
          : d.contacts.company_name || "Unbekannt",
      }));
    },
    enabled: !!selectedBuildingId,
  });

  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId);

  useEffect(() => {
    if (!periods.length || selectedPeriodId) return;
    const previousYear = new Date().getFullYear() - 1;
    const match =
      periods.find((p: any) => p.fiscal_year === previousYear) ??
      periods.find((p: any) => p.fiscal_year < new Date().getFullYear()) ??
      periods[0];
    if (match) setSelectedPeriodId(match.id);
  }, [periods, selectedPeriodId]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) => f.type === "application/pdf");
    setPdfFiles((prev) => [...prev, ...files]);
    e.target.value = "";
  };

  const reset = () => {
    setSelectedBuildingId("");
    setSelectedPeriodId("");
    setSelectedContactId("");
    setPdfFiles([]);
    setNotes([]);
  };

  const handleCreate = async () => {
    if (!selectedBuildingId || !selectedPeriodId || !selectedContactId) {
      toast.error("Bitte alle Pflichtfelder ausfüllen");
      return;
    }
    setSaving(true);
    try {
      const { data: audit, error } = await supabase.from("cash_audits").insert({
        building_id: selectedBuildingId,
        billing_period_id: selectedPeriodId,
        fiscal_year: selectedPeriod?.fiscal_year || new Date().getFullYear(),
        auditor_contact_id: selectedContactId,
        visible_in_portal_until: portalUntil ? new Date(portalUntil).toISOString() : null,
      }).select("id").single();
      if (error) throw error;

      // Upload PDFs
      for (let i = 0; i < pdfFiles.length; i++) {
        const file = pdfFiles[i];
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `cash-audits/${audit.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: upErr } = await supabase.storage.from("building-documents").upload(path, file, { contentType: "application/pdf" });
        if (upErr) throw upErr;
        await supabase.from("cash_audit_statements").insert({
          cash_audit_id: audit.id,
          file_name: file.name,
          file_path: path,
          sort_order: i,
        });
      }

      // Insert notes
      const validNotes = notes.filter((n) => n.title.trim() && n.body.trim());
      if (validNotes.length) {
        await supabase.from("cash_audit_notes").insert(
          validNotes.map((n, i) => ({
            cash_audit_id: audit.id,
            title: n.title.trim(),
            body: n.body.trim(),
            sort_order: i,
          }))
        );
      }

      toast.success("Kassenprüfung erstellt");
      queryClient.invalidateQueries({ queryKey: ["cash-audits"] });
      onOpenChange(false);
      reset();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Kassenprüfung erstellen</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Liegenschaft</Label>
              <Select value={selectedBuildingId} onValueChange={(v) => { setSelectedBuildingId(v); setSelectedPeriodId(""); setSelectedContactId(""); }}>
                <SelectTrigger><SelectValue placeholder="Wählen..." /></SelectTrigger>
                <SelectContent>
                  {buildings.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Abrechnungsjahr</Label>
              <Select value={selectedPeriodId} onValueChange={setSelectedPeriodId} disabled={!selectedBuildingId}>
                <SelectTrigger><SelectValue placeholder="Wählen..." /></SelectTrigger>
                <SelectContent>
                  {periods.map((p) => <SelectItem key={p.id} value={p.id}>{p.fiscal_year}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Kassenprüfer (Eigentümer)</Label>
            <Select value={selectedContactId} onValueChange={setSelectedContactId} disabled={!selectedBuildingId}>
              <SelectTrigger><SelectValue placeholder="Wählen..." /></SelectTrigger>
              <SelectContent>
                {contacts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Sichtbar im Portal bis</Label>
            <Input type="date" value={portalUntil} onChange={(e) => setPortalUntil(e.target.value)} />
          </div>

          {/* PDF-Kontoauszüge */}
          <div className="space-y-2 pt-2 border-t">
            <Label className="flex items-center gap-2">
              <Upload className="h-4 w-4" /> Kontoauszüge (PDF)
            </Label>
            <p className="text-xs text-muted-foreground">Diese PDFs werden dem Prüfer anstelle der CAMT-Dateien angezeigt.</p>
            <Input type="file" multiple accept="application/pdf" onChange={handleFileSelect} />
            {pdfFiles.length > 0 && (
              <div className="space-y-1">
                {pdfFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm bg-muted/40 p-2 rounded">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{f.name}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setPdfFiles((prev) => prev.filter((_, idx) => idx !== i))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Hinweise */}
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center justify-between">
              <Label>Hinweise für den Prüfer</Label>
              <Button size="sm" variant="outline" onClick={() => setNotes((prev) => [...prev, { title: "", body: "" }])} className="gap-1">
                <Plus className="h-3.5 w-3.5" /> Notiz
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">z.B. „Rechnung XYZ wurde auf Konto 1XXX gebucht, weil…"</p>
            {notes.map((n, i) => (
              <Card key={i} className="p-3 space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="Titel (z.B. Berechnungsmethode Heizkosten)"
                    value={n.title}
                    onChange={(e) => setNotes((prev) => prev.map((x, idx) => idx === i ? { ...x, title: e.target.value } : x))}
                  />
                  <Button size="icon" variant="ghost" onClick={() => setNotes((prev) => prev.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <Textarea
                  placeholder="Erklärung / Hinweis…"
                  value={n.body}
                  onChange={(e) => setNotes((prev) => prev.map((x, idx) => idx === i ? { ...x, body: e.target.value } : x))}
                  rows={3}
                />
              </Card>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving ? "Erstelle..." : "Erstellen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
