import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, ExternalLink, Image as ImageIcon, Lock, Paperclip, Pencil, Pin, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  istBild,
  nurText,
  useNotizBereiche,
  useNotizen,
} from '@/hooks/useNotizbuch';
import { NotizAnhaenge } from './NotizAnhaenge';
import { NOTIZ_TEXT_KLASSEN, notizHtmlZumAnzeigen } from './notizHtml';

interface Props {
  buildingId: string;
  /** Kurzfassung für die Übersicht: nur die neuesten Notizen, ohne Filter. */
  kompakt?: boolean;
}

function datum(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Notizen eines Gebäudes. Das sind dieselben Notizen wie im Notizbuch unter
 * „Gebäude" — angelegt und bearbeitet wird im Notizbuch, hier liest man sie.
 */
export function GebaeudeNotizen({ buildingId, kompakt }: Props) {
  const navigate = useNavigate();
  const { data: alle = [], isLoading } = useNotizen();
  const { data: bereiche = [] } = useNotizBereiche();
  const [thema, setThema] = useState<string | null>(null);
  const [offen, setOffen] = useState<string | null>(null);

  const notizen = useMemo(
    () =>
      alle
        .filter(n => n.building_id === buildingId)
        .sort((a, b) => (a.pinned !== b.pinned ? (a.pinned ? -1 : 1) : b.updated_at.localeCompare(a.updated_at))),
    [alle, buildingId],
  );

  const themen = useMemo(() => {
    const zahl: Record<string, number> = {};
    for (const n of notizen) if (n.area_id) zahl[n.area_id] = (zahl[n.area_id] ?? 0) + 1;
    return bereiche.filter(b => zahl[b.id]).map(b => ({ ...b, anzahl: zahl[b.id] }));
  }, [notizen, bereiche]);

  const bereichMap = useMemo(() => Object.fromEntries(bereiche.map(b => [b.id, b])), [bereiche]);
  const gezeigt = (thema ? notizen.filter(n => n.area_id === thema) : notizen).slice(0, kompakt ? 3 : undefined);

  const neu = () => navigate(`/notizbuch?neu=1&gebaeude=${buildingId}`);

  const chip = (aktiv: boolean) =>
    `inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] ${
      aktiv ? 'border-foreground bg-foreground font-semibold text-background' : 'border-border bg-background hover:bg-muted'
    }`;

  if (isLoading) return <Skeleton className="h-32 w-full rounded-lg" />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!kompakt && (
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={chip(thema === null)} onClick={() => setThema(null)}>
              Alle <span className="opacity-70">{notizen.length}</span>
            </button>
            {themen.map(t => (
              <button key={t.id} type="button" className={chip(thema === t.id)} onClick={() => setThema(t.id)}>
                {thema !== t.id && <span className="h-2 w-2 rounded-[2px]" style={{ background: t.color }} />}
                {t.name} <span className="opacity-70">{t.anzahl}</span>
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto flex gap-2">
          {!kompakt && (
            <Button asChild variant="ghost" size="sm">
              <Link to={`/notizbuch?gebaeude=${buildingId}`}>
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Im Notizbuch öffnen
              </Link>
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={neu}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Notiz
          </Button>
        </div>
      </div>

      {notizen.length === 0 && (
        <p className="py-2 text-[13px] text-muted-foreground">
          Noch keine Notizen zu diesem Gebäude.
        </p>
      )}

      {gezeigt.length > 0 && (
      <div className="divide-y divide-border rounded-lg border border-border bg-card">
        {gezeigt.map(n => {
          const istOffen = offen === n.id;
          const bilder = n.anhaenge.filter(istBild).length;
          const dateien = n.anhaenge.length - bilder;
          const b = n.area_id ? bereichMap[n.area_id] : undefined;
          return (
            <div key={n.id}>
              <button
                type="button"
                aria-expanded={istOffen}
                onClick={() => setOffen(istOffen ? null : n.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
              >
                {istOffen ? (
                  <ChevronDown className="h-4 w-4 flex-none text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" />
                )}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 text-[13.5px] font-medium text-foreground">
                    <span className="truncate">{n.title}</span>
                    {n.pinned && <Pin className="h-3 w-3 flex-none fill-primary text-primary" aria-label="Angeheftet" />}
                    {n.is_private && <Lock className="h-3 w-3 flex-none text-muted-foreground" aria-label="Nur für mich" />}
                  </span>
                  {!istOffen && (
                    <span className="truncate text-[12px] text-muted-foreground">
                      {nurText(n.content).slice(0, 120)}
                    </span>
                  )}
                </span>
                <span className="flex flex-none items-center gap-2 text-[11.5px] text-muted-foreground">
                  {b && (
                    <span className="hidden items-center gap-1 sm:inline-flex">
                      <span className="h-2 w-2 rounded-[2px]" style={{ background: b.color }} />
                      {b.name}
                    </span>
                  )}
                  {bilder > 0 && (<span className="inline-flex items-center gap-0.5"><ImageIcon className="h-3 w-3" />{bilder}</span>)}
                  {dateien > 0 && (<span className="inline-flex items-center gap-0.5"><Paperclip className="h-3 w-3" />{dateien}</span>)}
                  {datum(n.updated_at)}
                </span>
              </button>
              {istOffen && (
                <div className="space-y-4 px-4 pb-4 pl-11">
                  <div
                    className={NOTIZ_TEXT_KLASSEN}
                    dangerouslySetInnerHTML={{ __html: notizHtmlZumAnzeigen(n.content) }}
                  />
                  <NotizAnhaenge anhaenge={n.anhaenge} />
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/notizbuch?notiz=${n.id}`}>
                      <Pencil className="mr-1.5 h-3.5 w-3.5" /> Im Notizbuch bearbeiten
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}

      {kompakt && notizen.length > gezeigt.length && (
        <Link to={`/notizbuch?gebaeude=${buildingId}`} className="text-[12.5px] text-primary hover:underline">
          Alle {notizen.length} Notizen ansehen
        </Link>
      )}
    </div>
  );
}
