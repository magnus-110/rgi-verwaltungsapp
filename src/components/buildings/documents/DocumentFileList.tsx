import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Eye, Users, Lock, Calendar, Sparkles, Receipt, Mail, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { DocFile, VISIBILITY_LABELS } from "./types";

interface DocumentFileListProps {
  buildingId: string;
  categoryId: string | null;
  searchQuery: string;
  selectedFileId: string | null;
  onSelect: (file: DocFile) => void;
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
  const { data: files = [], isLoading } = useQuery({
    queryKey: ['stammakte-files', buildingId, categoryId, searchQuery],
    queryFn: async () => {
      let q = supabase
        .from('building_files')
        .select('*')
        .eq('building_id', buildingId)
        .eq('is_current_version', true)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });

      if (categoryId) q = q.eq('category_id', categoryId);
      if (searchQuery.trim()) {
        const term = `%${searchQuery.trim()}%`;
        q = q.or(`display_name.ilike.${term},description.ilike.${term},extracted_text.ilike.${term}`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as DocFile[];
    },
  });

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Laden...</div>;
  }

  if (files.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
        Keine Dokumente in diesem Ordner.
        <p className="text-xs mt-1">Dateien per Drag & Drop hochladen.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="divide-y">
        {files.map(f => {
          const isExpiringSoon = f.valid_until && new Date(f.valid_until) <= new Date(Date.now() + 90 * 86400000);
          const isExpired = f.valid_until && new Date(f.valid_until) < new Date();
          return (
            <div
              key={f.id}
              onClick={() => onSelect(f)}
              onDoubleClick={async () => {
                const { data, error } = await supabase.storage
                  .from('building-files')
                  .createSignedUrl(f.file_path, 60);
                if (!error && data) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
              }}
              className={cn(
                "w-full text-left p-3 hover:bg-accent transition-colors cursor-pointer",
                selectedFileId === f.id && "bg-accent"
              )}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded bg-muted flex-shrink-0">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm truncate flex-1">{f.display_name}</p>
                    {f.version > 1 && <Badge variant="outline" className="text-[10px] h-4 px-1">v{f.version}</Badge>}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 flex-shrink-0"
                      title="In neuem Tab öffnen"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const { data, error } = await supabase.storage
                          .from('building-files')
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
          );
        })}
      </div>
    </ScrollArea>
  );
}
