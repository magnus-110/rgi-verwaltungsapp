import React from "react";
import { MessageSquare } from "lucide-react";

export function ChatWelcome() {
  return (
    <div className="flex flex-col items-center justify-center text-center px-4">
      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-6">
        <MessageSquare className="h-6 w-6 text-primary" />
      </div>
      <h1 className="text-2xl font-semibold text-foreground mb-2">
        Wie kann ich Ihnen helfen?
      </h1>
      <p className="text-muted-foreground text-sm max-w-md">
        Stellen Sie Fragen zu Ihren Dokumenten. Die KI durchsucht alle relevanten Unterlagen und gibt Ihnen präzise Antworten.
      </p>
    </div>
  );
}
