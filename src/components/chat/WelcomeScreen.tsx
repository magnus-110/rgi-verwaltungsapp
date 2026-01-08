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
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ paddingBottom: '140px' }}>
      <div className="w-full max-w-2xl text-center space-y-8">
        {/* Header */}
        <div className="space-y-6">
          <div className="flex justify-center">
            <img 
              src="/lovable-uploads/b9771424-b209-4762-aff0-6832ee6c96c7.png" 
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
              Nova
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};