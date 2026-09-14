import ReactMarkdown from 'react-markdown';
import { FileText, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ChatSource {
  fileName: string;
  folderPath?: string[];
  pageNumber?: number | null;
}

export interface ReportDraft {
  title: string;
  description: string;
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
  // Mehrere Textabschnitte stammen oft aus derselben Datei - dem Leser genuegt
  // das Dokument einmal.
  const quellen = (message.sources || []).filter(
    (q, i, alle) => alle.findIndex((a) => a.fileName === q.fileName) === i,
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
                  <li key={i} className="flex gap-1.5 text-xs text-muted-foreground">
                    <FileText className="h-3.5 w-3.5 shrink-0 mt-px" />
                    <span>
                      {q.fileName}
                      {q.folderPath?.length ? ` · ${q.folderPath.join(' › ')}` : ''}
                      {q.pageNumber ? ` · S. ${q.pageNumber}` : ''}
                    </span>
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