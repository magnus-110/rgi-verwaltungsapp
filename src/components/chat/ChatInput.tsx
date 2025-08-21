import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  placeholder?: string;
  disabled?: boolean;
}

export const ChatInput = ({ onSendMessage, isLoading, placeholder = "Schreiben Sie eine Nachricht...", disabled = false }: ChatInputProps) => {
  const [message, setMessage] = useState("");

  const handleSend = () => {
    if (!message.trim() || isLoading || disabled) return;
    onSendMessage(message);
    setMessage("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm border-t border-border/50">
      <div className="max-w-4xl mx-auto p-4">
        <div className="flex gap-3 items-end">
          <div className="flex-1 relative">
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={placeholder}
              disabled={isLoading || disabled}
              className={cn(
                "min-h-[52px] max-h-[120px] resize-none rounded-2xl border-border/50",
                "focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200",
                "placeholder:text-muted-foreground/70 bg-card shadow-sm text-base px-4 py-3",
                "hover:border-border transition-colors",
                disabled && "opacity-50 cursor-not-allowed"
              )}
              rows={1}
            />
          </div>
          
          <Button
            onClick={handleSend}
            disabled={!message.trim() || isLoading || disabled}
            size="lg"
            className={cn(
              "rounded-2xl h-[52px] w-[52px] p-0 shadow-apple",
              "bg-gradient-primary hover:shadow-glow transition-all duration-200",
              "disabled:opacity-50 disabled:cursor-not-allowed hover-scale"
            )}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-white" />
            ) : (
              <Send className="w-5 h-5 text-white" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};