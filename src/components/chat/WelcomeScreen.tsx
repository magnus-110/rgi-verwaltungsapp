import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageCircle, Building2, FileText, Clock } from "lucide-react";

interface WelcomeScreenProps {
  userName?: string;
  userType: 'tenant' | 'weg_owner';
  onSuggestionClick: (message: string) => void;
}

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Guten Morgen";
  if (hour < 18) return "Guten Tag";
  return "Guten Abend";
};

const tenantSuggestions = [
  {
    icon: Building2,
    text: "Informationen zu meinem Gebäude",
    message: "Können Sie mir Informationen zu meinem Gebäude geben?"
  },
  {
    icon: FileText,
    text: "Status meiner Meldungen",
    message: "Wie ist der Status meiner eingereichten Meldungen?"
  },
  {
    icon: MessageCircle,
    text: "Neue Meldung erstellen",
    message: "Wie kann ich eine neue Meldung erstellen?"
  },
  {
    icon: Clock,
    text: "Öffnungszeiten Verwaltung",
    message: "Wann ist die Hausverwaltung erreichbar?"
  }
];

const wegOwnerSuggestions = [
  {
    icon: Building2,
    text: "Meine Gebäude anzeigen",
    message: "Zeigen Sie mir eine Übersicht meiner Gebäude."
  },
  {
    icon: FileText,
    text: "Verwaltungsberichte",
    message: "Wie kann ich Verwaltungsberichte einsehen?"
  },
  {
    icon: MessageCircle,
    text: "WEG-Angelegenheiten",
    message: "Ich habe eine Frage zu WEG-Angelegenheiten."
  },
  {
    icon: Clock,
    text: "Aktuelle Projekte",
    message: "Welche aktuellen Projekte gibt es in meinen Gebäuden?"
  }
];

export const WelcomeScreen = ({ userName, userType, onSuggestionClick }: WelcomeScreenProps) => {
  const suggestions = userType === 'tenant' ? tenantSuggestions : wegOwnerSuggestions;
  const userTypeText = userType === 'tenant' ? 'Mieter' : 'WEG-Eigentümer';

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full space-y-8 animate-fade-in">
        {/* Greeting */}
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto bg-gradient-primary rounded-full flex items-center justify-center mb-6">
            <MessageCircle className="w-8 h-8 text-white" />
          </div>
          
          <h1 className="text-3xl font-bold text-foreground">
            {getGreeting()}, {userName || userTypeText}!
          </h1>
          
          <p className="text-lg text-muted-foreground max-w-md mx-auto leading-relaxed">
            {userType === 'tenant' 
              ? "Ich bin Ihr KI-Assistent und helfe Ihnen bei Fragen rund um Ihr Gebäude und Ihre Mietangelegenheiten."
              : "Ich bin Ihr KI-Assistent für Gebäudeinformationen und WEG-Verwaltung."
            }
          </p>
        </div>

        {/* Suggestion Pills */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {suggestions.map((suggestion, index) => (
            <Button
              key={index}
              variant="outline"
              className="h-auto p-4 text-left justify-start hover-scale transition-all duration-200 bg-card hover:bg-accent border-border/50 hover:border-primary/30"
              onClick={() => onSuggestionClick(suggestion.message)}
            >
              <div className="flex items-center gap-3 w-full">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <suggestion.icon className="w-4 h-4 text-primary" />
                </div>
                <span className="text-sm font-medium text-foreground text-left">
                  {suggestion.text}
                </span>
              </div>
            </Button>
          ))}
        </div>

        {/* Help Text */}
        <div className="text-center">
          <p className="text-sm text-muted-foreground/80">
            Wählen Sie eine der Optionen oben oder stellen Sie eine eigene Frage
          </p>
        </div>
      </div>
    </div>
  );
};