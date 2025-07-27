import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertCircle, Clock, CheckCircle, Plus, Edit } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useManagementMode } from "@/hooks/useManagementMode";
import { toast } from "sonner";

interface Report {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  contact_address: string;
  created_at: string;
  updated_at: string;
  internal_notes?: string;
  admin_notes?: string;
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case "open":
      return <Badge variant="destructive"><AlertCircle className="mr-1 h-3 w-3" />Offen</Badge>;
    case "in_progress":
      return <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />In Bearbeitung</Badge>;
      case "resolved":
        return <Badge variant="default"><CheckCircle className="mr-1 h-3 w-3" />Bearbeitet</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

const getPriorityBadge = (priority: string) => {
  switch (priority) {
    case "critical":
      return <Badge className="bg-red-500 text-white">Kritisch</Badge>;
    case "high":
      return <Badge className="bg-orange-500 text-white">Hoch</Badge>;
    case "medium":
      return <Badge className="bg-yellow-500 text-black">Mittel</Badge>;
    case "low":
      return <Badge className="bg-green-500 text-white">Niedrig</Badge>;
    default:
      return <Badge variant="outline">{priority}</Badge>;
  }
};

export const Reports = () => {
  const { managementMode } = useManagementMode();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [editingStatus, setEditingStatus] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [adminNotes, setAdminNotes] = useState("");

  useEffect(() => {
    fetchReports();
  }, [managementMode]);

  const fetchReports = async () => {
    try {
      setLoading(true);
      const tableName = managementMode === "weg" ? "weg_reports" : "miete_reports";
      
      const { data, error } = await supabase
        .from(tableName)
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setReports(data || []);
    } catch (error) {
      console.error("Error fetching reports:", error);
    } finally {
      setLoading(false);
    }
  };

  const openReports = reports.filter(r => r.status === "open").length;
  const inProgressReports = reports.filter(r => r.status === "in_progress").length;
  const resolvedReports = reports.filter(r => r.status === "resolved").length;

  const handleEditReport = (report: Report) => {
    setSelectedReport(report);
    setEditingStatus(report.status);
    setInternalNotes(report.internal_notes || "");
    setAdminNotes(report.admin_notes || "");
  };

  const handleUpdateReport = async () => {
    if (!selectedReport) return;

    try {
      const tableName = managementMode === "weg" ? "weg_reports" : "miete_reports";
      
      const { error } = await supabase
        .from(tableName)
        .update({
          status: editingStatus,
          internal_notes: internalNotes,
          admin_notes: adminNotes,
          updated_at: new Date().toISOString()
        })
        .eq("id", selectedReport.id);

      if (error) throw error;

      // Update local state
      setReports(reports.map(report => 
        report.id === selectedReport.id 
          ? { 
              ...report, 
              status: editingStatus, 
              internal_notes: internalNotes, 
              admin_notes: adminNotes 
            }
          : report
      ));
      
      setSelectedReport(null);
      toast.success("Meldung erfolgreich aktualisiert");
    } catch (error) {
      console.error("Error updating report:", error);
      toast.error("Fehler beim Aktualisieren der Meldung");
    }
  };
  return (
    <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Meldungen</h2>
            <p className="text-muted-foreground">
              Verwalten Sie alle eingegangenen Meldungen
            </p>
          </div>
          <Button className="bg-gradient-primary hover:opacity-90">
            <Plus className="mr-2 h-4 w-4" />
            Neue Meldung
          </Button>
        </div>

        {/* Statistiken */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Gesamt</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{reports.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Offen</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-500">{openReports}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">In Bearbeitung</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-500">{inProgressReports}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Erledigt</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">{resolvedReports}</div>
            </CardContent>
          </Card>
        </div>

        {/* Meldungen Liste */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-8">Laden...</div>
          ) : reports.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Keine Meldungen vorhanden.</p>
            </div>
          ) : (
            reports.map((report) => (
              <Card key={report.id} className="hover:shadow-elegant transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{report.title}</CardTitle>
                      <CardDescription>{report.description}</CardDescription>
                    </div>
                    <div className="flex space-x-2">
                      {getStatusBadge(report.status)}
                      {getPriorityBadge(report.priority)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <p className="text-sm font-medium">Kontakt</p>
                      <p className="text-sm text-muted-foreground">{report.contact_name}</p>
                      <p className="text-sm text-muted-foreground">{report.contact_email}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Telefon</p>
                      <p className="text-sm text-muted-foreground">{report.contact_phone || 'Nicht angegeben'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Erstellt</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(report.created_at).toLocaleDateString('de-DE')}
                      </p>
                    </div>
                  </div>
                  
                  {/* Admin Notes - visible to both admin and tenant/owner */}
                  {report.admin_notes && (
                    <div className="mt-4 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                      <p className="text-sm font-medium text-primary mb-1">Verwalter-Notiz:</p>
                      <p className="text-sm">{report.admin_notes}</p>
                    </div>
                  )}
                  
                  {/* Internal Notes - only visible to admins */}
                  {report.internal_notes && (
                    <div className="mt-4 p-3 bg-muted border rounded-lg">
                      <p className="text-sm font-medium mb-1">Interne Notiz (nur Admin):</p>
                      <p className="text-sm text-muted-foreground">{report.internal_notes}</p>
                    </div>
                  )}
                  <div className="flex space-x-2 mt-4">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleEditReport(report)}
                        >
                          <Edit className="mr-1 h-3 w-3" />
                          Bearbeiten
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>Meldung bearbeiten</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <Label htmlFor="status">Status</Label>
                            <Select value={editingStatus} onValueChange={setEditingStatus}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="open">Offen</SelectItem>
                                <SelectItem value="resolved">Bearbeitet</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label htmlFor="internal_notes">Interne Notizen (nur für Admins)</Label>
                            <Textarea
                              id="internal_notes"
                              value={internalNotes}
                              onChange={(e) => setInternalNotes(e.target.value)}
                              placeholder="Interne Notizen eingeben..."
                              rows={3}
                            />
                          </div>
                          <div>
                            <Label htmlFor="admin_notes">Verwalter-Notizen (sichtbar für Mieter/Eigentümer)</Label>
                            <Textarea
                              id="admin_notes"
                              value={adminNotes}
                              onChange={(e) => setAdminNotes(e.target.value)}
                              placeholder="Notizen für Mieter/Eigentümer eingeben..."
                              rows={3}
                            />
                          </div>
                          <div className="flex space-x-2">
                            <Button onClick={handleUpdateReport} className="bg-gradient-primary hover:opacity-90">
                              Änderungen speichern
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
    </div>
  );
};