import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  ChevronLeft, 
  ChevronRight, 
  MessageSquare, 
  Trash2,
  Plus
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ChatSession {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  search_scope: string;
  include_general: boolean;
  building_ids: string[] | null;
}

interface ChatHistorySidebarProps {
  userId: string;
  currentSessionId: string | null;
  onSelectSession: (session: ChatSession) => void;
  onNewSession: () => void;
}

export function ChatHistorySidebar({
  userId,
  currentSessionId,
  onSelectSession,
  onNewSession,
}: ChatHistorySidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);

  // Load sessions
  useEffect(() => {
    if (!userId) return;

    const fetchSessions = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('document_chat_sessions')
        .select('id, title, created_at, updated_at, search_scope, include_general, building_ids')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(20);

      if (!error && data) {
        setSessions(data as ChatSession[]);
      }
      setIsLoading(false);
    };

    fetchSessions();

    // Subscribe to changes
    const channel = supabase
      .channel('chat_sessions_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'document_chat_sessions',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchSessions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const handleDeleteSession = async () => {
    if (!deleteSessionId) return;

    // Delete messages first
    await supabase
      .from('document_chat_messages')
      .delete()
      .eq('session_id', deleteSessionId);

    // Then delete session
    await supabase
      .from('document_chat_sessions')
      .delete()
      .eq('id', deleteSessionId);

    setSessions(prev => prev.filter(s => s.id !== deleteSessionId));
    
    // If we deleted the current session, start a new one
    if (deleteSessionId === currentSessionId) {
      onNewSession();
    }
    
    setDeleteSessionId(null);
  };

  const formatDate = (dateString: string) => {
    const date = parseISO(dateString);
    if (isToday(date)) {
      return "Heute";
    }
    if (isYesterday(date)) {
      return "Gestern";
    }
    return format(date, "d. MMM yyyy", { locale: de });
  };

  const getSessionTitle = (session: ChatSession) => {
    return session.title || "Neues Gespräch";
  };

  return (
    <>
      {/* Toggle Button - Always visible */}
      <div
        className={cn(
          "hidden md:flex flex-col transition-all duration-300",
          isOpen ? "w-72 border-r border-border bg-muted/30" : "w-3"
        )}
      >
        {/* Header with toggle */}
        <div className={cn(
          "flex items-center",
          isOpen ? "justify-between p-2 border-b border-border" : "justify-start py-2"
        )}>
          {isOpen && (
            <span className="text-sm font-medium text-muted-foreground px-2">
              Verlauf
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsOpen(!isOpen)}
            className={cn(
              "shrink-0",
              isOpen ? "h-8 w-8" : "h-5 w-5 p-0 hover:bg-transparent"
            )}
          >
            {isOpen ? (
              <ChevronLeft className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
          </Button>
        </div>

        {/* Content */}
        {isOpen && (
          <>
            {/* New Session Button */}
            <div className="p-2">
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={onNewSession}
              >
                <Plus className="h-4 w-4" />
                Neues Gespräch
              </Button>
            </div>

            {/* Sessions List */}
            <ScrollArea className="flex-1">
              <div className="px-2 pb-2 space-y-1">
                {isLoading ? (
                  <div className="text-sm text-muted-foreground text-center py-4">
                    Lade...
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-4">
                    Keine Gespräche
                  </div>
                ) : (
                  sessions.map((session) => (
                    <TooltipProvider key={session.id} delayDuration={500}>
                      <div
                        className={cn(
                          "group relative rounded-md transition-colors",
                          session.id === currentSessionId
                            ? "bg-primary/10"
                            : "hover:bg-muted"
                        )}
                      >
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => onSelectSession(session)}
                              className="w-full text-left p-2 pr-8"
                            >
                              <div className="flex items-start gap-2">
                                <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium truncate">
                                    {getSessionTitle(session)}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatDate(session.updated_at)}
                                  </p>
                                </div>
                              </div>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs">
                            <p>{getSessionTitle(session)}</p>
                          </TooltipContent>
                        </Tooltip>

                        {/* Delete button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteSessionId(session.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    </TooltipProvider>
                  ))
                )}
              </div>
            </ScrollArea>
          </>
        )}

        {/* Collapsed state - empty, just the chevron in header */}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteSessionId} onOpenChange={() => setDeleteSessionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gespräch löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dieses Gespräch und alle zugehörigen Nachrichten werden unwiderruflich gelöscht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSession} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
