import { useEffect, useRef } from 'react';
import { Bold, Heading2, Italic, Link2, List, ListOrdered, Quote, Paperclip, ImagePlus } from 'lucide-react';
import { NOTIZ_TEXT_KLASSEN, notizHtmlBereinigen } from './notizHtml';

interface Props {
  /** Startinhalt. Der Editor ist danach selbstständig (über `key` neu setzen). */
  initialHtml: string;
  onChange: (html: string) => void;
  /** Bilder oder Dateien, die eingefügt, hineingezogen oder ausgewählt wurden. */
  onDateien: (files: File[]) => void;
  placeholder?: string;
}

/**
 * Schreibfläche für eine Notiz.
 *
 * Bewusst einfach gehalten: Überschrift, fett, kursiv, Listen, Hinweis-Kasten
 * und Links. Bilder und Dateien landen nicht im Text, sondern als Anhang an
 * der Notiz — dann bleiben sie auch durchsuchbar und herunterladbar.
 */
export function NotizEditor({ initialHtml, onChange, onDateien, placeholder }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const bildInput = useRef<HTMLInputElement>(null);
  const dateiInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = notizHtmlBereinigen(initialHtml);
    // nur beim ersten Anzeigen — danach gehört der Inhalt dem Editor
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const melden = () => {
    if (ref.current) onChange(ref.current.innerHTML);
  };

  const befehl = (name: string, wert?: string) => {
    ref.current?.focus();
    document.execCommand(name, false, wert);
    melden();
  };

  const blockUmschalten = (tag: 'h3' | 'blockquote') => {
    const aktuell = (document.queryCommandValue('formatBlock') || '').toLowerCase();
    befehl('formatBlock', aktuell === tag ? 'p' : tag);
  };

  const linkSetzen = () => {
    const url = window.prompt('Adresse des Links (z. B. https://…):');
    if (!url) return;
    const sauber = /^(https?:|mailto:|tel:)/i.test(url) ? url : `https://${url}`;
    befehl('createLink', sauber);
  };

  const beimEinfuegen = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const dateien = Array.from(e.clipboardData.files || []);
    if (dateien.length) {
      e.preventDefault();
      onDateien(dateien);
      return;
    }
    const html = e.clipboardData.getData('text/html');
    if (html) {
      e.preventDefault();
      document.execCommand('insertHTML', false, notizHtmlBereinigen(html));
      melden();
    }
  };

  const beimLoslassen = (e: React.DragEvent<HTMLDivElement>) => {
    const dateien = Array.from(e.dataTransfer.files || []);
    if (dateien.length) {
      e.preventDefault();
      onDateien(dateien);
    }
  };

  const knopf =
    'inline-flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="flex flex-col">
      <div
        role="toolbar"
        aria-label="Formatierung"
        className="flex flex-wrap items-center gap-1 border-y border-border bg-muted/40 px-3 py-1.5"
      >
        {/* onMouseDown verhindert, dass die Markierung im Text verloren geht */}
        <button type="button" className={knopf} aria-label="Überschrift" title="Überschrift"
          onMouseDown={e => e.preventDefault()} onClick={() => blockUmschalten('h3')}>
          <Heading2 className="h-4 w-4" />
        </button>
        <button type="button" className={knopf} aria-label="Fett" title="Fett"
          onMouseDown={e => e.preventDefault()} onClick={() => befehl('bold')}>
          <Bold className="h-4 w-4" />
        </button>
        <button type="button" className={knopf} aria-label="Kursiv" title="Kursiv"
          onMouseDown={e => e.preventDefault()} onClick={() => befehl('italic')}>
          <Italic className="h-4 w-4" />
        </button>
        <button type="button" className={knopf} aria-label="Aufzählung" title="Aufzählung"
          onMouseDown={e => e.preventDefault()} onClick={() => befehl('insertUnorderedList')}>
          <List className="h-4 w-4" />
        </button>
        <button type="button" className={knopf} aria-label="Nummerierte Liste" title="Nummerierte Liste"
          onMouseDown={e => e.preventDefault()} onClick={() => befehl('insertOrderedList')}>
          <ListOrdered className="h-4 w-4" />
        </button>
        <button type="button" className={knopf} aria-label="Hinweis-Kasten" title="Hinweis-Kasten"
          onMouseDown={e => e.preventDefault()} onClick={() => blockUmschalten('blockquote')}>
          <Quote className="h-4 w-4" />
        </button>
        <button type="button" className={knopf} aria-label="Link" title="Link"
          onMouseDown={e => e.preventDefault()} onClick={linkSetzen}>
          <Link2 className="h-4 w-4" />
        </button>
        <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
        <button type="button"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-[13px] font-medium hover:bg-muted"
          onClick={() => bildInput.current?.click()}>
          <ImagePlus className="h-4 w-4" /> Bild
        </button>
        <button type="button"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-[13px] font-medium hover:bg-muted"
          onClick={() => dateiInput.current?.click()}>
          <Paperclip className="h-4 w-4" /> Datei
        </button>
        <input ref={bildInput} type="file" accept="image/*" capture="environment" multiple className="hidden"
          onChange={e => { onDateien(Array.from(e.target.files || [])); e.target.value = ''; }} />
        <input ref={dateiInput} type="file" multiple className="hidden"
          onChange={e => { onDateien(Array.from(e.target.files || [])); e.target.value = ''; }} />
      </div>

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Text der Notiz"
        data-placeholder={placeholder ?? 'Was soll man später nachlesen können?'}
        onInput={melden}
        onBlur={melden}
        onPaste={beimEinfuegen}
        onDrop={beimLoslassen}
        onDragOver={e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
        className={`${NOTIZ_TEXT_KLASSEN} min-h-[220px] px-5 py-4 outline-none empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]`}
      />
      <p className="px-5 pb-3 text-[12px] text-muted-foreground">
        Tipp: Bildschirmfotos mit Strg + V einfügen oder Bilder und PDFs einfach hineinziehen.
      </p>
    </div>
  );
}
