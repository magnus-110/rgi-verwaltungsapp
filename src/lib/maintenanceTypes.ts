export interface MaintenanceType {
  key: string;
  label: string;
  category: 'A' | 'B';
  categoryLabel: string;
  defaultIntervalMonths: number;
  defaultLeadTimeDays: number;
  seasonal?: { allowedMonths: number[]; fallbackMonth: number; fallbackDay: number };
  description: string;
}

export const MAINTENANCE_TYPES: MaintenanceType[] = [
  // Kategorie A: Gesetzlich / Pflicht
  {
    key: 'rauchmelder',
    label: 'Rauchwarnmelder',
    category: 'A',
    categoryLabel: 'Gesetzlich / Pflicht',
    defaultIntervalMonths: 12,
    defaultLeadTimeDays: 28,
    description: 'Jährliche Prüfung der Rauchwarnmelder',
  },
  {
    key: 'feuerloescher',
    label: 'Feuerlöscher',
    category: 'A',
    categoryLabel: 'Gesetzlich / Pflicht',
    defaultIntervalMonths: 24,
    defaultLeadTimeDays: 28,
    description: 'Prüfung der Feuerlöscher alle 2 Jahre',
  },
  {
    key: 'aufzug',
    label: 'Aufzug Hauptprüfung',
    category: 'A',
    categoryLabel: 'Gesetzlich / Pflicht',
    defaultIntervalMonths: 24,
    defaultLeadTimeDays: 56,
    description: 'TÜV-Hauptprüfung des Aufzugs',
  },
  {
    key: 'legionellen',
    label: 'Legionellenprüfung',
    category: 'A',
    categoryLabel: 'Gesetzlich / Pflicht',
    defaultIntervalMonths: 36,
    defaultLeadTimeDays: 56,
    description: 'Legionellenprüfung alle 3 Jahre',
  },
  {
    key: 'heizung',
    label: 'Heizungswartung',
    category: 'A',
    categoryLabel: 'Gesetzlich / Pflicht',
    defaultIntervalMonths: 12,
    defaultLeadTimeDays: 42,
    description: 'Jährliche Heizungswartung (idealerweise September)',
  },
  {
    key: 'wasserzaehler',
    label: 'Wasserzähler Eichung',
    category: 'A',
    categoryLabel: 'Gesetzlich / Pflicht',
    defaultIntervalMonths: 72,
    defaultLeadTimeDays: 84,
    description: 'Eichung der Wasserzähler alle 6 Jahre',
  },
  {
    key: 'hebeanlage',
    label: 'Hebeanlage',
    category: 'A',
    categoryLabel: 'Gesetzlich / Pflicht',
    defaultIntervalMonths: 6,
    defaultLeadTimeDays: 14,
    description: 'Wartung der Hebeanlage alle 6 Monate',
  },
  {
    key: 'tiefgaragentore',
    label: 'Tiefgaragentore',
    category: 'A',
    categoryLabel: 'Gesetzlich / Pflicht',
    defaultIntervalMonths: 12,
    defaultLeadTimeDays: 28,
    description: 'Jährliche Prüfung der Tiefgaragentore',
  },
  {
    key: 'energieausweis',
    label: 'Energieausweis',
    category: 'A',
    categoryLabel: 'Gesetzlich / Pflicht',
    defaultIntervalMonths: 120,
    defaultLeadTimeDays: 182,
    description: 'Energieausweis alle 10 Jahre erneuern',
  },
  {
    key: 'gas_hausschau',
    label: 'Gas-Hausschau',
    category: 'A',
    categoryLabel: 'Gesetzlich / Pflicht',
    defaultIntervalMonths: 144,
    defaultLeadTimeDays: 56,
    description: 'Gas-Hausschau alle 12 Jahre',
  },
  // Kategorie B: Empfohlen / Intern
  {
    key: 'rueckspuelfilter',
    label: 'Rückspülfilter',
    category: 'B',
    categoryLabel: 'Empfohlen / Intern',
    defaultIntervalMonths: 2,
    defaultLeadTimeDays: 7,
    description: 'Rückspülfilter alle 2 Monate betätigen',
  },
  {
    key: 'ventile',
    label: 'Ventile gängig machen',
    category: 'B',
    categoryLabel: 'Empfohlen / Intern',
    defaultIntervalMonths: 6,
    defaultLeadTimeDays: 14,
    description: 'Ventile alle 6 Monate gängig machen',
  },
  {
    key: 'dach_rinnen',
    label: 'Dach & Rinnen',
    category: 'B',
    categoryLabel: 'Empfohlen / Intern',
    defaultIntervalMonths: 3,
    defaultLeadTimeDays: 14,
    description: 'Quartalsweise Kontrolle von Dach und Rinnen',
  },
  {
    key: 'objektbegehung',
    label: 'Objektbegehung',
    category: 'B',
    categoryLabel: 'Empfohlen / Intern',
    defaultIntervalMonths: 3,
    defaultLeadTimeDays: 7,
    description: 'Quartalsweise Objektbegehung',
  },
  {
    key: 'baumbeschnitt',
    label: 'Baumbeschnitt',
    category: 'B',
    categoryLabel: 'Empfohlen / Intern',
    defaultIntervalMonths: 12,
    defaultLeadTimeDays: 28,
    seasonal: {
      allowedMonths: [10, 2], // Oktober, Februar
      fallbackMonth: 10,
      fallbackDay: 1,
    },
    description: 'Jährlicher Baumbeschnitt (nur Okt/Feb wegen Vogelschutz)',
  },
];

export function getMaintenanceType(key: string): MaintenanceType | undefined {
  return MAINTENANCE_TYPES.find(t => t.key === key);
}

export function formatInterval(months: number): string {
  if (months >= 12 && months % 12 === 0) {
    const years = months / 12;
    return years === 1 ? '1 Jahr' : `${years} Jahre`;
  }
  return months === 1 ? '1 Monat' : `${months} Monate`;
}

export function formatLeadTime(days: number): string {
  if (days >= 7 && days % 7 === 0) {
    const weeks = days / 7;
    return weeks === 1 ? '1 Woche' : `${weeks} Wochen`;
  }
  if (days >= 30) {
    const months = Math.round(days / 30);
    return months === 1 ? '1 Monat' : `${months} Monate`;
  }
  return days === 1 ? '1 Tag' : `${days} Tage`;
}
