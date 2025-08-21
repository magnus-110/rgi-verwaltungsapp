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
    <div className="flex items-center justify-center p-4" style={{ height: 'calc(100vh - 200px)' }}>
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
        
        {/* Chat Input in Welcome Screen */}
        <div className="max-w-2xl mx-auto">
          <div className="flex gap-2">
            <Textarea
              placeholder="Stellen Sie irgendeine Frage"
              className="min-h-[44px] max-h-32 resize-none bg-muted border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
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
              className="h-11 w-11 shrink-0 bg-primary hover:bg-primary/90 text-white rounded-full"
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
    </div>
  );
};