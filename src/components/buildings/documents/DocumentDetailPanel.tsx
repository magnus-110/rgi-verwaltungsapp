import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, Trash2, X, History, Sparkles, ExternalLink, Wrench, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { DocFile, VisibilityRole, VISIBILITY_LABELS } from "./types";
import { useNavigate } from "react-router-dom";
import { PersonVisibilityPicker } from "./PersonVisibilityPicker";
import { MAINTENANCE_TYPES } from "@/lib/maintenanceTypes";

interface DocumentDetailPanelProps {
  file: DocFile | null;
  buildingId: string;
  onClose: () => void;
  onChanged: () => void;
}

export function DocumentDetailPanel({ file, buildingId, onClose, onChanged }: DocumentDetailPanelProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<Partial<DocFile>>({});
  const [saving, setSaving] = useState(false);
  const [reindexing, setReindexing] = useState(false);

  useEffect(() => {
    if (file) setEditing({});
  }, [file?.id]);

  const { data: contacts = [] } = useQuery({
    queryKey: ['building-owners-for-visibility', buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_building_assignments')
        .select('contact_id, role_in_building, contacts(id, first_name, last_name, company_name)')
        .eq('building_id', buildingId)
        .eq('is_active', true)
        .eq('role_in_building', 'eigentuemer');
      if (error) throw error;
      return (data || []).map((r: any) => r.contacts).filter(Boolean);
    },
    enabled: !!file,
  });

  const { data: maintenanceConfigs = [] } = useQuery({
    queryKey: ['building-maintenance-configs', buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_configs')
        .select('id, maintenance_type, is_active')
        .eq('building_id', buildingId)
        .eq('is_active', true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!file,
  });

  const maintenanceLabel = (type: string) =>
    MAINTENANCE_TYPES.find(t => t.key === type)?.label || type;

  const { data: visibilityContacts = [] } = useQuery({
    queryKey: ['file-visibility', file?.id],
    queryFn: async () => {
      if (!file) return [];
      const { data, error } = await supabase
        .from('building_file_visibility')
        .select('contact_id')
        .eq('file_id', file.id);
      if (error) throw error;
      return (data || []).map(r => r.contact_id);
    },
    enabled: !!file,
  });

  const { data: versions = [] } = useQuery({
    queryKey: ['file-versions', file?.id, file?.parent_file_id],
    queryFn: async () => {
      if (!file) return [];
      const rootId = file.parent_file_id || file.id;
      const { data, error } = await supabase
        .from('building_files')
        .select('id, version, created_at, display_name')
        .or(`id.eq.${rootId},parent_file_id.eq.${rootId}`)
        .order('version', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!file,
  });

  if (!file) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground p-6 text-center">
        Wähle ein Dokument aus, um Details zu sehen.
      </div>
    );
  }

  const current = { ...file, ...editing };
  const isDirty = Object.keys(editing).length > 0;

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('building_files')
        .update(editing as any)
        .eq('id', file.id);
      if (error) throw error;
      await supabase.from('building_file_activity').insert({
        file_id: file.id,
        user_id: (await supabase.auth.getUser()).data.user?.id,
        action: 'updated',
        details: editing as any,
      });
      toast.success("Gespeichert");
      setEditing({});
      onChanged();
    } catch (e: any) {
      toast.error("Fehler: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async () => {
    const { data, error } = await supabase.storage
      .from('building-files')
      .createSignedUrl(file.file_path, 60, { download: file.display_name });
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, '_blank');
  };

  const handleOpenInTab = async () => {
    const { data, error } = await supabase.storage
      .from('building-files')
      .createSignedUrl(file.file_path, 60);
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const handleDelete = async () => {
    if (!confirm("Dokument in den Papierkorb verschieben?")) return;
    const { error } = await supabase
      .from('building_files')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', file.id);
    if (error) { toast.error(error.message); return; }
    await supabase.from('building_file_activity').insert({
      file_id: file.id,
      user_id: (await supabase.auth.getUser()).data.user?.id,
      action: 'deleted',
    });
    toast.success("In Papierkorb verschoben");
    onChanged();
    onClose();
  };

  const togglePersonVisibility = async (contactId: string) => {
    const exists = visibilityContacts.includes(contactId);
    if (exists) {
      await supabase.from('building_file_visibility').delete()
        .eq('file_id', file.id).eq('contact_id', contactId);
    } else {
      await supabase.from('building_file_visibility').insert({
        file_id: file.id, contact_id: contactId,
      });
    }
    queryClient.invalidateQueries({ queryKey: ['file-visibility', file.id] });
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold flex-1">Details</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Name</Label>
          <Input
            value={current.display_name}
            onChange={(e) => setEditing(s => ({ ...s, display_name: e.target.value }))}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Beschreibung</Label>
          <Textarea
            rows={2}
            value={current.description || ''}
            onChange={(e) => setEditing(s => ({ ...s, description: e.target.value }))}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Sichtbarkeit</Label>
          <Select
            value={current.visibility_role}
            onValueChange={(v) => setEditing(s => ({ ...s, visibility_role: v as VisibilityRole }))}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(VISIBILITY_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {current.visibility_role === 'personen' && (
          <div className="space-y-1">
            <Label className="text-xs">Freigegeben für</Label>
            <PersonVisibilityPicker
              contacts={contacts as any}
              selectedIds={visibilityContacts}
              onToggle={togglePersonVisibility}
            />
          </div>
        )}

        <div className="space-y-1">
          <Label className="text-xs">Wirtschaftsjahr</Label>
          <Select
            value={current.fiscal_year != null ? String(current.fiscal_year) : "general"}
            onValueChange={(v) =>
              setEditing(s => ({ ...s, fiscal_year: v === "general" ? null : parseInt(v, 10) }))
            }
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="general">Allgemein (kein Jahr)</SelectItem>
              {Array.from({ length: 8 }).map((_, i) => {
                const y = new Date().getFullYear() + 1 - i;
                return <SelectItem key={y} value={String(y)}>{y}</SelectItem>;
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Ablaufdatum (optional)</Label>
          <Input
            type="date"
            value={current.valid_until || ''}
            onChange={(e) => setEditing(s => ({ ...s, valid_until: e.target.value || null }))}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs flex items-center gap-1.5">
            <Wrench className="h-3.5 w-3.5" /> Wartung verknüpfen (optional)
          </Label>
          <Select
            value={current.maintenance_config_id || 'none'}
            onValueChange={(v) => setEditing(s => ({ ...s, maintenance_config_id: v === 'none' ? null : v }))}
          >
            <SelectTrigger><SelectValue placeholder="Keine Wartung" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Keine Wartung</SelectItem>
              {maintenanceConfigs.map((m: any) => (
                <SelectItem key={m.id} value={m.id}>{maintenanceLabel(m.maintenance_type)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {current.maintenance_config_id && current.valid_until && (
            <p className="text-[10px] text-muted-foreground">
              Speist Wartungs-Forecast (nächster Termin {format(new Date(current.valid_until), 'dd.MM.yyyy', { locale: de })})
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> KI-Indexierung (Nova)
            </Label>
            <Switch
              checked={current.rag_enabled}
              onCheckedChange={(v) => setEditing(s => ({ ...s, rag_enabled: v }))}
            />
          </div>

          {(() => {
            const status = (file as any).processing_status as string | undefined;
            const err = (file as any).processing_error as string | undefined;
            if (!status || status === 'done') return null;
            const map: Record<string, { label: string; cls: string }> = {
              pending: { label: 'Wartet auf KI-Verarbeitung', cls: 'bg-slate-100 text-slate-700 border-slate-300' },
              processing: { label: 'Wird gerade indiziert…', cls: 'bg-blue-50 text-blue-700 border-blue-300' },
              failed: { label: 'KI-Verarbeitung fehlgeschlagen', cls: 'bg-red-50 text-red-700 border-red-300' },
              skipped: { label: 'Übersprungen (kein Text gefunden)', cls: 'bg-amber-50 text-amber-700 border-amber-300' },
            };
            const m = map[status] ?? { label: status, cls: 'bg-muted text-muted-foreground border' };
            return (
              <div className={`text-[11px] rounded-md border px-2 py-1.5 ${m.cls}`}>
                <div className="font-medium">{m.label}</div>
                {err && <div className="mt-0.5 opacity-80 break-words">{err}</div>}
              </div>
            );
          })()}

          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={reindexing}
            onClick={async () => {
              setReindexing(true);
              try {
                const { error } = await supabase.functions.invoke('process-building-file', {
                  body: { fileId: file.id, force: true },
                });
                if (error) throw error;
                toast.success('OCR & RAG-Indexierung läuft im Hintergrund. Status erscheint hier, sobald fertig.');
                onChanged();
              } catch (e: any) {
                toast.error("Indexierung fehlgeschlagen: " + (e?.message ?? e));
              } finally {
                setReindexing(false);
              }
            }}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${reindexing ? 'animate-spin' : ''}`} />
            {reindexing ? 'Starte…' : 'OCR & RAG neu starten'}
          </Button>
        </div>

        {(file.linked_invoice_id || file.source_email_id) && (
          <>
            <Separator />
            <div className="space-y-2">
              <Label className="text-xs">Verknüpfungen</Label>
              {file.linked_invoice_id && (
                <Button variant="outline" size="sm" className="w-full justify-start gap-2"
                  onClick={() => navigate('/finance')}>
                  <ExternalLink className="h-3.5 w-3.5" /> Verknüpfte Rechnung öffnen
                </Button>
              )}
            </div>
          </>
        )}

        {versions.length > 1 && (
          <>
            <Separator />
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1.5">
                <History className="h-3.5 w-3.5" /> Versionen ({versions.length})
              </Label>
              <div className="space-y-1">
                {versions.map((v: any) => (
                  <div key={v.id} className="text-xs flex justify-between p-1.5 rounded hover:bg-accent">
                    <span>v{v.version} {v.id === file.id && '(aktuell)'}</span>
                    <span className="text-muted-foreground">
                      {format(new Date(v.created_at), 'dd.MM.yyyy', { locale: de })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <Separator />

        <div className="text-xs text-muted-foreground space-y-1">
          <div>Größe: {(file.file_size / 1024).toFixed(1)} KB</div>
          <div>Hochgeladen: {format(new Date(file.created_at), 'dd.MM.yyyy HH:mm', { locale: de })}</div>
          <div>Quelle: {file.source}</div>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          {isDirty && (
            <Button onClick={save} disabled={saving} size="sm">
              Änderungen speichern
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={handleDownload}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Download
            </Button>
            <Button variant="outline" size="sm" onClick={handleOpenInTab} title="In neuem Tab öffnen">
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="sm" className="text-destructive" onClick={handleDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
