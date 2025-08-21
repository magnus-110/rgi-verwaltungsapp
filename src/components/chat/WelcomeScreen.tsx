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
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl text-center space-y-8">
        {/* Header */}
        <div className="space-y-4">
          <div className="w-20 h-20 mx-auto bg-primary rounded-2xl flex items-center justify-center">
            <img 
              src="/lovable-uploads/2f4fde3b-f4b0-4829-9fcb-a148e37bae43.png" 
              alt="RGI Haus"
              className="w-10 h-10"
            />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-4xl font-display font-semibold text-foreground">
              {getGreeting()}
              {userName && (
                <span className="text-foreground"> {userName}!</span>
              )}
            </h1>
            <p className="text-xl text-primary font-semibold">
              RGI KI-Assistent
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};