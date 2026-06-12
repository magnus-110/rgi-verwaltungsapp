
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { toast as toastHook } from "@/hooks/use-toast";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { UserPlus, Edit, Trash2, MessageCircle, Download, Search, Calendar, User, Building, Bot } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { EmailSettingsSection } from "@/components/email/EmailSettingsSection";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { DateRangePicker } from "@/components/DateRangePicker";
import { KnowledgeDocumentsManager } from "@/components/chatbot/KnowledgeDocumentsManager";
import { ChartOfAccountsTab } from "@/components/finance/ChartOfAccountsTab";
import { ReportTemplateSettings } from "@/components/finance/ReportTemplateSettings";
import { NotificationSettingsSection } from "@/components/settings/NotificationSettingsSection";
import { PasskeysSection } from "@/components/settings/PasskeysSection";
import { BrokerModeToggle } from "@/components/settings/BrokerModeToggle";

interface AdminUser {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
}

interface EmployeeUser {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
}

interface ChatSession {
  id: string;
  started_at: string;
  ended_at?: string;
  user_id: string;
  building_id?: string;
  management_mode: 'rent' | 'weg';
  user_name?: string;
  user_email?: string;
  building_name?: string;
  message_count: number;
}

interface ChatMsg {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  created_at: string;
}

export const Settings = () => {
  const { profile, fetchProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultTab = searchParams.get('tab') || 'profile';

  // Profile states
  const [firstName, setFirstName] = useState(profile?.first_name || "");
  const [lastName, setLastName] = useState(profile?.last_name || "");
  const [phone, setPhone] = useState((profile as any)?.phone || "");
  const [isLoading, setIsLoading] = useState(false);
  
  // Admin creation states
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminFirstName, setNewAdminFirstName] = useState("");
  const [newAdminLastName, setNewAdminLastName] = useState("");
  const [newAdminPhone, setNewAdminPhone] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [isCreatingAdmin, setIsCreatingAdmin] = useState(false);
  
  // Admin management states
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [editingAdmin, setEditingAdmin] = useState<AdminUser | null>(null);
  const [editAdminData, setEditAdminData] = useState({ first_name: "", last_name: "", email: "", phone: "" });

  // Employee management states
  const [employeeUsers, setEmployeeUsers] = useState<EmployeeUser[]>([]);
  const [newEmployeeEmail, setNewEmployeeEmail] = useState("");
  const [newEmployeeFirstName, setNewEmployeeFirstName] = useState("");
  const [newEmployeeLastName, setNewEmployeeLastName] = useState("");
  const [newEmployeePhone, setNewEmployeePhone] = useState("");
  const [newEmployeePassword, setNewEmployeePassword] = useState("");
  const [isCreatingEmployee, setIsCreatingEmployee] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeUser | null>(null);
  const [editEmployeeData, setEditEmployeeData] = useState({ first_name: "", last_name: "", email: "", phone: "" });

  // Chatbot states
  const [chatbotSettings, setChatbotSettings] = useState({ system_prompt: "Sie sind ein hilfreicher Assistent für die Immobilienverwaltung." });
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [managementModeFilter, setManagementModeFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("all");
  const [csvStartDate, setCsvStartDate] = useState<Date | undefined>();
  const [csvEndDate, setCsvEndDate] = useState<Date | undefined>();

  useEffect(() => {
    if (profile?.role === 'admin') {
      fetchAdminUsers();
      fetchEmployeeUsers();
      fetchChatbotSettings();
      loadSessions();
    }
  }, [profile]);

  useEffect(() => {
    if (profile?.role === 'admin') {
      loadSessions();
    }
  }, [managementModeFilter, dateRange]);

  const fetchAdminUsers = async () => {
    try {
      const { data, error } = await supabase.from("profiles").select("user_id, first_name, last_name, email, phone").eq("role", "admin").order("first_name");
      if (error) throw error;
      setAdminUsers(data || []);
    } catch (error) { console.error("Error fetching admin users:", error); }
  };

  const fetchEmployeeUsers = async () => {
    try {
      const { data, error } = await supabase.from("profiles").select("user_id, first_name, last_name, email, phone").eq("role", "employee").order("first_name");
      if (error) throw error;
      setEmployeeUsers(data || []);
    } catch (error) { console.error("Error fetching employee users:", error); }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setIsLoading(true);
    try {
      const { error } = await supabase.from("profiles").update({ first_name: firstName, last_name: lastName, phone }).eq("user_id", profile.user_id);
      if (error) throw error;
      toast.success("Profil erfolgreich aktualisiert");
      await fetchProfile();
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error("Fehler beim Aktualisieren des Profils");
    } finally { setIsLoading(false); }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminEmail || !newAdminPassword || !newAdminFirstName || !newAdminLastName) { toast.error("Bitte füllen Sie alle Felder aus"); return; }
    setIsCreatingAdmin(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: { email: newAdminEmail, password: newAdminPassword, role: 'admin', first_name: newAdminFirstName, last_name: newAdminLastName, phone: newAdminPhone || undefined },
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      });
      if (error) { toast.error(error.message || "Fehler beim Erstellen des Admins"); return; }
      if (data?.error) { toast.error(data.error); return; }
      toast.success(data?.message || 'Admin erfolgreich erstellt');
      setNewAdminEmail(""); setNewAdminFirstName(""); setNewAdminLastName(""); setNewAdminPhone(""); setNewAdminPassword("");
      fetchAdminUsers();
    } catch (error: any) { toast.error(`Unerwarteter Fehler: ${error?.message || 'Unbekannter Fehler'}`); }
    finally { setIsCreatingAdmin(false); }
  };

  const handleEditAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAdmin) return;
    try {
      const { error } = await supabase.from("profiles").update({ first_name: editAdminData.first_name, last_name: editAdminData.last_name, email: editAdminData.email, phone: editAdminData.phone || null }).eq("user_id", editingAdmin.user_id);
      if (error) throw error;
      toast.success("Admin erfolgreich aktualisiert");
      setEditingAdmin(null); fetchAdminUsers();
    } catch (error) { toast.error("Fehler beim Aktualisieren des Admins"); }
  };

  const handleDeleteAdmin = async (adminId: string) => {
    if (!confirm("Sind Sie sicher, dass Sie diesen Admin löschen möchten?")) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('admin-delete-user', { body: { userId: adminId }, headers: { 'Authorization': `Bearer ${session?.access_token}` } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Admin erfolgreich gelöscht"); fetchAdminUsers();
    } catch (error: any) { toast.error(error?.message || "Fehler beim Löschen des Admins"); }
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmployeeEmail || !newEmployeePassword || !newEmployeeFirstName || !newEmployeeLastName) { toast.error("Bitte füllen Sie alle Felder aus"); return; }
    setIsCreatingEmployee(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: { email: newEmployeeEmail, password: newEmployeePassword, role: 'employee', first_name: newEmployeeFirstName, last_name: newEmployeeLastName, phone: newEmployeePhone || undefined },
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      });
      if (error) { toast.error(error.message || "Fehler beim Erstellen des Mitarbeiters"); return; }
      if (data?.error) { toast.error(data.error); return; }
      toast.success(data?.message || 'Mitarbeiter erfolgreich erstellt');
      setNewEmployeeEmail(""); setNewEmployeeFirstName(""); setNewEmployeeLastName(""); setNewEmployeePhone(""); setNewEmployeePassword("");
      fetchEmployeeUsers();
    } catch (error: any) { toast.error(`Unerwarteter Fehler: ${error?.message || 'Unbekannter Fehler'}`); }
    finally { setIsCreatingEmployee(false); }
  };

  const handleEditEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;
    try {
      const { error } = await supabase.from("profiles").update({ first_name: editEmployeeData.first_name, last_name: editEmployeeData.last_name, email: editEmployeeData.email, phone: editEmployeeData.phone || null }).eq("user_id", editingEmployee.user_id);
      if (error) throw error;
      toast.success("Mitarbeiter erfolgreich aktualisiert");
      setEditingEmployee(null); fetchEmployeeUsers();
    } catch (error) { toast.error("Fehler beim Aktualisieren des Mitarbeiters"); }
  };

  const handleDeleteEmployee = async (employeeId: string) => {
    if (!confirm("Sind Sie sicher, dass Sie diesen Mitarbeiter löschen möchten?")) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('admin-delete-user', { body: { userId: employeeId }, headers: { 'Authorization': `Bearer ${session?.access_token}` } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Mitarbeiter erfolgreich gelöscht"); fetchEmployeeUsers();
    } catch (error: any) { toast.error(error?.message || "Fehler beim Löschen des Mitarbeiters"); }
  };

  // Chatbot functions
  const fetchChatbotSettings = async () => {
    try {
      const { data, error } = await supabase.from("chatbot_settings").select("*").eq("management_mode", "weg").single();
      if (error && error.code !== 'PGRST116') throw error;
      if (data) setChatbotSettings({ system_prompt: data.system_prompt || "Sie sind ein hilfreicher Assistent für die Immobilienverwaltung." });
    } catch (error) { console.error("Error fetching chatbot settings:", error); }
  };

  const handleSaveChatbot = async () => {
    try {
      const { error } = await supabase.from("chatbot_settings").upsert([
        { system_prompt: chatbotSettings.system_prompt, management_mode: "weg" as const },
        { system_prompt: chatbotSettings.system_prompt, management_mode: "rent" as const }
      ], { onConflict: "management_mode" });
      if (error) throw error;
      toastHook({ title: "Einstellungen gespeichert", description: "Die Chatbot-Einstellungen wurden aktualisiert." });
    } catch (error) {
      toastHook({ title: "Fehler", description: "Beim Speichern ist ein Fehler aufgetreten.", variant: "destructive" });
    }
  };

  const loadSessions = async () => {
    try {
      setIsLoadingSessions(true);
      let sessionsQuery = supabase.from('chatbot_sessions').select('*').order('started_at', { ascending: false });
      if (managementModeFilter !== 'all') sessionsQuery = sessionsQuery.eq('management_mode', managementModeFilter as 'rent' | 'weg');
      if (dateRange !== 'all') {
        const now = new Date(); let startDate = new Date();
        switch (dateRange) { case 'today': startDate.setHours(0,0,0,0); break; case 'week': startDate.setDate(now.getDate()-7); break; case 'month': startDate.setMonth(now.getMonth()-1); break; }
        sessionsQuery = sessionsQuery.gte('started_at', startDate.toISOString());
      }
      const { data: sessionsData, error: sessionsError } = await sessionsQuery;
      if (sessionsError) return;
      if (!sessionsData || sessionsData.length === 0) { setSessions([]); return; }

      const userIds = [...new Set(sessionsData.map(s => s.user_id))];
      const { data: profiles } = await supabase.from('profiles').select('user_id, first_name, last_name, email').in('user_id', userIds);
      const buildingIds = [...new Set(sessionsData.filter(s => s.building_id).map(s => s.building_id!))];
      let buildings: any[] = [];
      if (buildingIds.length > 0) { const { data: bd } = await supabase.from('buildings').select('id, name').in('id', buildingIds); buildings = bd || []; }
      const sessionIds = sessionsData.map(s => s.id);
      const { data: messageCounts } = await supabase.from('chatbot_messages').select('session_id').in('session_id', sessionIds);
      const mcMap = messageCounts?.reduce((acc, msg) => { acc[msg.session_id] = (acc[msg.session_id] || 0) + 1; return acc; }, {} as Record<string, number>) || {};

      setSessions(sessionsData.map(session => {
        const p = profiles?.find(pr => pr.user_id === session.user_id);
        const b = buildings.find(bl => bl.id === session.building_id);
        return { id: session.id, started_at: session.started_at, ended_at: session.ended_at, user_id: session.user_id, building_id: session.building_id, management_mode: session.management_mode as 'rent' | 'weg', user_name: p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : 'Unbekannt', user_email: p?.email, building_name: b?.name, message_count: mcMap[session.id] || 0 };
      }));
    } catch (error) { console.error('Error in loadSessions:', error); }
    finally { setIsLoadingSessions(false); }
  };

  const loadMessages = async (sessionId: string) => {
    try {
      const { data, error } = await supabase.from('chatbot_messages').select('id, content, role, created_at').eq('session_id', sessionId).order('created_at', { ascending: true });
      if (error) return;
      setChatMessages((data || []).map(msg => ({ id: msg.id, content: msg.content, role: msg.role as 'user' | 'assistant', created_at: msg.created_at })));
    } catch (error) { console.error('Error in loadMessages:', error); }
  };

  const exportToCSV = async () => {
    try {
      let q = supabase.from('chatbot_sessions').select('*').order('started_at', { ascending: false });
      if (csvStartDate) q = q.gte('started_at', csvStartDate.toISOString());
      if (csvEndDate) { const end = new Date(csvEndDate); end.setHours(23,59,59,999); q = q.lte('started_at', end.toISOString()); }
      const { data: allSessions } = await q;
      if (!allSessions || allSessions.length === 0) return;

      const userIds = [...new Set(allSessions.map(s => s.user_id))];
      const { data: profiles } = await supabase.from('profiles').select('user_id, first_name, last_name, email').in('user_id', userIds);
      const buildingIds = [...new Set(allSessions.filter(s => s.building_id).map(s => s.building_id!))];
      let buildings: any[] = [];
      if (buildingIds.length > 0) { const { data: bd } = await supabase.from('buildings').select('id, name').in('id', buildingIds); buildings = bd || []; }
      const sessionIds = allSessions.map(s => s.id);
      const { data: allMessages } = await supabase.from('chatbot_messages').select('session_id, role, content, created_at').in('session_id', sessionIds).order('created_at', { ascending: true });

      const csvRows: string[][] = [['Session ID','Benutzer','Email','Verwaltungsmodus','Gebäude','Gestartet','Beendet','Nachrichtenrolle','Nachrichteninhalt','Nachricht Erstellt']];
      allSessions.forEach(session => {
        const p = profiles?.find(pr => pr.user_id === session.user_id);
        const b = buildings.find(bl => bl.id === session.building_id);
        const msgs = allMessages?.filter(m => m.session_id === session.id) || [];
        const base = [session.id, p ? `${p.first_name||''} ${p.last_name||''}`.trim() : 'Unbekannt', p?.email||'', session.management_mode === 'rent' ? 'Miete' : 'WEG', b?.name||'', format(new Date(session.started_at), 'dd.MM.yyyy HH:mm', { locale: de }), session.ended_at ? format(new Date(session.ended_at), 'dd.MM.yyyy HH:mm', { locale: de }) : ''];
        if (msgs.length > 0) { msgs.forEach(m => csvRows.push([...base, m.role === 'user' ? 'Benutzer' : 'Assistent', `"${m.content.replace(/"/g, '""')}"`, format(new Date(m.created_at), 'dd.MM.yyyy HH:mm', { locale: de })])); }
        else csvRows.push([...base, '', '', '']);
      });
      const blob = new Blob(['\ufeff' + csvRows.map(r => r.join(';')).join('\n')], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `chatbot-gespraeche-${format(new Date(), 'yyyy-MM-dd')}.csv`; link.style.visibility = 'hidden'; document.body.appendChild(link); link.click(); document.body.removeChild(link);
    } catch (error) { console.error('Error exporting CSV:', error); }
  };

  const filteredSessions = sessions.filter(session => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return session.user_name?.toLowerCase().includes(s) || session.user_email?.toLowerCase().includes(s) || session.building_name?.toLowerCase().includes(s);
  });

  if (!profile) {
    return <div className="min-h-screen flex items-center justify-center"><div className="text-lg">Laden...</div></div>;
  }

  const isAdmin = profile.role === 'admin';

  const renderUserForm = (prefix: string, data: { first_name: string; last_name: string; email?: string; phone: string }, setData: (d: any) => void) => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div><Label>Vorname</Label><Input value={data.first_name} onChange={e => setData((p: any) => ({...p, first_name: e.target.value}))} placeholder="Vorname" /></div>
        <div><Label>Nachname</Label><Input value={data.last_name} onChange={e => setData((p: any) => ({...p, last_name: e.target.value}))} placeholder="Nachname" /></div>
      </div>
      {data.email !== undefined && <div><Label>E-Mail</Label><Input type="email" value={data.email} onChange={e => setData((p: any) => ({...p, email: e.target.value}))} placeholder="E-Mail" required /></div>}
      <div><Label>Telefon</Label><Input value={data.phone} onChange={e => setData((p: any) => ({...p, phone: e.target.value}))} placeholder="Telefonnummer" /></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background p-3 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-4 md:space-y-6">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold">Einstellungen</h1>
          <p className="text-muted-foreground text-xs md:text-sm">Konfiguration und Verwaltung</p>
        </div>

        <Tabs defaultValue={defaultTab} onValueChange={(v) => setSearchParams({ tab: v })} className="w-full">
          <TabsList variant="segment" className="w-full flex flex-nowrap md:flex-wrap h-auto gap-1 overflow-x-auto scrollbar-hide justify-start md:justify-stretch">
            <TabsTrigger variant="segment" value="profile" className="flex-shrink-0 md:flex-1 min-w-[110px] min-h-[44px] text-xs sm:text-sm">Profil</TabsTrigger>
            <TabsTrigger variant="segment" value="notifications" className="flex-shrink-0 md:flex-1 min-w-[110px] min-h-[44px] text-xs sm:text-sm">Benachrichtigungen</TabsTrigger>
            {isAdmin && <TabsTrigger variant="segment" value="users" className="flex-shrink-0 md:flex-1 min-w-[110px] min-h-[44px] text-xs sm:text-sm">Benutzer</TabsTrigger>}
            {isAdmin && <TabsTrigger variant="segment" value="chatbot" className="flex-shrink-0 md:flex-1 min-w-[110px] min-h-[44px] text-xs sm:text-sm">Chatbot</TabsTrigger>}
            {isAdmin && <TabsTrigger variant="segment" value="email" className="flex-shrink-0 md:flex-1 min-w-[110px] min-h-[44px] text-xs sm:text-sm">E-Mail</TabsTrigger>}
            {isAdmin && <TabsTrigger variant="segment" value="templates" className="flex-shrink-0 md:flex-1 min-w-[110px] min-h-[44px] text-xs sm:text-sm">Vorlagen</TabsTrigger>}
          </TabsList>

          <TabsContent value="notifications" className="space-y-6 mt-6">
            <NotificationSettingsSection />
          </TabsContent>


          {/* Tab: Profil & Sicherheit */}
          <TabsContent value="profile" className="space-y-6 mt-6">
            <Card>
              <CardHeader><CardTitle>Persönliche Informationen</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={handleUpdateProfile} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><Label htmlFor="firstName">Vorname</Label><Input id="firstName" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Ihr Vorname" /></div>
                    <div><Label htmlFor="lastName">Nachname</Label><Input id="lastName" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Ihr Nachname" /></div>
                  </div>
                  <div>
                    <Label htmlFor="email">E-Mail</Label>
                    <Input id="email" value={profile.email} disabled className="bg-muted" />
                    <p className="text-xs text-muted-foreground mt-1">Die E-Mail-Adresse kann nicht geändert werden</p>
                  </div>
                  <div><Label htmlFor="phone">Telefon</Label><Input id="phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Ihre Telefonnummer" /></div>
                  <Button type="submit" disabled={isLoading}>{isLoading ? "Speichern..." : "Änderungen speichern"}</Button>
                </form>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Passwort</CardTitle></CardHeader>
              <CardContent>
                <Button variant="outline" onClick={() => {
                  if (profile.role === 'admin') navigate('/admin/change-password');
                  else if (profile.role === 'weg_owner') navigate('/weg-owner/change-password');
                  else if (profile.role === 'tenant') navigate('/tenant/change-password');
                  else navigate('/change-password');
                }}>Passwort ändern</Button>
              </CardContent>
            </Card>
            <PasskeysSection />
          </TabsContent>

          {/* Tab: Benutzerverwaltung */}
          {isAdmin && (
            <TabsContent value="users" className="space-y-6 mt-6">
              {/* Admin erstellen */}
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><UserPlus className="w-5 h-5" />Administrator erstellen</CardTitle></CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateAdmin} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div><Label>Vorname</Label><Input value={newAdminFirstName} onChange={e => setNewAdminFirstName(e.target.value)} placeholder="Vorname" required /></div>
                      <div><Label>Nachname</Label><Input value={newAdminLastName} onChange={e => setNewAdminLastName(e.target.value)} placeholder="Nachname" required /></div>
                    </div>
                    <div><Label>E-Mail</Label><Input type="email" value={newAdminEmail} onChange={e => setNewAdminEmail(e.target.value)} placeholder="E-Mail" required /></div>
                    <div><Label>Telefon</Label><Input value={newAdminPhone} onChange={e => setNewAdminPhone(e.target.value)} placeholder="Telefonnummer" /></div>
                    <div><Label>Temporäres Passwort</Label><Input type="password" value={newAdminPassword} onChange={e => setNewAdminPassword(e.target.value)} placeholder="Temporäres Passwort" required /><p className="text-xs text-muted-foreground mt-1">Der neue Admin sollte das Passwort nach der ersten Anmeldung ändern</p></div>
                    <Button type="submit" disabled={isCreatingAdmin}>{isCreatingAdmin ? "Erstellen..." : "Admin erstellen"}</Button>
                  </form>
                </CardContent>
              </Card>

              {/* Admin verwalten */}
              <Card>
                <CardHeader><CardTitle>Administratoren verwalten</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {adminUsers.map(admin => (
                      <div key={admin.user_id} className="flex items-center justify-between p-4 border border-border rounded-lg">
                        <div>
                          <div className="font-medium">{admin.first_name && admin.last_name ? `${admin.first_name} ${admin.last_name}` : admin.email}</div>
                          <div className="text-sm text-muted-foreground">{admin.email}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <BrokerModeToggle userId={admin.user_id} />
                          <Button variant="outline" size="sm" onClick={() => { setEditingAdmin(admin); setEditAdminData({ first_name: admin.first_name||"", last_name: admin.last_name||"", email: admin.email, phone: admin.phone||"" }); }}><Edit className="w-4 h-4" /></Button>
                          <Button variant="outline" size="sm" onClick={() => handleDeleteAdmin(admin.user_id)} className="text-destructive hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      </div>
                    ))}
                    {adminUsers.length === 0 && <p className="text-center text-muted-foreground py-4">Keine Administrator-Accounts gefunden</p>}
                  </div>
                </CardContent>
              </Card>

              {/* Mitarbeiter erstellen */}
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><UserPlus className="w-5 h-5" />Mitarbeiter erstellen</CardTitle></CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateEmployee} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div><Label>Vorname</Label><Input value={newEmployeeFirstName} onChange={e => setNewEmployeeFirstName(e.target.value)} placeholder="Vorname" required /></div>
                      <div><Label>Nachname</Label><Input value={newEmployeeLastName} onChange={e => setNewEmployeeLastName(e.target.value)} placeholder="Nachname" required /></div>
                    </div>
                    <div><Label>E-Mail</Label><Input type="email" value={newEmployeeEmail} onChange={e => setNewEmployeeEmail(e.target.value)} placeholder="E-Mail" required /></div>
                    <div><Label>Telefon</Label><Input value={newEmployeePhone} onChange={e => setNewEmployeePhone(e.target.value)} placeholder="Telefonnummer" /></div>
                    <div><Label>Temporäres Passwort</Label><Input type="password" value={newEmployeePassword} onChange={e => setNewEmployeePassword(e.target.value)} placeholder="Temporäres Passwort" required /></div>
                    <Button type="submit" disabled={isCreatingEmployee}>{isCreatingEmployee ? "Erstellen..." : "Mitarbeiter erstellen"}</Button>
                  </form>
                </CardContent>
              </Card>

              {/* Mitarbeiter verwalten */}
              <Card>
                <CardHeader><CardTitle>Mitarbeiter verwalten</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {employeeUsers.map(emp => (
                      <div key={emp.user_id} className="flex items-center justify-between p-4 border border-border rounded-lg">
                        <div>
                          <div className="font-medium">{emp.first_name && emp.last_name ? `${emp.first_name} ${emp.last_name}` : emp.email}</div>
                          <div className="text-sm text-muted-foreground">{emp.email}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <BrokerModeToggle userId={emp.user_id} />
                          <Button variant="outline" size="sm" onClick={() => { setEditingEmployee(emp); setEditEmployeeData({ first_name: emp.first_name||"", last_name: emp.last_name||"", email: emp.email, phone: emp.phone||"" }); }}><Edit className="w-4 h-4" /></Button>
                          <Button variant="outline" size="sm" onClick={() => handleDeleteEmployee(emp.user_id)} className="text-destructive hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      </div>
                    ))}
                    {employeeUsers.length === 0 && <p className="text-center text-muted-foreground py-4">Keine Mitarbeiter-Accounts gefunden</p>}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Tab: Chatbot (NOVA) */}
          {isAdmin && (
            <TabsContent value="chatbot" className="space-y-6 mt-6">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Bot className="w-5 h-5" />System Prompt</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="system-prompt">System Prompt</Label>
                    <Textarea id="system-prompt" value={chatbotSettings.system_prompt} onChange={e => setChatbotSettings({ ...chatbotSettings, system_prompt: e.target.value })} placeholder="Definieren Sie hier das Verhalten des Chatbots..." rows={4} />
                    <p className="text-xs text-muted-foreground mt-1">Beschreibt die Rolle und das Verhalten des Chatbots.</p>
                  </div>
                  <Button onClick={handleSaveChatbot} className="w-full">System Prompt speichern</Button>
                </CardContent>
              </Card>

              <KnowledgeDocumentsManager />

              {/* Conversations */}
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <CardTitle className="flex items-center gap-2"><MessageCircle className="w-5 h-5" />Chatbot Gespräche</CardTitle>
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                      <DateRangePicker startDate={csvStartDate} endDate={csvEndDate} onStartDateChange={setCsvStartDate} onEndDateChange={setCsvEndDate} />
                      <Button onClick={exportToCSV} variant="outline" size="sm"><Download className="w-4 h-4 mr-2" />CSV Export</Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Suche</Label>
                      <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                        <Input placeholder="Name, E-Mail oder Gebäude..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Verwaltungsmodus</Label>
                      <Select value={managementModeFilter} onValueChange={setManagementModeFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Alle Modi</SelectItem><SelectItem value="rent">Miete</SelectItem><SelectItem value="weg">WEG</SelectItem></SelectContent></Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Zeitraum</Label>
                      <Select value={dateRange} onValueChange={setDateRange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Alle Zeiten</SelectItem><SelectItem value="today">Heute</SelectItem><SelectItem value="week">Letzte Woche</SelectItem><SelectItem value="month">Letzter Monat</SelectItem></SelectContent></Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><MessageCircle className="w-4 h-4" />Gespräche ({filteredSessions.length})</CardTitle></CardHeader>
                      <CardContent>
                        <ScrollArea className="h-[400px]">
                          <div className="space-y-2">
                            {isLoadingSessions ? <div className="text-center py-8 text-muted-foreground">Lade Gespräche...</div> : filteredSessions.length === 0 ? <div className="text-center py-8 text-muted-foreground">Keine Gespräche gefunden</div> : filteredSessions.map(session => (
                              <Button key={session.id} variant={selectedSession?.id === session.id ? "secondary" : "ghost"} className="w-full justify-start h-auto p-4 text-left" onClick={() => { setSelectedSession(session); loadMessages(session.id); }}>
                                <div className="flex-1 min-w-0 space-y-2">
                                  <div className="flex items-center gap-2"><User className="w-3 h-3 text-muted-foreground" /><span className="font-medium truncate">{session.user_name}</span><Badge variant={session.management_mode === 'rent' ? 'default' : 'secondary'}>{session.management_mode === 'rent' ? 'Miete' : 'WEG'}</Badge></div>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><Calendar className="w-3 h-3" /><span>{format(new Date(session.started_at), 'dd.MM.yy HH:mm', { locale: de })}</span></div>
                                  {session.building_name && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Building className="w-3 h-3" /><span className="truncate">{session.building_name}</span></div>}
                                  <div className="text-xs text-muted-foreground">{session.message_count} Nachrichten</div>
                                </div>
                              </Button>
                            ))}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader><CardTitle className="text-base">{selectedSession ? <div className="space-y-1"><div>Gespräch mit {selectedSession.user_name}</div><div className="text-sm font-normal text-muted-foreground">{selectedSession.user_email}</div></div> : 'Gespräch auswählen'}</CardTitle></CardHeader>
                      <CardContent>
                        <ScrollArea className="h-[400px]">
                          {selectedSession ? (chatMessages.length === 0 ? <div className="text-center py-8 text-muted-foreground">Keine Nachrichten</div> : <div className="space-y-4">{chatMessages.map(msg => <div key={msg.id}><ChatMessage message={{ id: msg.id, content: msg.content, isBot: msg.role === 'assistant', timestamp: new Date(msg.created_at) }} /></div>)}</div>) : <div className="text-center py-8 text-muted-foreground">Wählen Sie ein Gespräch aus der Liste aus</div>}
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Tab: E-Mail */}
          {isAdmin && (
            <TabsContent value="email" className="space-y-6 mt-6">
              <EmailSettingsSection />
            </TabsContent>
          )}

          {/* Tab: Dokumente & Vorlagen */}
          {isAdmin && (
            <TabsContent value="templates" className="space-y-6 mt-6">
              <Card>
                <CardHeader><CardTitle>Globaler Kontenrahmen</CardTitle></CardHeader>
                <CardContent>
                  <ChartOfAccountsTab />
                </CardContent>
              </Card>
              <ReportTemplateSettings />
            </TabsContent>
          )}
        </Tabs>

        {/* Edit Admin Dialog */}
        <Dialog open={!!editingAdmin} onOpenChange={() => setEditingAdmin(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Administrator bearbeiten</DialogTitle></DialogHeader>
            <form onSubmit={handleEditAdmin} className="space-y-4">
              {renderUserForm('admin', editAdminData, setEditAdminData)}
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setEditingAdmin(null)}>Abbrechen</Button>
                <Button type="submit">Speichern</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit Employee Dialog */}
        <Dialog open={!!editingEmployee} onOpenChange={() => setEditingEmployee(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Mitarbeiter bearbeiten</DialogTitle></DialogHeader>
            <form onSubmit={handleEditEmployee} className="space-y-4">
              {renderUserForm('employee', editEmployeeData, setEditEmployeeData)}
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setEditingEmployee(null)}>Abbrechen</Button>
                <Button type="submit">Speichern</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};
