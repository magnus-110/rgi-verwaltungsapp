import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUp, HelpCircle } from "lucide-react";

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
    <div className="flex items-center justify-center flex-1 p-4">
      <div className="w-full max-w-2xl text-center space-y-8">
        {/* Header */}
        <div className="space-y-6">
          <div className="flex justify-center">
            <img 
              src="/lovable-uploads/2f4fde3b-f4b0-4829-9fcb-a148e37bae43.png" 
              alt="RGI Haus"
              className="w-16 h-auto object-contain"
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
  );
};