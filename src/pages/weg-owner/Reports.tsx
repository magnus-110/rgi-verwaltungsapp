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
import { SectionCard } from "@/components/onboarding/ui/SectionCard";
import { EmbeddedInput } from "@/components/onboarding/ui/InlineField";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, X, AlertCircle, FileText, ChevronDown, Pencil, Paperclip, Upload } from "lucide-react";

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
            <Button data-tour="reports-new" className="w-full h-12 rounded-[14px] bg-primary text-primary-foreground hover:bg-primary/90 text-[15px] font-medium shadow-sm">
              <Plus className="h-5 w-5 mr-2" />
              Neue Meldung
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[560px] p-0 overflow-hidden bg-[hsl(35_25%_96%)]">
            <DialogHeader className="px-5 pt-5 pb-3 bg-card border-b border-border/40">
              <DialogTitle className="font-display !font-normal text-[20px] leading-tight tracking-tight">
                Neue Meldung
              </DialogTitle>
              <p className="text-[13px] text-muted-foreground mt-0.5">
                Beschreiben Sie kurz, worum es geht — wir kümmern uns darum.
              </p>
            </DialogHeader>

            <div className="max-h-[70vh] overflow-y-auto px-4 py-4 space-y-3">
              {/* Kontakt */}
              <SectionCard label="Kontakt" flat>
                <Collapsible open={contactOpen} onOpenChange={setContactOpen}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full text-left px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-[15px] shrink-0">
                        {reportForm.contact_name?.charAt(0)?.toUpperCase() || "?"}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[14px] font-medium text-foreground truncate">
                          {reportForm.contact_name || "Name nicht gesetzt"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">Ihre Kontaktdaten</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-[12px] text-muted-foreground shrink-0">
                      <span>Details</span>
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${contactOpen ? 'rotate-180' : ''}`} />
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-4 pb-3 pt-1 space-y-2 border-t border-border/40">
                      <p className="text-[11px] text-muted-foreground pt-2">Zum Bearbeiten auf ein Feld tippen</p>
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
                        <div className="flex items-center gap-2 py-1">
                          <span className="text-[13px] text-muted-foreground min-w-[70px]">Gebäude</span>
                          <span className="text-[14px] text-foreground truncate">{buildings[0].name}</span>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </SectionCard>

              {/* Gebäudeauswahl bei mehreren */}
              {buildings.length > 1 && (
                <SectionCard label="Gebäude">
                  <div className="px-4 py-3">
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
                      <SelectTrigger className="w-full bg-[hsl(var(--input))] border-0 rounded-lg h-11 text-[14px] focus:ring-0 focus:ring-offset-0">
                        <SelectValue placeholder="Bitte wählen Sie ein Gebäude" />
                      </SelectTrigger>
                      <SelectContent>
                        {buildings.map((building) => (
                          <SelectItem key={building.id} value={building.id}>
                            {building.name} — {building.address}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </SectionCard>
              )}

              {/* Meldung */}
              <SectionCard label="Ihre Meldung">
                <div className="px-4 py-3 space-y-2.5">
                  <label className="block text-[12px] text-muted-foreground">
                    Was ist das Problem? <span className="text-primary">*</span>
                  </label>
                  <EmbeddedInput
                    id="title"
                    value={reportForm.title}
                    onChange={(e) => setReportForm(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="z. B. Heizung funktioniert nicht"
                  />
                </div>
                <div className="px-4 py-3 space-y-2.5">
                  <label className="block text-[12px] text-muted-foreground">
                    Beschreibung <span className="text-primary">*</span>
                  </label>
                  <textarea
                    id="description"
                    value={reportForm.description}
                    onChange={(e) => setReportForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Beschreiben Sie das Problem so genau wie möglich"
                    rows={4}
                    className="w-full bg-[hsl(var(--input))] rounded-lg px-3 py-2.5 text-[14px] text-foreground border-0 outline-none focus:bg-[hsl(35_25%_92%)] transition-colors placeholder:text-muted-foreground/60 resize-y"
                  />
                </div>
              </SectionCard>

              {/* Anhänge */}
              <SectionCard label="Fotos oder Dokumente">
                <div className="px-4 py-3 space-y-2">
                  <label
                    htmlFor="attachments"
                    className="flex items-center justify-center gap-2 w-full bg-[hsl(var(--input))] rounded-lg px-3 py-3 text-[13px] text-foreground/80 cursor-pointer hover:bg-[hsl(35_25%_92%)] transition-colors"
                  >
                    <Upload className="h-4 w-4" />
                    {attachments.length > 0
                      ? `${attachments.length} Datei${attachments.length === 1 ? "" : "en"} ausgewählt`
                      : "Dateien auswählen"}
                  </label>
                  <input
                    id="attachments"
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {attachments.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      {attachments.map((file, index) => (
                        <div key={index} className="flex items-center justify-between gap-2 rounded-lg bg-[hsl(var(--input))] px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-[13px] truncate">{file.name}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeAttachment(index)}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label="Anhang entfernen"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </SectionCard>
            </div>

            <div className="bg-card border-t border-border/60 px-4 py-3">
              <Button
                onClick={createReport}
                className="w-full h-12 text-[15px] font-medium rounded-[14px]"
                disabled={uploading}
              >
                {uploading ? "Wird gesendet…" : "Meldung absenden"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Reports List */}
        <section data-tour="reports-list">
          <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.6px] text-muted-foreground/80 px-1 mb-2">
            Ihre Meldungen
          </h2>
          {reports.length === 0 ? (
            <div className="rounded-[14px] border border-border/60 bg-card shadow-sm p-8 text-center">
              <div className="mx-auto h-12 w-12 rounded-xl bg-muted flex items-center justify-center mb-3">
                <AlertCircle className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-display text-[15px] font-semibold text-foreground mb-1">Noch keine Meldungen</p>
              <p className="text-[13px] text-muted-foreground">Erstellen Sie Ihre erste Meldung an die Verwaltung.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => (
                <div key={report.id} className="rounded-[14px] border border-border/60 bg-card shadow-sm overflow-hidden">
                  <div className="px-4 py-3.5">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-display text-[15px] font-semibold text-foreground tracking-tight leading-tight">
                          {report.title}
                        </h3>
                        <p className="text-[12px] text-muted-foreground mt-0.5">
                          {new Date(report.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}
                        </p>
                      </div>
                      {getStatusBadge(report.status)}
                    </div>
                    <p className="text-[14px] text-foreground/80 whitespace-pre-wrap leading-relaxed">{report.description}</p>
                  </div>

                  {report.admin_notes && report.admin_notes.trim() && (
                    <>
                      <div className="h-px bg-foreground/[0.055]" />
                      <div className="px-4 py-3 bg-emerald-500/[0.04]">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.5px] text-emerald-700 mb-1">
                          Antwort der Verwaltung
                        </p>
                        <p className="text-[14px] text-foreground/85 whitespace-pre-wrap leading-relaxed">{report.admin_notes}</p>
                      </div>
                    </>
                  )}

                  {attachmentUrls[report.id] && attachmentUrls[report.id].length > 0 && (
                    <>
                      <div className="h-px bg-foreground/[0.055]" />
                      <div className="px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.5px] text-muted-foreground/80 mb-2">
                          Anhänge
                        </p>
                        <div className="space-y-1.5">
                          {attachmentUrls[report.id].map((attachment: AttachmentWithUrl, index: number) => (
                            <a
                              key={index}
                              href={attachment.signedUrl || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors ${attachment.signedUrl ? 'hover:bg-muted/60 text-foreground' : 'text-muted-foreground pointer-events-none'}`}
                            >
                              <div className="h-8 w-8 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                                <FileText className="h-4 w-4 text-primary" />
                              </div>
                              <span className="truncate flex-1">{attachment.name}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

