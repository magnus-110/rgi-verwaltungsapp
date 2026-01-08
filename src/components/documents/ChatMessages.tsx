import React from "react";
import { FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{
    content: string;
    metadata: any;
    buildingId?: string;
  }>;
  created_at: string;
}

interface ChatMessagesProps {
  messages: ChatMessage[];
  isLoading: boolean;
}

export function ChatMessages({ messages, isLoading }: ChatMessagesProps) {
  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {messages.map((message) => (
        <div
          key={message.id}
          className={cn(
            "flex",
            message.role === 'user' ? "justify-end" : "justify-start"
          )}
        >
          <div
            className={cn(
              "max-w-[85%] rounded-2xl px-4 py-3",
              message.role === 'user'
                ? "bg-primary text-primary-foreground"
                : "bg-muted"
            )}
          >
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {message.content}
            </p>
            
            {/* Sources */}
            {message.sources && message.sources.length > 0 && (
              <div className="mt-3 pt-2 border-t border-border/30">
                <p className="text-xs font-medium mb-1.5 flex items-center gap-1 opacity-70">
                  <FileText className="h-3 w-3" />
                  Quellen
                </p>
                <div className="space-y-1">
                  {message.sources.slice(0, 3).map((source, index) => (
                    <div
                      key={index}
                      className={cn(
                        "text-xs rounded px-2 py-1",
                        message.role === 'user'
                          ? "bg-primary-foreground/10"
                          : "bg-background/50"
                      )}
                    >
                      {source.metadata?.section && (
                        <span className="font-medium">{source.metadata.section}</span>
                      )}
                      {source.metadata?.page && (
                        <span className="opacity-70 ml-1">
                          (Seite {source.metadata.page})
                        </span>
                      )}
                      {!source.metadata?.section && !source.metadata?.page && (
                        <span className="opacity-70">Dokument {index + 1}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Loading indicator */}
      {isLoading && (
        <div className="flex justify-start">
          <div className="bg-muted rounded-2xl px-4 py-3">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Suche in Dokumenten...</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
