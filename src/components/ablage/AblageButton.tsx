import { useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { Inbox, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { showInAppToast } from '@/lib/inAppToast';
import { useAuth } from '@/hooks/useAuth';
import { useAblage, useAblageLive } from '@/hooks/useAblage';
import { AblageView } from './AblageView';
import { cn } from '@/lib/utils';

// Ob die Leiste offen ist — außerhalb von React gehalten, weil es zwei
// Knöpfe gibt (Kopfzeile am Rechner, Kopfzeile am Handy), aber nur eine Leiste.
let offen = false;
const hoerer = new Set<() => void>();
export function setAblageOffen(wert: boolean) {
  offen = wert;
  hoerer.forEach(h => h());
}
function useAblageOffen() {
  return useSyncExternalStore(
    cb => {
      hoerer.add(cb);
      return () => hoerer.delete(cb);
    },
    () => offen,
  );
}

/**
 * Das Korb-Symbol oben in der Kopfzeile.
 * Die Zahl zeigt, wie viele neue Sachen für einen in der Ablage liegen.
 */
export function AblageButton({ className }: { className?: string }) {
  const { neuCount } = useAblage();
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn('relative h-9 w-9', className)}
      onClick={() => setAblageOffen(true)}
      aria-label={neuCount ? `Ablage – ${neuCount} neu` : 'Ablage'}
      title="Ablage"
    >
      <Inbox className="h-[18px] w-[18px]" />
      {neuCount > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[#C0392B] px-1 text-[10px] font-semibold text-white">
          {neuCount > 99 ? '99+' : neuCount}
        </span>
      )}
    </Button>
  );
}

/**
 * Die Leiste am rechten Rand — einmal im Verwaltungsbereich eingebunden.
 * Hört außerdem live mit: Legt ein Kollege etwas nur für einen selbst hinein,
 * kommt unten rechts ein kurzer Hinweis; ein Klick darauf öffnet die Ablage.
 */
export function AblagePanel() {
  const open = useAblageOffen();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { people } = useAblage();

  useAblageLive(row => {
    const von = people.find(p => p.userId === row.created_by)?.name ?? 'Ein Kollege';
    const nurFuerMich = !!user?.id && (row.recipient_ids || []).includes(user.id);
    // Einträge "für alle" melden sich nicht mehr mit einem Hinweis — nur noch
    // über die Zahl am Korb-Symbol. Hingewiesen wird nur, wenn etwas
    // ausdrücklich für einen selbst hingelegt wurde.
    if (!nurFuerMich) return;
    showInAppToast({
      icon: <Inbox className="h-5 w-5" />,
      title: `${von} hat dir etwas in die Ablage gelegt`,
      subtitle: row.kind === 'note' ? 'Notiz' : row.file_name ?? 'Datei',
      detail: (row.note ?? '').slice(0, 140) || undefined,
      onClick: () => setAblageOffen(true),
    });
  });

  return (
    // Bewusst nicht "modal": Solange die Leiste offen ist, kann man dahinter
    // weiterarbeiten — z. B. einen Mail-Anhang aus dem Postfach hineinziehen
    // oder eine Datei ins (verschiebbare) E-Mail-Fenster. Zu geht sie nur über
    // das X oder die Esc-Taste.
    <Sheet open={open} onOpenChange={setAblageOffen} modal={false}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 shadow-2xl sm:max-w-[460px]"
        onInteractOutside={e => e.preventDefault()}
      >
        <SheetHeader className="flex-row items-center justify-between space-y-0 px-4 pb-3 pr-12 pt-4">
          <div>
            <SheetTitle className="text-[16px]">Ablage</SheetTitle>
            <SheetDescription className="text-[12.5px]">
              Dateien und Notizen fürs Büro — statt sich E-Mails zu schreiben.
            </SheetDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => {
              setAblageOffen(false);
              navigate('/ablage');
            }}
            title="Große Ansicht öffnen"
            aria-label="Große Ansicht öffnen"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </SheetHeader>
        <div className="min-h-0 flex-1">{open && <AblageView variant="panel" />}</div>
      </SheetContent>
    </Sheet>
  );
}
