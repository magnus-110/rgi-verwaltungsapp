import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUp } from "lucide-react";

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

export const WelcomeScreen = ({ userName, userType, onSuggestionClick }: WelcomeScreenProps) => {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-center flex-1 p-4" style={{ minHeight: 'calc(100vh - 300px)' }}>
        <div className="w-full max-w-2xl text-center space-y-8">
          {/* Header */}
          <div className="space-y-6">
            <div className="flex justify-center">
              <img 
                src="/lovable-uploads/2f4fde3b-f4b0-4829-9fcb-a148e37bae43.png" 
                alt="RGI Haus"
                className="w-16 h-16"
              />
            </div>
            
            <div className="space-y-2">
              <h1 className="text-4xl font-sans font-semibold text-foreground">
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
      
      {/* Chat Input for Desktop - moved to bottom */}
      <div className="hidden md:block max-w-2xl mx-auto p-4 w-full">
        <div className="relative">
          <Textarea
            placeholder="Stellen Sie irgendeine Frage"
            className="min-h-[44px] max-h-32 resize-none bg-muted border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/20 pr-12"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                const target = e.target as HTMLTextAreaElement;
                if (target.value.trim()) {
                  onSuggestionClick(target.value.trim());
                  target.value = "";
                }
              }
            }}
          />
          <Button
            size="icon"
            className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8 bg-primary hover:bg-primary/90 text-white rounded-full"
            onClick={(e) => {
              const textarea = (e.currentTarget.parentElement?.querySelector('textarea') as HTMLTextAreaElement);
              if (textarea?.value.trim()) {
                onSuggestionClick(textarea.value.trim());
                textarea.value = "";
              }
            }}
          >
            <ArrowUp className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground text-center mt-3">
          RGI KI kann Fehler machen. Bitte prüfen Sie wichtige Informationen.
        </p>
      </div>
    </div>
  );
};