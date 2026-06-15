import { Sparkles } from "lucide-react";

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

const SUGGESTIONS: Record<'tenant' | 'weg_owner', string[]> = {
  weg_owner: [
    "Wer ist der Hausmeister?",
    "Wie viel Hausgeld muss ich zahlen?",
  ],
  tenant: [
    "Wer ist der Hausmeister?",
    "Wann ist die nächste Müllabfuhr?",
  ],
};

export const WelcomeScreen = ({ userName, userType, onSuggestionClick }: WelcomeScreenProps) => {
  const suggestions = SUGGESTIONS[userType];
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ paddingBottom: '140px' }}>
      <div className="w-full max-w-2xl text-center space-y-8">
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
              {userName && <span className="text-foreground"> {userName}!</span>}
            </h1>
            <p className="text-xl text-primary font-semibold">
              Nova - RGI KI Assistentin
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center items-stretch max-w-xl mx-auto">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => onSuggestionClick(s)}
              className="group flex-1 flex items-center gap-2.5 px-4 py-3 rounded-2xl border border-border/70 bg-card hover:border-primary/50 hover:bg-primary/5 transition-all text-left shadow-sm hover:shadow"
            >
              <Sparkles className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm text-foreground">{s}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
