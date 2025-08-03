import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bot } from "lucide-react";

export const TypingIndicator = () => {
  return (
    <div className="flex justify-center w-full p-4 animate-fade-in">
      <div className="flex gap-4 max-w-4xl w-full justify-start">
        <Avatar className="w-8 h-8 flex-shrink-0 mt-1">
          <AvatarFallback className="bg-gradient-primary text-white">
            <Bot className="w-4 h-4" />
          </AvatarFallback>
        </Avatar>
        
        <div className="flex flex-col space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              RGI Assistant
            </span>
            <span className="text-xs text-muted-foreground/70">tippt...</span>
          </div>
          
          <div className="rounded-2xl px-4 py-3 shadow-sm bg-card border border-border/50 w-fit">
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};