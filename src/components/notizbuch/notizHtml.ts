import DOMPurify from 'dompurify';

/**
 * Was eine Notiz an Formatierung enthalten darf. Alles andere (Schriftarten,
 * Farben, Skripte, eingefügter Word-Ballast) fliegt beim Einfügen und beim
 * Anzeigen raus.
 */
const ERLAUBT = {
  ALLOWED_TAGS: ['p', 'br', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'blockquote', 'a', 'div'],
  ALLOWED_ATTR: ['href'],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:)/i,
};

export function notizHtmlBereinigen(html: string): string {
  return DOMPurify.sanitize(html || '', ERLAUBT) as unknown as string;
}

/** Bereinigt für die Anzeige: Links öffnen in einem neuen Fenster. */
export function notizHtmlZumAnzeigen(html: string): string {
  const sauber = notizHtmlBereinigen(html);
  const div = document.createElement('div');
  div.innerHTML = sauber;
  div.querySelectorAll('a').forEach(a => {
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  });
  return div.innerHTML;
}

/** Ist der Inhalt praktisch leer (nur leere Absätze)? */
export function notizIstLeer(html: string): boolean {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return !(div.textContent || '').trim();
}

/** Gemeinsame Gestaltung für Lesen und Bearbeiten. */
export const NOTIZ_TEXT_KLASSEN =
  'text-[14.5px] leading-relaxed text-foreground break-words ' +
  '[&_p]:my-2 [&_p:first-child]:mt-0 ' +
  '[&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-[17px] [&_h2]:font-semibold ' +
  '[&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:text-[15.5px] [&_h3]:font-semibold ' +
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-0.5 ' +
  '[&_blockquote]:my-3 [&_blockquote]:rounded-md [&_blockquote]:bg-primary/10 [&_blockquote]:px-4 [&_blockquote]:py-2.5 ' +
  '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2';
