import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { FileText, Check, AlertCircle, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ChatSource {
  fileId?: string | null;
  fileName: string;
  folderPath?: string[];
  pageNumber?: number | null;
}

export interface ReportDraft {
  title: string;
  description: string;
  buildingId?: string | null;
  buildingName?: string | null;
}

interface ChatMessageProps {
  message: {
    id: string;
    content: string;
    isBot: boolean;
    timestamp: Date;
    sources?: ChatSource[];
    reportDraft?: ReportDraft | null;
    reportStatus?: 'gesendet' | 'fehler';
  };
  onSubmitReport?: (messageId: string, draft: ReportDraft) => void;
  isSubmittingReport?: boolean;
}

export const ChatMessage = ({ message, onSubmitReport, isSubmittingReport }: ChatMessageProps) => {
  const { toast } = useToast();
  const [oeffnet, setOeffnet] = useState<string | null>(null);

  // Dokument aus einer Quelle oeffnen. get-building-file-url prueft die Freigabe erneut,
  // der Link ist eine Stunde gueltig. Das Fenster wird sofort geoeffnet (vor dem Laden),
  // damit Browser - besonders Safari auf dem iPhone - es nicht als Pop-up blockieren.
  const dokumentOeffnen = async (q: ChatSource) => {
    if (!q.fileId) return;
    const fenster = window.open('', '_blank');
    setOeffnet(q.fileId);
    try {
      const { data, error } = await supabase.functions.invoke('get-building-file-url', {
        body: { fileId: q.fileId },
      });
      if (error || !data?.signedUrl) throw error || new Error('Kein Link');
      const ziel = q.pageNumber ? `${data.signedUrl}#page=${q.pageNumber}` : data.signedUrl;
      if (fenster) fenster.location.href = ziel;
      else window.location.href = ziel;
    } catch {
      fenster?.close();
      toast({
        title: 'Dokument konnte nicht geöffnet werden',
        description: 'Sie finden es auch unter „Dokumente“.',
        variant: 'destructive',
      });
    } finally {
      setOeffnet(null);
    }
  };

  // Mehrere Textabschnitte stammen oft aus derselben Datei - dem Leser genuegt
  // das Dokument einmal.
  const quellen = (message.sources || []).filter(
    (q, i, alle) =>
      alle.findIndex((a) => (a.fileId && q.fileId ? a.fileId === q.fileId : a.fileName === q.fileName)) === i,
  );

  return (
    <div className="p-4 max-w-3xl mx-auto">
      {message.isBot ? (
        <div className="text-sm text-foreground leading-relaxed prose prose-sm max-w-none
          prose-headings:text-foreground prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2
          prose-p:my-1.5 prose-li:my-0.5 prose-strong:text-foreground prose-strong:font-semibold
          prose-ul:my-2 prose-ol:my-2" style={{ lineHeight: '1.8', letterSpacing: '0.01em' }}>
          <ReactMarkdown>{message.content}</ReactMarkdown>

          {message.reportDraft && (
            <div className="mt-4 not-prose rounded-lg border border-border bg-muted/40 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Meldung an die Hausverwaltung
              </p>
              <p className="text-sm font-medium text-foreground">{message.reportDraft.title}</p>
              {message.reportDraft.buildingName && (
                <p className="text-xs text-muted-foreground">Objekt: {message.reportDraft.buildingName}</p>
              )}
              <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
                {message.reportDraft.description}
              </p>

              {message.reportStatus === 'gesendet' ? (
                <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-500">
                  <Check className="h-3.5 w-3.5" />
                  Meldung wurde übermittelt. Sie finden sie unter „Meine Meldungen".
                </p>
              ) : message.reportStatus === 'fehler' ? (
                <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-destructive">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Die Meldung konnte nicht gespeichert werden. Bitte über „Meine Meldungen" anlegen.
                </p>
              ) : (
                <Button
                  size="sm"
                  className="mt-3"
                  disabled={isSubmittingReport}
                  onClick={() => onSubmitReport?.(message.id, message.reportDraft!)}
                >
                  {isSubmittingReport ? 'Wird gesendet…' : 'Meldung absenden'}
                </Button>
              )}
            </div>
          )}

          {quellen.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border/60 not-prose">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                Grundlage dieser Antwort
              </p>
              <ul className="space-y-1">
                {quellen.map((q, i) => (
                  <li key={q.fileId || i} className="flex gap-1.5 text-xs text-muted-foreground">
                    {oeffnet && oeffnet === q.fileId ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 mt-px animate-spin" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 shrink-0 mt-px" />
                    )}
                    {q.fileId ? (
                      <button
                        type="button"
                        onClick={() => dokumentOeffnen(q)}
                        className="text-left hover:text-foreground hover:underline underline-offset-2 transition-colors"
                        title="Dokument öffnen"
                      >
                        <span className="font-medium text-foreground/80">{q.fileName}</span>
                        {q.folderPath?.length ? ` · ${q.folderPath.join(' › ')}` : ''}
                        {q.pageNumber ? ` · S. ${q.pageNumber}` : ''}
                        <ExternalLink className="inline h-3 w-3 ml-1 -mt-0.5" />
                      </button>
                    ) : (
                      <span>
                        {q.fileName}
                        {q.folderPath?.length ? ` · ${q.folderPath.join(' › ')}` : ''}
                        {q.pageNumber ? ` · S. ${q.pageNumber}` : ''}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="flex justify-end mb-4">
          <div className="bg-muted px-4 py-2 rounded-2xl max-w-xs text-sm text-foreground">
            {message.content}
          </div>
        </div>
      )}
    </div>
  );
};
