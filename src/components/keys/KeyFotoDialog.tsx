import { useEffect, useState } from 'react';
import { ExternalLink, ImageOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

interface KeyFotoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pfad im Bucket "key-files". */
  photoPath: string | null;
  /** Nummer des Anhängers, für die Überschrift. */
  tagNumber?: string | null;
  /** Der Schlüssel, auf den geklickt wurde. */
  schluesselName?: string | null;
}

/**
 * Das Foto zum Schlüssel groß anzeigen.
 *
 * Das Bild hängt am Anhänger, nicht am einzelnen Schlüssel — es gibt in der
 * Datenbank nur ein Foto je Anhänger. Wer auf einen Schlüssel klickt, sieht
 * also das Foto des Bunds, an dem er hängt. Das steht auch so darunter, damit
 * niemand ein Bild des einzelnen Schlüssels erwartet.
 *
 * Die Adresse wird bei jedem Öffnen frisch signiert; die Bilder liegen nicht
 * offen im Netz.
 */
export function KeyFotoDialog({
  open,
  onOpenChange,
  photoPath,
  tagNumber,
  schluesselName,
}: KeyFotoDialogProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState(false);

  useEffect(() => {
    if (!open || !photoPath) return;

    let aktiv = true;
    setLaedt(true);
    setFehler(false);
    setUrl(null);

    supabase.storage
      .from('key-files')
      .createSignedUrl(photoPath, 600)
      .then(({ data, error }) => {
        if (!aktiv) return;
        setLaedt(false);
        if (error || !data?.signedUrl) setFehler(true);
        else setUrl(data.signedUrl);
      });

    return () => {
      aktiv = false;
    };
  }, [open, photoPath]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[720px]">
        <DialogHeader>
          <DialogTitle className="text-[15px]">
            {schluesselName || 'Schlüssel'}
            {tagNumber && (
              <span className="ml-2 font-mono text-[13px] font-normal text-muted-foreground">
                Anhänger {tagNumber}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {laedt && <Skeleton className="h-[380px] w-full" />}

        {fehler && (
          <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <ImageOff className="h-6 w-6" />
            <p className="text-[13px]">Das Foto lässt sich gerade nicht laden.</p>
          </div>
        )}

        {url && (
          <>
            <img
              src={url}
              alt={`Foto des Anhängers ${tagNumber ?? ''}`}
              className="max-h-[70vh] w-full rounded-lg border border-border object-contain"
            />
            <div className="flex items-center justify-between">
              <p className="text-[11.5px] text-muted-foreground">
                Ein Foto je Anhänger — es zeigt den ganzen Bund, nicht den einzelnen Schlüssel.
              </p>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground hover:underline"
              >
                In neuem Tab <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
