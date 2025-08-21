import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquare, Building2, Settings } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ChatInput } from "@/components/chat/ChatInput";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import { WelcomeScreen } from "@/components/chat/WelcomeScreen";

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState("");
  
  const [buildings, setBuildings] = useState<WegOwnerBuilding[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [hasStartedChat, setHasStartedChat] = useState(false);

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
    <div className="h-full flex flex-col lg:flex-row bg-gradient-warm min-h-screen">
      {/* Main Chat Interface */}
      <div className="flex-1 flex flex-col">
        {!hasStartedChat ? (
          <WelcomeScreen 
            userName={profile?.first_name}
            userType="weg_owner"
            onSuggestionClick={handleSendMessage}
          />
        ) : (
          <ScrollArea className="flex-1 bg-muted/10">
            <div className="min-h-full">
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}
              
              {isTyping && <TypingIndicator />}
            </div>
          </ScrollArea>
        )}
        
        <ChatInput 
          onSendMessage={handleSendMessage}
          isLoading={isTyping}
          disabled={buildings.length === 0}
          placeholder={buildings.length === 0 ? 
            "Keine Gebäude zugeordnet. Wenden Sie sich an die Verwaltung." : 
            "Stellen Sie Fragen zu Ihren Gebäuden und Verwaltungsangelegenheiten..."}
        />
      </div>

      {/* Sidebar */}
      <div className="w-full lg:w-80 space-y-4 p-4 bg-background/50 backdrop-blur-sm">
        <Card className="shadow-card border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              Gebäude auswählen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {buildings.length > 0 ? (
                <>
                  <Label className="text-sm font-medium">
                    Ihre zugeordneten Gebäude
                  </Label>
                  <Select value={selectedBuildingId} onValueChange={setSelectedBuildingId}>
                    <SelectTrigger className="focus:ring-2 focus:ring-primary/20">
                      <SelectValue placeholder="Gebäude auswählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {buildings.map((building) => (
                        <SelectItem key={building.id} value={building.building_id}>
                          {(building as any).buildings?.name || building.building_id} - {(building as any).buildings?.address}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              ) : (
                <div className="text-center py-4">
                  <Building2 className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
                  <Label className="text-sm font-medium block mb-2">
                    Keine Gebäude zugeordnet
                  </Label>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Wenden Sie sich an die Verwaltung, um Gebäude zugeordnet zu bekommen. 
                    Ohne Gebäude-Zuordnung ist der Chatbot nicht verfügbar.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Hilfe & Tipps</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-sm">
              <div className="flex items-start gap-3">
                <MessageSquare className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                <p className="text-muted-foreground leading-relaxed">
                  Wählen Sie ein Gebäude aus, um spezifische Informationen zu erhalten
                </p>
              </div>
              <div className="flex items-start gap-3">
                <MessageSquare className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                <p className="text-muted-foreground leading-relaxed">
                  Stellen Sie Fragen zu Verwaltungsangelegenheiten
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Settings className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                <p className="text-muted-foreground leading-relaxed">
                  Gebäude-Zuordnungen werden durch die Verwaltung vorgenommen
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};