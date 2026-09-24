import { ChevronLeft } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MeldungSchalter,
  SCHALTER_REIHENFOLGE,
  SCHALTER_TEXT,
  SCHALTER_ZUSATZ,
  useMailboxAbos,
  useNotificationPrefs,
  useSetMailboxAbo,
  useSetNotificationPref,
} from '@/hooks/useNotifications';

interface NotificationSettingsProps {
  onBack: () => void;
}

/**
 * Aus welchen Postfächern kommen die E-Mail-Meldungen?
 *
 * Steht bewusst eingerückt unter dem Schalter „Neue E-Mails" — wer dort eine
 * Mail aus einem fremden Postfach sieht, kann es genau hier abstellen, statt
 * es in den Einstellungen zu suchen.
 */
function Postfaecher() {
  const { data: konten = [], isLoading } = useMailboxAbos();
  const setzen = useSetMailboxAbo();

  if (isLoading || konten.length === 0) return null;

  return (
    <div className="ml-[52px] space-y-2 border-l border-border pl-3">
      <span className="block text-[11.5px] text-muted-foreground">Aus diesen Postfächern:</span>
      {konten.map(k => (
        <label
          key={k.id}
          htmlFor={`postfach-${k.id}`}
          className="flex cursor-pointer items-center justify-between gap-3"
        >
          <span className="min-w-0">
            <span className={`block truncate text-[12.5px] leading-snug ${k.an ? 'text-foreground' : 'text-muted-foreground'}`}>
              {k.display_name || k.email_address}
            </span>
            {k.display_name && (
              <span className="block truncate text-[11px] leading-snug text-muted-foreground">
                {k.email_address}
              </span>
            )}
          </span>
          <Switch
            id={`postfach-${k.id}`}
            className="shrink-0 scale-90"
            checked={k.an}
            disabled={setzen.isPending}
            onCheckedChange={an => setzen.mutate({ accountId: k.id, an })}
          />
        </label>
      ))}
    </div>
  );
}

/**
 * „Was meldet sich bei mir?" — direkt in der Glocke, nicht drei Klicks
 * entfernt in den Einstellungen. Wer eine Meldung sieht, die er nicht will,
 * soll sie an Ort und Stelle abstellen können.
 *
 * Alles hier bleibt in der App. Nach außen geht nichts.
 */
export function NotificationSettings({ onBack }: NotificationSettingsProps) {
  const { data: prefs, isLoading } = useNotificationPrefs();
  const setzen = useSetNotificationPref();

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-border px-3 py-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Zurück zu den Benachrichtigungen"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <span className="block text-[14.5px] font-semibold leading-tight">
            Was meldet sich bei mir?
          </span>
          <span className="block text-[11.5px] text-muted-foreground">
            Nur in der App — nichts geht per Mail oder Push raus.
          </span>
        </div>
      </div>

      <div className="px-4 py-3">
        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-[22px] w-full" />
            <Skeleton className="h-[22px] w-full" />
            <Skeleton className="h-[22px] w-full" />
          </div>
        )}

        {!isLoading && prefs && (
          <div className="space-y-3.5">
            {SCHALTER_REIHENFOLGE.map((schalter: MeldungSchalter) => {
              const an = prefs[schalter];
              const zusatz = SCHALTER_ZUSATZ[schalter];
              return (
                <label
                  key={schalter}
                  className="flex cursor-pointer items-start gap-3"
                  htmlFor={`meldung-${schalter}`}
                >
                  <Switch
                    id={`meldung-${schalter}`}
                    className="mt-[1px] shrink-0"
                    checked={an}
                    disabled={setzen.isPending}
                    onCheckedChange={wert => setzen.mutate({ schalter, an: wert })}
                  />
                  <span className="min-w-0">
                    <span
                      className={`block text-[13px] leading-snug ${
                        an ? 'text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {SCHALTER_TEXT[schalter]}
                    </span>
                    {zusatz && (
                      <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
                        {zusatz}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}

            {/* Welche Postfächer gemeint sind, stand bisher nirgends hier. */}
            {prefs.neue_emails && <Postfaecher />}
          </div>
        )}

        <p className="mt-4 border-t border-border pt-3 text-[11.5px] leading-relaxed text-muted-foreground">
          Beim Hinlegen einer Aufgabe kannst du einzeln{' '}
          <span className="font-medium text-foreground">„still hinlegen"</span> wählen — dann
          bekommt der andere sie ohne Meldung auf die Wand.
        </p>
      </div>
    </div>
  );
}
