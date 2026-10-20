import { useEffect } from 'react';

/**
 * Holt Bilder und Dateien aus der Zwischenablage (Strg + V).
 * Je nach Browser und Quelle liegen sie unter `files`, nur unter `items`
 * oder – bei einem aus einer Webseite kopierten Bild – nur als <img> im HTML.
 */
export async function dateienAusZwischenablage(dt: DataTransfer | null): Promise<File[]> {
  if (!dt) return [];
  let dateien = Array.from(dt.files || []);
  if (!dateien.length) {
    dateien = Array.from(dt.items || [])
      .filter(i => i.kind === 'file')
      .map(i => i.getAsFile())
      .filter((f): f is File => !!f);
  }
  if (dateien.length) return dateien.map(benennen);

  // Bild aus einer Webseite kopiert: Adresse aus dem HTML holen und laden
  const html = dt.getData('text/html');
  const nurBild = html && /<img\b/i.test(html) && !textOhneBilder(html);
  if (!nurBild) return [];
  const src = /<img[^>]+src=["']([^"']+)["']/i.exec(html)?.[1];
  if (!src) return [];
  try {
    const blob = await (await fetch(src)).blob();
    if (!blob.type.startsWith('image/')) return [];
    return [benennen(new File([blob], `bild.${blob.type.split('/')[1] || 'png'}`, { type: blob.type }))];
  } catch {
    return [];
  }
}

/** Liegt in der Zwischenablage überhaupt etwas, das ein Bild oder eine Datei sein könnte? */
export function hatDateien(dt: DataTransfer | null) {
  if (!dt) return false;
  if (dt.files?.length) return true;
  if (Array.from(dt.items || []).some(i => i.kind === 'file')) return true;
  const html = dt.getData('text/html');
  return !!html && /<img\b/i.test(html) && !textOhneBilder(html);
}

function textOhneBilder(html: string) {
  const d = document.createElement('div');
  d.innerHTML = html;
  return (d.textContent || '').trim();
}

/** „image.png“ aus der Zwischenablage bekommt einen sprechenden Namen. */
function benennen(f: File) {
  if (f.name && !/^image\.\w+$/i.test(f.name) && !/^bild\.\w+$/i.test(f.name)) return f;
  const jetzt = new Date();
  const z = (n: number) => String(n).padStart(2, '0');
  const endung = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
  const name = `Bild ${z(jetzt.getDate())}.${z(jetzt.getMonth() + 1)}.${jetzt.getFullYear()} ${z(jetzt.getHours())}-${z(jetzt.getMinutes())}-${z(jetzt.getSeconds())}.${endung}`;
  return new File([f], name, { type: f.type || 'image/png' });
}

/**
 * Strg + V überall auf der Seite: Bilder landen als Anhang, auch wenn der
 * Cursor gerade nicht im Text steht (z. B. im Titel oder nirgends).
 * Einfügen im Schreibfeld selbst übernimmt der Editor.
 */
export function useEinfuegenAufSeite(aktiv: boolean, onDateien: (files: File[]) => void) {
  useEffect(() => {
    if (!aktiv) return;
    const beim = (e: ClipboardEvent) => {
      const ziel = e.target as HTMLElement | null;
      if (ziel?.closest?.('[data-notiz-editor]')) return;
      if (!hatDateien(e.clipboardData)) return;
      e.preventDefault();
      dateienAusZwischenablage(e.clipboardData).then(f => f.length && onDateien(f));
    };
    document.addEventListener('paste', beim);
    return () => document.removeEventListener('paste', beim);
  }, [aktiv, onDateien]);
}
