import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
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

export const TenantChatbot = () => {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasStartedChat, setHasStartedChat] = useState(false);

  const sendMessage = async (inputMessage: string) => {
    if (!inputMessage.trim()) return;

    // Start chat if it's the first message
    if (!hasStartedChat) {
      setHasStartedChat(true);
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputMessage,
      isBot: false,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await getBotResponse(inputMessage);
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: response,
        isBot: true,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "Entschuldigung, es gab einen Fehler. Bitte versuchen Sie es erneut oder wenden Sie sich direkt an die Hausverwaltung.",
        isBot: true,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
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
          managementMode: 'rent'
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

  return (
    <div className="h-full flex flex-col bg-gradient-warm min-h-screen">
      {!hasStartedChat ? (
        <WelcomeScreen 
          userName={profile?.first_name}
          userType="tenant"
          onSuggestionClick={sendMessage}
        />
      ) : (
        <div className="flex-1 flex flex-col">
          <ScrollArea className="flex-1 bg-muted/10">
            <div className="min-h-full">
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}
              
              {isLoading && <TypingIndicator />}
            </div>
          </ScrollArea>
        </div>
      )}
      
      <ChatInput 
        onSendMessage={sendMessage}
        isLoading={isLoading}
        placeholder="Stellen Sie Fragen zu Ihrem Gebäude und Mietangelegenheiten..."
      />
    </div>
  );
};