import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Eye, Users, Lock, Calendar, Sparkles, Receipt, Mail, ExternalLink, Trash2, Loader2, Search, X, Archive, ArchiveRestore } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";
import { DocFile, VISIBILITY_LABELS, getFileBucket } from "./types";
import { ARCHIVE_CATEGORY_ID } from "./FolderTree";

interface DocumentFileListProps {
  buildingId: string;
  categoryId: string | null;
  searchQuery: string;
  selectedFileId: string | null;
  onSelect: (file: DocFile) => void;
}

function HighlightText({ text, search }: { text: string; search: string }) {
  if (!search.trim()) return <>{text}</>;
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === search.toLowerCase() ? (
          <span key={i} className="bg-yellow-200 text-yellow-900 px-0.5 rounded">{part}</span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

const sourceIcon = (source: string) => {
  switch (source) {
    case 'email': return <Mail className="h-3 w-3" />;
    case 'invoice': return <Receipt className="h-3 w-3" />;
    default: return null;
  }
};

const visIcon = (role: string) => {
  switch (role) {
    case 'intern': return <Lock className="h-3 w-3" />;
    case 'alle': return <Eye className="h-3 w-3" />;
    case 'personen': return <Users className="h-3 w-3" />;
    default: return <Eye className="h-3 w-3" />;
  }
};

export function DocumentFileList({ buildingId, categoryId, searchQuery, selectedFileId, onSelect }: DocumentFileListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [localSearch, setLocalSearch] = useState("");

  const effectiveSearch = (localSearch || searchQuery).trim();
  const isArchiveView = categoryId === ARCHIVE_CATEGORY_ID;

  const { data: files = [], isLoading } = useQuery({
    queryKey: ['stammakte-files', buildingId, categoryId, effectiveSearch],
    queryFn: async () => {
      let q = supabase
        .from('building_files')
        .select('*');

      if (effectiveSearch) {
        const term = `%${effectiveSearch}%`;
        q = q.or(`display_name.ilike.${term},description.ilike.${term},extracted_text.ilike.${term}`);
      }

      q = q.eq('building_id', buildingId)
        .eq('is_current_version', true)
        .is('deleted_at', null);

      if (isArchiveView) {
        q = q.not('archived_at', 'is', null);
      } else {
        q = q.is('archived_at', null);
        if (categoryId) q = q.eq('category_id', categoryId);
      }
      q = q.order('updated_at', { ascending: false });

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as DocFile[];
    },
  });


  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 96,
    overscan: 8,
  });

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allSelected = files.length > 0 && files.every(f => selectedIds.has(f.id));
  const someSelected = selectedIds.size > 0;

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(files.map(f => f.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase
        .from('building_files')
        .update({ deleted_at: new Date().toISOString() } as any)
        .in('id', ids);
      if (error) throw error;
      toast.success(`${ids.length} Dokument(e) in Papierkorb verschoben`);
      setSelectedIds(new Set());
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ['stammakte-files'] });
    } catch (e: any) {
      toast.error("Löschen fehlgeschlagen: " + e.message);
    } finally {
      setDeleting(false);
    }
  };

  // Dokumente archivieren / wiederherstellen (kein Löschen)
  const setArchived = async (ids: string[], archived: boolean) => {
    if (ids.length === 0) return;
    const { error } = await supabase
      .from('building_files')
      .update({ archived_at: archived ? new Date().toISOString() : null } as any)
      .in('id', ids);
    if (error) {
      toast.error((archived ? "Archivieren" : "Wiederherstellen") + " fehlgeschlagen: " + error.message);
      return;
    }
    toast.success(`${ids.length} Dokument(e) ${archived ? "archiviert" : "wiederhergestellt"}`);
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ['stammakte-files'] });
    queryClient.invalidateQueries({ queryKey: ['stammakte-counts', buildingId] });
    queryClient.invalidateQueries({ queryKey: ['stammakte-archived-count', buildingId] });
  };

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Laden...</div>;
  }

  if (files.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
        {effectiveSearch ? (
          <>Keine Dokumente für „{effectiveSearch}" gefunden.</>
        ) : isArchiveView ? (
          <>Keine archivierten Dokumente.</>
        ) : (
          <>Keine Dokumente in diesem Ordner.<p className="text-xs mt-1">Dateien per Drag & Drop hochladen.</p></>
        )}
      </div>
    );
  }


  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30 gap-2">

        <div className="flex items-center gap-2">
          <Checkbox
            checked={allSelected}
            onCheckedChange={toggleAll}
            aria-label="Alle auswählen"
          />
          <span className="text-xs text-muted-foreground">
            {someSelected ? `${selectedIds.size} ausgewählt` : `${files.length} Dokument(e)`}
          </span>
        </div>
        {someSelected && (
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5"
              onClick={() => setArchived(Array.from(selectedIds), !isArchiveView)}
            >
              {isArchiveView ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
              {isArchiveView ? "Wiederherstellen" : "Archivieren"}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="h-7 gap-1.5"
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Löschen
            </Button>
          </div>
        )}
      </div>

      <div ref={parentRef} className="flex-1 overflow-y-auto">
        <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const f = files[vi.index];
            const isExpiringSoon = f.valid_until && new Date(f.valid_until) <= new Date(Date.now() + 90 * 86400000);
            const isExpired = f.valid_until && new Date(f.valid_until) < new Date();
            const isChecked = selectedIds.has(f.id);
            return (
              <div
                key={f.id}
                data-index={vi.index}
                ref={virtualizer.measureElement}
                className="absolute top-0 left-0 w-full"
                style={{ transform: `translateY(${vi.start}px)` }}
              >
                <div
                  draggable
                  onDragStart={(e) => {
                    // If row is part of current selection, drag all selected; else drag just this one
                    const ids = selectedIds.has(f.id) && selectedIds.size > 0
                      ? Array.from(selectedIds)
                      : [f.id];
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("application/x-dms-file-ids", JSON.stringify(ids));
                    e.dataTransfer.setData("text/plain", ids.join(","));
                  }}
                  onClick={() => onSelect(f)}
                  onDoubleClick={async () => {
                    const { data, error } = await supabase.storage
                      .from(getFileBucket(f.source))
                      .createSignedUrl(f.file_path, 60);
                    if (!error && data) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
                  }}
                  className={cn(
                    "w-full text-left p-3 hover:bg-accent transition-colors cursor-pointer border-b",
                    selectedFileId === f.id && "bg-accent",
                    isChecked && "bg-accent/60"
                  )}
                >

                  <div className="flex items-start gap-3">
                    <div
                      className="flex items-center pt-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => toggleOne(f.id)}
                        aria-label="Dokument auswählen"
                      />
                    </div>
                    <div className="p-2 rounded bg-muted flex-shrink-0">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate flex-1">
                          <HighlightText text={f.display_name} search={effectiveSearch} />
                        </p>
                        {f.version > 1 && <Badge variant="outline" className="text-[10px] h-4 px-1">v{f.version}</Badge>}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 flex-shrink-0"
                          title="In neuem Tab öffnen"
                          onClick={async (e) => {
                            e.stopPropagation();
                            const { data, error } = await supabase.storage
                              .from(getFileBucket(f.source))
                              .createSignedUrl(f.file_path, 60);
                            if (!error && data) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
                          }}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {f.description && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{f.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5 gap-1">
                          {visIcon(f.visibility_role)}
                          {VISIBILITY_LABELS[f.visibility_role]}
                        </Badge>
                        {f.source !== 'manual' && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5 gap-1">
                            {sourceIcon(f.source)}
                            {f.source}
                          </Badge>
                        )}
                        {f.rag_enabled && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5 gap-1">
                            <Sparkles className="h-3 w-3" /> KI
                          </Badge>
                        )}
                        {f.valid_until && (
                          <Badge
                            variant={isExpired ? "destructive" : isExpiringSoon ? "default" : "outline"}
                            className="text-[10px] h-4 px-1.5 gap-1"
                          >
                            <Calendar className="h-3 w-3" />
                            {format(new Date(f.valid_until), 'dd.MM.yyyy', { locale: de })}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{selectedIds.size} Dokument(e) löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die ausgewählten Dokumente werden in den Papierkorb verschoben und sind nicht mehr sichtbar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleBulkDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Lösche...</> : "Löschen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
