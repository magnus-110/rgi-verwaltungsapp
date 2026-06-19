import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Mic, MicOff, Loader2, Check, X, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useVoiceDictation } from "@/hooks/useVoiceDictation";

interface Props {
  /** Wird mit dem (KI-bereinigten) Text aufgerufen. */
  onResult: (text: string) => void;
  /** Optionaler Kontext-Hinweis für die KI (z. B. die Frage). */
  contextHint?: string;
  /** Standard: true – KI bereinigt Füllwörter/Interpunktion. */
  cleanup?: boolean;
  /** Tooltip-Text. */
  tooltip?: string;
  /** Größe / Style. */
  iconClassName?: string;
  buttonSize?: "icon" | "sm";
  /** Optional: bestehenden Text mit ergänzen statt überschreiben. */
  appendMode?: boolean;
  currentValue?: string;
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function VoiceInputButton({
  onResult,
  contextHint,
  cleanup = true,
  tooltip = "Spracheingabe (KI-Transkription)",
  iconClassName,
  buttonSize = "icon",
  appendMode = false,
  currentValue = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ text: string; transcript: string } | null>(null);
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
      const { data, error } = await supabase.functions.invoke("voice-transcribe", {
        body: { audioBase64, mimeType: blob.type, cleanup, contextHint },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult({
        text: (data as any).text || "",
        transcript: (data as any).transcript || "",
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
    const next = appendMode && currentValue ? `${currentValue} ${result.text}`.trim() : result.text;
    onResult(next);
    toast.success("Übernommen");
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
                buttonSize === "icon" ? "h-8 w-8 text-muted-foreground hover:text-foreground" : "",
                iconClassName,
              )}
              aria-label={tooltip}
            >
              <Mic className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog open={open} onOpenChange={(o) => { if (!o) handleCancel(); }}>
        <DialogContent className="z-[100] w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mic className="h-4 w-4" /> Spracheingabe
            </DialogTitle>
          </DialogHeader>

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
                {contextHint && (
                  <p className="text-xs text-muted-foreground text-center max-w-sm italic">„{contextHint}"</p>
                )}
                <p className="text-sm text-muted-foreground text-center max-w-sm">
                  {isRecording ? "Sprechen Sie frei – die KI bereinigt den Text."
                    : dict.state === "error" ? (dict.error || "Mikrofon nicht verfügbar")
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

          {submitting && (
            <div className="py-10 flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Transkribiere…</p>
            </div>
          )}

          {result && !submitting && (
            <div className="space-y-3">
              <div className="rounded-md border bg-background p-3 max-h-[40vh] overflow-y-auto whitespace-pre-wrap text-sm">
                {result.text || <span className="text-muted-foreground italic">(leer)</span>}
              </div>
              {result.transcript && result.transcript !== result.text && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer hover:text-foreground">Rohes Transkript</summary>
                  <p className="mt-2 italic whitespace-pre-wrap">{result.transcript}</p>
                </details>
              )}
              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={handleRetry}>
                  <RotateCcw className="h-4 w-4 mr-1" /> Neu aufnehmen
                </Button>
                <Button variant="outline" size="sm" onClick={handleCancel}>
                  <X className="h-4 w-4 mr-1" /> Verwerfen
                </Button>
                <Button size="sm" onClick={handleAccept}>
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
