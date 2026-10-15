import type { ComponentType } from 'react';
import {
  BarChart3,
  BookUser,
  Briefcase,
  CalendarDays,
  CalendarRange,
  Castle,
  CreditCard,
  FolderKanban,
  Home,
  Inbox,
  KeyRound,
  Landmark,
  ListChecks,
  Mail,
  NotebookPen,
  Settings,
  StickyNote,
  Users,
  Wallet,
  Workflow, ReceiptText } from 'lucide-react';

/**
 * Die Navigation — an einer Stelle.
 *
 * Seitenleiste und mobile Ansicht hatten je eine eigene Liste. Die mobile
 * lief dadurch auseinander: sie zeigte noch „Aufgaben" auf die alte Seite
 * /todos, „Vorgänge" auf eine Route, die es nicht mehr gibt, und „Prozesse"
 * statt „Anleitungen" — Pinnwand und Jahreszyklus fehlten ganz.
 *
 * Wer hier etwas ändert, ändert es überall.
 */

export interface MenuItem {
  title: string;
  url: string;
  icon: ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  children?: MenuItem[];
  /** Zwischenüberschrift, unter der der Punkt steht (leer = ganz oben). */
  abschnitt?: Abschnitt;
  /** Nur in diesem Verwaltungsmodus sichtbar (leer = in beiden). */
  modus?: 'weg' | 'rent';
}

export type Abschnitt = 'Büro' | 'Objekte' | 'Finanzen' | 'Eigentümer' | 'Intern';

/**
 * Seit dem Umbau vom 15.10.2026 hat die Seitenleiste fünf
 * Zwischenüberschriften statt aufklappbarer Gruppen. Oben stehen die drei
 * Seiten für jeden Tag (Dashboard, Postfach, Kalender).
 *
 * „Büro" nimmt die frühere Gruppe „Aufgaben" und „Wissen" auf
 * (Notizbuch und Anleitungen stehen am Ende). Was nur zur WEG oder nur
 * zur Miete gehört, trägt `modus` und erscheint nur im passenden Modus:
 * Versammlungen und Umfragen nur im WEG-Modus.
 */
export const adminMenu: MenuItem[] = [
  { title: 'Dashboard', url: '/dashboard', icon: BarChart3 },
  { title: 'Postfach', url: '/postfach', icon: Mail },
  { title: 'Kalender', url: '/calendar', icon: CalendarDays },

  { title: 'Pinnwand', url: '/pinnwand', icon: StickyNote, abschnitt: 'Büro' },
  { title: 'Ablage', url: '/ablage', icon: Inbox, abschnitt: 'Büro' },
  { title: 'Vorgänge', url: '/vorgaenge', icon: FolderKanban, abschnitt: 'Büro' },
  { title: 'Jahreszyklus', url: '/jahreszyklus', icon: CalendarRange, abschnitt: 'Büro' },
  { title: 'Notizbuch', url: '/notizbuch', icon: NotebookPen, abschnitt: 'Büro' },
  { title: 'Anleitungen', url: '/checklisten', icon: Workflow, abschnitt: 'Büro' },

  { title: 'Gebäude', url: '/buildings', icon: Castle, abschnitt: 'Objekte' },
  { title: 'Adressen', url: '/contacts', icon: BookUser, abschnitt: 'Objekte' },
  { title: 'Schlüssel', url: '/schluessel', icon: KeyRound, abschnitt: 'Objekte' },

  { title: 'Konten', url: '/konten', icon: Wallet, abschnitt: 'Finanzen' },
  { title: 'Zahlungen', url: '/zahlungen', icon: CreditCard, abschnitt: 'Finanzen' },
  { title: 'Buchhaltung', url: '/finanzen', icon: Landmark, abschnitt: 'Finanzen' },
  { title: 'Mietkontrolle', url: '/mietkontrolle', icon: ReceiptText, abschnitt: 'Finanzen', modus: 'rent' },

  { title: 'Versammlungen', url: '/versammlungen', icon: Users, abschnitt: 'Eigentümer', modus: 'weg' },
  { title: 'Umfragen', url: '/umfragen', icon: ListChecks, abschnitt: 'Eigentümer', modus: 'weg' },

  { title: 'RGI Intern', url: '/rgi-intern', icon: Briefcase, adminOnly: true, abschnitt: 'Intern' },
  { title: 'Einstellungen', url: '/settings', icon: Settings, adminOnly: true, abschnitt: 'Intern' },
];

export const brokerMenu: MenuItem[] = [
  { title: 'Objekte', url: '/makler/objekte', icon: Home },
  { title: 'Postfach', url: '/postfach', icon: Mail },
  { title: 'Adressen', url: '/contacts', icon: BookUser },
  { title: 'Kalender', url: '/calendar', icon: CalendarDays },
  { title: 'Einstellungen', url: '/settings', icon: Settings, adminOnly: true },
];

/** Steht man gerade auf einem der Unterpunkte dieser Gruppe? */
export function istGruppenPfad(item: MenuItem, pfad: string): boolean {
  return (item.children ?? []).some(kind => istAktiv(kind, pfad));
}

/** Steht man gerade auf diesem Punkt? Einige Punkte haben Nebenpfade. */
export function istAktiv(item: MenuItem, pfad: string): boolean {
  if (item.children) return istGruppenPfad(item, pfad);
  if (item.url === '/checklisten') {
    return pfad.startsWith('/checklisten') || pfad.startsWith('/prozesse');
  }
  if (item.url === '/zahlungen') {
    return pfad.startsWith('/zahlungen') || pfad.startsWith('/ueberweisungen');
  }
  if (item.url === '/makler/objekte') return pfad.startsWith('/makler');
  if (item.url === '/dashboard') return pfad === '/dashboard';
  return pfad.startsWith(item.url);
}

/** Die Punkte, die diese Rolle (und dieser Verwaltungsmodus) sehen darf. */
export function menueFuer(
  rolle: string | undefined,
  items: MenuItem[],
  modus?: 'weg' | 'rent',
): MenuItem[] {
  return items.filter(item => {
    if (item.adminOnly && rolle !== 'admin') return false;
    if (rolle === 'employee' && ['Chatbot', 'Einstellungen'].includes(item.title)) return false;
    if (item.modus && modus && item.modus !== modus) return false;
    return true;
  });
}

/**
 * Teilt die sichtbaren Punkte nach Zwischenüberschrift auf, in der
 * Reihenfolge der Liste. Ein Abschnitt ohne sichtbaren Punkt (z. B.
 * „Eigentümer" im Miete-Modus) fällt dabei weg.
 */
export function abschnittsweise(items: MenuItem[]): { abschnitt?: Abschnitt; items: MenuItem[] }[] {
  const gruppen: { abschnitt?: Abschnitt; items: MenuItem[] }[] = [];
  for (const item of items) {
    const letzte = gruppen[gruppen.length - 1];
    if (letzte && letzte.abschnitt === item.abschnitt) letzte.items.push(item);
    else gruppen.push({ abschnitt: item.abschnitt, items: [item] });
  }
  return gruppen;
}
