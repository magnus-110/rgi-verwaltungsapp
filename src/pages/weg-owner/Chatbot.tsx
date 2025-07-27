import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Bot, Send, MessageSquare } from "lucide-react";

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
}

const generateResponse = (input: string, buildingId: string): string => {
  const lowerInput = input.toLowerCase();
  
  if (lowerInput.includes("meldung") || lowerInput.includes("problem") || lowerInput.includes("defekt")) {
    return "Für Meldungen und Reparaturanfragen können Sie im Menü 'Meldungen' eine neue Meldung erstellen. Dort können Sie das Problem detailliert beschreiben und die Priorität festlegen.";
  }
  
  if (lowerInput.includes("verwaltung") || lowerInput.includes("verwalter")) {
    return buildingId ? 
      `Verwaltungsinformationen für Gebäude ${buildingId}: Kontaktieren Sie die Hausverwaltung über das Meldungssystem oder direkt per E-Mail.` :
      "Für Verwaltungsangelegenheiten wenden Sie sich bitte an Ihre Hausverwaltung oder nutzen Sie das Meldungssystem.";
  }
  
  if (lowerInput.includes("kosten") || lowerInput.includes("hausgeld") || lowerInput.includes("nebenkosten")) {
    return "Fragen zu Hausgeld und Nebenkosten können Sie über das Meldungssystem stellen oder direkt mit der Hausverwaltung klären.";
  }
  
  if (lowerInput.includes("eigentümer") || lowerInput.includes("wohnung")) {
    return buildingId ? 
      `Für Gebäude ${buildingId}: Eigentümerinformationen werden aus Datenschutzgründen nur direkt an berechtigte Personen weitergegeben.` :
      "Eigentümerinformationen können bei der Hausverwaltung erfragt werden. Bitte geben Sie Ihre Gebäude-ID für spezifische Auskünfte an.";
  }
  
  if (lowerInput.includes("heizung") || lowerInput.includes("wartung") || lowerInput.includes("reparatur")) {
    return "Für Wartungs- und Reparaturangelegenheiten erstellen Sie bitte eine Meldung mit entsprechender Priorität. Bei Notfällen wenden Sie sich direkt an die Hausverwaltung.";
  }
  
  if (buildingId && (lowerInput.includes("gebäude") || lowerInput.includes("information"))) {
    return `Für Gebäude ${buildingId}: Spezifische Gebäudeinformationen können aus der Datenbank abgerufen werden. Welche Details benötigen Sie?`;
  }
  
  return buildingId ? 
    `Vielen Dank für Ihre Anfrage zu Gebäude ${buildingId}. Ich helfe Ihnen gerne bei Fragen zu Verwaltung, Meldungen und allgemeinen Informationen. Für spezifische Angelegenheiten nutzen Sie bitte das Meldungssystem.` :
    "Vielen Dank für Ihre Frage! Ich kann Ihnen bei Verwaltungsangelegenheiten, Meldungen und allgemeinen Informationen helfen. Für gebäudespezifische Auskünfte geben Sie bitte Ihre Gebäude-ID ein.";
};

export const WegOwnerChatbot = () => {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      content: "Hallo! Ich bin Ihr KI-Assistent für Gebäudeinformationen. Geben Sie Ihre Gebäude-ID ein, um spezifische Informationen zu erhalten, oder stellen Sie mir eine allgemeine Frage.",
      isUser: false,
      timestamp: new Date()
    }
  ]);
  const [currentMessage, setCurrentMessage] = useState("");
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

  const handleSendMessage = async () => {
    if (!currentMessage.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: currentMessage,
      isUser: true,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const inputText = currentMessage;
    setCurrentMessage("");
    setIsTyping(true);

    try {
      const response = await getBotResponse(inputText);
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        content: response,
        isUser: false,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiResponse]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "Entschuldigung, es gab einen Fehler. Bitte versuchen Sie es erneut.",
        isUser: false,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">KI-Chatbot</h1>
        <div className="flex items-center gap-2 text-green-600">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-sm">Online</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <Card className="h-[600px] flex flex-col">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                <Bot className="w-5 h-5" />
                RGI KI-Assistent
              </CardTitle>
            </CardHeader>
            
            <CardContent className="flex-1 flex flex-col p-0">
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] p-3 rounded-lg ${
                        message.isUser
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      }`}
                    >
                      <p className="text-sm">{message.content}</p>
                      <p className="text-xs opacity-70 mt-1">
                        {message.timestamp.toLocaleTimeString('de-DE', { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </p>
                    </div>
                  </div>
                ))}
                
                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-muted p-3 rounded-lg">
                      <div className="flex space-x-2">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="border-t p-4">
                <div className="flex gap-2">
                  <Textarea
                    value={currentMessage}
                    onChange={(e) => setCurrentMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Stellen Sie Ihre Frage..."
                    className="flex-1 min-h-[40px] max-h-[120px] resize-none"
                    rows={1}
                  />
                  <Button 
                    onClick={handleSendMessage}
                    disabled={!currentMessage.trim() || isTyping}
                    className="px-3"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Gebäude-ID</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Label htmlFor="building-id">
                  Ihre Gebäude-ID eingeben
                </Label>
                <Input
                  id="building-id"
                  value={buildingId}
                  onChange={(e) => setBuildingId(e.target.value)}
                  placeholder="z.B. GEB-2024-001"
                />
                <p className="text-xs text-muted-foreground">
                  Die Gebäude-ID erhalten Sie von Ihrem Administrator für spezifische Gebäudeinformationen.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Hilfe & Tipps</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <MessageSquare className="w-4 h-4 mt-0.5 text-muted-foreground" />
                  <p>Fragen Sie nach Gebäudeinformationen mit Ihrer ID</p>
                </div>
                <div className="flex items-start gap-2">
                  <MessageSquare className="w-4 h-4 mt-0.5 text-muted-foreground" />
                  <p>Stellen Sie Fragen zu Verwaltungsangelegenheiten</p>
                </div>
                <div className="flex items-start gap-2">
                  <MessageSquare className="w-4 h-4 mt-0.5 text-muted-foreground" />
                  <p>Erfragen Sie allgemeine Informationen</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};