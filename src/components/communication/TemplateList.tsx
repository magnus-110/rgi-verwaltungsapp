import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Mail, Trash2, Globe, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EditTemplateDialog } from "./EditTemplateDialog";

interface Props {
  buildingId: string;
  type?: "letter" | "email";
  onUse?: (template: any) => void;
}

export const TemplateList = ({ buildingId, type, onUse }: Props) => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<any | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["comm-templates", buildingId, type, "general"],
    queryFn: async () => {
      let q = supabase.from("comm_templates").select("*")
        .or(`building_id.eq.${buildingId},is_global.eq.true`)
        .or("template_kind.eq.general,template_kind.is.null")
        .order("created_at", { ascending: false });
      if (type) q = q.eq("type", type);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });


  const handleDelete = async (id: string, docxPath: string | null) => {
    if (!confirm("Vorlage wirklich löschen?")) return;
    if (docxPath) await supabase.storage.from("comm-assets").remove([docxPath]);
    const { error } = await supabase.from("comm_templates").delete().eq("id", id);
    if (error) { toast({ title: "Fehler", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Vorlage gelöscht" });
    qc.invalidateQueries({ queryKey: ["comm-templates", buildingId] });
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Laden...</p>;
  if (templates.length === 0) {
    return <p className="text-sm text-muted-foreground p-4 text-center border border-dashed rounded">Noch keine Vorlagen vorhanden.</p>;
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {templates.map((t: any) => (
          <Card key={t.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  {t.type === "letter" ? <FileText className="h-4 w-4 text-primary flex-shrink-0" /> : <Mail className="h-4 w-4 text-primary flex-shrink-0" />}
                  <span className="font-medium text-sm truncate">{t.name}</span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {t.is_global && (
                    <Badge variant="secondary" className="gap-1">
                      <Globe className="h-3 w-3" /> Global
                    </Badge>
                  )}
                  <Badge variant="outline">{t.type === "letter" ? "Brief" : "Mail"}</Badge>
                </div>
              </div>
              {t.description && <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{t.description}</p>}
              {Array.isArray(t.variables) && t.variables.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {t.variables.slice(0, 4).map((v: string) => (
                    <Badge key={v} variant="secondary" className="text-[10px] font-mono">{`{{${v}}}`}</Badge>
                  ))}
                  {t.variables.length > 4 && <Badge variant="secondary" className="text-[10px]">+{t.variables.length - 4}</Badge>}
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t">
                {onUse ? (
                  <Button size="sm" variant="default" onClick={() => onUse(t)}>Verwenden</Button>
                ) : <span />}
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(t)}
                    title="Bearbeiten"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(t.id, t.docx_path)}
                    className="text-destructive hover:text-destructive" title="Löschen">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <EditTemplateDialog
        open={!!editing}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        template={editing}
      />
    </>
  );
};

