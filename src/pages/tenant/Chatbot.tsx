import { useState } from "react";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ChatInput } from "@/components/chat/ChatInput";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { TypingIndicator } from "@/components/chat/TypingIndicator";

interface Message {
  id: string;
  content: string;
  isBot: boolean;
  timestamp: Date;
}

export const TenantChatbot = () => {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      content: `Hallo ${profile?.first_name || 'Mieter'}! Ich bin Ihr KI-Assistent und kann Ihnen bei Fragen rund um Ihr Gebäude und Ihre Mietangelegenheiten helfen. Wie kann ich Ihnen behilflich sein?`,
      isBot: true,
      timestamp: new Date(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async (inputMessage: string) => {
    if (!inputMessage.trim()) return;

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
      // Fetch chatbot settings for rent mode
      const { data: settings } = await supabase
        .from('chatbot_settings')
        .select('*')
        .eq('management_mode', 'rent')
        .single();

      if (!settings?.openai_api_key) {
        return "Entschuldigung, der Chatbot-Service ist momentan nicht verfügbar. Bitte wenden Sie sich direkt an die Hausverwaltung.";
      }

      // Fetch all relevant data for context
      let contextData = "";
      
      // Get building information
      const profileWithBuilding = profile as any;
      if (profileWithBuilding?.building_id) {
        const { data: building } = await supabase
          .from('buildings')
          .select('*')
          .eq('id', profileWithBuilding.building_id)
          .maybeSingle();
        
        if (building) {
          contextData += `\n\nGebäudeinformationen:\nName: ${building.name}\nAdresse: ${building.address}\nTyp: ${building.type}\nVerwaltungsmodus: ${building.management_mode}`;
        }
      }

      // Get user's reports
      const { data: userReports } = await supabase
        .from('miete_reports')
        .select('*')
        .eq('reported_by', profile?.user_id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (userReports && userReports.length > 0) {
        contextData += `\n\nIhre letzten Meldungen:\n`;
        userReports.forEach(report => {
          contextData += `- ${report.title} (Status: ${report.status}, Priorität: ${report.priority}, Erstellt: ${new Date(report.created_at).toLocaleDateString('de-DE')})\n`;
          if (report.admin_notes) {
            contextData += `  Verwalter-Notiz: ${report.admin_notes}\n`;
          }
        });
      }

      // Get forum posts for additional context
      const { data: forumPosts } = await supabase
        .from('forum_posts')
        .select('*')
        .eq('management_mode', 'rent')
        .order('created_at', { ascending: false })
        .limit(5);

      if (forumPosts && forumPosts.length > 0) {
        contextData += `\n\nAktuelle Forum-Beiträge:\n`;
        forumPosts.forEach(post => {
          contextData += `- ${post.title}: ${post.content.substring(0, 100)}...\n`;
        });
      }

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.openai_api_key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: settings.model,
          messages: [
            { 
              role: 'system', 
              content: `${settings.system_prompt}\n\nWissensdatenbank:\n${settings.knowledge_base}\n\nAktuelle Kontextdaten:${contextData}\n\nSie sprechen mit: ${profile?.first_name} ${profile?.last_name} (${profile?.email})`
            },
            { role: 'user', content: input }
          ],
          temperature: settings.temperature,
          max_tokens: settings.max_tokens,
        }),
      });

      if (!response.ok) {
        throw new Error('API request failed');
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error('Error generating response:', error);
      return "Entschuldigung, es gab einen Fehler bei der Verarbeitung Ihrer Anfrage. Bitte wenden Sie sich direkt an die Hausverwaltung unter info@rgi-immobilien.de oder Tel: 08362-123456.";
    }
  };

  return (
    <div className="h-full flex flex-col animate-fade-in">
      {/* Modern Chat Interface */}
      <Card className="flex-1 flex flex-col shadow-apple border-0 bg-card">
        <ChatHeader 
          title="Mieter-Assistent"
          subtitle="Ich helfe Ihnen bei Fragen zu Ihrem Gebäude und Mietangelegenheiten"
        />
        
        <div className="flex-1 flex flex-col min-h-0">
          <ScrollArea className="flex-1">
            <div className="divide-y divide-border/50">
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}
              
              {isLoading && <TypingIndicator />}
            </div>
          </ScrollArea>
          
          <ChatInput 
            onSendMessage={sendMessage}
            isLoading={isLoading}
            placeholder="Stellen Sie Fragen zu Ihrem Gebäude und Mietangelegenheiten..."
          />
        </div>
      </Card>
    </div>
  );
};