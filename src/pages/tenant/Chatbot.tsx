import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ChatInput } from "@/components/chat/ChatInput";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import { WelcomeScreen } from "@/components/chat/WelcomeScreen";
import { MobileHeader } from "@/components/MobileHeader";
import { HelpFab } from "@/components/chat/HelpFab";
import { ConversationHistory } from "@/components/chat/ConversationHistory";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";

interface Message {
  id: string;
  content: string;
  isBot: boolean;
  timestamp: Date;
}

export const TenantChatbot = () => {
  const { profile } = useAuth();
  const isMobile = useIsMobile();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasStartedChat, setHasStartedChat] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string>();
  const [showHistory, setShowHistory] = useState(false);

  const sendMessage = async (inputMessage: string) => {
    if (!inputMessage.trim()) return;

    // Start chat if it's the first message and no session selected
    if (!hasStartedChat && !currentSessionId) {
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
          managementMode: 'rent',
          buildingId: (profile as any)?.building_id,
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

      return data.response || "Entschuldigung, ich konnte keine Antwort generieren.";
    } catch (error) {
      console.error('Error generating response:', error);
      return "Entschuldigung, es gab einen Fehler bei der Verarbeitung Ihrer Anfrage. Bitte wenden Sie sich direkt an die Hausverwaltung unter info@rgi-immobilien.de oder Tel: 08362-123456.";
    }
  };

  const loadSessionMessages = async (sessionId: string) => {
    try {
      const { data, error } = await supabase
        .from('chatbot_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error loading session messages:', error);
        return;
      }

      if (data) {
        const loadedMessages: Message[] = data.map(msg => ({
          id: msg.id,
          content: msg.content,
          isBot: msg.role === 'assistant',
          timestamp: new Date(msg.created_at)
        }));
        setMessages(loadedMessages);
        setHasStartedChat(true);
        setCurrentSessionId(sessionId);
      }
    } catch (error) {
      console.error('Error in loadSessionMessages:', error);
    }
  };

  const startNewConversation = () => {
    setMessages([]);
    setHasStartedChat(false);
    setCurrentSessionId(undefined);
    setShowHistory(false);
  };

  const isTyping = isLoading;

  return (
    <div className="h-full flex bg-background relative">
      {showHistory && (
        <ConversationHistory
          managementMode="rent"
          onSessionSelect={loadSessionMessages}
          currentSessionId={currentSessionId}
        />
      )}
      
      <div className="flex-1 flex flex-col">
        <div className="border-b p-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              {showHistory ? 'Gespräche ausblenden' : 'Gespräche anzeigen'}
            </Button>
            {hasStartedChat && (
              <Button
                variant="outline"
                size="sm"
                onClick={startNewConversation}
              >
                Neues Gespräch
              </Button>
            )}
          </div>
        </div>

        {!hasStartedChat ? (
        <WelcomeScreen 
          userName={profile?.first_name}
          userType="tenant"
          onSuggestionClick={sendMessage}
          />
        ) : (
          <div className="flex-1 pb-32">
            <ScrollArea className="h-full">
              <div className="py-4">
                {messages.map((message) => (
                  <ChatMessage key={message.id} message={message} />
                ))}
                
                {isTyping && <TypingIndicator />}
              </div>
            </ScrollArea>
          </div>
        )}
        
        <ChatInput
        onSendMessage={sendMessage}
        isLoading={isTyping}
          setIsHelpOpen={setIsHelpOpen}
        />
        
        {isHelpOpen && (
          <HelpFab 
            userType="tenant"
            userName={profile?.first_name}
            isOpen={isHelpOpen}
            setIsOpen={setIsHelpOpen}
          />
        )}
      </div>
    </div>
  );
};