import { useState, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ChatInput } from "@/components/chat/ChatInput";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import { WelcomeScreen } from "@/components/chat/WelcomeScreen";
import { MobileHeader } from "@/components/MobileHeader";
import { HelpFab } from "@/components/chat/HelpFab";
import { useIsMobile } from "@/hooks/use-mobile";

interface Message {
  id: string;
  content: string;
  isBot: boolean;
  timestamp: Date;
}

interface WegOwnerBuilding {
  id: string;
  building_id: string;
  created_at: string;
}

export const WegOwnerChatbot = () => {
  const { profile } = useAuth();
  const isMobile = useIsMobile();
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState("");
  
  const [buildings, setBuildings] = useState<WegOwnerBuilding[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [hasStartedChat, setHasStartedChat] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  useEffect(() => {
    if (profile?.user_id) {
      fetchBuildingAssignments();
    }
  }, [profile?.user_id]);

  const fetchBuildingAssignments = async () => {
    try {
      // First, get the building assignments
      const { data: assignments, error: assignmentsError } = await supabase
        .from("weg_owner_buildings")
        .select("id, building_id, created_at")
        .eq("user_id", profile?.user_id)
        .order("created_at", { ascending: false });

      if (assignmentsError) throw assignmentsError;

      if (!assignments || assignments.length === 0) {
        setBuildings([]);
        return;
      }

      // Get building IDs
      const buildingIds = assignments.map(a => a.building_id);

      // Fetch building details separately
      const { data: buildingsData, error: buildingsError } = await supabase
        .from("buildings")
        .select("id, name, address, building_code")
        .in("id", buildingIds);

      if (buildingsError) throw buildingsError;

      // Combine assignments with building data
      const combinedData = assignments.map(assignment => {
        const building = buildingsData?.find(b => b.id === assignment.building_id);
        return {
          ...assignment,
          buildings: building
        };
      });

      setBuildings(combinedData);
      
      // Auto-select first building if available and none selected
      if (combinedData && combinedData.length > 0 && !selectedBuildingId) {
        setSelectedBuildingId(combinedData[0].building_id);
      }
    } catch (error: any) {
      console.error("Error fetching building assignments:", error);
    }
  };


  const getBotResponse = async (input: string): Promise<string> => {
    try {
      if (!profile?.user_id) {
        return "Benutzeranmeldung erforderlich.";
      }

      // Call the Edge Function instead of OpenAI directly
      const { data, error } = await supabase.functions.invoke('chat-with-ai', {
        body: {
          message: input,
          userId: profile.user_id,
          managementMode: 'weg',
          buildingId: selectedBuildingId || undefined
        }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message);
      }

      return data.response || "Entschuldigung, ich konnte keine Antwort generieren.";
    } catch (error) {
      console.error('Error generating response:', error);
      return "Entschuldigung, es gab einen Fehler bei der Verarbeitung Ihrer Anfrage. Bitte wenden Sie sich direkt an die Hausverwaltung unter info@rgi-immobilien.de oder Tel: 08362-123456.";
    }
  };

  const handleSendMessage = async (message: string) => {
    if (!message.trim()) return;

    // Start chat if it's the first message
    if (!hasStartedChat) {
      setHasStartedChat(true);
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      content: message,
      isBot: false,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setIsTyping(true);

    try {
      const response = await getBotResponse(message);
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        content: response,
        isBot: true,
        timestamp: new Date()
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
      setIsTyping(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <MobileHeader userRole="weg_owner" />
      
      <div className="flex-1 flex flex-col pt-16 pb-28 md:pt-0 md:pb-0">
        {!hasStartedChat ? (
          <WelcomeScreen 
            userName={profile?.first_name}
            userType="weg_owner"
            onSuggestionClick={handleSendMessage}
          />
        ) : (
          <div className="flex-1 flex flex-col">
            <ScrollArea className="flex-1">
              <div className="min-h-full py-4 pb-28 md:pb-4">
                {messages.map((message) => (
                  <ChatMessage key={message.id} message={message} />
                ))}
                
                {isTyping && <TypingIndicator />}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
      
      <ChatInput 
        onSendMessage={handleSendMessage}
        isLoading={isTyping}
        disabled={buildings.length === 0}
        placeholder={buildings.length === 0 ? 
          "Keine Gebäude zugeordnet. Wenden Sie sich an die Verwaltung." : 
          undefined}
        setIsHelpOpen={setIsHelpOpen}
      />
      
      {isHelpOpen && (
        <HelpFab 
          userType="weg_owner"
          userName={profile?.first_name}
          selectedBuildingId={selectedBuildingId}
          onBuildingChange={setSelectedBuildingId}
          isOpen={isHelpOpen}
          setIsOpen={setIsHelpOpen}
        />
      )}
    </div>
  );
};