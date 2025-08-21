import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUp, Loader2 } from "lucide-react";

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

export const ChatInput = ({ 
  onSendMessage, 
  isLoading = false, 
  placeholder = "Stellen Sie irgendeine Frage",
  disabled = false 
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
    <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border z-40 md:relative md:border-t-0">
      <div className="max-w-3xl mx-auto p-4">
        <div className="relative">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={placeholder}
            disabled={isLoading || disabled}
            className="min-h-[44px] max-h-32 resize-none bg-muted border-border focus:border-border focus:ring-0 pr-12"
            rows={1}
          />
          <Button
            onClick={handleSend}
            disabled={!message.trim() || isLoading || disabled}
            size="icon"
            className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8 bg-primary hover:bg-primary/90 text-white rounded-full"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowUp className="w-4 h-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground text-center mt-3">
          RGI KI kann Fehler machen. Bitte prüfen Sie wichtige Informationen.
        </p>
      </div>
    </div>
  );
};