/**
 * Zuletzt gewählte Liegenschaft bei den Zahlungen – damit man sie nicht bei
 * jedem Zwischenschritt (Hausgeld ändern, neuer Auftrag, zurück zur Liste)
 * neu auswählen muss. Gilt für den geöffneten Browser-Tab.
 */
const SCHLUESSEL = "rgi_zahlungen_gebaeude";

export function gemerktesGebaeude(): string | null {
  try {
    return sessionStorage.getItem(SCHLUESSEL);
  } catch {
    return null;
  }
}

export function gebaeudeMerken(id: string | null | undefined) {
  try {
    if (id && id !== "all" && id !== "company") sessionStorage.setItem(SCHLUESSEL, id);
    else sessionStorage.removeItem(SCHLUESSEL);
  } catch {
    /* ohne Speicher geht es auch */
  }
}
