import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, FileText, Upload, ExternalLink, FolderOpen, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { useManagementMode } from "@/hooks/useManagementMode";
import { cn } from "@/lib/utils";

interface CreateAuditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** If set, dialog edits an existing audit instead of creating a new one. */
  auditId?: string | null;
}

interface NoteDraft { id?: string; title: string; body: string; }
interface ExistingStatement { id: string; file_name: string; file_path: string; }
interface DmsCandidate { id: string; display_name: string; file_path: string; category: string; }

export function CreateAuditDialog({ open, onOpenChange, auditId }: CreateAuditDialogProps) {
  const queryClient = useQueryClient();
  const { managementMode } = useManagementMode();
  const isEdit = !!auditId;

  const [selectedBuildingId, setSelectedBuildingId] = useState<string>("");
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const [selectedContactId, setSelectedContactId] = useState<string>("");
  const [portalUntil, setPortalUntil] = useState(format(addDays(new Date(), 30), "yyyy-MM-dd"));
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [planFiles, setPlanFiles] = useState<File[]>([]);
  const [existingStatements, setExistingStatements] = useState<(ExistingStatement & { category?: string })[]>([]);
  const [dmsAttachments, setDmsAttachments] = useState<DmsCandidate[]>([]);
  const [notes, setNotes] = useState<NoteDraft[]>([]);
  const [removedNoteIds, setRemovedNoteIds] = useState<string[]>([]);
  const [removedStatementIds, setRemovedStatementIds] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingPlan, setIsDraggingPlan] = useState(false);
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
  const targetFiscalYear = selectedPeriod?.fiscal_year;

  // DMS-Kandidaten: Finanzdokumente der Liegenschaft für das Abrechnungsjahr
  // Filter: allgemeine Dokumente (kein linked_contact_id) + nur die personenbezogenen
  // Dokumente, die dem ausgewählten Kassenprüfer zugeordnet sind.
  const { data: dmsCandidates = [] } = useQuery({
    queryKey: ["audit-dms-candidates", selectedBuildingId, targetFiscalYear, selectedContactId],
    queryFn: async () => {
      if (!selectedBuildingId || !targetFiscalYear) return [] as DmsCandidate[];
      const { data } = await supabase
        .from("building_files")
        .select("id, display_name, file_path, fiscal_year, linked_contact_id, visibility_role, building_file_categories(name)")
        .eq("building_id", selectedBuildingId)
        .eq("fiscal_year", targetFiscalYear)
        .is("deleted_at", null)
        .order("display_name");
      const relevant = /Gesamtabrechnung|Einzelabrechnung|Verm.gensbericht|§?35a|Paragraph 35a/i;
      return (data || [])
        .filter((r: any) => {
          // Allgemein: kein Personenbezug
          if (!r.linked_contact_id) return true;
          // Personenbezogen: nur wenn es zum gewählten Kassenprüfer passt
          return selectedContactId && r.linked_contact_id === selectedContactId;
        })
        .map((r: any) => ({
          id: r.id,
          display_name: r.display_name,
          file_path: r.file_path,
          category: r.building_file_categories?.name || "Sonstiges",
        }))
        .filter((r: DmsCandidate) => relevant.test(r.category) || relevant.test(r.display_name));
    },
    enabled: !!selectedBuildingId && !!targetFiscalYear,
  });

  // Pre-fill in edit mode
  useEffect(() => {
    if (!open) return;
    if (!isEdit) {
      reset();
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: audit } = await supabase
        .from("cash_audits")
        .select("*")
        .eq("id", auditId!)
        .maybeSingle();
      if (cancelled || !audit) return;
      setSelectedBuildingId(audit.building_id);
      setSelectedPeriodId(audit.billing_period_id || "");
      setSelectedContactId(audit.auditor_contact_id || "");
      setPortalUntil(audit.visible_in_portal_until ? format(new Date(audit.visible_in_portal_until), "yyyy-MM-dd") : "");

      const [{ data: stmts }, { data: nts }] = await Promise.all([
        supabase.from("cash_audit_statements").select("id, file_name, file_path, category").eq("cash_audit_id", auditId!).order("sort_order"),
        supabase.from("cash_audit_notes").select("id, title, body").eq("cash_audit_id", auditId!).order("sort_order"),
      ]);
      if (cancelled) return;
      setExistingStatements((stmts || []) as any);
      setNotes((nts || []).map((n: any) => ({ id: n.id, title: n.title, body: n.body })));
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, auditId]);

  // Auto-select previous fiscal year only for create mode
  useEffect(() => {
    if (isEdit) return;
    if (!periods.length || selectedPeriodId) return;
    const previousYear = new Date().getFullYear() - 1;
    const match =
      periods.find((p: any) => p.fiscal_year === previousYear) ??
      periods.find((p: any) => p.fiscal_year < new Date().getFullYear()) ??
      periods[0];
    if (match) setSelectedPeriodId(match.id);
  }, [periods, selectedPeriodId, isEdit]);

  const addFiles = useCallback((files: File[], target: "statement" | "plan") => {
    const pdfs = files.filter((f) => f.type === "application/pdf");
    if (pdfs.length !== files.length) {
      toast.warning("Nur PDF-Dateien werden akzeptiert");
    }
    if (!pdfs.length) return;
    if (target === "plan") setPlanFiles((prev) => [...prev, ...pdfs]);
    else setPdfFiles((prev) => [...prev, ...pdfs]);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, target: "statement" | "plan") => {
    addFiles(Array.from(e.target.files || []), target);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent, target: "statement" | "plan") => {
    e.preventDefault();
    if (target === "plan") setIsDraggingPlan(false);
    else setIsDragging(false);
    addFiles(Array.from(e.dataTransfer.files || []), target);
  };

  const reset = () => {
    setSelectedBuildingId("");
    setSelectedPeriodId("");
    setSelectedContactId("");
    setPortalUntil(format(addDays(new Date(), 30), "yyyy-MM-dd"));
    setPdfFiles([]);
    setPlanFiles([]);
    setExistingStatements([]);
    setNotes([]);
    setRemovedNoteIds([]);
    setRemovedStatementIds([]);
    setDmsAttachments([]);
  };

  const openExistingStatement = async (path: string) => {
    const clean = path.replace(/^\/+/, "").replace(/^building-documents\//, "");
    const { data } = await supabase.storage.from("building-documents").createSignedUrl(clean, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    else toast.error("Datei konnte nicht geladen werden");
  };

  const handleSave = async () => {
    if (!selectedBuildingId || !selectedPeriodId || !selectedContactId) {
      toast.error("Bitte alle Pflichtfelder ausfüllen");
      return;
    }
    setSaving(true);
    try {
      let targetAuditId = auditId || "";
      if (isEdit) {
        const { error } = await supabase.from("cash_audits").update({
          building_id: selectedBuildingId,
          billing_period_id: selectedPeriodId,
          fiscal_year: selectedPeriod?.fiscal_year || new Date().getFullYear(),
          auditor_contact_id: selectedContactId,
          visible_in_portal_until: portalUntil ? new Date(portalUntil).toISOString() : null,
        }).eq("id", auditId!);
        if (error) throw error;
      } else {
        const { data: audit, error } = await supabase.from("cash_audits").insert({
          building_id: selectedBuildingId,
          billing_period_id: selectedPeriodId,
          fiscal_year: selectedPeriod?.fiscal_year || new Date().getFullYear(),
          auditor_contact_id: selectedContactId,
          visible_in_portal_until: portalUntil ? new Date(portalUntil).toISOString() : null,
        }).select("id").single();
        if (error) throw error;
        targetAuditId = audit.id;
      }

      // Remove statements marked for deletion (storage + row)
      if (removedStatementIds.length) {
        const toDelete = existingStatements.filter(s => removedStatementIds.includes(s.id));
        const paths = toDelete.map(s => s.file_path.replace(/^\/+/, "").replace(/^building-documents\//, ""));
        if (paths.length) await supabase.storage.from("building-documents").remove(paths);
        await supabase.from("cash_audit_statements").delete().in("id", removedStatementIds);
      }

      // Upload new PDFs (Kontoauszüge)
      const baseSort = existingStatements.filter(s => !removedStatementIds.includes(s.id)).length;
      let sortCursor = baseSort;
      for (let i = 0; i < pdfFiles.length; i++) {
        const file = pdfFiles[i];
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `cash-audits/${targetAuditId}/${crypto.randomUUID()}-${safeName}`;
        const { error: upErr } = await supabase.storage.from("building-documents").upload(path, file, { contentType: "application/pdf" });
        if (upErr) throw upErr;
        await supabase.from("cash_audit_statements").insert({
          cash_audit_id: targetAuditId,
          file_name: file.name,
          file_path: path,
          sort_order: sortCursor++,
          category: "statement",
        });
      }

      // Upload new PDFs (Abrechnungen & Berichte)
      for (let i = 0; i < planFiles.length; i++) {
        const file = planFiles[i];
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `cash-audits/${targetAuditId}/${crypto.randomUUID()}-${safeName}`;
        const { error: upErr } = await supabase.storage.from("building-documents").upload(path, file, { contentType: "application/pdf" });
        if (upErr) throw upErr;
        await supabase.from("cash_audit_statements").insert({
          cash_audit_id: targetAuditId,
          file_name: file.name,
          file_path: path,
          sort_order: sortCursor++,
          category: "plan",
        });
      }

      // DMS-Anhänge: aus building-files herunterladen und ins audit-Bucket kopieren (category=plan)
      for (let i = 0; i < dmsAttachments.length; i++) {
        const att = dmsAttachments[i];
        const srcPath = att.file_path.replace(/^\/+/, "").replace(/^building-files\//, "");
        const { data: blob, error: dlErr } = await supabase.storage.from("building-files").download(srcPath);
        if (dlErr || !blob) {
          toast.error(`DMS-Datei "${att.display_name}" konnte nicht geladen werden`);
          continue;
        }
        const safeName = att.display_name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `cash-audits/${targetAuditId}/${crypto.randomUUID()}-${safeName}`;
        const { error: upErr } = await supabase.storage.from("building-documents").upload(path, blob, { contentType: "application/pdf" });
        if (upErr) {
          toast.error(`Upload von "${att.display_name}" fehlgeschlagen: ${upErr.message}`);
          continue;
        }
        await supabase.from("cash_audit_statements").insert({
          cash_audit_id: targetAuditId,
          file_name: att.display_name,
          file_path: path,
          sort_order: sortCursor++,
          category: "plan",
        });
      }


      // Remove deleted notes
      if (removedNoteIds.length) {
        await supabase.from("cash_audit_notes").delete().in("id", removedNoteIds);
      }

      // Upsert notes
      const validNotes = notes.filter((n) => n.title.trim() && n.body.trim());
      for (let i = 0; i < validNotes.length; i++) {
        const n = validNotes[i];
        if (n.id) {
          await supabase.from("cash_audit_notes").update({
            title: n.title.trim(),
            body: n.body.trim(),
            sort_order: i,
          }).eq("id", n.id);
        } else {
          await supabase.from("cash_audit_notes").insert({
            cash_audit_id: targetAuditId,
            title: n.title.trim(),
            body: n.body.trim(),
            sort_order: i,
          });
        }
      }

      toast.success(isEdit ? "Kassenprüfung aktualisiert" : "Kassenprüfung erstellt");
      queryClient.invalidateQueries({ queryKey: ["cash-audits"] });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("cash-audit") });
      onOpenChange(false);
      reset();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Kassenprüfung bearbeiten" : "Kassenprüfung erstellen"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Liegenschaft</Label>
              <Select
                value={selectedBuildingId}
                onValueChange={(v) => { setSelectedBuildingId(v); if (!isEdit) { setSelectedPeriodId(""); setSelectedContactId(""); } }}
                disabled={isEdit}
              >
                <SelectTrigger><SelectValue placeholder="Wählen..." /></SelectTrigger>
                <SelectContent>
                  {buildings.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Abrechnungsjahr</Label>
              <Select value={selectedPeriodId} onValueChange={setSelectedPeriodId} disabled={!selectedBuildingId || isEdit}>
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

            {/* Drag & Drop zone */}
            <label
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => handleDrop(e, "statement")}
              className={cn(
                "flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-6 cursor-pointer transition-colors",
                isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
              )}
            >
              <Upload className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                PDFs hierher ziehen oder <span className="text-primary font-medium">durchsuchen</span>
              </p>
              <input type="file" multiple accept="application/pdf" onChange={(e) => handleFileSelect(e, "statement")} className="hidden" />
            </label>

            {/* Aus DMS hinzufügen */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <p className="text-xs text-muted-foreground">
                Oder Dokumente aus dem DMS (Gesamt-/Einzelabrechnung, Vermögensbericht, §35a) anhängen:
              </p>
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1.5" disabled={!targetFiscalYear}>
                    <FolderOpen className="h-3.5 w-3.5" />
                    Aus DMS ({dmsCandidates.length})
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-96 p-0" align="end">
                  <div className="p-3 border-b">
                    <p className="text-sm font-medium">DMS-Dokumente {targetFiscalYear}</p>
                    <p className="text-xs text-muted-foreground">Auswählen zum Anhängen an die Kassenprüfung</p>
                  </div>
                  <ScrollArea className="max-h-80">
                    {dmsCandidates.length === 0 ? (
                      <p className="p-4 text-sm text-muted-foreground text-center">
                        Keine passenden DMS-Dokumente für {targetFiscalYear} gefunden
                      </p>
                    ) : (
                      <div className="p-1">
                        {dmsCandidates.map((c) => {
                          const selected = dmsAttachments.some((a) => a.id === c.id);
                          return (
                            <button
                              key={c.id}
                              onClick={() =>
                                setDmsAttachments((prev) =>
                                  selected ? prev.filter((a) => a.id !== c.id) : [...prev, c],
                                )
                              }
                              className={cn(
                                "w-full flex items-start gap-2 p-2 rounded text-left text-sm hover:bg-muted",
                                selected && "bg-primary/5",
                              )}
                            >
                              <div className={cn(
                                "mt-0.5 h-4 w-4 rounded border flex items-center justify-center flex-shrink-0",
                                selected ? "bg-primary border-primary" : "border-muted-foreground/40",
                              )}>
                                {selected && <Check className="h-3 w-3 text-primary-foreground" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="truncate font-medium">{c.display_name}</p>
                                <p className="text-xs text-muted-foreground truncate">{c.category}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            </div>

            {dmsAttachments.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Aus DMS angehängt</p>
                {dmsAttachments.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 text-sm bg-primary/5 p-2 rounded">
                    <FolderOpen className="h-4 w-4 text-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate">{a.display_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{a.category}</p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => setDmsAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}


            {/* Existing statements (edit mode) */}
            {existingStatements.filter(s => !removedStatementIds.includes(s.id)).length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Bereits hochgeladen</p>
                {existingStatements.filter(s => !removedStatementIds.includes(s.id)).map((s) => (
                  <div key={s.id} className="flex items-center gap-2 text-sm bg-muted/40 p-2 rounded">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{s.file_name}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openExistingStatement(s.file_path)} title="Öffnen">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => setRemovedStatementIds((prev) => [...prev, s.id])} title="Entfernen">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* New file queue */}
            {pdfFiles.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Neu hinzugefügt</p>
                {pdfFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm bg-primary/5 p-2 rounded">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="flex-1 truncate">{f.name}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setPdfFiles((prev) => prev.filter((_, idx) => idx !== i))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Abrechnungen & Berichte (externe PDFs) */}
          <div className="space-y-2 pt-2 border-t">
            <Label className="flex items-center gap-2">
              <Upload className="h-4 w-4" /> Abrechnungen & Berichte (PDF)
            </Label>
            <p className="text-xs text-muted-foreground">
              Gesamt-/Einzelabrechnung, Wirtschaftsplan, Vermögensbericht, §35a-Bescheinigung – externe PDFs zusätzlich zu den DMS-Anhängen.
            </p>
            <label
              onDragOver={(e) => { e.preventDefault(); setIsDraggingPlan(true); }}
              onDragLeave={() => setIsDraggingPlan(false)}
              onDrop={(e) => handleDrop(e, "plan")}
              className={cn(
                "flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-6 cursor-pointer transition-colors",
                isDraggingPlan ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
              )}
            >
              <Upload className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                PDFs hierher ziehen oder <span className="text-primary font-medium">durchsuchen</span>
              </p>
              <input type="file" multiple accept="application/pdf" onChange={(e) => handleFileSelect(e, "plan")} className="hidden" />
            </label>

            {planFiles.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Neu hinzugefügt</p>
                {planFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm bg-primary/5 p-2 rounded">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="flex-1 truncate">{f.name}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setPlanFiles((prev) => prev.filter((_, idx) => idx !== i))}>
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
              <Card key={n.id ?? `new-${i}`} className="p-3 space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="Titel (z.B. Berechnungsmethode Heizkosten)"
                    value={n.title}
                    onChange={(e) => setNotes((prev) => prev.map((x, idx) => idx === i ? { ...x, title: e.target.value } : x))}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      const removed = notes[i];
                      if (removed?.id) setRemovedNoteIds((prev) => [...prev, removed.id!]);
                      setNotes((prev) => prev.filter((_, idx) => idx !== i));
                    }}
                  >
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
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (isEdit ? "Speichere..." : "Erstelle...") : (isEdit ? "Speichern" : "Erstellen")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
