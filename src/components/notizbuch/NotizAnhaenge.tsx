import { useState } from 'react';
import { Download, FileText, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  anhangHerunterladen,
  istBild,
  type NotizAnhang,
  useAnhangAktionen,
  useAnhangLinks,
} from '@/hooks/useNotizbuch';

function groesse(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

interface Props {
  anhaenge: NotizAnhang[];
  /** Im Bearbeiten-Modus lassen sich Anhänge entfernen. */
  bearbeitbar?: boolean;
}

/** Bilder als Galerie, alles andere als Dateiliste. */
export function NotizAnhaenge({ anhaenge, bearbeitbar }: Props) {
  const { data: links = {} } = useAnhangLinks(anhaenge);
  const { loeschen } = useAnhangAktionen();
  const [gross, setGross] = useState<NotizAnhang | null>(null);

  const bilder = anhaenge.filter(istBild);
  const dateien = anhaenge.filter(a => !istBild(a));

  if (!anhaenge.length) return null;

  const entfernen = (a: NotizAnhang) => {
    if (confirm(`„${a.file_name}“ aus der Notiz entfernen?`)) loeschen.mutate(a);
  };

  return (
    <div className="space-y-4">
      {bilder.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {bilder.map(b => (
            <figure key={b.id} className="group relative m-0">
              <button
                type="button"
                onClick={() => setGross(b)}
                className="block w-full overflow-hidden rounded-lg border border-border bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`${b.file_name} groß anzeigen`}
              >
                {links[b.file_path] ? (
                  <img
                    src={links[b.file_path]}
                    alt={b.file_name}
                    className="h-36 w-full object-cover transition-transform group-hover:scale-[1.02]"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-36 w-full animate-pulse bg-muted" />
                )}
              </button>
              <figcaption className="mt-1 truncate text-[12px] text-muted-foreground">{b.file_name}</figcaption>
              {bearbeitbar && (
                <button
                  type="button"
                  onClick={() => entfernen(b)}
                  aria-label={`${b.file_name} entfernen`}
                  className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-md bg-background/90 text-foreground shadow hover:bg-background"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </figure>
          ))}
        </div>
      )}

      {dateien.length > 0 && (
        <div className="space-y-2">
          {dateien.map(d => (
            <div key={d.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-md bg-muted">
                <FileText className="h-4 w-4 text-muted-foreground" />
              </span>
              <button
                type="button"
                onClick={() => anhangHerunterladen(d)}
                className="min-w-0 flex-1 text-left hover:underline"
              >
                <span className="block truncate text-[13.5px] font-medium">{d.file_name}</span>
                <span className="text-[12px] text-muted-foreground">{groesse(d.file_size)}</span>
              </button>
              {links[d.file_path] && (d.mime_type === 'application/pdf' || /\.pdf$/i.test(d.file_name)) && (
                <a
                  href={links[d.file_path]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12.5px] text-primary hover:underline"
                >
                  Öffnen
                </a>
              )}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-9 w-9"
                aria-label={`${d.file_name} herunterladen`}
                onClick={() => anhangHerunterladen(d)}
              >
                <Download className="h-4 w-4" />
              </Button>
              {bearbeitbar && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9"
                  aria-label={`${d.file_name} entfernen`}
                  onClick={() => entfernen(d)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!gross} onOpenChange={o => !o && setGross(null)}>
        <DialogContent className="max-w-4xl p-2">
          <DialogTitle className="sr-only">{gross?.file_name}</DialogTitle>
          {gross && links[gross.file_path] && (
            <img
              src={links[gross.file_path]}
              alt={gross.file_name}
              className="max-h-[80vh] w-full rounded-md object-contain"
            />
          )}
          {gross && (
            <div className="flex items-center justify-between px-2 pb-1">
              <span className="truncate text-[13px] text-muted-foreground">{gross.file_name}</span>
              <Button type="button" size="sm" variant="outline" onClick={() => anhangHerunterladen(gross)}>
                <Download className="mr-2 h-4 w-4" /> Herunterladen
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
