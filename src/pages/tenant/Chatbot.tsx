import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/useAuth";
import { Bot, User, Send } from "lucide-react";

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
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputMessage,
      isBot: false,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage("");
    setIsLoading(true);

    // Simulate bot response
    setTimeout(() => {
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: getBotResponse(inputMessage),
        isBot: true,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, botMessage]);
      setIsLoading(false);
    }, 1000);
  };

  const getBotResponse = (input: string): string => {
    const lowerInput = input.toLowerCase();
    
    if (lowerInput.includes("meldung") || lowerInput.includes("problem") || lowerInput.includes("defekt")) {
      return "Für Meldungen und Reparaturanfragen können Sie im Menü 'Meldungen' eine neue Meldung erstellen. Dort können Sie das Problem detailliert beschreiben und die Priorität festlegen.";
    }
    
    if (lowerInput.includes("miete") || lowerInput.includes("zahlung") || lowerInput.includes("überweisung")) {
      return "Fragen zur Miete und Zahlungen können Sie über das Meldungssystem stellen oder direkt mit der Hausverwaltung Kontakt aufnehmen.";
    }
    
    if (lowerInput.includes("hausordnung") || lowerInput.includes("regel")) {
      return "Informationen zur Hausordnung finden Sie im Forum oder können bei der Hausverwaltung angefragt werden.";
    }
    
    if (lowerInput.includes("nachbar") || lowerInput.includes("lärm") || lowerInput.includes("störung")) {
      return "Bei Problemen mit Nachbarn oder Lärmbelästigung empfehle ich zunächst das direkte Gespräch. Falls das nicht hilft, können Sie eine Meldung über das System erstellen.";
    }
    
    if (lowerInput.includes("heizung") || lowerInput.includes("warm") || lowerInput.includes("kalt")) {
      return "Heizungsprobleme sollten schnell gemeldet werden. Erstellen Sie bitte eine Meldung mit hoher Priorität im Meldungssystem.";
    }
    
    return "Vielen Dank für Ihre Frage! Für spezifische Anliegen empfehle ich Ihnen, eine Meldung über das Meldungssystem zu erstellen oder im Forum nach ähnlichen Themen zu suchen. Bei dringenden Problemen wenden Sie sich bitte direkt an die Hausverwaltung.";
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-4xl font-bold tracking-tight">KI-Chatbot</h1>
        <p className="text-lg text-muted-foreground">
          Stellen Sie Fragen rund um Ihr Gebäude und Mietangelegenheiten
        </p>
      </div>

      {/* Chat Interface */}
      <Card className="h-[600px] flex flex-col">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Mieter-Assistent
          </CardTitle>
          <CardDescription>
            Ich helfe Ihnen bei Fragen zu Ihrem Gebäude und Mietangelegenheiten
          </CardDescription>
        </CardHeader>
        
        <CardContent className="flex-1 flex flex-col">
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${message.isBot ? "justify-start" : "justify-end"}`}
                >
                  {message.isBot && (
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] p-3 rounded-lg ${
                      message.isBot
                        ? "bg-muted text-foreground"
                        : "bg-primary text-primary-foreground"
                    }`}
                  >
                    <p className="text-sm">{message.content}</p>
                    <p className="text-xs opacity-70 mt-1">
                      {message.timestamp.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  {!message.isBot && (
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4 text-primary-foreground" />
                    </div>
                  )}
                </div>
              ))}
              
              {isLoading && (
                <div className="flex gap-3 justify-start">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="bg-muted p-3 rounded-lg">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
          
          <div className="flex gap-2 mt-4">
            <Input
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Schreiben Sie eine Nachricht..."
              disabled={isLoading}
            />
            <Button onClick={sendMessage} disabled={isLoading || !inputMessage.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};