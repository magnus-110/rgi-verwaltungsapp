// Dubletten-Prüfung für Edge Functions: sucht über public.aehnliche_kontakte (gleiche Logik wie im Büro-Frontend)
// einen SICHER passenden Kontakt (gleiche E-Mail, gleiche Telefonnummer oder normalisiert gleicher Name).
// Rückgabe: contacts.id oder null. Fehler der Suche blockieren nie das Anlegen.
// deno-lint-ignore no-explicit-any
export async function sichererKontakt(admin: any, e: { name?: string | null; telefon?: string | null; email?: string | null }): Promise<string | null> {
  const leer = (v?: string | null) => (v ?? "").trim() || null;
  if (!leer(e.name) && !leer(e.telefon) && !leer(e.email)) return null;
  const { data, error } = await admin.rpc("aehnliche_kontakte", {
    p_name: leer(e.name),
    p_telefon: leer(e.telefon),
    p_email: leer(e.email),
    p_iban: null,
    p_limit: 5,
  });
  if (error) {
    console.warn("aehnliche_kontakte", error.message);
    return null;
  }
  const treffer = ((data ?? []) as { contact_id: string; sicher: boolean }[]).find((t) => t.sicher);
  return treffer?.contact_id ?? null;
}
