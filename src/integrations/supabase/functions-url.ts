// Zentrale Basis-URL für direkte Edge-Function-Aufrufe (fetch).
//
// Hintergrund: Die .env ist seit dem Security-Commit (b3b4cdf2, 14.07.2026)
// nicht mehr im Repository. Dadurch fehlte VITE_SUPABASE_PROJECT_ID im
// Production-Build und alle URLs wurden zu "https://undefined.supabase.co/..."
// → "Failed to fetch" bei allen Vorlagen-Downloads (Einzel-/Gesamtabrechnung,
// Wirtschaftsplan, §35a-Bescheinigungen).
//
// Die Env-Variable wird weiterhin berücksichtigt (lokale Entwicklung),
// der Fallback muss mit src/integrations/supabase/client.ts übereinstimmen.
const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "eebphowrbarzawwixqcc";

export const SUPABASE_FUNCTIONS_URL = `https://${projectId}.supabase.co/functions/v1`;
