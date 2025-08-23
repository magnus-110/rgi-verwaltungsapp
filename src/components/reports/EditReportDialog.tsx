import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useManagementMode } from "@/hooks/useManagementMode";

interface Report {
  id: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  building_id: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  contact_address: string;
  attachments: any;
  admin_notes?: string;
  internal_notes?: string;
  buildings?: {
    name: string;
    address: string;
    manager_name?: string | null;
  } | null;
}

interface Template {
  id: string;
  title: string;
  content: string;
}

interface EditReportDialogProps {
  report: Report;
  tableName: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const EditReportDialog = ({ report, tableName, open, onClose, onSaved }: EditReportDialogProps) => {
  const { managementMode } = useManagementMode();
  const [status, setStatus] = useState(report.status);
  const [adminNotes, setAdminNotes] = useState(report.admin_notes || "");
  const [internalNotes, setInternalNotes] = useState(report.internal_notes || "");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchTemplates();
      // Reset form when dialog opens
      setStatus(report.status);
      setAdminNotes(report.admin_notes || "");
      setInternalNotes(report.internal_notes || "");
      setSelectedTemplate("");
    }
  }, [open, report, managementMode]); // managementMode als Abhängigkeit hinzufügen

  const fetchTemplates = async () => {
    console.log('Fetching templates for management mode:', managementMode);
    try {
      const { data, error } = await supabase
        .from('report_templates')
        .select('*')
        .eq('management_mode', managementMode)
        .order('name');

      if (error) throw error;
      
      console.log('Raw template data:', data);
      
      // Map the data to match the expected Template interface
      const mappedTemplates = data?.map(template => ({
        id: template.id,
        title: template.name,
        content: template.content || ''
      })) || [];
      
      console.log('Mapped templates:', mappedTemplates);
      setTemplates(mappedTemplates);
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    console.log('=== Template Selection Debug ===');
    console.log('Template ID received:', templateId);
    console.log('All available templates:', templates);
    
    const template = templates.find(t => t.id === templateId);
    console.log('Found template object:', template);
    
    if (template && template.content) {
      console.log('Current adminNotes value:', `"${adminNotes}"`);
      console.log('Template content to add:', `"${template.content}"`);
      
      // Direkt den Template-Inhalt setzen (ohne die Logik für bestehenden Text)
      const newContent = template.content;
      console.log('Setting new content:', `"${newContent}"`);
      
      setAdminNotes(newContent);
      
      // Toast zur Bestätigung
      toast({
        title: "Vorlage eingefügt",
        description: `"${template.title}" wurde als Verwalter-Notiz eingefügt.`,
      });
      
      console.log('Template insertion completed');
    } else {
      console.log('Template not found or content empty:', { template, templateId });
      toast({
        title: "Fehler",
        description: "Vorlage konnte nicht eingefügt werden.",
        variant: "destructive",
      });
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      
      const { error } = await supabase
        .from(tableName as any)
        .update({
          status,
          admin_notes: adminNotes,
          internal_notes: internalNotes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", report.id);

      if (error) throw error;

      toast({
        title: "Erfolgreich",
        description: "Meldung wurde aktualisiert.",
      });

      onSaved();
      onClose();
    } catch (error) {
      console.error("Error updating report:", error);
      toast({
        title: "Fehler",
        description: "Meldung konnte nicht aktualisiert werden.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto z-50" aria-describedby="edit-report-description">
        <DialogHeader>
          <DialogTitle>Meldung bearbeiten</DialogTitle>
          <p id="edit-report-description" className="sr-only">
            Dialog zum Bearbeiten einer Meldung mit Status, Verwalter-Notizen und internen Notizen
          </p>
        </DialogHeader>
        
        <div className="space-y-6">
          <div>
            <h3 className="font-medium mb-1">{report.title}</h3>
            <p className="text-sm text-muted-foreground">{report.description}</p>
          </div>

          <div>
            <label className="text-sm font-medium mb-3 block">Status</label>
            <div className="flex gap-2">
              <Button
                variant={status === "open" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatus("open")}
              >
                Offen
              </Button>
              <Button
                variant={status === "in_progress" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatus("in_progress")}
              >
                Bearbeitet
              </Button>
            </div>
          </div>

          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
              <label className="text-sm font-medium">Verwalter-Notiz (sichtbar für Kunden)</label>
              {templates.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Vorlage:</span>
                  <Select 
                    onValueChange={(value) => {
                      console.log('=== SELECT TRIGGERED ===');
                      console.log('Selected value:', value);
                      handleTemplateSelect(value);
                    }}
                  >
                    <SelectTrigger className="w-48 bg-background border border-border shadow-sm">
                      <SelectValue placeholder="Vorlage auswählen..." />
                    </SelectTrigger>
                    <SelectContent className="z-50 bg-background border border-border shadow-lg">
                      {templates.map((template) => (
                        <SelectItem 
                          key={template.id} 
                          value={template.id}
                          className="cursor-pointer hover:bg-muted focus:bg-muted"
                        >
                          {template.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <Textarea
              value={adminNotes}
              onChange={(e) => {
                console.log('Textarea onChange:', e.target.value);
                setAdminNotes(e.target.value);
              }}
              placeholder="Antwort für den Kunden..."
              rows={4}
              className="min-h-[100px]"
            />
            {templates.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Keine Vorlagen verfügbar. Erstellen Sie Vorlagen im Tab "Vorlagen".
              </p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Interne Notiz (nur für Verwalter)</label>
            <Textarea
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              placeholder="Interne Notizen zur Meldung..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Abbrechen
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? "Speichern..." : "Speichern"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};