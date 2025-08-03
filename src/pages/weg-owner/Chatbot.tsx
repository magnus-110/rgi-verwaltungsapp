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
  const [newBuildingId, setNewBuildingId] = useState("");
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
      const { data, error } = await supabase
        .from("weg_owner_buildings")
        .select("*")
        .eq("user_id", profile?.user_id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setBuildings(data || []);
      
      // Auto-select first building if available and none selected
      if (data && data.length > 0 && !selectedBuildingId) {
        setSelectedBuildingId(data[0].building_id);
      }
    } catch (error: any) {
      console.error("Error fetching building assignments:", error);
    }
  };

  const addQuickBuildingId = async () => {
    if (!newBuildingId.trim()) {
      toast({
        title: "Fehler",
        description: "Bitte geben Sie eine gültige Gebäude-ID ein.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from("weg_owner_buildings")
        .insert([{
          user_id: profile?.user_id,
          building_id: newBuildingId.trim()
        }])
        .select()
        .single();

      if (error) throw error;

      setBuildings(prev => [data, ...prev]);
      setSelectedBuildingId(newBuildingId.trim());
      setNewBuildingId("");
      
      toast({
        title: "Erfolg",
        description: "Gebäude-ID wurde hinzugefügt und ausgewählt.",
      });
    } catch (error: any) {
      if (error.code === '23505') {
        // Building already exists, just select it
        setSelectedBuildingId(newBuildingId.trim());
        setNewBuildingId("");
        toast({
          title: "Info",
          description: "Gebäude-ID bereits vorhanden und wurde ausgewählt.",
        });
      } else {
        toast({
          title: "Fehler",
          description: "Gebäude-ID konnte nicht hinzugefügt werden.",
          variant: "destructive",
        });
      }
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
          placeholder="Stellen Sie Fragen zu Ihren Gebäuden und Verwaltungsangelegenheiten..."
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
                    Ihre hinterlegten Gebäude
                  </Label>
                  <Select value={selectedBuildingId} onValueChange={setSelectedBuildingId}>
                    <SelectTrigger className="focus:ring-2 focus:ring-primary/20">
                      <SelectValue placeholder="Gebäude auswählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {buildings.map((building) => (
                        <SelectItem key={building.id} value={building.building_id}>
                          {building.building_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="pt-2 border-t">
                    <Label className="text-sm font-medium">Neue ID hinzufügen</Label>
                    <div className="flex gap-2 mt-2">
                      <Input
                        placeholder="z.B. GEB-2024-001"
                        value={newBuildingId}
                        onChange={(e) => setNewBuildingId(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addQuickBuildingId()}
                        className="text-sm"
                      />
                      <Button onClick={addQuickBuildingId} size="sm">+</Button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <Label className="text-sm font-medium">
                    Erste Gebäude-ID hinzufügen
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="z.B. GEB-2024-001"
                      value={newBuildingId}
                      onChange={(e) => setNewBuildingId(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addQuickBuildingId()}
                      className="focus:ring-2 focus:ring-primary/20"
                    />
                    <Button onClick={addQuickBuildingId} size="sm">+</Button>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Die Gebäude-ID erhalten Sie von Ihrem Administrator. Einmal hinzugefügt, können Sie diese jederzeit in den Einstellungen verwalten.
                  </p>
                </>
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
                <MessageSquare className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                <p className="text-muted-foreground leading-relaxed">
                  Verwalten Sie Ihre Gebäude-IDs in den Einstellungen
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Settings className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                <p className="text-muted-foreground leading-relaxed">
                  Besuchen Sie die Einstellungen für erweiterte Gebäude-Verwaltung
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};