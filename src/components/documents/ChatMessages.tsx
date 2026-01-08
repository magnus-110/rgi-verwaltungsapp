import React from "react";
import ReactMarkdown from "react-markdown";
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
              "max-w-[85%]",
              message.role === 'user'
                ? "bg-primary text-primary-foreground rounded-3xl px-5 py-3"
                : ""
            )}
          >
            {message.role === 'user' ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {message.content}
              </p>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-headings:font-semibold prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground prose-strong:text-foreground prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5">
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => <h2 className="text-lg font-semibold mt-4 mb-2 first:mt-0">{children}</h2>,
                    h2: ({ children }) => <h3 className="text-base font-semibold mt-4 mb-2 first:mt-0">{children}</h3>,
                    h3: ({ children }) => <h4 className="text-sm font-semibold mt-3 mb-1.5">{children}</h4>,
                    h4: ({ children }) => <h5 className="text-sm font-medium mt-3 mb-1.5">{children}</h5>,
                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc pl-5 mb-2">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-5 mb-2">{children}</ol>,
                    li: ({ children }) => <li className="mb-0.5">{children}</li>,
                    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                    em: ({ children }) => <em className="italic">{children}</em>,
                    code: ({ children }) => (
                      <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
                        {children}
                      </code>
                    ),
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-2 border-primary/30 pl-4 italic text-muted-foreground my-2">
                        {children}
                      </blockquote>
                    ),
                    hr: () => <hr className="my-4 border-border" />,
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            )}
            
            {/* Sources */}
            {message.role === 'assistant' && message.sources && message.sources.length > 0 && (
              <div className="mt-4 pt-3 border-t border-border/50">
                <p className="text-xs font-medium mb-2 flex items-center gap-1.5 text-muted-foreground">
                  <FileText className="h-3 w-3" />
                  Quellen
                </p>
                <div className="flex flex-wrap gap-2">
                  {message.sources.slice(0, 3).map((source, index) => (
                    <div
                      key={index}
                      className="text-xs rounded-full px-3 py-1 bg-muted text-muted-foreground"
                    >
                      {source.metadata?.section && (
                        <span className="font-medium">{source.metadata.section}</span>
                      )}
                      {source.metadata?.page && (
                        <span className="opacity-70">
                          {source.metadata?.section ? ' · ' : ''}Seite {source.metadata.page}
                        </span>
                      )}
                      {!source.metadata?.section && !source.metadata?.page && (
                        <span>Dokument {index + 1}</span>
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
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
              <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
              <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
