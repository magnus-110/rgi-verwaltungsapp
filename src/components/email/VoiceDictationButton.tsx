import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Mic, MicOff, Loader2, Check, X, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useVoiceDictation } from "@/hooks/useVoiceDictation";

interface DictationContext {
  recipientEmail?: string;
  recipientName?: string;
  subject?: string;
  existingBody?: string;
  senderName?: string;
  isReply?: boolean;
}

interface Result {
  transcript: string;
  body: string;
  suggested_subject?: string;
}

interface Props {
  context: DictationContext;
  /** Wird beim Übernehmen aufgerufen mit dem formatierten Body und optional einem Betreffvorschlag. */
  onAccept: (body: string, suggestedSubject?: string) => void;
  /** Optional: Größe / Style. */
  iconClassName?: string;
  buttonSize?: "icon" | "sm";
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function VoiceDictationButton({ context, onAccept, iconClassName, buttonSize = "icon" }: Props) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const dict = useVoiceDictation();

  const handleOpen = async () => {
    setResult(null);
    setOpen(true);
    await dict.start();
  };

  const handleStop = async () => {
    const blob = await dict.stop();
    if (!blob) {
      toast.error("Keine Aufnahme erkannt");
      setOpen(false);
      return;
    }
    setSubmitting(true);
    try {
      const audioBase64 = await dict.blobToBase64(blob);
      const { data, error } = await supabase.functions.invoke("voice-to-email", {
        body: { audioBase64, mimeType: blob.type, context },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult({
        transcript: (data as any).transcript || "",
        body: (data as any).body || "",
        suggested_subject: (data as any).suggested_subject,
      });
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Spracheingabe fehlgeschlagen");
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    dict.cancel();
    setResult(null);
    setOpen(false);
  };

  const handleAccept = () => {
    if (!result) return;
    onAccept(result.body, result.suggested_subject);
    if (result.suggested_subject && !context.subject) {
      toast.success("Betreffvorschlag übernommen");
    } else {
      toast.success("Diktat übernommen");
    }
    setResult(null);
    setOpen(false);
  };

  const handleRetry = async () => {
    setResult(null);
    await dict.start();
  };

  const isRecording = dict.state === "recording";

  if (!dict.isSupported) return null;

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size={buttonSize}
              onClick={handleOpen}
              className={cn(
                buttonSize === "icon" ? "h-9 w-9 text-muted-foreground hover:text-foreground" : "",
                iconClassName,
              )}
              aria-label="E-Mail diktieren"
            >
              <Mic className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>E-Mail diktieren (KI formatiert)</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog open={open} onOpenChange={(o) => { if (!o) handleCancel(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mic className="h-4 w-4" /> E-Mail diktieren
            </DialogTitle>
          </DialogHeader>

          {/* Recording-Phase */}
          {!result && !submitting && (
            <div className="space-y-4 py-4">
              <div className="flex flex-col items-center justify-center gap-4">
                <div className="relative h-28 w-28 flex items-center justify-center">
                  <div
                    className={cn(
                      "absolute inset-0 rounded-full transition-all",
                      isRecording ? "bg-destructive/20 animate-pulse" : "bg-muted",
                    )}
                    style={isRecording ? { transform: `scale(${1 + dict.audioLevel * 0.4})` } : undefined}
                  />
                  <div className={cn(
                    "relative h-20 w-20 rounded-full flex items-center justify-center",
                    isRecording ? "bg-destructive text-destructive-foreground" : "bg-muted-foreground/20",
                  )}>
                    {isRecording ? <Mic className="h-9 w-9" /> : <MicOff className="h-9 w-9" />}
                  </div>
                </div>
                <div className="text-2xl font-mono tabular-nums">{fmtTime(dict.elapsed)}</div>
                <p className="text-sm text-muted-foreground text-center max-w-sm">
                  {isRecording
                    ? "Sprechen Sie frei – Anrede, Inhalt und Grußformel werden von der KI ergänzt."
                    : dict.state === "error"
                      ? (dict.error || "Mikrofon nicht verfügbar")
                      : "Aufnahme wird vorbereitet…"}
                </p>
              </div>
              <div className="flex justify-center gap-2 pt-2">
                <Button variant="outline" onClick={handleCancel}>
                  <X className="h-4 w-4 mr-1" /> Abbrechen
                </Button>
                <Button onClick={handleStop} disabled={!isRecording || dict.elapsed < 1}>
                  <Check className="h-4 w-4 mr-1" /> Fertig
                </Button>
              </div>
            </div>
          )}

          {/* Processing */}
          {submitting && (
            <div className="py-10 flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Transkribiere und formatiere E-Mail…</p>
            </div>
          )}

          {/* Result */}
          {result && !submitting && (
            <div className="space-y-3">
              {result.suggested_subject && !context.subject && (
                <div className="rounded-md border bg-muted/40 p-2 text-xs">
                  <span className="font-medium">Betreffvorschlag: </span>
                  {result.suggested_subject}
                </div>
              )}
              <div className="rounded-md border bg-background p-3 max-h-[40vh] overflow-y-auto whitespace-pre-wrap text-sm">
                {result.body}
              </div>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer hover:text-foreground">Original-Transkript anzeigen</summary>
                <p className="mt-2 italic whitespace-pre-wrap">{result.transcript}</p>
              </details>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={handleRetry}>
                  <RotateCcw className="h-4 w-4 mr-1" /> Neu aufnehmen
                </Button>
                <Button variant="outline" onClick={handleCancel}>
                  <X className="h-4 w-4 mr-1" /> Verwerfen
                </Button>
                <Button onClick={handleAccept}>
                  <Check className="h-4 w-4 mr-1" /> Übernehmen
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
