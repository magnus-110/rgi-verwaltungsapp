import { useState, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ChatMessage, type ChatSource, type ReportDraft } from "@/components/chat/ChatMessage";
import { ChatInput } from "@/components/chat/ChatInput";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import { WelcomeScreen } from "@/components/chat/WelcomeScreen";
import { HelpFab } from "@/components/chat/HelpFab";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Message {
  id: string;
  content: string;
  isBot: boolean;
  timestamp: Date;
  sources?: ChatSource[];
  reportDraft?: ReportDraft | null;
  reportStatus?: 'gesendet' | 'fehler';
}

interface WegOwnerBuilding {
  id: string;
  building_id: string;
  building_name: string;
  created_at: string;
}

export const WegOwnerChatbot = () => {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasStartedChat, setHasStartedChat] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [buildingAssignments, setBuildingAssignments] = useState<WegOwnerBuilding[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>("");
  const [currentSessionId, setCurrentSessionId] = useState<string>();
  const [sendendeMeldung, setSendendeMeldung] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.user_id) {
      fetchBuildingAssignments();
    }
  }, [profile?.user_id]);

  const fetchBuildingAssignments = async () => {
    try {
      // First, get the building assignments with building data
      const { data: assignments, error: assignmentsError } = await supabase
        .from("weg_owner_buildings")
        .select(`
          id,
          building_id,
          created_at,
          buildings!inner(id, name, address, building_code)
        `)
        .eq("user_id", profile?.user_id)
        .order("created_at", { ascending: false });

      if (assignmentsError) throw assignmentsError;

      if (!assignments || assignments.length === 0) {
        setBuildingAssignments([]);
        return;
      }

      const formattedAssignments = assignments.map(assignment => ({
        id: assignment.id,
        building_id: assignment.building_id,
        building_name: (assignment.buildings as any).name,
        created_at: assignment.created_at
      }));

      setBuildingAssignments(formattedAssignments);
      
      // Auto-select first building if available and none selected
      if (formattedAssignments.length > 0 && !selectedBuildingId) {
        setSelectedBuildingId(formattedAssignments[0].building_id);
      }
    } catch (error: any) {
      console.error("Error fetching building assignments:", error);
    }
  };


  const handleSendMessage = async (message: string): Promise<void> => {
    if (!message.trim()) return;

    // Start chat if it's the first message and no session selected
    if (!hasStartedChat && !currentSessionId) {
      setHasStartedChat(true);
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      content: message,
      isBot: false,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await getBotResponse(message);
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        content: response.text,
        isBot: true,
        timestamp: new Date(),
        sources: response.sources,
        reportDraft: response.reportDraft
      };
      setMessages(prev => [...prev, aiResponse]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "Entschuldigung, es gab einen Fehler. Bitte versuchen Sie es erneut.",
        isBot: true,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const getBotResponse = async (
    input: string
  ): Promise<{ text: string; sources?: ChatSource[]; reportDraft?: ReportDraft | null }> => {
    try {
      if (!profile?.user_id) {
        return { text: "Benutzeranmeldung erforderlich." };
      }

      // Call the Edge Function instead of OpenAI directly
      const { data, error } = await supabase.functions.invoke('chat-with-ai', {
        body: {
          message: input,
          userId: profile.user_id,
          managementMode: 'weg',
          buildingId: selectedBuildingId || null,
          sessionId: currentSessionId
        }
      });

      // Update session ID if it was created
      if (data?.sessionId && !currentSessionId) {
        setCurrentSessionId(data.sessionId);
      }

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message);
      }

      return {
        text: data.response || "Entschuldigung, ich konnte keine Antwort generieren.",
        sources: Array.isArray(data.sources) ? data.sources : undefined,
        reportDraft: data.reportDraft ?? null,
      };
    } catch (error) {
      console.error('Error generating response:', error);
      return {
        text: "Entschuldigung, es gab einen Fehler bei der Verarbeitung Ihrer Anfrage. Bitte wenden Sie sich direkt an die Hausverwaltung unter info@rgi-immobilien.de oder Tel: 08363 960656.",
      };
    }
  };

  // Die Meldung wird bewusst hier angelegt und nicht in der Edge Function: So greift
  // die RLS beim Schreiben, und es entsteht nie eine Meldung ohne Klick des Nutzers.
  const meldungAbsenden = async (messageId: string, draft: ReportDraft) => {
    if (!profile?.user_id) return;
    setSendendeMeldung(messageId);
    const gebaeudeId = selectedBuildingId || buildingAssignments[0]?.building_id || null;
    try {
      const { error } = await supabase.from("weg_reports").insert([{
        title: draft.title,
        description: draft.description,
        reported_by: profile.user_id,
        weg_owner_id: profile.user_id,
        building_id: gebaeudeId,
        contact_name: [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email,
        contact_email: profile.email,
        status: "open",
      }]);
      if (error) throw error;
      setMessages(prev => prev.map(m => (m.id === messageId ? { ...m, reportStatus: "gesendet" as const } : m)));
    } catch (error) {
      console.error("Meldung aus Chat fehlgeschlagen:", error);
      setMessages(prev => prev.map(m => (m.id === messageId ? { ...m, reportStatus: "fehler" as const } : m)));
    } finally {
      setSendendeMeldung(null);
    }
  };

  const isTyping = isLoading;

  return (
    <div className="h-full flex flex-col bg-background relative">

      {!hasStartedChat ? (
        <WelcomeScreen 
          userName={profile?.first_name}
          userType="weg_owner"
          onSuggestionClick={handleSendMessage}
        />
      ) : (
        <div className="flex-1 pb-32">
          <ScrollArea className="h-full">
            <div className="py-4">
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  onSubmitReport={meldungAbsenden}
                  isSubmittingReport={sendendeMeldung === message.id}
                />
              ))}
              
              {isTyping && <TypingIndicator />}
            </div>
          </ScrollArea>
        </div>
      )}
      
      <ChatInput
        onSendMessage={handleSendMessage}
        isLoading={isTyping}
        setIsHelpOpen={setIsHelpOpen}
      />

      
      {isHelpOpen && (
        <HelpFab 
          userType="weg_owner"
          userName={profile?.first_name}
          isOpen={isHelpOpen}
          setIsOpen={setIsHelpOpen}
        />
      )}
    </div>
  );
};