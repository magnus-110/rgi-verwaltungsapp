import { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Paperclip } from 'lucide-react';
import { CaseEmail, mailText } from '@/hooks/useCaseEmails';

interface EmailEintragProps {
  mail: CaseEmail;
  /** Die KI-Zusammenfassung aus dem Verlaufseintrag, falls vorhanden. */
  zusammenfassung?: string | null;
}

function empfaenger(mail: CaseEmail): string {
  const namen = mail.to_names?.filter(Boolean) ?? [];
  if (namen.length) return namen.join(', ');
  const adressen = mail.to_addresses?.filter(Boolean) ?? [];
  return adressen.join(', ');
}

/**
 * Eine E-Mail im Verlauf eines Vorgangs.
 *
 * Zugeklappt: wer geschrieben hat und die Kurzfassung. Der Wortlaut kommt
 * erst auf Klick — bei zwanzig Mails am Vorgang wäre der Verlauf sonst eine
 * endlose Textwand, durch die man scrollen muss.
 *
 * Der Verweis öffnet sie zusätzlich in einem neuen Browsertab, damit die
 * Akte offen bleibt.
 */
export function EmailEintrag({ mail, zusammenfassung }: EmailEintragProps) {
  const [offen, setOffen] = useState(false);
  const text = mailText(mail);

  return (
    <div className="mt-1.5 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11.5px] text-muted-foreground">
        <span>
          Von <span className="text-foreground">{mail.from_name || mail.from_address || 'unbekannt'}</span>
        </span>
        {empfaenger(mail) && <span>· an {empfaenger(mail)}</span>}
        {mail.has_attachments && (
          <span className="inline-flex items-center gap-1">
            <Paperclip className="h-3 w-3" /> Anhang
          </span>
        )}
      </div>

      {zusammenfassung && (
        <p className="mt-2 border-l-2 border-border pl-2.5 text-[12px] leading-relaxed text-muted-foreground">
          <span className="font-medium">Kurzfassung:</span> {zusammenfassung}
        </p>
      )}

      {offen &&
        (text ? (
          <p className="mt-2 whitespace-pre-wrap text-[12.5px] leading-relaxed text-foreground">
            {text}
          </p>
        ) : (
          <p className="mt-2 text-[12.5px] italic text-muted-foreground">
            Zu dieser Mail ist kein Text gespeichert.
          </p>
        ))}

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setOffen(o => !o)}
          className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
        >
          {offen ? (
            <>zuklappen <ChevronUp className="h-3.5 w-3.5" /></>
          ) : (
            <>E-Mail lesen <ChevronDown className="h-3.5 w-3.5" /></>
          )}
        </button>
        <a
          href={`/postfach?email=${mail.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground hover:underline"
        >
          Im Postfach öffnen <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}
