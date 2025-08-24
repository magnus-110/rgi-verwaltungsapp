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
import { Plus, Upload, X, AlertCircle, FileText } from "lucide-react";


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

  // Real-time subscription for new reports
  useEffect(() => {
    if (!profile) return;

    const channel = supabase
      .channel('weg-reports-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'weg_reports',
          filter: `reported_by=eq.${profile.user_id}`
        },
        (payload) => {
          console.log('New WEG report received:', payload);
          // Fetch reports to get complete data with proper relations
          fetchReports();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'weg_reports',
          filter: `reported_by=eq.${profile.user_id}`
        },
        (payload) => {
          console.log('WEG report updated:', payload);
          setReports(prev => prev.map(r => 
            r.id === payload.new.id ? { ...r, ...payload.new } as Report : r
          ));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
      let contactName = '';
      let contactEmail = profile?.email || '';
      let contactPhone = '';

      // 1. Try to get from WEG owners table first
      try {
        const { data: wegOwnerData } = await supabase
          .from("weg_owners")
          .select("*")
          .eq("user_id", profile?.user_id)
          .maybeSingle();

        if (wegOwnerData) {
          const fullName = `${wegOwnerData.first_name || ''} ${wegOwnerData.last_name || ''}`.trim();
          if (fullName) {
            contactName = fullName;
          }
          if (wegOwnerData.email) {
            contactEmail = wegOwnerData.email;
          }
          if (wegOwnerData.phone) {
            contactPhone = wegOwnerData.phone;
          }
          console.log('WEG Owner Data loaded:', { 
            first_name: wegOwnerData.first_name, 
            last_name: wegOwnerData.last_name, 
            fullName: contactName,
            email: contactEmail,
            phone: contactPhone
          });
        }
      } catch (error) {
        console.warn('Could not load WEG owner data:', error);
      }

      // 2. Fallback to profiles table if still missing data
      if (!contactName || !contactPhone) {
        try {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("*")
            .eq("user_id", profile?.user_id)
            .maybeSingle();

          if (profileData) {
            if (!contactName) {
              const fullName = `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim();
              if (fullName) {
                contactName = fullName;
              }
            }
            if (!contactPhone && profileData.phone) {
              contactPhone = profileData.phone;
            }
          }
        } catch (error) {
          console.warn('Could not load profile data:', error);
        }
      }

      // 3. Final fallbacks
      if (!contactName) {
        contactName = contactEmail || 'WEG-Eigentümer';
      }

      setReportForm(prev => ({
        ...prev,
        contact_name: contactName,
        contact_email: contactEmail,
        contact_phone: contactPhone,
      }));

      console.log('Final contact info set:', { contactName, contactEmail, contactPhone });
    } catch (error) {
      console.error("Error in prefillContactInfo:", error);
      // Set minimal fallback values
      setReportForm(prev => ({
        ...prev,
        contact_name: profile?.email || 'WEG-Eigentümer',
        contact_email: profile?.email || '',
        contact_phone: '',
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

  const uploadAttachments = async () => {
    if (attachments.length === 0) return [];

    const uploadedFiles = [];
    setUploading(true);

    for (const file of attachments) {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
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
    if (!reportForm.title || !reportForm.description || !reportForm.contact_name || !reportForm.contact_email || !reportForm.building_id) {
      toast({
        title: "Fehler",
        description: "Bitte füllen Sie alle Pflichtfelder aus, einschließlich Gebäude-Auswahl.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Upload attachments first
      const uploadedFiles = await uploadAttachments();
      
      const { data, error } = await supabase
        .from("weg_reports")
        .insert([{
          title: reportForm.title,
          description: reportForm.description,
          reported_by: profile?.user_id,
          weg_owner_id: profile?.user_id,
          building_id: reportForm.building_id,
          contact_name: reportForm.contact_name,
          contact_email: reportForm.contact_email,
          contact_phone: reportForm.contact_phone,
          contact_address: reportForm.contact_address,
          attachments: uploadedFiles,
          status: 'open'
        }])
        .select()
        .single();

      if (error) throw error;

      // Report erfolgreich erstellt - Benachrichtigungen sind derzeit deaktiviert
      console.log('WEG report created successfully - notifications disabled');
      
      // Reset form but keep contact info
      setReportForm(prev => ({ 
        title: "", 
        description: "", 
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
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-200">Bearbeitet</Badge>;
      case "resolved":
        return <Badge variant="default">Erledigt</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
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
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4 py-8">
          <h1 className="text-4xl font-light text-foreground">WEG-Meldungen</h1>
          <p className="text-lg text-muted-foreground">
            Erstellen und verwalten Sie Ihre WEG-Meldungen
          </p>
        </div>

        {/* Create Button */}
        <div className="text-center">
          <Dialog open={isCreateReportOpen} onOpenChange={setIsCreateReportOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90 text-base px-8 py-3 rounded-full shadow-sm">
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    <Label htmlFor="contact_address">Gebäude *</Label>
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
                        required
                      >
                        <SelectTrigger className="border-2">
                          <SelectValue placeholder="Gebäude auswählen *" />
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
            <div className="text-center py-16">
              <AlertCircle className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground text-lg mb-2">Noch keine Meldungen</p>
              <p className="text-sm text-muted-foreground">Erstellen Sie Ihre erste Meldung</p>
            </div>
          ) : (
            reports.map((report) => (
              <Card key={report.id} className="border-0 shadow-sm bg-white">
                <CardContent className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-medium mb-1">{report.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {new Date(report.created_at).toLocaleDateString('de-DE')}
                      </p>
                      {report.contact_email && (
                        <p className="text-sm text-muted-foreground">
                          Von: {report.contact_email}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {getStatusBadge(report.status)}
                    </div>
                  </div>
                  
                  <p className="text-muted-foreground mb-4">{report.description}</p>
                  
                  {/* Admin Notes Display */}
                  {report.admin_notes && report.admin_notes.trim() && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                      <h4 className="text-sm font-medium text-blue-800 mb-2">Notiz der Verwaltung:</h4>
                      <p className="text-sm text-blue-700">{report.admin_notes}</p>
                    </div>
                  )}
                  
                  {/* Attachments Display */}
                  {report.attachments && report.attachments.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Anhänge:</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {report.attachments.map((attachment: any, index: number) => (
                          <div key={index} className="flex items-center p-2 bg-muted rounded-lg">
                            <FileText className="h-4 w-4 mr-2 text-blue-600" />
                            <a
                              href={`https://eebphowrbarzawwixqcc.supabase.co/storage/v1/object/public/report-attachments/${attachment.path}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:text-blue-800 truncate"
                            >
                              {attachment.name}
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
