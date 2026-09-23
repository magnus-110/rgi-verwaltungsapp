import type { ComponentType } from 'react';
import {
  BarChart3,
  BookUser,
  Briefcase,
  CalendarDays,
  CalendarRange,
  Castle,
  CheckSquare,
  ClipboardList,
  CreditCard,
  FolderKanban,
  Home,
  KeyRound,
  Landmark,
  ListChecks,
  Mail,
  Settings,
  StickyNote,
  Users,
  Workflow,
} from 'lucide-react';

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
}

/**
 * „Aufgaben" fasst die vier Bereiche zusammen, die zusammengehören: die
 * Pinnwand mit den Aufgaben, die Vorgänge, der Jahreszyklus und die
 * Anleitungen. Vorher standen sie einzeln und weit auseinander in der Liste.
 */
export const adminMenu: MenuItem[] = [
  { title: 'Dashboard', url: '/dashboard', icon: BarChart3 },
  { title: 'Postfach', url: '/postfach', icon: Mail },
  { title: 'Gebäude', url: '/buildings', icon: Castle },
  {
    title: 'Aufgaben',
    url: '/pinnwand',
    icon: CheckSquare,
    children: [
      { title: 'Pinnwand', url: '/pinnwand', icon: StickyNote },
      { title: 'Vorgänge', url: '/vorgaenge', icon: FolderKanban },
      { title: 'Jahreszyklus', url: '/jahreszyklus', icon: CalendarRange },
      { title: 'Anleitungen', url: '/checklisten', icon: Workflow },
    ],
  },
  { title: 'Buchhaltung', url: '/finanzen', icon: Landmark },
  { title: 'Zahlungen', url: '/zahlungen', icon: CreditCard },
  { title: 'Adressen', url: '/contacts', icon: BookUser },
  { title: 'Kalender', url: '/calendar', icon: CalendarDays },
  { title: 'Meldungen', url: '/tickets', icon: ClipboardList },
  { title: 'Versammlungen', url: '/versammlungen', icon: Users },
  { title: 'Schlüssel', url: '/schluessel', icon: KeyRound },
  { title: 'Umfragen', url: '/umfragen', icon: ListChecks },
  { title: 'RGI Intern', url: '/rgi-intern', icon: Briefcase, adminOnly: true },
  { title: 'Einstellungen', url: '/settings', icon: Settings, adminOnly: true },
];

export const brokerMenu: MenuItem[] = [
  { title: 'Objekte', url: '/makler/objekte', icon: Home },
  { title: 'Postfach', url: '/postfach', icon: Mail },
  { title: 'Adressen', url: '/contacts', icon: BookUser },
  { title: 'Kalender', url: '/calendar', icon: CalendarDays },
  { title: 'Einstellungen', url: '/settings', icon: Settings, adminOnly: true },
];

/** Gehört dieser Pfad zu einem der Unterpunkte von „Aufgaben"? */
export function istAufgabenPfad(pfad: string) {
  return (
    pfad.startsWith('/pinnwand') ||
    pfad.startsWith('/vorgaenge') ||
    pfad.startsWith('/jahreszyklus') ||
    pfad.startsWith('/checklisten') ||
    pfad.startsWith('/prozesse') ||
    pfad.startsWith('/tickets/vorgaenge')
  );
}

/** Steht man gerade auf diesem Punkt? Einige Punkte haben Nebenpfade. */
export function istAktiv(item: MenuItem, pfad: string): boolean {
  if (item.children) return istAufgabenPfad(pfad);
  if (item.url === '/tickets') {
    return pfad === '/tickets' || pfad.startsWith('/reports') || pfad.startsWith('/admin/reports');
  }
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

/** Die Punkte, die diese Rolle sehen darf. */
export function menueFuer(rolle: string | undefined, items: MenuItem[]): MenuItem[] {
  return items.filter(item => {
    if (item.adminOnly && rolle !== 'admin') return false;
    if (rolle === 'employee' && ['Chatbot', 'Einstellungen'].includes(item.title)) return false;
    return true;
  });
}
