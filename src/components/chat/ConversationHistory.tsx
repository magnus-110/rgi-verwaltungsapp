import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { MessageCircle, Clock } from "lucide-react";

interface ChatSession {
  id: string;
  started_at: string;
  building_id?: string;
  building_name?: string;
  message_count: number;
}

interface ConversationHistoryProps {
  managementMode: 'rent' | 'weg';
  onSessionSelect: (sessionId: string) => void;
  currentSessionId?: string;
}

export const ConversationHistory = ({ 
  managementMode, 
  onSessionSelect, 
  currentSessionId 
}: ConversationHistoryProps) => {
  const { profile } = useAuth();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (profile?.user_id) {
      loadSessions();
    }
  }, [profile?.user_id, managementMode]);

  const loadSessions = async () => {
    try {
      setIsLoading(true);
      
      // Load sessions with message count
      const { data: sessionsData, error } = await supabase
        .from('chatbot_sessions')
        .select(`
          id,
          started_at,
          building_id,
          chatbot_messages(count)
        `)
        .eq('user_id', profile!.user_id)
        .eq('management_mode', managementMode)
        .order('started_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error('Error loading sessions:', error);
        return;
      }

      // Load building names if needed
      const sessionsWithCounts = sessionsData?.map(session => ({
        id: session.id,
        started_at: session.started_at,
        building_id: session.building_id,
        message_count: session.chatbot_messages?.[0]?.count || 0
      })) || [];

      // Get building names for sessions that have building_id
      const buildingIds = sessionsWithCounts
        .filter(s => s.building_id)
        .map(s => s.building_id);

      let buildingNames: { [key: string]: string } = {};
      
      if (buildingIds.length > 0) {
        const { data: buildings } = await supabase
          .from('buildings')
          .select('id, name')
          .in('id', buildingIds);

        if (buildings) {
          buildingNames = buildings.reduce((acc, building) => ({
            ...acc,
            [building.id]: building.name
          }), {});
        }
      }

      const sessionsWithBuildings = sessionsWithCounts.map(session => ({
        ...session,
        building_name: session.building_id ? buildingNames[session.building_id] : undefined
      }));

      setSessions(sessionsWithBuildings);
    } catch (error) {
      console.error('Error in loadSessions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Lade Gespräche...
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground text-center">
        <MessageCircle className="mx-auto h-8 w-8 mb-2 opacity-50" />
        Noch keine Gespräche
      </div>
    );
  }

  return (
    <div className="border-r bg-muted/20 w-80">
      <div className="p-4 border-b">
        <h3 className="font-semibold text-sm">Letzte Gespräche</h3>
      </div>
      <ScrollArea className="h-full">
        <div className="p-2 space-y-1">
          {sessions.map((session) => (
            <Button
              key={session.id}
              variant={currentSessionId === session.id ? "secondary" : "ghost"}
              className="w-full justify-start h-auto p-3 text-left"
              onClick={() => onSessionSelect(session.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(session.started_at), 'dd.MM.yy HH:mm', { locale: de })}
                  </span>
                </div>
                {session.building_name && (
                  <div className="text-xs text-muted-foreground truncate">
                    {session.building_name}
                  </div>
                )}
                <div className="text-xs text-muted-foreground mt-1">
                  {session.message_count} Nachrichten
                </div>
              </div>
            </Button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};