export const SERVICE_PROVIDER_CATEGORIES = [
  { id: "hausmeister", label: "Hausmeister" },
  { id: "heizung", label: "Heizung & Sanitär" },
  { id: "reinigung", label: "Reinigung" },
  { id: "winterdienst", label: "Winterdienst" },
  { id: "elektro", label: "Elektro" },
  { id: "garten", label: "Gartenpflege" },
  { id: "sonstige", label: "Sonstige" },
] as const;

export type ServiceProviderCategoryId = typeof SERVICE_PROVIDER_CATEGORIES[number]["id"];
