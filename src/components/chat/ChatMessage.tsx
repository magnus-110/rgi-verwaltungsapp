import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bot, User, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  message: {
    id: string;
    content: string;
    isBot: boolean;
    timestamp: Date;
  };
}

export const ChatMessage = ({ message }: ChatMessageProps) => {
  return (
    <div className="flex justify-center w-full p-4 animate-fade-in">
      <div className={cn(
        "flex gap-4 max-w-4xl w-full",
        message.isBot ? "justify-start" : "justify-end"
      )}>
        {message.isBot && (
          <Avatar className="w-8 h-8 flex-shrink-0 mt-1">
            <AvatarFallback className="bg-gradient-primary text-white">
              <Bot className="w-4 h-4" />
            </AvatarFallback>
          </Avatar>
        )}
        
        <div className={cn(
          "flex flex-col space-y-2 max-w-[85%]",
          message.isBot ? "items-start" : "items-end"
        )}>
          {/* Message Header */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {message.isBot ? "RGI Assistant" : "Sie"}
            </span>
            <div className="flex items-center gap-1 text-xs text-muted-foreground/70">
              <Clock className="w-3 h-3" />
              {message.timestamp.toLocaleTimeString('de-DE', { 
                hour: '2-digit', 
                minute: '2-digit' 
              })}
            </div>
          </div>
          
          {/* Message Bubble */}
          <div className={cn(
            "rounded-2xl px-4 py-3 shadow-sm",
            message.isBot 
              ? "bg-card border border-border/50 text-foreground" 
              : "bg-gradient-primary text-white"
          )}>
            <div className="prose prose-sm max-w-none">
              <p className={cn(
                "leading-relaxed whitespace-pre-wrap m-0 text-sm",
                message.isBot ? "text-foreground" : "text-white"
              )}>
                {message.content}
              </p>
            </div>
          </div>
        </div>
        
        {!message.isBot && (
          <Avatar className="w-8 h-8 flex-shrink-0 mt-1">
            <AvatarFallback className="bg-secondary text-secondary-foreground">
              <User className="w-4 h-4" />
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    </div>
  );
};