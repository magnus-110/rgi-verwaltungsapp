import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, AlertCircle, X, FileText, ChevronDown, Pencil } from "lucide-react";

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

export const TenantReports = () => {
  const { profile } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
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
    building_name: "",
  });
  const [tenantInfo, setTenantInfo] = useState<any>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (profile) {
      fetchReports();
      fetchTenantInfo();
    }
  }, [profile]);

  useEffect(() => {
    if (!profile) return;

    const channel = supabase
      .channel('tenant-reports-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'miete_reports',
          filter: `reported_by=eq.${profile.user_id}`
        },
        (payload) => {
          console.log('New tenant report received:', payload);
          fetchReports();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'miete_reports',
          filter: `reported_by=eq.${profile.user_id}`
        },
        (payload) => {
          console.log('Tenant report updated:', payload);
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

  const fetchTenantInfo = async () => {
    try {
      console.log('Starting fetchTenantInfo for user:', profile?.user_id);
      
      const profileWithPhone = profile as any;
      setReportForm(prev => ({
        ...prev,
        contact_name: `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim(),
        contact_email: profile?.email || '',
        contact_phone: profileWithPhone?.phone || '',
      }));

      const profileWithBuilding = profile as any;
      console.log('Profile building_id:', profileWithBuilding?.building_id);
      
      if (profileWithBuilding?.building_id) {
        const { data: buildingData, error: buildingError } = await supabase
          .from("buildings")
          .select("id, name, address")
          .eq("id", profileWithBuilding.building_id)
          .single();

        console.log('Building data from profile path:', { buildingData, buildingError });

        if (!buildingError && buildingData) {
          setTenantInfo({ 
            building_id: profileWithBuilding.building_id,
            buildings: buildingData 
          });
          setReportForm(prev => ({
            ...prev,
            contact_address: buildingData.address || '',
            building_name: buildingData.name || '',
          }));
          console.log('Successfully loaded building data via profile path');
          return;
        }
      }

      console.log('Trying tenants table fallback');
      const { data: tenantData, error: tenantError } = await supabase
        .from("tenants")
        .select("*")
        .eq("user_id", profile?.user_id)
        .maybeSingle();

      console.log('Tenant data:', { tenantData, tenantError });

      if (!tenantError && tenantData && tenantData.building_id) {
        const { data: buildingData, error: buildingError } = await supabase
          .from("buildings")
          .select("id, name, address")
          .eq("id", tenantData.building_id)
          .single();

        console.log('Building data from tenants path:', { buildingData, buildingError });

        if (!buildingError && buildingData) {
          const combinedTenantInfo = {
            ...tenantData,
            buildings: buildingData
          };
          
          setTenantInfo(combinedTenantInfo);
          setReportForm(prev => ({
            ...prev,
            contact_name: `${tenantData.first_name || ''} ${tenantData.last_name || ''}`.trim() || prev.contact_name,
            contact_email: tenantData.email || prev.contact_email,
            contact_phone: tenantData.phone || prev.contact_phone,
            contact_address: buildingData.address || prev.contact_address,
            building_name: buildingData.name || prev.building_name,
          }));
          console.log('Successfully loaded building data via tenants path');
        }
      }
    } catch (error) {
      console.error("Error fetching tenant info:", error);
    }
  };

  const fetchReports = async () => {
    try {
      const { data, error } = await supabase
        .from("miete_reports")
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
    if (!reportForm.title || !reportForm.description || !reportForm.contact_name || !reportForm.contact_email) {
      toast({
        title: "Fehler",
        description: "Bitte füllen Sie alle Pflichtfelder aus.",
        variant: "destructive",
      });
      return;
    }

    try {
      const uploadedFiles = await uploadAttachments();
      
      const buildingId = tenantInfo?.building_id || (profile as any)?.building_id || null;
      console.log('Creating report with building_id:', buildingId);
      
      const { data, error } = await supabase
        .from("miete_reports")
        .insert([{
          title: reportForm.title,
          description: reportForm.description,
          reported_by: profile?.user_id,
          building_id: buildingId,
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

      console.log('Report created successfully - notifications disabled');
      setReportForm({ 
        title: "", 
        description: "", 
        contact_name: `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim(),
        contact_email: profile?.email || '',
        contact_phone: (profile as any)?.phone || '',
        contact_address: tenantInfo?.buildings?.address || '',
        building_name: tenantInfo?.buildings?.name || '',
      });
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

  const handleDialogOpen = (open: boolean) => {
    setIsCreateReportOpen(open);
    if (open && profile) {
      fetchTenantInfo();
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
          <h1 className="text-4xl font-light text-foreground">Meldungen</h1>
          <p className="text-lg text-muted-foreground">
            Erstellen und verwalten Sie Ihre Meldungen
          </p>
        </div>

        {/* Create Button */}
        <div className="text-center">
          <Dialog open={isCreateReportOpen} onOpenChange={handleDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90 text-base px-8 py-3 rounded-full shadow-sm">
                <Plus className="h-5 w-5 mr-2" />
                Neue Meldung
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Neue Meldung erstellen</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 max-h-[70vh] overflow-y-auto">
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
                    <Label htmlFor="contact_address">Adresse</Label>
                    <Input
                      id="contact_address"
                      value={reportForm.contact_address}
                      onChange={(e) => setReportForm(prev => ({ ...prev, contact_address: e.target.value }))}
                      placeholder="Ihre Adresse"
                    />
                  </div>
                </div>

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
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                      <h4 className="text-sm font-medium text-green-800 mb-2">Notiz der Verwaltung:</h4>
                      <p className="text-sm text-green-700">{report.admin_notes}</p>
                    </div>
                  )}
                  
                  {/* Attachments Display with Signed URLs */}
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
