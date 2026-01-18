import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, RefreshCw, X, Check, MapPin, Loader2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

interface EnhancedPromptData {
  original: string;
  enhanced: string;
  categories: string[];
  features: string[];
  sourceHint: string;
  keywords: string[];
}

interface PromptEnhancerSuggestionProps {
  data: EnhancedPromptData;
  isLoading: boolean;
  onAccept: (editedText: string) => void;
  onRegenerate: () => void;
  onClose: () => void;
}

const categoryLabels: Record<string, string> = {
  rechtlich: "Rechtlich",
  protokoll: "Protokolle",
  finanzen: "Finanzen",
  technik: "Technik",
  versicherung: "Versicherung",
  eigentuemer: "Eigentümer",
  verwalter: "Verwalter",
};

const featureLabels: Record<string, string> = {
  gas_heating: "Gasheizung",
  oil_heating: "Ölheizung",
  heat_pump: "Wärmepumpe",
  district_heating: "Fernwärme",
  solar: "Solar",
  elevator: "Aufzug",
  parking: "Parkplätze",
};

export function PromptEnhancerSuggestion({
  data,
  isLoading,
  onAccept,
  onRegenerate,
  onClose,
}: PromptEnhancerSuggestionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(data.enhanced);

  // Update editedText when data changes (e.g., on regenerate)
  useEffect(() => {
    setEditedText(data.enhanced);
    setIsEditing(false);
  }, [data.enhanced]);

  const handleAccept = () => {
    onAccept(editedText);
  };

  return (
    <div className="mb-3 mx-auto w-full max-w-3xl px-4">
      <div className="rounded-xl border border-border bg-card shadow-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-muted/50 border-b border-border">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>Optimierter Prompt</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onRegenerate}
              disabled={isLoading}
              title="Neu generieren"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onClose}
              title="Schließen"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span className="text-sm">Analysiere Anfrage...</span>
            </div>
          ) : (
            <>
              {/* Enhanced Query - Editable */}
              <div className="relative group">
                {isEditing ? (
                  <Textarea
                    value={editedText}
                    onChange={(e) => setEditedText(e.target.value)}
                    className="text-sm leading-relaxed min-h-[80px] resize-none"
                    autoFocus
                  />
                ) : (
                  <div 
                    className="relative cursor-pointer rounded-md p-2 -m-2 hover:bg-muted/50 transition-colors"
                    onClick={() => setIsEditing(true)}
                  >
                    <p className="text-sm leading-relaxed pr-6">{editedText}</p>
                    <Pencil className="absolute top-2 right-2 h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                )}
              </div>

              {/* Categories & Features */}
              {(data.categories.length > 0 || data.features.length > 0) && (
                <div className="flex flex-wrap gap-2">
                  {data.categories.map((cat) => (
                    <Badge
                      key={cat}
                      variant="secondary"
                      className="text-xs"
                    >
                      {categoryLabels[cat] || cat}
                    </Badge>
                  ))}
                  {data.features.map((feat) => (
                    <Badge
                      key={feat}
                      variant="outline"
                      className="text-xs"
                    >
                      {featureLabels[feat] || feat}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Source Hint */}
              {data.sourceHint && (
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  <span>{data.sourceHint}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!isLoading && (
          <div className="px-4 pb-4 flex gap-2">
            {isEditing && (
              <Button
                onClick={() => setIsEditing(false)}
                size="sm"
                variant="outline"
                className="flex-1"
              >
                Fertig
              </Button>
            )}
            <Button
              onClick={handleAccept}
              size="sm"
              className={isEditing ? "flex-1" : "w-full"}
            >
              <Check className="h-4 w-4 mr-2" />
              Übernehmen
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
