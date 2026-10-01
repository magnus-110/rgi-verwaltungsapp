import { useEffect, useState } from 'react';
import { Inbox, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { useAblage, useAblageHinlegen } from '@/hooks/useAblage';
import type { MailAnhangDrag } from '@/integrations/supabase/ablage';
import { EmpfaengerWahl } from './EmpfaengerWahl';

/**
 * „In Ablage legen" an einem Mail-Anhang: Kopie in die Büro-Ablage, für alle
 * oder nur für bestimmte Kollegen, mit kurzem Kommentar. Der Anhang bleibt
 * in der E-Mail.
 */
export function InAblageLegenDialog({
  open,
  onOpenChange,
  anhaenge,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anhaenge: MailAnhangDrag[];
}) {
  const { user } = useAuth();
  const { people } = useAblage();
  const { mailAnhaenge } = useAblageHinlegen();
  const [empfaenger, setEmpfaenger] = useState<string[]>([]);
  const [kommentar, setKommentar] = useState('');

  useEffect(() => {
    if (open) {
      setEmpfaenger([]);
      setKommentar('');
    }
  }, [open]);

  const ablegen = () => {
    mailAnhaenge.mutate(
      { anhaenge, recipientIds: empfaenger, note: kommentar },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Inbox className="h-4 w-4" /> In die Ablage legen
          </DialogTitle>
          <DialogDescription className="truncate">
            {anhaenge.length === 1 ? anhaenge[0]?.name : `${anhaenge.length} Anhänge`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Für wen?</Label>
            <EmpfaengerWahl people={people} selfId={user?.id} value={empfaenger} onChange={setEmpfaenger} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ablage-kommentar">Kommentar (freiwillig)</Label>
            <Textarea
              id="ablage-kommentar"
              value={kommentar}
              onChange={e => setKommentar(e.target.value)}
              placeholder="z. B. Bitte bis Freitag prüfen"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={ablegen} disabled={mailAnhaenge.isPending || anhaenge.length === 0}>
            {mailAnhaenge.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Hinlegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
