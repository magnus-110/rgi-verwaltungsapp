import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useManagementMode } from "@/hooks/useManagementMode";
import { toast } from "sonner";
import { FileText, Edit, Trash2, Plus } from "lucide-react";

interface ReportTemplate {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface ReportTemplatesManagerProps {
  onTemplateSelect?: (template: ReportTemplate) => void;
}

export const ReportTemplatesManager = ({ onTemplateSelect }: ReportTemplatesManagerProps) => {
  const { managementMode } = useManagementMode();
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ReportTemplate | null>(null);
  const [formData, setFormData] = useState({
    name: ""
  });

  useEffect(() => {
    fetchTemplates();
  }, [managementMode]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("report_templates")
        .select("*")
        .eq("management_mode", managementMode)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error("Error fetching templates:", error);
      toast.error("Fehler beim Laden der Vorlagen");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTemplate = async () => {
    if (!formData.name.trim()) {
      toast.error("Name ist erforderlich");
      return;
    }

    try {
      const { error } = await supabase
        .from("report_templates")
        .insert({
          name: formData.name.trim(),
          management_mode: managementMode
        });

      if (error) throw error;

      toast.success("Vorlage erfolgreich erstellt");
      setIsCreateDialogOpen(false);
      resetForm();
      fetchTemplates();
    } catch (error) {
      console.error("Error creating template:", error);
      toast.error("Fehler beim Erstellen der Vorlage");
    }
  };

  const handleUpdateTemplate = async () => {
    if (!editingTemplate) return;

    try {
      const { error } = await supabase
        .from("report_templates")
        .update({
          name: formData.name.trim(),
          updated_at: new Date().toISOString()
        })
        .eq("id", editingTemplate.id);

      if (error) throw error;

      toast.success("Vorlage erfolgreich aktualisiert");
      setEditingTemplate(null);
      resetForm();
      fetchTemplates();
    } catch (error) {
      console.error("Error updating template:", error);
      toast.error("Fehler beim Aktualisieren der Vorlage");
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm("Sind Sie sicher, dass Sie diese Vorlage löschen möchten?")) return;

    try {
      const { error } = await supabase
        .from("report_templates")
        .delete()
        .eq("id", templateId);

      if (error) throw error;

      toast.success("Vorlage erfolgreich gelöscht");
      fetchTemplates();
    } catch (error) {
      console.error("Error deleting template:", error);
      toast.error("Fehler beim Löschen der Vorlage");
    }
  };

  const openEditDialog = (template: ReportTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name
    });
  };

  const resetForm = () => {
    setFormData({
      name: ""
    });
  };

  const getPriorityColor = (priority: string) => {
    return "outline";
  };

  const getPriorityLabel = (priority: string) => {
    return priority;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Meldungsvorlagen</h3>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { resetForm(); setIsCreateDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Vorlage erstellen
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Neue Vorlage erstellen</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name der Vorlage</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="z.B. Heizungsausfall, Wasserrohrbruch..."
                />
              </div>
              <div className="flex justify-end space-x-2 pt-4">
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Abbrechen
                </Button>
                <Button onClick={handleCreateTemplate}>
                  Erstellen
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-center py-4">Lade Vorlagen...</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Keine Vorlagen vorhanden. Erstellen Sie Ihre erste Vorlage.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-sm font-medium">{template.name}</CardTitle>
                  <div className="flex space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(template)}
                      className="h-8 w-8 p-0"
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteTemplate(template.id)}
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Erstellt: {new Date(template.created_at).toLocaleDateString("de-DE")}
                  </p>
                  {onTemplateSelect && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onTemplateSelect(template)}
                      className="w-full"
                    >
                      Verwenden
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Template Dialog */}
      <Dialog open={editingTemplate !== null} onOpenChange={(open) => !open && setEditingTemplate(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Vorlage bearbeiten</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name der Vorlage</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="z.B. Heizungsausfall, Wasserrohrbruch..."
              />
            </div>
            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={() => setEditingTemplate(null)}>
                Abbrechen
              </Button>
              <Button onClick={handleUpdateTemplate}>
                Aktualisieren
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};