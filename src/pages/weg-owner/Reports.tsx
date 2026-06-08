import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, X, AlertCircle, FileText, ChevronDown, Pencil } from "lucide-react";

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

interface AttachmentWithUrl {
  name: string;
  path: string;
  size: number;
  type: string;
  signedUrl?: string;
}

// Helper function to safely parse attachments
const parseAttachments = (attachments: any): any[] => {
  if (!attachments) return [];
  if (Array.isArray(attachments)) return attachments;
  if (typeof attachments === 'string') {
    try {
      const parsed = JSON.parse(attachments);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

// Inline editable text field component
const InlineEditField = ({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (val: string) => void; type?: string }) => {
  const [editing, setEditing] = useState(false);
  
  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground min-w-[70px]">{label}:</span>
        <Input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setEditing(false)}
          autoFocus
          className="h-8 text-base"
        />
      </div>
    );
  }
  
  return (
    <div 
      className="flex items-center gap-2 cursor-pointer group py-1 rounded-md hover:bg-muted/50 px-2 -mx-2 transition-colors"
      onClick={() => setEditing(true)}
    >
      <span className="text-sm text-muted-foreground min-w-[70px]">{label}:</span>
      <span className="text-base text-foreground">{value || "—"}</span>
      <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
    </div>
  );
};

export const WegOwnerReports = () => {
  const { profile } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [isCreateReportOpen, setIsCreateReportOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attachmentUrls, setAttachmentUrls] = useState<{[key: string]: AttachmentWithUrl[]}>({});
  const [contactOpen, setContactOpen] = useState(false);
  
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

  const generateSignedUrls = async (reportId: string, attachments: any) => {
    const attachmentsArray = parseAttachments(attachments);
    if (attachmentsArray.length === 0) return [];

    const attachmentsWithUrls: AttachmentWithUrl[] = [];

    for (const attachment of attachmentsArray) {
      try {
        const { data, error } = await supabase.storage
          .from('report-attachments')
          .createSignedUrl(attachment.path, 3600); // 1 hour expiry

        if (error) {
          console.error('Error creating signed URL:', error);
          attachmentsWithUrls.push(attachment);
        } else {
          attachmentsWithUrls.push({
            ...attachment,
            signedUrl: data.signedUrl
          });
        }
      } catch (error) {
        console.error('Error generating signed URL:', error);
        attachmentsWithUrls.push(attachment);
      }
    }

    return attachmentsWithUrls;
  };

  const fetchBuildings = async () => {
    try {
      const { data: assignments, error: assignmentsError } = await supabase
        .from("weg_owner_buildings")
        .select("id, building_id, created_at")
        .eq("user_id", profile?.user_id);

      if (assignmentsError) throw assignmentsError;

      if (assignments && assignments.length > 0) {
        const buildingIds = assignments.map(a => a.building_id);
        
        const { data: buildingsData, error: buildingsError } = await supabase
          .from("buildings")
          .select("id, name, address, building_code")
          .in("id", buildingIds);

        if (buildingsError) throw buildingsError;
        
        setBuildings(buildingsData || []);
        
        // Auto-select if only one building
        if (buildingsData && buildingsData.length === 1) {
          const b = buildingsData[0];
          setReportForm(prev => ({
            ...prev,
            building_id: b.id,
            contact_address: `${b.name} - ${b.address}`,
          }));
        }
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

      try {
        const { data: wegOwnerData } = await supabase
          .from("weg_owners")
          .select("*")
          .eq("user_id", profile?.user_id)
          .maybeSingle();

        if (wegOwnerData) {
          const fullName = `${wegOwnerData.first_name || ''} ${wegOwnerData.last_name || ''}`.trim();
          if (fullName) contactName = fullName;
          if (wegOwnerData.email) contactEmail = wegOwnerData.email;
          if (wegOwnerData.phone) contactPhone = wegOwnerData.phone;
        }
      } catch (error) {
        console.warn('Could not load WEG owner data:', error);
      }

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
              if (fullName) contactName = fullName;
            }
            if (!contactPhone && profileData.phone) contactPhone = profileData.phone;
          }
        } catch (error) {
          console.warn('Could not load profile data:', error);
        }
      }

      if (!contactName) contactName = contactEmail || 'WEG-Eigentümer';

      setReportForm(prev => ({
        ...prev,
        contact_name: contactName,
        contact_email: contactEmail,
        contact_phone: contactPhone,
      }));
    } catch (error) {
      console.error("Error in prefillContactInfo:", error);
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

      const urlPromises = (data || []).map(async (report) => {
        const attachmentsArray = parseAttachments(report.attachments);
        if (attachmentsArray.length > 0) {
          const attachmentsWithUrls = await generateSignedUrls(report.id, report.attachments);
          return { reportId: report.id, attachments: attachmentsWithUrls };
        }
        return { reportId: report.id, attachments: [] };
      });

      const urlResults = await Promise.all(urlPromises);
      const urlMap: {[key: string]: AttachmentWithUrl[]} = {};
      urlResults.forEach(result => {
        urlMap[result.reportId] = result.attachments;
      });
      setAttachmentUrls(urlMap);

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

      console.log('WEG report created successfully - notifications disabled');
      
      setReportForm(prev => ({ 
        title: "", 
        description: "", 
        contact_name: prev.contact_name,
        contact_email: prev.contact_email,
        contact_phone: prev.contact_phone,
        contact_address: buildings.length === 1 ? prev.contact_address : '',
        building_id: buildings.length === 1 ? prev.building_id : '',
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
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/10 text-orange-700 px-2.5 py-0.5 text-[11px] font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
            Offen
          </span>
        );
      case "in_progress":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 text-blue-700 px-2.5 py-0.5 text-[11px] font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            In Bearbeitung
          </span>
        );
      case "resolved":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 text-emerald-700 px-2.5 py-0.5 text-[11px] font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Erledigt
          </span>
        );
      default:
        return <Badge variant="outline" className="text-[11px]">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-base text-muted-foreground">Laden...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-xl md:max-w-2xl mx-auto px-4 py-5 space-y-5">
        {/* Header */}
        <div className="space-y-2 pt-1">
          <h1 className="font-display text-2xl font-semibold text-foreground leading-tight tracking-tight">
            Meldungen
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Erstellen und verwalten Sie Ihre Meldungen an die Verwaltung
          </p>
        </div>

        {/* Create Button */}
        <Dialog open={isCreateReportOpen} onOpenChange={setIsCreateReportOpen}>
          <DialogTrigger asChild>
            <Button className="w-full h-12 rounded-[14px] bg-primary text-primary-foreground hover:bg-primary/90 text-[15px] font-medium shadow-sm">
              <Plus className="h-5 w-5 mr-2" />
              Neue Meldung
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle className="font-display tracking-tight">Neue Meldung erstellen</DialogTitle>
            </DialogHeader>
              <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
                {/* Collapsible contact section */}
                <div className="bg-muted/30 rounded-xl p-4">
                  <Collapsible open={contactOpen} onOpenChange={setContactOpen}>
                    <CollapsibleTrigger className="flex items-center justify-between w-full text-left">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-lg">
                          {reportForm.contact_name?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                        <div>
                          <p className="text-base font-medium text-foreground">{reportForm.contact_name || "Name nicht gesetzt"}</p>
                          <p className="text-xs text-muted-foreground">Ihre Kontaktdaten</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <span className="text-xs">Details</span>
                        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${contactOpen ? 'rotate-180' : ''}`} />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-3 space-y-1 border-t border-border/50 pt-3">
                      <p className="text-xs text-muted-foreground mb-2">Zum Bearbeiten auf ein Feld tippen</p>
                      <InlineEditField
                        label="Name"
                        value={reportForm.contact_name}
                        onChange={(val) => setReportForm(prev => ({ ...prev, contact_name: val }))}
                      />
                      <InlineEditField
                        label="E-Mail"
                        value={reportForm.contact_email}
                        onChange={(val) => setReportForm(prev => ({ ...prev, contact_email: val }))}
                        type="email"
                      />
                      <InlineEditField
                        label="Telefon"
                        value={reportForm.contact_phone}
                        onChange={(val) => setReportForm(prev => ({ ...prev, contact_phone: val }))}
                        type="tel"
                      />
                      {buildings.length === 1 && (
                        <div className="flex items-center gap-2 py-1 px-2 -mx-2">
                          <span className="text-sm text-muted-foreground min-w-[70px]">Gebäude:</span>
                          <span className="text-base text-foreground">{buildings[0].name} - {buildings[0].address}</span>
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                </div>

                {/* Building select - only if multiple buildings */}
                {buildings.length > 1 && (
                  <div>
                    <Label htmlFor="building" className="text-base font-medium">Gebäude auswählen *</Label>
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
                      <SelectTrigger className="mt-1.5 h-12 text-base">
                        <SelectValue placeholder="Bitte wählen Sie ein Gebäude" />
                      </SelectTrigger>
                      <SelectContent>
                        {buildings.map((building) => (
                          <SelectItem key={building.id} value={building.id}>
                            {building.name} - {building.address}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Main form fields - prominent */}
                <div>
                  <Label htmlFor="title" className="text-base font-medium">Was ist das Problem? *</Label>
                  <Input
                    id="title"
                    value={reportForm.title}
                    onChange={(e) => setReportForm(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="z.B. Heizung funktioniert nicht"
                    className="mt-1.5 text-base h-12"
                  />
                </div>
                <div>
                  <Label htmlFor="description" className="text-base font-medium">Beschreibung *</Label>
                  <Textarea
                    id="description"
                    value={reportForm.description}
                    onChange={(e) => setReportForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Beschreiben Sie das Problem so genau wie möglich"
                    rows={4}
                    className="mt-1.5 text-base"
                  />
                </div>

                {/* Attachments */}
                <div>
                  <Label htmlFor="attachments" className="text-base font-medium">Fotos oder Dokumente</Label>
                  <div className="space-y-2 mt-1.5">
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
                            <Button variant="ghost" size="sm" onClick={() => removeAttachment(index)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <Button onClick={createReport} className="w-full h-12 text-base font-medium" disabled={uploading}>
                  {uploading ? "Wird erstellt..." : "Meldung absenden"}
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
                  
                  {report.admin_notes && report.admin_notes.trim() && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                      <h4 className="text-sm font-medium text-green-800 mb-2">Notiz der Verwaltung:</h4>
                      <p className="text-sm text-green-700">{report.admin_notes}</p>
                    </div>
                  )}
                  
                  {attachmentUrls[report.id] && attachmentUrls[report.id].length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Anhänge:</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {attachmentUrls[report.id].map((attachment: AttachmentWithUrl, index: number) => (
                          <div key={index} className="flex items-center p-2 bg-muted rounded-lg">
                            <FileText className="h-4 w-4 mr-2 text-blue-600" />
                            {attachment.signedUrl ? (
                              <a
                                href={attachment.signedUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-blue-600 hover:text-blue-800 truncate"
                              >
                                {attachment.name}
                              </a>
                            ) : (
                              <span className="text-sm text-gray-500 truncate">
                                {attachment.name} (Nicht verfügbar)
                              </span>
                            )}
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
