import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Bot, MessageCircle, Download, Search, Calendar, User, Building } from "lucide-react";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { DateRangePicker } from "@/components/DateRangePicker";
import { KnowledgeDocumentsManager } from "@/components/chatbot/KnowledgeDocumentsManager";

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

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  created_at: string;
}

export const ChatbotSettings = () => {
  const { profile } = useAuth();
  const [settings, setSettings] = useState({
    system_prompt: "Sie sind ein hilfreicher Assistent für die Immobilienverwaltung."
  });
  const [loading, setLoading] = useState(true);
  
  // Conversations state
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [managementModeFilter, setManagementModeFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("all");
  const [csvStartDate, setCsvStartDate] = useState<Date | undefined>();
  const [csvEndDate, setCsvEndDate] = useState<Date | undefined>();

  useEffect(() => {
    fetchChatbotSettings();
    if (profile?.role === 'admin') {
      loadSessions();
    }
  }, [profile, managementModeFilter, dateRange]);

  const fetchChatbotSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("chatbot_settings")
        .select("id, model, temperature, max_tokens, management_mode, updated_at, system_prompt, knowledge_base, knowledge_items")
        .eq("management_mode", "weg")
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setSettings({
          system_prompt: data.system_prompt || "Sie sind ein hilfreicher Assistent für die Immobilienverwaltung."
        });
      }
    } catch (error) {
      console.error("Error fetching chatbot settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = profile?.role === 'admin';

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Zugriff verweigert</h1>
          <p className="text-muted-foreground">Nur Administratoren können Chatbot-Einstellungen verwalten.</p>
        </div>
      </div>
    );
  }

  const handleSave = async () => {
    try {
      const settingsData = {
        system_prompt: settings.system_prompt
      };

      // Save identical settings for both management modes
      const { error } = await supabase
        .from("chatbot_settings")
        .upsert([
          { ...settingsData, management_mode: "weg" as const },
          { ...settingsData, management_mode: "rent" as const }
        ], {
          onConflict: "management_mode"
        });

      if (error) throw error;

      toast({
        title: "Einstellungen gespeichert",
        description: "Die Chatbot-Einstellungen wurden für beide Verwaltungsmodi aktualisiert.",
      });
    } catch (error) {
      console.error("Error saving settings:", error);
      toast({
        title: "Fehler",
        description: "Beim Speichern der Einstellungen ist ein Fehler aufgetreten.",
        variant: "destructive",
      });
    }
  };

  const loadSessions = async () => {
    try {
      setIsLoadingSessions(true);
      
      let sessionsQuery = supabase
        .from('chatbot_sessions')
        .select('*')
        .order('started_at', { ascending: false });

      if (managementModeFilter !== 'all') {
        sessionsQuery = sessionsQuery.eq('management_mode', managementModeFilter as 'rent' | 'weg');
      }

      if (dateRange !== 'all') {
        const now = new Date();
        let startDate = new Date();
        
        switch (dateRange) {
          case 'today':
            startDate.setHours(0, 0, 0, 0);
            break;
          case 'week':
            startDate.setDate(now.getDate() - 7);
            break;
          case 'month':
            startDate.setMonth(now.getMonth() - 1);
            break;
        }
        
        sessionsQuery = sessionsQuery.gte('started_at', startDate.toISOString());
      }

      const { data: sessionsData, error: sessionsError } = await sessionsQuery;

      if (sessionsError) {
        console.error('Error loading sessions:', sessionsError);
        return;
      }

      if (!sessionsData || sessionsData.length === 0) {
        setSessions([]);
        return;
      }

      const userIds = [...new Set(sessionsData.map(s => s.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, email')
        .in('user_id', userIds);

      const buildingIds = [...new Set(sessionsData.filter(s => s.building_id).map(s => s.building_id!))];
      let buildings: any[] = [];
      if (buildingIds.length > 0) {
        const { data: buildingsData } = await supabase
          .from('buildings')
          .select('id, name')
          .in('id', buildingIds);
        buildings = buildingsData || [];
      }

      const sessionIds = sessionsData.map(s => s.id);
      const { data: messageCounts } = await supabase
        .from('chatbot_messages')
        .select('session_id')
        .in('session_id', sessionIds);

      const messageCountMap = messageCounts?.reduce((acc, msg) => {
        acc[msg.session_id] = (acc[msg.session_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};

      const formattedSessions: ChatSession[] = sessionsData.map(session => {
        const profile = profiles?.find(p => p.user_id === session.user_id);
        const building = buildings.find(b => b.id === session.building_id);
        
        return {
          id: session.id,
          started_at: session.started_at,
          ended_at: session.ended_at,
          user_id: session.user_id,
          building_id: session.building_id,
          management_mode: session.management_mode as 'rent' | 'weg',
          user_name: profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : 'Unbekannt',
          user_email: profile?.email,
          building_name: building?.name,
          message_count: messageCountMap[session.id] || 0
        };
      });

      setSessions(formattedSessions);
    } catch (error) {
      console.error('Error in loadSessions:', error);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const loadMessages = async (sessionId: string) => {
    try {
      const { data, error } = await supabase
        .from('chatbot_messages')
        .select('id, content, role, created_at')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error loading messages:', error);
        return;
      }

      const formattedMessages: Message[] = (data || []).map(msg => ({
        id: msg.id,
        content: msg.content,
        role: msg.role as 'user' | 'assistant',
        created_at: msg.created_at
      }));

      setMessages(formattedMessages);
    } catch (error) {
      console.error('Error in loadMessages:', error);
    }
  };

  const exportToCSV = async () => {
    try {
      let sessionsQuery = supabase
        .from('chatbot_sessions')
        .select('*')
        .order('started_at', { ascending: false });

      // Apply date filters for CSV export
      if (csvStartDate) {
        sessionsQuery = sessionsQuery.gte('started_at', csvStartDate.toISOString());
      }
      if (csvEndDate) {
        const endOfDay = new Date(csvEndDate);
        endOfDay.setHours(23, 59, 59, 999);
        sessionsQuery = sessionsQuery.lte('started_at', endOfDay.toISOString());
      }

      const { data: allSessions, error: sessionsError } = await sessionsQuery;

      if (sessionsError) {
        console.error('Error exporting sessions:', sessionsError);
        return;
      }

      if (!allSessions || allSessions.length === 0) {
        return;
      }

      const userIds = [...new Set(allSessions.map(s => s.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, email')
        .in('user_id', userIds);

      const buildingIds = [...new Set(allSessions.filter(s => s.building_id).map(s => s.building_id!))];
      let buildings: any[] = [];
      if (buildingIds.length > 0) {
        const { data: buildingsData } = await supabase
          .from('buildings')
          .select('id, name')
          .in('id', buildingIds);
        buildings = buildingsData || [];
      }

      const sessionIds = allSessions.map(s => s.id);
      const { data: allMessages } = await supabase
        .from('chatbot_messages')
        .select('session_id, role, content, created_at')
        .in('session_id', sessionIds)
        .order('created_at', { ascending: true });

      const csvRows = [];
      csvRows.push([
        'Session ID',
        'Benutzer',
        'Email',
        'Verwaltungsmodus',
        'Gebäude',
        'Gestartet',
        'Beendet',
        'Nachrichtenrolle',
        'Nachrichteninhalt',
        'Nachricht Erstellt'
      ]);

      allSessions.forEach(session => {
        const profile = profiles?.find(p => p.user_id === session.user_id);
        const building = buildings.find(b => b.id === session.building_id);
        const sessionMessages = allMessages?.filter(m => m.session_id === session.id) || [];
        
        const baseInfo = [
          session.id,
          profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : 'Unbekannt',
          profile?.email || '',
          session.management_mode === 'rent' ? 'Miete' : 'WEG',
          building?.name || '',
          format(new Date(session.started_at), 'dd.MM.yyyy HH:mm', { locale: de }),
          session.ended_at ? format(new Date(session.ended_at), 'dd.MM.yyyy HH:mm', { locale: de }) : ''
        ];

        if (sessionMessages.length > 0) {
          sessionMessages.forEach(message => {
            csvRows.push([
              ...baseInfo,
              message.role === 'user' ? 'Benutzer' : 'Assistent',
              `"${message.content.replace(/"/g, '""')}"`,
              format(new Date(message.created_at), 'dd.MM.yyyy HH:mm', { locale: de })
            ]);
          });
        } else {
          csvRows.push([...baseInfo, '', '', '']);
        }
      });

      const csvContent = csvRows.map(row => row.join(';')).join('\n');
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `chatbot-gespraeche-${format(new Date(), 'yyyy-MM-dd')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error exporting CSV:', error);
    }
  };

  const filteredSessions = sessions.filter(session => {
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      return (
        session.user_name?.toLowerCase().includes(searchLower) ||
        session.user_email?.toLowerCase().includes(searchLower) ||
        session.building_name?.toLowerCase().includes(searchLower)
      );
    }
    return true;
  });

  return (
      <div className="space-y-4 overflow-x-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
          <Bot className="w-6 h-6 sm:w-8 sm:h-8 flex-shrink-0" />
          <h1 className="text-2xl sm:text-3xl font-bold">Chatbot-Einstellungen</h1>
        </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>System Prompt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="system-prompt">System Prompt</Label>
            <Textarea
              id="system-prompt"
              value={settings.system_prompt}
              onChange={(e) => setSettings({ ...settings, system_prompt: e.target.value })}
              placeholder="Definieren Sie hier das Verhalten des Chatbots..."
              rows={4}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Beschreibt die Rolle und das Verhalten des Chatbots.
            </p>
          </div>
          <Button onClick={handleSave} className="w-full">
            System Prompt speichern
          </Button>
        </CardContent>
      </Card>

      {/* Knowledge Documents Manager */}
      <div className="mb-6">
        <KnowledgeDocumentsManager />
      </div>

      {/* Chatbot Conversations Section */}
      <Card>
        <CardHeader>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5" />
                Chatbot Gespräche
              </CardTitle>
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <DateRangePicker
                  startDate={csvStartDate}
                  endDate={csvEndDate}
                  onStartDateChange={setCsvStartDate}
                  onEndDateChange={setCsvEndDate}
                />
                
                <Button onClick={exportToCSV} variant="outline" size="sm" className="w-full sm:w-auto">
                  <Download className="w-4 h-4 mr-2" />
                  CSV Export
                </Button>
              </div>
            </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Suche</Label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Name, E-Mail oder Gebäude suchen..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-full"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium">Verwaltungsmodus</Label>
              <Select value={managementModeFilter} onValueChange={setManagementModeFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Modi</SelectItem>
                  <SelectItem value="rent">Miete</SelectItem>
                  <SelectItem value="weg">WEG</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 sm:col-span-2 lg:col-span-1">
              <Label className="text-sm font-medium">Zeitraum</Label>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Zeiten</SelectItem>
                  <SelectItem value="today">Heute</SelectItem>
                  <SelectItem value="week">Letzte Woche</SelectItem>
                  <SelectItem value="month">Letzter Monat</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sessions List */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="w-4 h-4" />
                  Gespräche ({filteredSessions.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {isLoadingSessions ? (
                      <div className="text-center py-8 text-muted-foreground">
                        Lade Gespräche...
                      </div>
                    ) : filteredSessions.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        Keine Gespräche gefunden
                      </div>
                    ) : (
                      filteredSessions.map((session) => (
                        <Button
                          key={session.id}
                          variant={selectedSession?.id === session.id ? "secondary" : "ghost"}
                          className="w-full justify-start h-auto p-4 text-left"
                          onClick={() => {
                            setSelectedSession(session);
                            loadMessages(session.id);
                          }}
                        >
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-center gap-2">
                              <User className="w-3 h-3 text-muted-foreground" />
                              <span className="font-medium truncate">{session.user_name}</span>
                              <Badge variant={session.management_mode === 'rent' ? 'default' : 'secondary'}>
                                {session.management_mode === 'rent' ? 'Miete' : 'WEG'}
                              </Badge>
                            </div>
                            
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Calendar className="w-3 h-3" />
                              <span>
                                {format(new Date(session.started_at), 'dd.MM.yy HH:mm', { locale: de })}
                              </span>
                            </div>
                            
                            {session.building_name && (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Building className="w-3 h-3" />
                                <span className="truncate">{session.building_name}</span>
                              </div>
                            )}
                            
                            <div className="text-xs text-muted-foreground">
                              {session.message_count} Nachrichten
                            </div>
                          </div>
                        </Button>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Messages */}
            <Card>
              <CardHeader>
                <CardTitle>
                  {selectedSession ? (
                    <div className="space-y-1">
                      <div>Gespräch mit {selectedSession.user_name}</div>
                      <div className="text-sm font-normal text-muted-foreground">
                        {selectedSession.user_email}
                      </div>
                    </div>
                  ) : (
                    'Gespräch auswählen'
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  {selectedSession ? (
                    messages.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        Keine Nachrichten in diesem Gespräch
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {messages.map((message) => (
                          <div key={message.id}>
                            <ChatMessage 
                              message={{
                                id: message.id,
                                content: message.content,
                                isBot: message.role === 'assistant',
                                timestamp: new Date(message.created_at)
                              }} 
                            />
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      Wählen Sie ein Gespräch aus der Liste aus
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};