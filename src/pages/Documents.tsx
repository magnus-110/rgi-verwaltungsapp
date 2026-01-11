import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MoreHorizontal, RefreshCw, Settings, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { KnowledgeScopeSelector, KnowledgeScope } from "@/components/documents/KnowledgeScopeSelector";
import { UploadDialog } from "@/components/documents/UploadDialog";
import { ChatWelcome } from "@/components/documents/ChatWelcome";
import { ChatInputField } from "@/components/documents/ChatInputField";
import { ChatMessages } from "@/components/documents/ChatMessages";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
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

const NOVA_SESSION_KEY = 'nova_current_session_id';

export function Documents() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Knowledge scope state
  const [scope, setScope] = useState<KnowledgeScope>('general');
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [includeGeneral, setIncludeGeneral] = useState(true);

  // Data state
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  // Chat state - load sessionId from localStorage on init
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(() => {
    return localStorage.getItem(NOVA_SESSION_KEY);
  });
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);

  // Persist sessionId to localStorage when it changes
  useEffect(() => {
    if (sessionId) {
      localStorage.setItem(NOVA_SESSION_KEY, sessionId);
    }
  }, [sessionId]);

  // Fetch buildings
  useEffect(() => {
    const fetchBuildings = async () => {
      const { data, error } = await supabase
        .from('buildings')
        .select('id, name, address, building_code')
        .order('name');

      if (!error && data) {
        setBuildings(data);
      }
    };

    fetchBuildings();
  }, []);

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
      // Determine buildingId based on scope
      let buildingId: string | null = null;
      if (scope === 'specific' && selectedBuildingId) {
        buildingId = selectedBuildingId;
      }

      // Determine includeGeneral based on scope
      const shouldIncludeGeneral = scope === 'general' ? true : includeGeneral;

      const { data, error } = await supabase.functions.invoke('query-documents', {
        body: {
          sessionId,
          question: messageContent,
          buildingId: scope === 'specific' ? buildingId : null,
          includeGeneral: shouldIncludeGeneral,
          userId: user?.id,
          searchAllBuildings: scope === 'all',
          useWebSearch: webSearchEnabled,
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
    localStorage.removeItem(NOVA_SESSION_KEY);
    setSessionId(null);
    setMessages([]);
    toast({
      title: "Neue Session",
      description: "Eine neue Chat-Session wurde gestartet.",
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <KnowledgeScopeSelector
            scope={scope}
            onScopeChange={setScope}
            selectedBuildingId={selectedBuildingId}
            onBuildingChange={setSelectedBuildingId}
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
            <DropdownMenuItem onClick={() => navigate('/documents/settings')}>
              <Settings className="h-4 w-4 mr-2" />
              Einstellungen
            </DropdownMenuItem>
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
    </div>
  );
}

export default Documents;
