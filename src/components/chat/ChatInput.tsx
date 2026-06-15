import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUp, Loader2, HelpCircle } from "lucide-react";

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  disabled?: boolean;
  setIsHelpOpen?: (open: boolean) => void;
}

export const ChatInput = ({ 
  onSendMessage, 
  isLoading = false, 
  placeholder = "Stellen Sie irgendeine Frage",
  disabled = false,
  setIsHelpOpen
}: ChatInputProps) => {
  const [message, setMessage] = useState("");

  const handleSend = () => {
    if (message.trim() && !isLoading && !disabled) {
      onSendMessage(message.trim());
      setMessage("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div data-tour="chatbot-input" className="fixed bottom-0 left-0 right-0 bg-background border-t border-border z-40">
      <div className="max-w-3xl mx-auto p-4">
        <div className="relative flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsHelpOpen && setIsHelpOpen(true)}
            className="h-11 w-11 text-muted-foreground/60 hover:text-muted-foreground hover:bg-transparent shrink-0"
          >
            <HelpCircle className="w-6 h-6" />
          </Button>
          <div className="relative flex-1">
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={placeholder}
              disabled={isLoading || disabled}
              className="min-h-[44px] max-h-32 resize-none bg-muted border-0 focus:ring-0 focus:outline-none pr-12"
              rows={1}
            />
            <Button
              onClick={handleSend}
              disabled={!message.trim() || isLoading || disabled}
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8 text-primary hover:text-primary/80 hover:bg-transparent"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowUp className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground text-center mt-3 hidden md:block">
          RGI KI kann Fehler machen. Bitte prüfen Sie wichtige Informationen.
        </p>
      </div>
    </div>
  );
};