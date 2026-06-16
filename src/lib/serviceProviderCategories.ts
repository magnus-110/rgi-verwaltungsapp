export type ServiceProviderGroup =
  | "haus_aussen"
  | "bau_ausbau"
  | "technik"
  | "sonder"
  | "energie_messdienst"
  | "planung_recht"
  | "sonstige";

export interface ServiceProviderCategory {
  id: string;
  label: string;
  group: ServiceProviderGroup;
  /** Optional Aliase, damit auch mit alten IDs/Schreibweisen gefiltert werden kann */
  aliases?: string[];
}

export const SERVICE_PROVIDER_GROUPS: Record<ServiceProviderGroup, string> = {
  haus_aussen: "Haus & Außen",
  bau_ausbau: "Bau & Ausbau",
  technik: "Technik",
  sonder: "Sondergewerke",
  energie_messdienst: "Energie & Messdienst",
  planung_recht: "Planung & Recht",
  sonstige: "Sonstige",
};

export const SERVICE_PROVIDER_CATEGORIES: ServiceProviderCategory[] = [
  // Haus & Außen
  { id: "hausmeister", label: "Hausmeister", group: "haus_aussen" },
  { id: "reinigung", label: "Reinigung", group: "haus_aussen" },
  { id: "glasreinigung", label: "Glas-/Fassadenreinigung", group: "haus_aussen" },
  { id: "gartenpflege", label: "Gartenpflege", group: "haus_aussen", aliases: ["garten"] },
  { id: "baumpflege", label: "Baumpflege", group: "haus_aussen" },
  { id: "winterdienst", label: "Winterdienst", group: "haus_aussen" },
  { id: "schaedlingsbekaempfung", label: "Schädlingsbekämpfung", group: "haus_aussen" },
  { id: "entruempelung", label: "Entrümpelung / Entsorgung", group: "haus_aussen", aliases: ["entsorgung"] },
  { id: "pflasterbau", label: "Pflaster- / Wegebau", group: "haus_aussen" },

  // Bau & Ausbau
  { id: "maler", label: "Maler / Lackierer", group: "bau_ausbau", aliases: ["lackierer"] },
  { id: "bodenleger", label: "Bodenleger", group: "bau_ausbau" },
  { id: "fliesenleger", label: "Fliesenleger", group: "bau_ausbau" },
  { id: "trockenbau", label: "Trockenbau", group: "bau_ausbau" },
  { id: "zimmerer", label: "Zimmerer", group: "bau_ausbau" },
  { id: "dachdecker", label: "Dachdecker / Spengler", group: "bau_ausbau", aliases: ["spengler"] },
  { id: "maurer", label: "Maurer", group: "bau_ausbau" },
  { id: "stuckateur", label: "Stuckateur", group: "bau_ausbau" },
  { id: "schreiner", label: "Schreinerei / Tischler", group: "bau_ausbau", aliases: ["tischler"] },
  { id: "estrich", label: "Estrich", group: "bau_ausbau" },
  { id: "geruestbau", label: "Gerüstbau", group: "bau_ausbau" },
  { id: "glaser", label: "Glaser / Fenster", group: "bau_ausbau", aliases: ["fenster"] },
  { id: "schlosserei", label: "Schlosserei / Metallbau", group: "bau_ausbau", aliases: ["metallbau"] },
  { id: "tiefbau", label: "Tiefbau / Kanal", group: "bau_ausbau", aliases: ["kanalbau"] },
  { id: "renovierung", label: "Renovierung / Umbau", group: "bau_ausbau" },


  // Technik
  { id: "elektro", label: "Elektro", group: "technik" },
  { id: "heizung", label: "Heizung", group: "technik", aliases: ["heizung_sanitaer"] },
  { id: "sanitaer", label: "Sanitär", group: "technik" },
  { id: "lueftung_klima", label: "Lüftung / Klima", group: "technik" },
  { id: "solar_pv", label: "Solar / Photovoltaik", group: "technik" },
  { id: "smart_home", label: "Smart Home", group: "technik" },
  { id: "aufzug", label: "Aufzug", group: "technik" },
  { id: "tor_tuer", label: "Tor-/Tür-/Schließanlagen", group: "technik" },
  { id: "rollladen_markisen", label: "Rollladen / Markisen / Tore", group: "technik", aliases: ["markisen", "rollladen"] },
  { id: "brandschutz", label: "Brandschutz", group: "technik" },
  { id: "blitzschutz", label: "Blitzschutz", group: "technik" },


  // Sondergewerke
  { id: "rohrreinigung", label: "Rohrreinigung", group: "sonder" },
  { id: "schornsteinfeger", label: "Schornsteinfeger", group: "sonder" },
  { id: "kaminbau", label: "Kaminbau", group: "sonder" },
  { id: "brunnenbau", label: "Brunnenbau", group: "sonder" },
  { id: "pool_spa", label: "Pool / Spa", group: "sonder" },
  { id: "garagentore", label: "Garagentore", group: "sonder" },

  // Energie & Messdienst
  { id: "heizkostenabrechnung", label: "Heizkostenabrechnung", group: "energie_messdienst" },
  { id: "ablesedienst", label: "Ablesedienst", group: "energie_messdienst" },
  { id: "energieberatung", label: "Energieberatung", group: "energie_messdienst" },
  { id: "schornsteinmessung", label: "Schornsteinmessung", group: "energie_messdienst" },

  // Planung & Recht
  { id: "architekt", label: "Architekt", group: "planung_recht" },
  { id: "statiker", label: "Statiker", group: "planung_recht" },
  { id: "energieausweis", label: "Energieausweis", group: "planung_recht" },
  { id: "gutachter", label: "Gutachter / Sachverständiger", group: "planung_recht" },
  { id: "vermesser", label: "Vermesser", group: "planung_recht" },
  { id: "anwalt", label: "Anwalt", group: "planung_recht" },
  { id: "notar", label: "Notar", group: "planung_recht" },
  { id: "steuerberater", label: "Steuerberater", group: "planung_recht" },

  // Sonstige
  { id: "versicherung", label: "Versicherung / Versicherungsmakler", group: "sonstige", aliases: ["versicherungsmakler"] },
  { id: "notdienst", label: "Notdienst", group: "sonstige" },
  { id: "bank", label: "Bank", group: "sonstige" },
  { id: "lieferant", label: "Lieferant", group: "sonstige" },
  { id: "elektro_sonstige", label: "Sonstige", group: "sonstige", aliases: ["sonstige"] },

];

export const getCategoryLabel = (id: string): string =>
  SERVICE_PROVIDER_CATEGORIES.find((c) => c.id === id || c.aliases?.includes(id))?.label || id;

export type ServiceProviderCategoryId = typeof SERVICE_PROVIDER_CATEGORIES[number]["id"];
