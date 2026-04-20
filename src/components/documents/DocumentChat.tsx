import React, { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, Send, Loader2, RefreshCw, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
    fileName?: string | null;
    folderPath?: string[];
    categorySlug?: string | null;
    documentUrl?: string | null;
    pageNumber?: number | null;
  }>;
  created_at: string;
}

interface DocumentChatProps {
  buildings: Building[];
  selectedBuildingId: string | null;
  onBuildingChange: (id: string | null) => void;
  userId: string;
}

export function DocumentChat({
  buildings,
  selectedBuildingId,
  onBuildingChange,
  userId,
}: DocumentChatProps) {
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [searchScope, setSearchScope] = useState<'all' | 'building'>('all');
  const [includeGeneral, setIncludeGeneral] = useState(true);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Load existing session messages
  useEffect(() => {
    const loadSession = async () => {
      if (!sessionId) return;

      const { data, error } = await supabase
        .from('document_chat_messages')
        .select('*')
        .eq('session_id', sessionId)
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

    loadSession();
  }, [sessionId]);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: inputValue.trim(),
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('query-documents', {
        body: {
          sessionId,
          question: userMessage.content,
          buildingId: searchScope === 'building' ? selectedBuildingId : null,
          includeGeneral,
          userId,
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      // Update session ID if new
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
      
      // Remove the user message on error
      setMessages(prev => prev.filter(m => m.id !== userMessage.id));
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleNewSession = () => {
    setSessionId(null);
    setMessages([]);
    toast({
      title: "Neue Session",
      description: "Eine neue Chat-Session wurde gestartet.",
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const exampleQuestions = [
    "Wie viele Eigentümer gibt es in diesem Gebäude?",
    "Was sind die wichtigsten Beschlüsse der letzten Eigentümerversammlung?",
    "Wer ist der aktuelle Verwalter?",
  ];

  return (
    <Card className="flex flex-col h-[600px]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Chat mit Dokumenten
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNewSession}
            className="flex items-center gap-1"
          >
            <RefreshCw className="h-4 w-4" />
            Neue Session
          </Button>
        </div>

        {/* Search scope controls */}
        <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t mt-3">
          <div className="flex-1">
            <Select
              value={searchScope}
              onValueChange={(v) => setSearchScope(v as 'all' | 'building')}
            >
              <SelectTrigger>
                <SelectValue placeholder="Suchbereich" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Gebäude durchsuchen</SelectItem>
                <SelectItem value="building">Nur ausgewähltes Gebäude</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {searchScope === 'building' && (
            <div className="flex-1">
              <Select
                value={selectedBuildingId || ''}
                onValueChange={(v) => onBuildingChange(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Gebäude auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {buildings.map((building) => (
                    <SelectItem key={building.id} value={building.id}>
                      {building.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Checkbox
              id="includeGeneral"
              checked={includeGeneral}
              onCheckedChange={(checked) => setIncludeGeneral(checked as boolean)}
            />
            <label htmlFor="includeGeneral" className="text-sm cursor-pointer">
              Allgemeine Dokumente einbeziehen
            </label>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col min-h-0 p-4">
        {/* Messages area */}
        <ScrollArea className="flex-1 pr-4" ref={scrollRef as any}>
          <div className="space-y-4">
            {messages.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-medium mb-2">Stellen Sie eine Frage zu Ihren Dokumenten</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Die KI sucht in Ihren hochgeladenen Dokumenten nach relevanten Informationen.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {exampleQuestions.map((question, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      size="sm"
                      onClick={() => setInputValue(question)}
                      className="text-xs"
                    >
                      {question}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg p-3 ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                    
                    {/* Sources */}
                    {message.sources && message.sources.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-border/50">
                        <p className="text-xs font-medium mb-1 flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          Quellen:
                        </p>
                        <div className="space-y-1">
                          {message.sources.slice(0, 3).map((source, index) => (
                            <div
                              key={index}
                              className="text-xs bg-background/50 rounded p-1.5"
                            >
                              {source.metadata?.section && (
                                <span className="font-medium">{source.metadata.section}</span>
                              )}
                              {source.metadata?.page && (
                                <span className="text-muted-foreground ml-1">
                                  (Seite {source.metadata.page})
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Suche in Dokumenten...</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input area */}
        <div className="flex gap-2 pt-4 border-t mt-4">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Stellen Sie eine Frage..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading}
            size="icon"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
