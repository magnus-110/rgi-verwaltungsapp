import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { FileText, Plus, Trash2, Upload, Star, Loader2 } from "lucide-react";
import { toast } from "sonner";

const TEMPLATE_TYPES = [
  { value: "gesamtabrechnung", label: "Gesamtabrechnung" },
  { value: "einzelabrechnung", label: "Einzelabrechnung" },
  { value: "wirtschaftsplan", label: "Wirtschaftsplan" },
  { value: "vermoegensbericht", label: "Vermögensbericht" },
];

interface ReportTemplateSettingsProps {
  buildingId?: string;
}

export function ReportTemplateSettings({ buildingId }: ReportTemplateSettingsProps) {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("gesamtabrechnung");
  const [marginTop, setMarginTop] = useState(25);
  const [marginRight, setMarginRight] = useState(15);
  const [marginBottom, setMarginBottom] = useState(20);
  const [marginLeft, setMarginLeft] = useState(15);
  const [uploading, setUploading] = useState(false);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["report-templates", buildingId],
    queryFn: async () => {
      let query = supabase
        .from("report_templates" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (buildingId) {
        query = query.or(`building_id.is.null,building_id.eq.${buildingId}`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("report_templates" as any).insert({
        name: newName,
        type: newType,
        building_id: buildingId || null,
        margins: { top: marginTop, right: marginRight, bottom: marginBottom, left: marginLeft },
        is_default: templates.length === 0,
        management_mode: "weg",
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-templates"] });
      setShowCreate(false);
      setNewName("");
      toast.success("Vorlage erstellt");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("report_templates" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-templates"] });
      toast.success("Vorlage gelöscht");
    },
  });

  const setDefault = useMutation({
    mutationFn: async (id: string) => {
      // Reset all defaults for this type
      const template = templates.find((t: any) => t.id === id);
      if (!template) return;
      await supabase
        .from("report_templates" as any)
        .update({ is_default: false } as any)
        .eq("type", template.type);
      await supabase
        .from("report_templates" as any)
        .update({ is_default: true } as any)
        .eq("id", id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-templates"] });
      toast.success("Standard-Vorlage gesetzt");
    },
  });

  const uploadBackground = async (templateId: string, file: File) => {
    setUploading(true);
    try {
      const path = `report-backgrounds/${templateId}/${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("building-documents")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("building-documents")
        .getPublicUrl(path);

      await supabase
        .from("report_templates" as any)
        .update({ background_pdf_url: urlData.publicUrl } as any)
        .eq("id", templateId);

      queryClient.invalidateQueries({ queryKey: ["report-templates"] });
      toast.success("Hintergrund hochgeladen");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-5 w-5" /> PDF-Vorlagen
        </CardTitle>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-1" /> Neue Vorlage
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Neue PDF-Vorlage erstellen</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="z.B. Standard-Briefpapier" />
              </div>
              <div>
                <Label>Typ</Label>
                <Select value={newType} onValueChange={setNewType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Ränder (mm)</Label>
                <div className="grid grid-cols-4 gap-2 mt-1">
                  <div>
                    <span className="text-xs text-muted-foreground">Oben</span>
                    <Input type="number" value={marginTop} onChange={(e) => setMarginTop(Number(e.target.value))} />
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Rechts</span>
                    <Input type="number" value={marginRight} onChange={(e) => setMarginRight(Number(e.target.value))} />
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Unten</span>
                    <Input type="number" value={marginBottom} onChange={(e) => setMarginBottom(Number(e.target.value))} />
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Links</span>
                    <Input type="number" value={marginLeft} onChange={(e) => setMarginLeft(Number(e.target.value))} />
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => createMutation.mutate()} disabled={!newName || createMutation.isPending}>
                Erstellen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : templates.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Noch keine Vorlagen erstellt. Erstelle eine Vorlage, um Briefpapier und Ränder für die PDF-Generierung zu konfigurieren.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead>Hintergrund</TableHead>
                <TableHead className="w-[120px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell className="text-sm font-medium">
                    {t.name}
                    {t.is_default && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        <Star className="h-3 w-3 mr-0.5 fill-current" /> Standard
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {TEMPLATE_TYPES.find((tt) => tt.value === t.type)?.label || t.type}
                  </TableCell>
                  <TableCell>
                    {t.background_pdf_url ? (
                      <Badge variant="outline" className="text-xs text-green-700">Hochgeladen</Badge>
                    ) : (
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept=".pdf"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadBackground(t.id, file);
                          }}
                        />
                        <Badge variant="outline" className="text-xs cursor-pointer hover:bg-muted">
                          <Upload className="h-3 w-3 mr-1" /> {uploading ? "..." : "PDF hochladen"}
                        </Badge>
                      </label>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {!t.is_default && (
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setDefault.mutate(t.id)}>
                          <Star className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => deleteMutation.mutate(t.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
