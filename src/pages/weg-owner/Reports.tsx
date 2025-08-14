import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, Upload, X, AlertCircle } from "lucide-react";

interface Report {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  created_at: string;
  building_id: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  contact_address: string;
  attachments: any;
  reported_by?: string;
  updated_at?: string;
}

export const WegOwnerReports = () => {
  const { profile } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [isCreateReportOpen, setIsCreateReportOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [reportForm, setReportForm] = useState({
    title: "",
    description: "",
    priority: "medium",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    contact_address: "",
    building_id: "",
  });
  const [attachments, setAttachments] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (profile) {
      fetchReports();
      fetchBuildings();
      prefillContactInfo();
    }
  }, [profile]);

  const fetchBuildings = async () => {
    try {
      // Fetch building assignments
      const { data: assignments, error: assignmentsError } = await supabase
        .from("weg_owner_buildings")
        .select("id, building_id, created_at")
        .eq("user_id", profile?.user_id);

      if (assignmentsError) throw assignmentsError;

      if (assignments && assignments.length > 0) {
        const buildingIds = assignments.map(a => a.building_id);
        
        // Fetch building details
        const { data: buildingsData, error: buildingsError } = await supabase
          .from("buildings")
          .select("id, name, address, building_code")
          .in("id", buildingIds);

        if (buildingsError) throw buildingsError;
        
        setBuildings(buildingsData || []);
      }
    } catch (error) {
      console.error("Error fetching buildings:", error);
    }
  };

  const prefillContactInfo = async () => {
    try {
      // First try to get from WEG owners table
      const { data: wegOwnerData } = await supabase
        .from("weg_owners")
        .select("*")
        .eq("user_id", profile?.user_id)
        .single();

      if (wegOwnerData) {
        const fullName = `${wegOwnerData.first_name || ''} ${wegOwnerData.last_name || ''}`.trim();
        console.log('WEG Owner Data:', { 
          first_name: wegOwnerData.first_name, 
          last_name: wegOwnerData.last_name, 
          fullName, 
          email: wegOwnerData.email 
        });
        setReportForm(prev => ({
          ...prev,
          contact_name: fullName || wegOwnerData.email || 'WEG-Eigentümer',
          contact_email: wegOwnerData.email || profile?.email || '',
          contact_phone: wegOwnerData.phone || '',
        }));
        return;
      }

      // Fallback to profiles table
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", profile?.user_id)
        .single();

      if (profileData) {
        const fullName = `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim();
        setReportForm(prev => ({
          ...prev,
          contact_name: fullName || profileData.email || 'WEG-Eigentümer',
          contact_email: profileData.email || '',
          contact_phone: profileData.phone || '',
        }));
      }
    } catch (error) {
      console.error("Error fetching contact info:", error);
      // Set default values
      setReportForm(prev => ({
        ...prev,
        contact_name: 'WEG-Eigentümer',
        contact_email: profile?.email || '',
      }));
    }
  };

  const fetchReports = async () => {
    try {
      const { data, error } = await supabase
        .from("weg_reports")
        .select("*")
        .eq("reported_by", profile?.user_id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setReports(data || []);
    } catch (error) {
      console.error("Error fetching reports:", error);
      toast({
        title: "Fehler",
        description: "Meldungen konnten nicht geladen werden.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const uploadAttachments = async (reportId: string) => {
    if (attachments.length === 0) return [];

    const uploadedFiles = [];
    setUploading(true);

    for (const file of attachments) {
      const fileExt = file.name.split('.').pop();
      const fileName = `${reportId}/${Date.now()}.${fileExt}`;
      const filePath = `${profile?.user_id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('report-attachments')
        .upload(filePath, file);

      if (uploadError) {
        console.error('Error uploading file:', uploadError);
        continue;
      }

      uploadedFiles.push({
        name: file.name,
        path: filePath,
        size: file.size,
        type: file.type,
      });
    }

    setUploading(false);
    return uploadedFiles;
  };

  const createReport = async () => {
    if (!reportForm.title || !reportForm.description || !reportForm.contact_name || !reportForm.contact_email) {
      toast({
        title: "Fehler",
        description: "Bitte füllen Sie alle Pflichtfelder aus.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from("weg_reports")
        .insert([{
          title: reportForm.title,
          description: reportForm.description,
          priority: reportForm.priority,
          reported_by: profile?.user_id,
          weg_owner_id: profile?.user_id,
          building_id: reportForm.building_id || null,
          contact_name: reportForm.contact_name,
          contact_email: reportForm.contact_email,
          contact_phone: reportForm.contact_phone,
          contact_address: reportForm.contact_address,
          status: 'open'
        }])
        .select()
        .single();

      if (error) throw error;

      // Upload attachments
      const uploadedFiles = await uploadAttachments(data.id);
      if (uploadedFiles.length > 0) {
        await supabase
          .from("weg_reports")
          .update({ attachments: uploadedFiles })
          .eq("id", data.id);
      }

      setReports(prev => [{ ...data, attachments: uploadedFiles }, ...prev]);
      
      // Reset form but keep contact info
      setReportForm(prev => ({ 
        title: "", 
        description: "", 
        priority: "medium",
        contact_name: prev.contact_name, // Keep current contact info
        contact_email: prev.contact_email,
        contact_phone: prev.contact_phone,
        contact_address: '',
        building_id: '',
      }));
      setAttachments([]);
      setIsCreateReportOpen(false);
      
      toast({
        title: "Erfolg",
        description: "Meldung wurde erfolgreich erstellt.",
      });
    } catch (error: any) {
      console.error("Error creating report:", error);
      toast({
        title: "Fehler",
        description: "Meldung konnte nicht erstellt werden.",
        variant: "destructive",
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setAttachments(prev => [...prev, ...files]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return <Badge variant="destructive">Offen</Badge>;
      case "in_progress":
        return <Badge variant="secondary">In Bearbeitung</Badge>;
      case "resolved":
        return <Badge variant="default">Erledigt</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "low":
        return <Badge variant="outline">Niedrig</Badge>;
      case "medium":
        return <Badge variant="secondary">Mittel</Badge>;
      case "high":
        return <Badge variant="destructive">Hoch</Badge>;
      default:
        return <Badge variant="outline">{priority}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Laden...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Meldungen</h1>
          <p className="text-lg text-muted-foreground">
            Erstellen und verwalten Sie Ihre WEG-Meldungen
          </p>
        </div>
        <Dialog open={isCreateReportOpen} onOpenChange={setIsCreateReportOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-primary text-white hover:scale-105 transition-all duration-200 text-base px-6 py-3">
              <Plus className="h-5 w-5 mr-2" />
              Neue Meldung
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Neue WEG-Meldung erstellen</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Contact Information */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="contact_name">Name *</Label>
                  <Input
                    id="contact_name"
                    value={reportForm.contact_name}
                    onChange={(e) => setReportForm(prev => ({ ...prev, contact_name: e.target.value }))}
                    placeholder="Ihr Name"
                  />
                </div>
                <div>
                  <Label htmlFor="contact_email">E-Mail *</Label>
                  <Input
                    id="contact_email"
                    type="email"
                    value={reportForm.contact_email}
                    onChange={(e) => setReportForm(prev => ({ ...prev, contact_email: e.target.value }))}
                    placeholder="Ihre E-Mail Adresse"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="contact_phone">Telefon</Label>
                  <Input
                    id="contact_phone"
                    value={reportForm.contact_phone}
                    onChange={(e) => setReportForm(prev => ({ ...prev, contact_phone: e.target.value }))}
                    placeholder="Ihre Telefonnummer"
                  />
                </div>
                <div>
                  <Label htmlFor="contact_address">Adresse</Label>
                  {buildings.length > 0 ? (
                    <Select 
                      value={reportForm.building_id} 
                      onValueChange={(value) => {
                        const selectedBuilding = buildings.find(b => b.id === value);
                        setReportForm(prev => ({ 
                          ...prev, 
                          building_id: value,
                          contact_address: selectedBuilding ? `${selectedBuilding.name} - ${selectedBuilding.address}` : ''
                        }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Gebäude auswählen" />
                      </SelectTrigger>
                      <SelectContent>
                        {buildings.map((building) => (
                          <SelectItem key={building.id} value={building.id}>
                            {building.name} - {building.address}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="contact_address"
                      value={reportForm.contact_address}
                      onChange={(e) => setReportForm(prev => ({ ...prev, contact_address: e.target.value }))}
                      placeholder="Adresse des Problems"
                    />
                  )}
                </div>
              </div>

              {/* Report Information */}
              <div>
                <Label htmlFor="title">Titel *</Label>
                <Input
                  id="title"
                  value={reportForm.title}
                  onChange={(e) => setReportForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Kurze Beschreibung des Problems"
                />
              </div>
              <div>
                <Label htmlFor="description">Beschreibung *</Label>
                <Textarea
                  id="description"
                  value={reportForm.description}
                  onChange={(e) => setReportForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Detaillierte Beschreibung des Problems"
                  rows={4}
                />
              </div>
              <div>
                <Label htmlFor="priority">Priorität</Label>
                <Select value={reportForm.priority} onValueChange={(value) => setReportForm(prev => ({ ...prev, priority: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Priorität auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Niedrig</SelectItem>
                    <SelectItem value="medium">Mittel</SelectItem>
                    <SelectItem value="high">Hoch</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Attachments */}
              <div>
                <Label htmlFor="attachments">Anhänge</Label>
                <div className="space-y-2">
                  <Input
                    id="attachments"
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx"
                    onChange={handleFileChange}
                    className="cursor-pointer"
                  />
                  {attachments.length > 0 && (
                    <div className="space-y-2">
                      {attachments.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                          <span className="text-sm">{file.name}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeAttachment(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <Button onClick={createReport} className="w-full" disabled={uploading}>
                {uploading ? "Wird erstellt..." : "Meldung erstellen"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Reports List */}
      <div className="space-y-4">
        {reports.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Noch keine Meldungen erstellt.</p>
            </CardContent>
          </Card>
        ) : (
          reports.map((report) => (
            <Card key={report.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-xl">{report.title}</CardTitle>
                    <CardDescription className="mt-2">
                      Erstellt am: {new Date(report.created_at).toLocaleDateString('de-DE')}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {getStatusBadge(report.status)}
                    {getPriorityBadge(report.priority)}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{report.description}</p>
                {report.contact_name && (
                  <div className="mt-4 text-sm text-muted-foreground">
                    Kontakt: {report.contact_name} ({report.contact_email})
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};