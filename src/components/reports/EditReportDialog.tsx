import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

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

interface EditReportDialogProps {
  report: Report;
  tableName: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const EditReportDialog = ({ report, tableName, open, onClose, onSaved }: EditReportDialogProps) => {
  const [status, setStatus] = useState(report.status);
  const [adminNotes, setAdminNotes] = useState(report.admin_notes || "");
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    try {
      setLoading(true);
      
      const { error } = await supabase
        .from(tableName as any)
        .update({
          status,
          admin_notes: adminNotes,
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Meldung bearbeiten</DialogTitle>
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
            <label className="text-sm font-medium mb-2 block">Admin-Notizen</label>
            <Textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder="Interne Notizen zur Meldung..."
              rows={4}
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