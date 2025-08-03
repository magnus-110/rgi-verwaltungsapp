import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Bot, Zap } from "lucide-react";

interface ChatHeaderProps {
  title: string;
  subtitle: string;
  isOnline?: boolean;
}

export const ChatHeader = ({ title, subtitle, isOnline = true }: ChatHeaderProps) => {
  return (
    <div className="flex items-center justify-between p-6 border-b border-border bg-gradient-warm">
      <div className="flex items-center gap-4">
        <Avatar className="w-12 h-12">
          <AvatarFallback className="bg-gradient-primary text-white">
            <Bot className="w-6 h-6" />
          </AvatarFallback>
        </Avatar>
        
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            {title}
            <Zap className="w-4 h-4 text-primary" />
          </h3>
          <p className="text-sm text-muted-foreground">
            {subtitle}
          </p>
        </div>
      </div>
      
      {isOnline && (
        <Badge variant="secondary" className="bg-success/10 text-success border-success/20">
          <div className="w-2 h-2 bg-success rounded-full mr-2 animate-pulse" />
          Online
        </Badge>
      )}
    </div>
  );
};