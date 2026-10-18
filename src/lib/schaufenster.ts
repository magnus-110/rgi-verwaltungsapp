/**
 * Typen für die Steuerung der Schaufensteranzeige (/display/).
 *
 * Der Ablauf liegt in der Tabelle display_slides, die globalen
 * Vorgaben in display_settings. Fehlen beide, läuft der
 * Bildschirm mit seinem eingebauten Standardablauf weiter.
 */

export type SlideKind =
  | 'auftakt'
  | 'objekte'
  | 'referenzen'
  | 'bereich'
  | 'stimme'
  | 'app'
  | 'frei';

/** Ziel des QR-Codes auf einer Inhaltsfolie. */
export type QrTarget = '' | 'verkauf' | 'vermietung' | 'verwaltung' | 'kontakt';

export interface SlideConfig {
  /** Kleine Kennzeichnung oben rechts, z. B. „Unsere Leistungen“ */
  pill?: string;
  /** Große Schlagzeile in der Fernzone */
  title?: string;
  /** Fließtext. Erlaubt sind nur <b>, <i> und <br> */
  lead?: string;
  /** Nummerierte Punkte unter dem Fließtext */
  points?: string[];
  /** Dateiname eines Bildes im Ordner /display/ */
  image?: string;

  /** Aufruf am Fuß der Folie */
  cta1?: string;
  cta2?: string;
  page?: string;
  qr?: QrTarget;

  /** Kundenstimme */
  text?: string;
  author?: string;
  stars?: number;

  /** Eigentümer-App */
  steps?: [string, string][];
  features?: string[];

  /** Objekt- und Referenzfolien */
  count?: number;
  transaction?: 'all' | 'sale' | 'rent';
}

export interface DisplaySlide {
  id: string;
  kind: SlideKind;
  sort_order: number;
  is_active: boolean;
  /** Leer = Standarddauer aus den Einstellungen */
  duration_seconds: number | null;
  config: SlideConfig;
}

/** Neue Folie vor dem ersten Speichern */
export type NewDisplaySlide = Omit<DisplaySlide, 'id'>;

export interface DisplaySettings {
  id: number;
  object_duration_seconds: number;
  content_duration_seconds: number;
  city_filter: string | null;
}

export const DEFAULT_SETTINGS: DisplaySettings = {
  id: 1,
  object_duration_seconds: 16,
  content_duration_seconds: 13,
  city_filter: null,
};

export const SLIDE_LABELS: Record<SlideKind, string> = {
  auftakt: 'Auftaktfolie',
  objekte: 'Objekte',
  referenzen: 'Referenzen',
  bereich: 'Leistungsbereich',
  stimme: 'Kundenstimme',
  app: 'Eigentümer-App',
  frei: 'Freie Folie',
};

export const SLIDE_HINTS: Record<SlideKind, string> = {
  auftakt: 'Das fertig gestaltete Bild, randlos und ohne Kontaktleiste.',
  objekte: 'Zieht die nächsten Objekte aus dem Bestand. Neue erscheinen von allein.',
  referenzen: 'Verkaufte und vermittelte Objekte mit dem Balken „Verkauft“.',
  bereich: 'Verkauf, Vermietung oder Verwaltung mit Foto, Punkten und QR-Code.',
  stimme: 'Ein Zitat mit Sternen und Herkunft.',
  app: 'Smartphone, Jahreszyklus und Funktionsliste.',
  frei: 'Leere Folie zum selbst Befüllen.',
};

/** Vorlagen für neu angelegte Folien */
export const SLIDE_TEMPLATES: Record<SlideKind, SlideConfig> = {
  auftakt: { image: 'auftakt.jpg' },
  objekte: { count: 2, transaction: 'all' },
  referenzen: { count: 1 },
  bereich: {
    pill: 'Unsere Leistungen',
    title: 'Verkauf',
    image: 'bg-verkauf.jpg',
    lead: '',
    points: ['', '', ''],
    cta1: '',
    cta2: '',
    page: 'rgi-immobilien.de/verkauf',
    qr: 'verkauf',
  },
  stimme: {
    pill: 'Kundenstimme',
    title: '5-Sterne-Service',
    stars: 5,
    text: '',
    author: '',
  },
  app: {
    pill: 'Verwaltung digital',
    title: 'Ihre Eigentümer-App',
    image: 'app-mockup.png',
    lead: '',
    steps: [['', '']],
    features: [],
  },
  frei: {
    pill: '',
    title: '',
    lead: '',
    points: [],
    image: '',
    qr: '',
  },
};

/** Bilder, die im Ordner /display/ liegen */
export const DISPLAY_IMAGES = [
  { value: '', label: 'Kein Bild' },
  { value: 'auftakt.jpg', label: 'Auftaktfolie (Sofa)' },
  { value: 'bg-verkauf.jpg', label: 'Verkauf (Pfronten)' },
  { value: 'bg-vermietung.jpg', label: 'Vermietung (Füssen)' },
  { value: 'bg-verwaltung.jpg', label: 'Verwaltung' },
  { value: 'app-mockup.png', label: 'Smartphone mit App' },
];

export const QR_OPTIONS: { value: QrTarget; label: string }[] = [
  { value: '', label: 'Kein QR-Code' },
  { value: 'verkauf', label: 'rgi-immobilien.de/verkauf' },
  { value: 'vermietung', label: 'rgi-immobilien.de/vermietung' },
  { value: 'verwaltung', label: 'rgi-immobilien.de/verwaltung' },
  { value: 'kontakt', label: 'rgi-immobilien.de/kontakt' },
];

/** Kurzfassung einer Folie für die Liste */
export const slideSummary = (slide: Pick<DisplaySlide, 'kind' | 'config'>): string => {
  const c = slide.config || {};
  switch (slide.kind) {
    case 'objekte': {
      const art =
        c.transaction === 'sale' ? 'nur Verkauf'
        : c.transaction === 'rent' ? 'nur Vermietung'
        : 'Verkauf und Vermietung';
      return `${c.count ?? 1} Objekt${(c.count ?? 1) === 1 ? '' : 'e'} · ${art}`;
    }
    case 'referenzen':
      return `${c.count ?? 1} Referenz${(c.count ?? 1) === 1 ? '' : 'en'}`;
    case 'stimme':
      return c.author ? `„…“ – ${c.author}` : 'Noch kein Zitat hinterlegt';
    case 'auftakt':
      return c.image || 'auftakt.jpg';
    default:
      return c.title || SLIDE_LABELS[slide.kind];
  }
};
