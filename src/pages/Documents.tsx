import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MoreHorizontal, RefreshCw, Settings, Upload, BookOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { KnowledgeScopeSelector, KnowledgeScope } from "@/components/documents/KnowledgeScopeSelector";
import { UploadDialog } from "@/components/documents/UploadDialog";
import { ChatWelcome } from "@/components/documents/ChatWelcome";
import { ChatInputField } from "@/components/documents/ChatInputField";
import { ChatMessages } from "@/components/documents/ChatMessages";
import { PromptGuideSheet } from "@/components/documents/PromptGuideSheet";
import { ChatHistorySidebar } from "@/components/documents/ChatHistorySidebar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useManagementMode } from "@/hooks/useManagementMode";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Building {
  id: string;
  name: string;
  address: string;
  building_code: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{
    content: string;
    metadata: any;
    buildingId?: string;
  }>;
  created_at: string;
}

interface ChatSession {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  search_scope: string;
  include_general: boolean;
  building_ids: string[] | null;
}

const NOVA_SESSION_KEY = 'nova_current_session_id';
const NOVA_SCOPE_KEY = 'nova_knowledge_scope';
const NOVA_BUILDING_IDS_KEY = 'nova_selected_building_ids';
const NOVA_INCLUDE_GENERAL_KEY = 'nova_include_general';

export function Documents() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { managementMode } = useManagementMode();

  // Knowledge scope state - load from localStorage
  const [scope, setScope] = useState<KnowledgeScope>(() => {
    const saved = localStorage.getItem(NOVA_SCOPE_KEY);
    return (saved as KnowledgeScope) || 'general';
  });
  const [selectedBuildingIds, setSelectedBuildingIds] = useState<string[]>(() => {
    const saved = localStorage.getItem(NOVA_BUILDING_IDS_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [includeGeneral, setIncludeGeneral] = useState(() => {
    const saved = localStorage.getItem(NOVA_INCLUDE_GENERAL_KEY);
    return saved !== null ? saved === 'true' : true;
  });

  // Data state
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isPromptGuideOpen, setIsPromptGuideOpen] = useState(false);

  // Chat state - load sessionId from localStorage on init
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(() => {
    return localStorage.getItem(NOVA_SESSION_KEY);
  });
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [deepResearchEnabled, setDeepResearchEnabled] = useState(false);

  // Persist sessionId to localStorage when it changes
  useEffect(() => {
    if (sessionId) {
      localStorage.setItem(NOVA_SESSION_KEY, sessionId);
    }
  }, [sessionId]);

  // Persist scope settings to localStorage
  useEffect(() => {
    localStorage.setItem(NOVA_SCOPE_KEY, scope);
  }, [scope]);

  useEffect(() => {
    localStorage.setItem(NOVA_BUILDING_IDS_KEY, JSON.stringify(selectedBuildingIds));
  }, [selectedBuildingIds]);

  useEffect(() => {
    localStorage.setItem(NOVA_INCLUDE_GENERAL_KEY, String(includeGeneral));
  }, [includeGeneral]);

  // Fetch buildings filtered by management mode
  useEffect(() => {
    const fetchBuildings = async () => {
      const { data, error } = await supabase
        .from('buildings')
        .select('id, name, address, building_code')
        .eq('management_mode', managementMode)
        .order('name');

      if (!error && data) {
        setBuildings(data);
        // Clear selected buildings if they're no longer in the filtered list
        const validIds = data.map(b => b.id);
        setSelectedBuildingIds(prev => prev.filter(id => validIds.includes(id)));
      }
    };

    fetchBuildings();
  }, [managementMode]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  // Load existing session messages (on mount from localStorage or when sessionId changes)
  useEffect(() => {
    const loadSession = async () => {
      if (!sessionId) return;

      const { data, error } = await supabase
        .from('document_chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (!error && data && data.length > 0) {
        setMessages(data.map(msg => ({
          id: msg.id,
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
          sources: msg.sources as any,
          created_at: msg.created_at,
        })));
      } else if (error) {
        // Session doesn't exist anymore, clear it
        console.log('Session not found, clearing localStorage');
        localStorage.removeItem(NOVA_SESSION_KEY);
        setSessionId(null);
      }
    };

    loadSession();
  }, [sessionId]);

  const handleSend = async (messageContent: string) => {
    if (isLoading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: messageContent,
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // Determine buildingIds based on scope
      let buildingIds: string[] = [];
      if (scope === 'specific' && selectedBuildingIds.length > 0) {
        buildingIds = selectedBuildingIds;
      }

      // Determine includeGeneral based on scope
      const shouldIncludeGeneral = scope === 'general' ? true : includeGeneral;

      const { data, error } = await supabase.functions.invoke('query-documents', {
        body: {
          sessionId,
          question: messageContent,
          buildingId: scope === 'specific' && buildingIds.length === 1 ? buildingIds[0] : null,
          buildingIds: scope === 'specific' && buildingIds.length > 1 ? buildingIds : null,
          includeGeneral: shouldIncludeGeneral,
          userId: user?.id,
          searchAllBuildings: scope === 'all',
          useWebSearch: webSearchEnabled,
          useDeepResearch: deepResearchEnabled,
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data.sessionId && !sessionId) {
        setSessionId(data.sessionId);
      }

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.answer,
        sources: data.sources,
        created_at: new Date().toISOString(),
      };

      setMessages(prev => [...prev, assistantMessage]);

    } catch (error) {
      console.error('Chat error:', error);
      toast({
        title: "Fehler",
        description: error instanceof Error ? error.message : "Konnte keine Antwort generieren.",
        variant: "destructive",
      });
      
      setMessages(prev => prev.filter(m => m.id !== userMessage.id));
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewSession = () => {
    // Clear session
    localStorage.removeItem(NOVA_SESSION_KEY);
    setSessionId(null);
    setMessages([]);
    
    // Reset scope to default
    localStorage.removeItem(NOVA_SCOPE_KEY);
    localStorage.removeItem(NOVA_BUILDING_IDS_KEY);
    localStorage.removeItem(NOVA_INCLUDE_GENERAL_KEY);
    setScope('general');
    setSelectedBuildingIds([]);
    setIncludeGeneral(true);
    
    toast({
      title: "Neue Session",
      description: "Eine neue Chat-Session wurde gestartet.",
    });
  };

  const handleSelectSession = async (session: ChatSession) => {
    // Set session ID
    setSessionId(session.id);
    localStorage.setItem(NOVA_SESSION_KEY, session.id);
    
    // Restore scope settings
    if (session.building_ids && session.building_ids.length > 0) {
      setScope('specific');
      setSelectedBuildingIds(session.building_ids);
      localStorage.setItem(NOVA_SCOPE_KEY, 'specific');
      localStorage.setItem(NOVA_BUILDING_IDS_KEY, JSON.stringify(session.building_ids));
    } else if (session.search_scope === 'all') {
      setScope('all');
      setSelectedBuildingIds([]);
      localStorage.setItem(NOVA_SCOPE_KEY, 'all');
      localStorage.setItem(NOVA_BUILDING_IDS_KEY, '[]');
    } else {
      setScope('general');
      setSelectedBuildingIds([]);
      localStorage.setItem(NOVA_SCOPE_KEY, 'general');
      localStorage.setItem(NOVA_BUILDING_IDS_KEY, '[]');
    }
    
    setIncludeGeneral(session.include_general);
    localStorage.setItem(NOVA_INCLUDE_GENERAL_KEY, String(session.include_general));
    
    // Load messages for this session
    const { data, error } = await supabase
      .from('document_chat_messages')
      .select('*')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setMessages(data.map(msg => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        sources: msg.sources as any,
        created_at: msg.created_at,
      })));
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-background">
      {/* Chat History Sidebar */}
      {user && (
        <ChatHistorySidebar
          userId={user.id}
          currentSessionId={sessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <KnowledgeScopeSelector
            scope={scope}
            onScopeChange={setScope}
            selectedBuildingIds={selectedBuildingIds}
            onBuildingChange={setSelectedBuildingIds}
            includeGeneral={includeGeneral}
            onIncludeGeneralChange={setIncludeGeneral}
            buildings={buildings}
          />
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleNewSession}
              className="h-9 w-9"
              title="Neue Session"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <MoreHorizontal className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setIsPromptGuideOpen(true)}>
              <BookOpen className="h-4 w-4 mr-2" />
              Prompt-Guide
            </DropdownMenuItem>
            {(profile?.role === 'admin' || profile?.role === 'employee') && (
              <DropdownMenuItem onClick={() => navigate('/documents/settings')}>
                <Settings className="h-4 w-4 mr-2" />
                Einstellungen
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => setIsUploadOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Dokument hochladen
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-h-0">
        {messages.length === 0 ? (
          /* Welcome Screen - Centered with Input, shifted up */
          <div className="flex-1 flex flex-col items-center justify-center -mt-32">
            <ChatWelcome />
            <div className="mt-8 w-full">
              <ChatInputField
                onSend={handleSend}
                isLoading={isLoading}
                webSearchEnabled={webSearchEnabled}
                onWebSearchToggle={() => setWebSearchEnabled(!webSearchEnabled)}
                deepResearchEnabled={deepResearchEnabled}
                onDeepResearchToggle={() => setDeepResearchEnabled(!deepResearchEnabled)}
              />
            </div>
          </div>
        ) : (
          /* Messages with Input at Bottom */
          <>
            <ScrollArea className="flex-1 px-4" ref={scrollRef}>
              <div className="py-6">
                <ChatMessages messages={messages} isLoading={isLoading} />
              </div>
            </ScrollArea>

            {/* Input Area */}
            <div className="pb-6 pt-4 bg-gradient-to-t from-background via-background to-transparent">
              <ChatInputField
                onSend={handleSend}
                isLoading={isLoading}
                webSearchEnabled={webSearchEnabled}
                onWebSearchToggle={() => setWebSearchEnabled(!webSearchEnabled)}
                deepResearchEnabled={deepResearchEnabled}
                onDeepResearchToggle={() => setDeepResearchEnabled(!deepResearchEnabled)}
              />
            </div>
          </>
        )}
      </div>

      {/* Upload Dialog */}
      <UploadDialog
        open={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        buildings={buildings}
      />

      {/* Prompt Guide Sheet */}
      <PromptGuideSheet
        open={isPromptGuideOpen}
        onOpenChange={setIsPromptGuideOpen}
      />
      </div>
    </div>
  );
}

export default Documents;
