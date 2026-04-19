import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

interface ContactDocumentsSectionProps {
  contactId: string;
}

export function ContactDocumentsSection({ contactId }: ContactDocumentsSectionProps) {
  const { toast } = useToast();

  const { data: files = [], isLoading } = useQuery({
    queryKey: ["contact-documents", contactId],
    queryFn: async () => {
      // Files linked directly via linked_contact_id OR shared via building_file_visibility
      const { data: direct } = await supabase
        .from("building_files")
        .select("id, display_name, file_path, file_size, mime_type, source, valid_until, created_at, building_id, buildings(name)")
        .eq("linked_contact_id", contactId)
        .is("deleted_at", null)
        .eq("is_current_version", true)
        .order("created_at", { ascending: false });

      const { data: visibility } = await supabase
        .from("building_file_visibility")
        .select("file_id, building_files!inner(id, display_name, file_path, file_size, mime_type, source, valid_until, created_at, building_id, deleted_at, is_current_version, buildings(name))")
        .eq("contact_id", contactId);

      const visList = (visibility || [])
        .map((v: any) => v.building_files)
        .filter((f: any) => f && !f.deleted_at && f.is_current_version);

      const map = new Map();
      [...(direct || []), ...visList].forEach((f: any) => map.set(f.id, f));
      return Array.from(map.values());
    },
  });

  const handleOpen = async (filePath: string, name: string) => {
    const { data, error } = await supabase.storage
      .from("building-files")
      .createSignedUrl(filePath, 3600);
    if (error || !data) {
      toast({ title: "Fehler", description: "Datei konnte nicht geöffnet werden", variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-4">Lädt...</p>;
  }

  if (files.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        Keine Dokumente verknüpft. Dokumente können in der Stammakte eines Gebäudes dieser Person zugeordnet werden.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {files.map((f: any) => (
        <Card key={f.id} className="p-3 flex items-center gap-3">
          <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{f.display_name}</p>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              {f.buildings?.name && (
                <Badge variant="outline" className="text-[10px]">{f.buildings.name}</Badge>
              )}
              {f.source && f.source !== "manual" && (
                <Badge variant="secondary" className="text-[10px]">{f.source}</Badge>
              )}
              {f.valid_until && (
                <span className="text-[10px] text-muted-foreground">
                  Gültig bis {format(new Date(f.valid_until), "dd.MM.yyyy", { locale: de })}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground">
                {format(new Date(f.created_at), "dd.MM.yyyy", { locale: de })}
              </span>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => handleOpen(f.file_path, f.display_name)}>
            <ExternalLink className="h-4 w-4" />
          </Button>
        </Card>
      ))}
    </div>
  );
}
