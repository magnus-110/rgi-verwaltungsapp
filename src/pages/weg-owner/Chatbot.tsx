import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquare, Building2 } from "lucide-react";
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

export const WegOwnerChatbot = () => {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [buildingId, setBuildingId] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [hasStartedChat, setHasStartedChat] = useState(false);

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
          buildingId: buildingId || undefined
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
              Gebäude-ID
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Label htmlFor="building-id" className="text-sm font-medium">
                Ihre Gebäude-ID eingeben
              </Label>
              <Input
                id="building-id"
                value={buildingId}
                onChange={(e) => setBuildingId(e.target.value)}
                placeholder="z.B. GEB-2024-001"
                className="focus:ring-2 focus:ring-primary/20"
              />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Die Gebäude-ID erhalten Sie von Ihrem Administrator für spezifische Gebäudeinformationen.
              </p>
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
                  Fragen Sie nach Gebäudeinformationen mit Ihrer ID
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
                  Erfragen Sie allgemeine Informationen zu Ihren Objekten
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};