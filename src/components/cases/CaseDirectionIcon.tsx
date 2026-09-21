import { ArrowDownLeft, ArrowUpRight, Phone, FileText, StickyNote, Circle } from 'lucide-react';

interface CaseDirectionIconProps {
  /** 'in' | 'out' bei Mails, sonst der Ereignistyp. */
  kind: string;
  className?: string;
}

/**
 * Woher kam die letzte Bewegung.
 *
 * Wichtig aus dem Plan: Die Richtung färbt nur das Icon, niemals die Zeile.
 * Bewertet wird ausschließlich über die Stille-Gruppe — eine eingegangene
 * Mail ist nicht schlimmer als eine ausgegangene.
 */
export function CaseDirectionIcon({ kind, className = 'h-3.5 w-3.5' }: CaseDirectionIconProps) {
  switch (kind) {
    case 'in':
      return <ArrowDownLeft className={className} style={{ color: '#B4472B' }} strokeWidth={2.2} />;
    case 'out':
      return <ArrowUpRight className={className} style={{ color: '#6B8A55' }} strokeWidth={2.2} />;
    case 'phone':
      return <Phone className={className} style={{ color: '#7A6FA0' }} strokeWidth={2.2} />;
    case 'note':
      return <StickyNote className={className} style={{ color: '#8a6417' }} strokeWidth={2.2} />;
    case 'document':
    case 'file':
    case 'image':
      return <FileText className={className} style={{ color: '#6B6B6B' }} strokeWidth={2.2} />;
    default:
      return <Circle className={className} style={{ color: '#B6B0A4' }} strokeWidth={2.2} />;
  }
}

export function beschreibeHerkunft(kind: string, who: string | null): string {
  const wer = who || 'unbekannt';
  switch (kind) {
    case 'in':
      return `Mail von ${wer}`;
    case 'out':
      return `Mail an ${wer}`;
    case 'phone':
      return `Telefonnotiz${who ? ` · ${who}` : ''}`;
    case 'note':
      return who || 'Notiz';
    case 'document':
    case 'file':
    case 'image':
      return who || 'Dokument';
    case 'none':
      return 'Seit dem Anlegen nichts';
    default:
      return who || kind;
  }
}
