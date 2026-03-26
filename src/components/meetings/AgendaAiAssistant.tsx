import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, X, Loader2, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AgendaAiAssistantProps {
  meetingId: string;
  itemTitle: string;
  itemDescription: string;
  onResult: (text: string) => void;
  onClose: () => void;
}

export const AgendaAiAssistant = ({
  meetingId,
  itemTitle,
  itemDescription,
  onResult,
  onClose,
}: AgendaAiAssistantProps) => {
  const { toast } = useToast();
  const [generatedText, setGeneratedText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  // Get building_id from meeting
  const { data: meeting } = useQuery({
    queryKey: ["etv-meeting-building", meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_meetings")
        .select("building_id")
        .eq("id", meetingId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("chat-with-ai", {
        body: {
          message: `Formuliere einen rechtssicheren Beschlusstext für eine WEG-Eigentümerversammlung zum folgenden Tagesordnungspunkt:

Titel: ${itemTitle}
${itemDescription ? `Erläuterung: ${itemDescription}` : ""}

Der Beschlusstext soll:
- Mit "Die Eigentümer beschließen..." beginnen
- Rechtlich korrekt nach WEG-Recht formuliert sein
- Klar und eindeutig sein
- Sich auf die Teilungserklärung beziehen, falls relevant

Antworte NUR mit dem Beschlusstext, ohne zusätzliche Erklärungen.`,
          buildingId: meeting?.building_id,
          managementMode: "weg",
        },
      });

      if (error) throw error;
      setGeneratedText(data?.response || data?.message || "");
    } catch (err: any) {
      toast({
        title: "KI-Fehler",
        description: err.message || "Beschlusstext konnte nicht generiert werden.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
      <CardContent className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
            <Sparkles className="h-4 w-4" />
            KI-Beschlusstext-Assistent
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="h-3 w-3" />
          </Button>
        </div>

        {!generatedText ? (
          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            size="sm"
            variant="outline"
            className="gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Generiere...
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                Beschlusstext generieren
              </>
            )}
          </Button>
        ) : (
          <div className="space-y-2">
            <Textarea
              value={generatedText}
              onChange={(e) => setGeneratedText(e.target.value)}
              rows={4}
              className="text-sm"
            />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={handleGenerate} disabled={isGenerating}>
                Neu generieren
              </Button>
              <Button size="sm" onClick={() => onResult(generatedText)} className="gap-2">
                <Check className="h-3.5 w-3.5" />
                Übernehmen
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
