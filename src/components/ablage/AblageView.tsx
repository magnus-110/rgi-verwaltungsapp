import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Copy,
  Download,
  File as FileIcon,
  FileSpreadsheet,
  FileText,
  FolderArchive,
  Image as ImageIcon,
  Inbox,
  Loader2,
  MoreHorizontal,
  Paperclip,
  Send,
  StickyNote,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useComposeEmail } from '@/contexts/ComposeEmailContext';
import {
  ablageAlsFile,
  ablageHerunterladen,
  ablageSignedUrl,
  formatGroesse,
  relativeZeit,
  useAblage,
  useAblageHinlegen,
  useAblageLoeschen,
  useMarkAblageRead,
  type AblageItem,
} from '@/hooks/useAblage';
import {
  ABLAGE_BUCKET,
  DRAG_TYPE_ABLAGE,
  DRAG_TYPE_DMS,
  DRAG_TYPE_MAIL_ANHANG,
  setLaufenderAblageZug,
  type AblageDragFile,
  type MailAnhangDrag,
} from '@/integrations/supabase/ablage';
import { EmpfaengerWahl } from './EmpfaengerWahl';
import { AttachmentPreviewDialog } from '@/components/email/AttachmentPreviewDialog';
import { SaveAttachmentToBuildingDialog } from '@/components/email/SaveAttachmentToBuildingDialog';

/**
 * Die Büro-Ablage — dieselbe Ansicht als Seite (unter Aufgaben) und als
 * Leiste am rechten Rand (Korb-Symbol oben).
 *
 * Hinein geht alles per Ziehen: Dateien vom Desktop oder Anhänge aus einer
 * Mail. Bildschirmfotos kommen mit Strg+V hinein. Ist eine E-Mail offen,
 * hängt die Büroklammer an einem Eintrag die Datei direkt an diese E-Mail.
 */

type Filter = 'alle' | 'fuer_mich' | 'von_mir';

const FILTER_LABEL: Record<Filter, string> = {
  alle: 'Alles',
  fuer_mich: 'Nur für mich',
  von_mir: 'Von mir',
};

function dateiIcon(mime: string | null, name: string | null) {
  const n = (name || '').toLowerCase();
  if (mime?.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/.test(n)) return ImageIcon;
  if (mime?.includes('pdf') || n.endsWith('.pdf')) return FileText;
  if (mime?.includes('sheet') || mime?.includes('excel') || /\.(xlsx?|csv)$/.test(n)) return FileSpreadsheet;
  return FileIcon;
}

const istBild = (i: AblageItem) =>
  i.kind === 'file' && (i.mime_type?.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(i.file_name || ''));

function hatEigeneDaten(e: React.DragEvent) {
  const t = Array.from(e.dataTransfer.types);
  return t.includes('Files') || t.includes(DRAG_TYPE_MAIL_ANHANG) || t.includes(DRAG_TYPE_DMS);
}

export function AblageView({ variant }: { variant: 'page' | 'panel' }) {
  const { user } = useAuth();
  const { items, people, isLoading } = useAblage();
  const { dateien, notiz, mailAnhaenge, dmsDateien } = useAblageHinlegen();
  const loeschen = useAblageLoeschen();
  const markRead = useMarkAblageRead();
  const { composes, openCompose, updateCompose, setMode } = useComposeEmail();
  // Die E-Mail, die gerade offen ist (oder zuletzt geöffnet wurde).
  const offeneMail = [...composes].reverse().find(c => c.mode !== 'minimized') ?? composes[composes.length - 1];

  const [empfaenger, setEmpfaenger] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [filter, setFilter] = useState<Filter>('alle');
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const dragCounter = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const [vorschau, setVorschau] = useState<{ url: string; name: string; mime: string | null } | null>(null);
  const [dmsItems, setDmsItems] = useState<AblageItem[]>([]);
  const [mailLaedt, setMailLaedt] = useState(false);

  // „Neu" bleibt sichtbar, solange die Ansicht offen ist — auch wenn der
  // Eintrag im Hintergrund schon als gesehen markiert wurde.
  const [hervorheben, setHervorheben] = useState<Set<string>>(new Set());
  useEffect(() => {
    const neu = items.filter(i => i.neu).map(i => i.id);
    if (!neu.length) return;
    setHervorheben(prev => {
      const next = new Set(prev);
      neu.forEach(id => next.add(id));
      return next;
    });
    const t = window.setTimeout(() => markRead.mutate(neu), 1500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  useEffect(() => {
    if (variant === 'panel') rootRef.current?.focus();
  }, [variant]);

  const gefiltert = useMemo(() => {
    if (filter === 'fuer_mich') return items.filter(i => i.fuerMich);
    if (filter === 'von_mir') return items.filter(i => i.vonMir);
    return items;
  }, [items, filter]);

  const anzahl = useMemo(
    () => ({
      alle: items.length,
      fuer_mich: items.filter(i => i.fuerMich).length,
      von_mir: items.filter(i => i.vonMir).length,
    }),
    [items],
  );

  // Vorschaubilder für Bilder — in einem Rutsch geholt.
  const bildPfade = useMemo(
    () => items.filter(istBild).map(i => i.file_path!).sort(),
    [items],
  );
  const { data: vorschauUrls } = useQuery({
    queryKey: ['office-drop-thumbs', bildPfade],
    enabled: bildPfade.length > 0,
    staleTime: 8 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.storage.from(ABLAGE_BUCKET).createSignedUrls(bildPfade, 600);
      const map = new Map<string, string>();
      (data || []).forEach(d => d.path && d.signedUrl && map.set(d.path, d.signedUrl));
      return map;
    },
  });

  const ausgewaehlt = items.filter(i => auswahl.has(i.id));
  const beschaeftigt = dateien.isPending || mailAnhaenge.isPending || dmsDateien.isPending;

  // ------------------------------------------------------------ Hinlegen
  const legeDateien = (files: File[], source: 'upload' | 'paste' = 'upload') => {
    if (!files.length) return;
    dateien.mutate({ files, recipientIds: empfaenger, note: text, source });
    setText('');
  };

  const legeNotiz = () => {
    if (!text.trim()) return;
    notiz.mutate({ recipientIds: empfaenger, note: text }, { onSuccess: () => setText('') });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDragOver(false);
    const mail = e.dataTransfer.getData(DRAG_TYPE_MAIL_ANHANG);
    if (mail) {
      try {
        const anhaenge = JSON.parse(mail) as MailAnhangDrag[];
        mailAnhaenge.mutate({ anhaenge, recipientIds: empfaenger, note: text });
        setText('');
      } catch {
        toast.error('Anhang konnte nicht übernommen werden');
      }
      return;
    }
    // Aus dem DMS (Objekt-Dokumente oder RGI intern) hereingezogen
    const dms = e.dataTransfer.getData(DRAG_TYPE_DMS);
    if (dms) {
      try {
        const fileIds = (JSON.parse(dms) as string[]).filter(Boolean);
        if (fileIds.length) {
          dmsDateien.mutate({ fileIds, recipientIds: empfaenger, note: text });
          setText('');
        }
      } catch {
        toast.error('Dokument konnte nicht übernommen werden');
      }
      return;
    }
    legeDateien(Array.from(e.dataTransfer.files));
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files || []);
    if (!files.length) return; // normaler Text → ganz normal einfügen
    e.preventDefault();
    const benannt = files.map((f, idx) =>
      f.name && f.name !== 'image.png'
        ? f
        : new File([f], `Bildschirmfoto ${new Date().toLocaleString('de-DE').replace(/[/:]/g, '-')}${files.length > 1 ? ` (${idx + 1})` : ''}.png`, { type: f.type || 'image/png' }),
    );
    legeDateien(benannt, 'paste');
  };

  // ------------------------------------------------------------ Aktionen
  const oeffnen = async (item: AblageItem) => {
    if (!item.file_path) return;
    try {
      const url = await ablageSignedUrl(item.file_path);
      setVorschau({ url, name: item.file_name || 'Datei', mime: item.mime_type });
    } catch {
      toast.error('Datei konnte nicht geöffnet werden');
    }
  };

  const perMail = async (liste: AblageItem[]) => {
    const files = liste.filter(i => i.kind === 'file');
    const notizen = liste.filter(i => i.kind === 'note');
    setMailLaedt(true);
    try {
      const anhaenge: { file: File; name: string; size: number }[] = [];
      for (const i of files) {
        try {
          const file = await ablageAlsFile(i);
          anhaenge.push({ file, name: file.name, size: file.size });
        } catch {
          toast.error(`${i.file_name}: konnte nicht geladen werden`);
        }
      }
      const kommentare = [...notizen.map(n => n.note), ...files.map(f => f.note)].filter(Boolean) as string[];
      const id = openCompose({ prefill: kommentare.length ? { bodyText: kommentare.join('\n\n') } : undefined });
      if (anhaenge.length) updateCompose(id, { attachments: anhaenge });
    } finally {
      setMailLaedt(false);
    }
  };

  /**
   * Ein Knopf für alles: Ist gerade eine E-Mail offen, kommen die Dateien
   * dorthin. Sonst öffnet sich eine neue E-Mail mit den Dateien.
   */
  const anEmail = (liste: AblageItem[]) =>
    offeneMail && liste.some(i => i.kind === 'file') ? anOffeneMail(liste) : perMail(liste);

  /** Dateien an die gerade offene E-Mail hängen (die Dateien bleiben in der Ablage). */
  const anOffeneMail = async (liste: AblageItem[]) => {
    if (!offeneMail) return;
    const files = liste.filter(i => i.kind === 'file');
    if (!files.length) return;
    setMailLaedt(true);
    try {
      const neu: { file: File; name: string; size: number }[] = [];
      for (const i of files) {
        if ((i.file_size ?? 0) > 25 * 1024 * 1024) {
          toast.error(`${i.file_name} ist zu groß für eine E-Mail (max. 25 MB)`);
          continue;
        }
        try {
          const file = await ablageAlsFile(i);
          neu.push({ file, name: file.name, size: file.size });
        } catch {
          toast.error(`${i.file_name}: konnte nicht geladen werden`);
        }
      }
      if (!neu.length) return;
      updateCompose(offeneMail.id, { attachments: [...offeneMail.attachments, ...neu] });
      if (offeneMail.mode === 'minimized') setMode(offeneMail.id, 'docked');
      toast.success(neu.length === 1 ? 'An die offene E-Mail angehängt' : `${neu.length} Dateien an die offene E-Mail angehängt`);
    } finally {
      setMailLaedt(false);
    }
  };

  const loescheAuswahl = (liste: AblageItem[]) => {
    loeschen(liste);
    setAuswahl(prev => {
      const next = new Set(prev);
      liste.forEach(i => next.delete(i.id));
      return next;
    });
  };

  const toggleAuswahl = (id: string) =>
    setAuswahl(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onDragStartItem = (e: React.DragEvent, item: AblageItem) => {
    const liste = (auswahl.has(item.id) ? ausgewaehlt : [item]).filter(i => i.kind === 'file');
    const payload: AblageDragFile[] = liste.map(i => ({
      path: i.file_path!,
      name: i.file_name || 'Datei',
      mimeType: i.mime_type,
      size: i.file_size,
      bucket: ABLAGE_BUCKET,
    }));
    if (!payload.length) {
      e.dataTransfer.setData('text/plain', item.note || '');
      return;
    }
    setLaufenderAblageZug(payload);
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData(DRAG_TYPE_ABLAGE, JSON.stringify(payload));
    e.dataTransfer.setData('text/plain', payload.map(p => p.name).join(', '));
  };

  const panel = variant === 'panel';

  // ------------------------------------------------------------ Darstellung
  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      onPaste={onPaste}
      onDragEnter={e => {
        if (!hatEigeneDaten(e)) return;
        e.preventDefault();
        dragCounter.current++;
        setDragOver(true);
      }}
      onDragLeave={e => {
        if (!hatEigeneDaten(e)) return;
        dragCounter.current = Math.max(0, dragCounter.current - 1);
        if (dragCounter.current === 0) setDragOver(false);
      }}
      onDragOver={e => {
        if (!hatEigeneDaten(e)) return;
        e.preventDefault();
        // Die DMS-Listen erlauben nur "verschieben" — dann muss der Ablagepunkt
        // das auch so melden, sonst lehnt der Browser das Loslassen ab.
        e.dataTransfer.dropEffect = e.dataTransfer.effectAllowed === 'move' ? 'move' : 'copy';
      }}
      onDrop={e => {
        if (!hatEigeneDaten(e)) return;
        onDrop(e);
      }}
      className={cn('relative flex min-h-0 flex-col outline-none', panel ? 'h-full' : '')}
    >
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary bg-primary/10 text-primary">
          <Upload className="h-8 w-8" />
          <div className="text-[15px] font-semibold">Loslassen zum Ablegen</div>
          <div className="text-[12.5px]">
            {empfaenger.length ? 'Nur für die ausgewählten Kollegen' : 'Für alle im Büro'}
          </div>
        </div>
      )}

      {/* ---------- Hinlegen ---------- */}
      <div className={cn('shrink-0 space-y-2.5', panel ? 'border-b px-4 pb-4 pt-1' : 'mb-5')}>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className={cn(
            'flex w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-[#D8D2C6] bg-background px-4 text-center transition-colors hover:border-primary hover:bg-primary/5',
            panel ? 'py-4' : 'py-7',
          )}
        >
          {beschaeftigt ? (
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          ) : (
            <Upload className="h-6 w-6 text-muted-foreground" />
          )}
          <span className="text-[13.5px] font-medium text-foreground">
            {beschaeftigt ? 'Wird abgelegt …' : 'Dateien hierher ziehen oder klicken'}
          </span>
          <span className="text-[12px] text-muted-foreground">
            Auch aus E-Mails und dem DMS · Bildschirmfotos mit Strg+V
          </span>
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          className="hidden"
          onChange={e => {
            legeDateien(Array.from(e.target.files || []));
            e.target.value = '';
          }}
        />

        <div className="rounded-xl border bg-background focus-within:ring-2 focus-within:ring-primary/30">
          <Textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                legeNotiz();
              }
            }}
            placeholder="Notiz schreiben … (oder Kommentar für die nächste Datei)"
            className="min-h-[56px] resize-none border-0 text-[13.5px] shadow-none focus-visible:ring-0"
            rows={2}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-2 py-1.5">
            <EmpfaengerWahl
              people={people}
              selfId={user?.id}
              value={empfaenger}
              onChange={setEmpfaenger}
              compact={panel}
            />
            <Button size="sm" className="h-8 gap-1.5" onClick={legeNotiz} disabled={!text.trim() || notiz.isPending}>
              {notiz.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Notiz hinlegen
            </Button>
          </div>
        </div>
      </div>

      {/* ---------- Filter / Auswahl ---------- */}
      <div className={cn('flex shrink-0 flex-wrap items-center gap-1.5', panel ? 'px-4 pt-3' : 'mb-3')}>
        {ausgewaehlt.length > 0 ? (
          <div className="flex w-full flex-wrap items-center gap-1.5 rounded-lg bg-muted px-2 py-1.5 text-[12.5px]">
            <span className="px-1 font-medium">{ausgewaehlt.length} ausgewählt</span>
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[12.5px]" onClick={() => anEmail(ausgewaehlt)} disabled={mailLaedt}>
              <Paperclip className="h-3.5 w-3.5" /> An E-Mail anhängen
            </Button>
            {ausgewaehlt.some(i => i.kind === 'file') && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 px-2 text-[12.5px]"
                onClick={() => setDmsItems(ausgewaehlt.filter(i => i.kind === 'file'))}
              >
                <FolderArchive className="h-3.5 w-3.5" /> Im DMS ablegen
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-[12.5px] text-destructive hover:text-destructive"
              onClick={() => loescheAuswahl(ausgewaehlt)}
            >
              <Trash2 className="h-3.5 w-3.5" /> Löschen
            </Button>
            <Button size="sm" variant="ghost" className="ml-auto h-7 px-2" onClick={() => setAuswahl(new Set())} aria-label="Auswahl aufheben">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          (Object.keys(FILTER_LABEL) as Filter[]).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                'rounded-full px-2.5 py-1 text-[12px] transition-colors',
                filter === f ? 'bg-[#2B2B2B] text-white' : 'border border-border text-foreground hover:bg-muted',
              )}
            >
              {FILTER_LABEL[f]}
              {anzahl[f] > 0 && <span className="ml-1 opacity-70">{anzahl[f]}</span>}
            </button>
          ))
        )}
      </div>

      {/* ---------- Liste ---------- */}
      <div className={cn('min-h-0', panel ? 'flex-1 overflow-y-auto px-4 pb-4 pt-2' : '')}>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : gefiltert.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
            <Inbox className="h-8 w-8 opacity-50" />
            <div className="text-[13.5px]">
              {filter === 'alle' ? 'Die Ablage ist leer.' : 'Hier liegt gerade nichts.'}
            </div>
          </div>
        ) : (
          <ul className={cn('space-y-2', !panel && 'grid gap-2.5 space-y-0 md:grid-cols-2')}>
            {gefiltert.map(item => {
              const Icon = item.kind === 'note' ? StickyNote : dateiIcon(item.mime_type, item.file_name);
              const thumb = istBild(item) ? vorschauUrls?.get(item.file_path!) : undefined;
              const markiert = auswahl.has(item.id);
              const neu = hervorheben.has(item.id);
              return (
                <li
                  key={item.id}
                  draggable
                  onDragStart={e => onDragStartItem(e, item)}
                  onDragEnd={() => setLaufenderAblageZug(null)}
                  className={cn(
                    'group relative flex gap-2.5 rounded-xl border bg-background p-2.5 transition-shadow hover:shadow-sm',
                    item.kind === 'file' && 'cursor-grab active:cursor-grabbing',
                    item.kind === 'note' && 'border-[#F3DDB0] bg-[#FFFBF2]',
                    markiert && 'ring-2 ring-primary/50',
                  )}
                >
                  <div className="flex flex-col items-center gap-1.5 pt-0.5">
                    <Checkbox
                      checked={markiert}
                      onCheckedChange={() => toggleAuswahl(item.id)}
                      aria-label="Auswählen"
                      className={cn(!markiert && auswahl.size === 0 && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100')}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => (item.kind === 'file' ? oeffnen(item) : undefined)}
                    className={cn(
                      'flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg',
                      item.kind === 'note' ? 'bg-[#FFF0D1] text-[#8a6417] cursor-default' : 'bg-muted text-muted-foreground',
                    )}
                    tabIndex={item.kind === 'file' ? 0 : -1}
                    aria-label={item.kind === 'file' ? `${item.file_name} öffnen` : undefined}
                  >
                    {thumb ? (
                      <img src={thumb} alt="" className="h-full w-full object-cover" draggable={false} />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    {item.kind === 'file' ? (
                      <button
                        type="button"
                        onClick={() => oeffnen(item)}
                        className="block max-w-full truncate text-left text-[13.5px] font-medium text-foreground hover:underline"
                        title={item.file_name || ''}
                      >
                        {item.file_name}
                      </button>
                    ) : null}
                    {item.note && (
                      <p
                        className={cn(
                          'whitespace-pre-wrap break-words text-[13px]',
                          item.kind === 'note' ? 'text-foreground' : 'mt-0.5 text-muted-foreground italic',
                        )}
                      >
                        {item.note}
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] text-muted-foreground">
                      {neu && (
                        <span className="rounded-full bg-[#C0392B] px-1.5 py-px text-[10px] font-semibold text-white">Neu</span>
                      )}
                      <span>{item.vonMir ? 'von mir' : `von ${item.fromName}`}</span>
                      <span>·</span>
                      <span>{relativeZeit(item.created_at)}</span>
                      {item.file_size ? (
                        <>
                          <span>·</span>
                          <span>{formatGroesse(item.file_size)}</span>
                        </>
                      ) : null}
                      {item.source === 'email' && (
                        <>
                          <span>·</span>
                          <span>aus E-Mail</span>
                        </>
                      )}
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-px',
                          item.recipient_ids.length ? 'bg-[#F0EEF6] text-[#5f5486]' : 'bg-muted',
                        )}
                      >
                        {item.recipient_ids.length ? `nur für ${item.recipientNames.join(', ')}` : 'für alle'}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-start gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-primary"
                      onClick={() => anEmail([item])}
                      disabled={mailLaedt}
                      title={offeneMail && item.kind === 'file' ? 'An die offene E-Mail anhängen' : 'Per E-Mail senden'}
                      aria-label={offeneMail && item.kind === 'file' ? 'An die offene E-Mail anhängen' : 'Per E-Mail senden'}
                    >
                      {mailLaedt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                    </Button>
                    {item.kind === 'file' ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => ablageHerunterladen(item)}
                        title="Herunterladen"
                        aria-label="Herunterladen"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          void navigator.clipboard?.writeText(item.note || '');
                          toast.success('Text kopiert');
                        }}
                        title="Text kopieren"
                        aria-label="Text kopieren"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => loescheAuswahl([item])}
                      title="Löschen"
                      aria-label="Löschen"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Weitere Aktionen">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {item.kind === 'file' && (
                          <DropdownMenuItem onClick={() => oeffnen(item)}>
                            <FileText className="mr-2 h-4 w-4" /> Öffnen
                          </DropdownMenuItem>
                        )}
                        {item.kind === 'file' && (
                          <DropdownMenuItem onClick={() => setDmsItems([item])}>
                            <FolderArchive className="mr-2 h-4 w-4" /> Im DMS ablegen
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => loescheAuswahl([item])}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Löschen
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {!panel && gefiltert.some(i => i.kind === 'file') && (
          <p className="mt-4 text-[12px] text-muted-foreground">
            Tipp: Die Büroklammer hängt die Datei an die gerade offene E-Mail (sonst an eine neue). Oder die Datei einfach ins E-Mail-Fenster ziehen.
          </p>
        )}
      </div>

      <AttachmentPreviewDialog
        open={!!vorschau}
        onOpenChange={o => !o && setVorschau(null)}
        url={vorschau?.url ?? null}
        fileName={vorschau?.name ?? ''}
        mimeType={vorschau?.mime ?? null}
      />
      <SaveAttachmentToBuildingDialog
        open={dmsItems.length > 0}
        onOpenChange={o => !o && setDmsItems([])}
        attachments={dmsItems.map(i => ({
          name: i.file_name || 'Datei',
          path: i.file_path!,
          size: i.file_size,
          mimeType: i.mime_type,
        }))}
        sourceBucket={ABLAGE_BUCKET}
        removeAfterLabel="Danach aus der Ablage entfernen"
        onDone={({ removeAfter }) => {
          if (removeAfter) {
            loeschen(dmsItems, { still: true });
            setAuswahl(new Set());
          }
        }}
      />
    </div>
  );
}
