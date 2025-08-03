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
import { ChatHeader } from "@/components/chat/ChatHeader";
import { TypingIndicator } from "@/components/chat/TypingIndicator";

interface Message {
  id: string;
  content: string;
  isBot: boolean;
  timestamp: Date;
}

export const WegOwnerChatbot = () => {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      content: `Hallo ${profile?.first_name || 'WEG-Eigentümer'}! Ich bin Ihr KI-Assistent für Gebäudeinformationen. Geben Sie Ihre Gebäude-ID ein, um spezifische Informationen zu erhalten, oder stellen Sie mir eine allgemeine Frage.`,
      isBot: true,
      timestamp: new Date()
    }
  ]);
  const [buildingId, setBuildingId] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const getBotResponse = async (input: string): Promise<string> => {
    try {
      // Fetch chatbot settings for WEG mode
      const { data: settings } = await supabase
        .from('chatbot_settings')
        .select('*')
        .eq('management_mode', 'weg')
        .single();

      if (!settings?.openai_api_key) {
        return "Entschuldigung, der Chatbot-Service ist momentan nicht verfügbar. Bitte wenden Sie sich direkt an die Hausverwaltung.";
      }

      // Fetch all relevant data for context
      let contextData = "";
      
      // Get buildings information
      const { data: buildings } = await supabase
        .from('buildings')
        .select('*')
        .eq('management_mode', 'weg')
        .order('created_at', { ascending: false });

      if (buildings && buildings.length > 0) {
        contextData += `\n\nVerfügbare Gebäude:\n`;
        buildings.forEach(building => {
          contextData += `- ${building.name} (${building.address})\n`;
        });
      }

      // Get user's reports
      const { data: userReports } = await supabase
        .from('weg_reports')
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
        .eq('management_mode', 'weg')
        .order('created_at', { ascending: false })
        .limit(5);

      if (forumPosts && forumPosts.length > 0) {
        contextData += `\n\nAktuelle Forum-Beiträge:\n`;
        forumPosts.forEach(post => {
          contextData += `- ${post.title}: ${post.content.substring(0, 100)}...\n`;
        });
      }

      // Add building ID context if provided
      if (buildingId) {
        const { data: specificBuilding } = await supabase
          .from('buildings')
          .select('*')
          .ilike('name', `%${buildingId}%`)
          .or(`id.eq.${buildingId}`)
          .maybeSingle();

        if (specificBuilding) {
          contextData += `\n\nSpezifisches Gebäude (${buildingId}):\n`;
          contextData += `- Name: ${specificBuilding.name}\n- Adresse: ${specificBuilding.address}\n- Typ: ${specificBuilding.type}\n`;
        }
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
              content: `${settings.system_prompt}\n\nWissensdatenbank:\n${settings.knowledge_base}\n\nAktuelle Kontextdaten:${contextData}\n\nSie sprechen mit: ${profile?.first_name} ${profile?.last_name} (${profile?.email}) - WEG-Eigentümer. ${buildingId ? `Gebäude-ID: ${buildingId}` : 'Keine spezifische Gebäude-ID angegeben - bitten Sie um die Gebäude-ID für spezifische Informationen.'}`
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

  const handleSendMessage = async (message: string) => {
    if (!message.trim()) return;

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
    <div className="h-full flex flex-col lg:flex-row gap-6 animate-fade-in">
      {/* Main Chat Interface */}
      <div className="flex-1">
        <Card className="h-full flex flex-col shadow-apple border-0 bg-card">
          <ChatHeader 
            title="WEG-Eigentümer Assistent"
            subtitle="Ich helfe Ihnen bei Fragen zu Ihren Gebäuden und Verwaltungsangelegenheiten"
          />
          
          <div className="flex-1 flex flex-col min-h-0">
            <ScrollArea className="flex-1">
              <div className="divide-y divide-border/50">
                {messages.map((message) => (
                  <ChatMessage key={message.id} message={message} />
                ))}
                
                {isTyping && <TypingIndicator />}
              </div>
            </ScrollArea>
            
            <ChatInput 
              onSendMessage={handleSendMessage}
              isLoading={isTyping}
              placeholder="Stellen Sie Fragen zu Ihren Gebäuden und Verwaltungsangelegenheiten..."
            />
          </div>
        </Card>
      </div>

      {/* Sidebar */}
      <div className="w-full lg:w-80 space-y-4">
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