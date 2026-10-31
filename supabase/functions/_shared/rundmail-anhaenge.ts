// Rundmails (comm_campaigns type='email'): Empfänger und persönliche Anhänge serverseitig
// genau so speichern, wie es der Rundmail-Editor der App tut (BulkMailEditor/useBulkRecipients).
// Schlüssel je Empfänger: `${assignment_id}|${email_lowercase}`; persönliche Anhänge stehen in
// comm_recipient_overrides.attachment_paths (Bucket comm-assets).
// Gleiche Logik steckt im Claude-Konnektor (rgi-connector/rundmail.ts) – Änderungen dort mitziehen.

const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

/** Wie _shared/sanitize-email.ts bzw. src/lib/extractEmails: gültige Adressen aus einem Feld. */
export function emailsAus(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .replace(/[^,;\s]*<\s*([^>]+?)\s*>/g, "$1")
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .split(/[,;\s\/]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && EMAIL_RE.test(s));
}

/** Einheitennummer ohne führende Nullen ("0005" -> "5"), wie normalizeUnit in der App. */
export const einheitKey = (u: string | null | undefined): string | null => {
  if (!u) return null;
  const d = String(u).match(/\d+/)?.[0];
  return d ? String(Number(d)) : String(u).trim().toLowerCase();
};

export type RundmailEmpfaenger = {
  key: string; assignment_id: string; contact_id: string; einheit: string | null; einheit_key: string | null;
  rolle: string | null; name: string; email: string;
};

/** Empfänger wie im Rundmail-Editor: je Zuordnung und E-Mail-Adresse ein Eintrag. */
export async function rundmailEmpfaenger(db: any, building_id: string, rolle = "alle") {
  const { data: rows, error } = await db
    .from("contact_building_assignments")
    .select("id, contact_id, unit_number, role_in_building, contacts(first_name, last_name, company_name)")
    .eq("building_id", building_id)
    .or("is_active.is.null,is_active.eq.true");
  if (error) throw error;
  const zuord = (rows ?? []).filter((a: any) => {
    const r = String(a.role_in_building ?? "").toLowerCase();
    return rolle === "alle" ? r !== "dienstleister" : r === rolle;
  });
  const mitEmail: RundmailEmpfaenger[] = [];
  const ohneEmail: { einheit: string | null; name: string }[] = [];
  const ids = [...new Set(zuord.map((a: any) => a.contact_id))];
  if (!ids.length) return { mitEmail, ohneEmail };
  const [{ data: ce }, { data: cp }] = await Promise.all([
    db.from("contact_emails").select("contact_id, email, is_primary").in("contact_id", ids),
    db.from("contact_persons").select("contact_id, email, is_primary").in("contact_id", ids),
  ]);
  const proKontakt = new Map<string, string[]>();
  const add = (c: string, e: string) => {
    const arr = proKontakt.get(c) ?? [];
    if (!arr.some((x) => x.toLowerCase() === e.toLowerCase())) arr.push(e);
    proKontakt.set(c, arr);
  };
  const prim = (a: any, b: any) => Number(!!b.is_primary) - Number(!!a.is_primary);
  [...(ce ?? [])].sort(prim).forEach((r: any) => emailsAus(r.email).forEach((e) => add(r.contact_id, e)));
  [...(cp ?? [])].sort(prim).forEach((p: any) => emailsAus(p.email).forEach((e) => add(p.contact_id, e)));
  for (const a of zuord as any[]) {
    const c = a.contacts;
    const name = c?.company_name || `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim() || "(ohne Name)";
    const mails = proKontakt.get(a.contact_id) ?? [];
    if (!mails.length) { ohneEmail.push({ einheit: a.unit_number ?? null, name }); continue; }
    for (const e of mails) {
      mitEmail.push({
        key: `${a.id}|${e.toLowerCase()}`, assignment_id: a.id, contact_id: a.contact_id, einheit: a.unit_number ?? null,
        einheit_key: einheitKey(a.unit_number), rolle: a.role_in_building ?? null, name, email: e,
      });
    }
  }
  return { mitEmail, ohneEmail };
}

/** Rundmail laden – Änderungen nur an Entwürfen. */
export async function rundmailEntwurfLaden(db: any, campaign_id: string) {
  const { data: c, error } = await db
    .from("comm_campaigns")
    .select("id, name, type, status, building_id, recipient_filter, attachment_paths")
    .eq("id", campaign_id)
    .maybeSingle();
  if (error || !c) throw new Error("Rundmail nicht gefunden");
  if (c.type !== "email") throw new Error("Das ist keine Rundmail (E-Mail-Kampagne)");
  if (c.status !== "draft") throw new Error(`Rundmail ist kein Entwurf mehr (Status: ${c.status}) – Änderungen nur an Entwürfen`);
  return c;
}

async function objektVorhanden(db: any, bucket: string, path: string): Promise<boolean> {
  const i = path.lastIndexOf("/");
  const name = path.slice(i + 1);
  const { data } = await db.storage.from(bucket).list(path.slice(0, i), { search: name, limit: 100 });
  return (data ?? []).some((x: any) => x.name === name);
}

/**
 * Hängt Dateien aus comm-assets (campaigns/<id>/personal|attachments/...) an die Rundmail.
 * Persönliche Anhänge werden über die Einheitennummer am Dateianfang zugeordnet
 * ("0005-0006_..." -> alle Adressen der Einheiten 5 und 6), alternativ über einheiten/emails.
 */
export async function rundmailAnhaengeZuordnen(
  db: any,
  campaign_id: string,
  dateien: { path: string; art?: "persoenlich" | "alle"; einheiten?: string[]; emails?: string[] }[],
) {
  const camp = await rundmailEntwurfLaden(db, campaign_id);
  const filter = (camp.recipient_filter ?? {}) as Record<string, any>;
  const keys: string[] = [...(filter.recipient_keys ?? [])];
  const keysVorher = keys.length;
  const { mitEmail } = await rundmailEmpfaenger(db, camp.building_id, "alle");

  // Je Adresse der bereits ausgewählte Schlüssel (der Editor fasst gleiche Adressen zusammen)
  const keyNachEmail = new Map<string, string>();
  for (const k of keys) {
    const em = k.split("|")[1];
    if (em && !keyNachEmail.has(em)) keyNachEmail.set(em, k);
  }
  const allgemein: string[] = [...(camp.attachment_paths ?? [])];
  const allgemeinVorher = allgemein.length;
  const neu = new Map<string, string[]>();
  const ergebnisse: any[] = [];

  for (const f of dateien) {
    const path = String(f.path);
    if (!path.startsWith(`campaigns/${campaign_id}/`)) { ergebnisse.push({ ok: false, path, fehler: "Pfad gehört nicht zu dieser Rundmail" }); continue; }
    if (!(await objektVorhanden(db, "comm-assets", path))) { ergebnisse.push({ ok: false, path, fehler: "Datei nicht im Speicher" }); continue; }
    const dateiname = (path.split("/").pop() ?? path).replace(/^\d{13}_/, "");
    const art = f.art ?? (path.includes("/attachments/") ? "alle" : "persoenlich");
    if (art === "alle") {
      if (!allgemein.includes(path)) allgemein.push(path);
      ergebnisse.push({ ok: true, dateiname, art: "alle" });
      continue;
    }
    let ziele: RundmailEmpfaenger[];
    if (f.emails?.length) {
      const s = new Set(f.emails.map((e) => e.trim().toLowerCase()));
      ziele = mitEmail.filter((r) => s.has(r.email.toLowerCase()));
    } else {
      const einh: string[] = f.einheiten?.length ? f.einheiten : (dateiname.match(/^\s*(\d+(?:\s*-\s*\d+)*)\s*[_\-. ]/)?.[1]?.split("-") ?? []);
      const s = new Set(einh.map((u) => einheitKey(u)).filter(Boolean));
      ziele = mitEmail.filter((r) => r.einheit_key && s.has(r.einheit_key));
    }
    if (!ziele.length) { ergebnisse.push({ ok: false, dateiname, fehler: "Kein Empfänger mit E-Mail gefunden" }); continue; }
    const an = new Set<string>();
    for (const r of ziele) {
      const em = r.email.toLowerCase();
      let k = keyNachEmail.get(em);
      if (!k) { k = r.key; keys.push(k); keyNachEmail.set(em, k); }
      const arr = neu.get(k) ?? [];
      if (!arr.includes(path)) arr.push(path);
      neu.set(k, arr);
      an.add(r.email);
    }
    ergebnisse.push({ ok: true, dateiname, art: "persoenlich", an: [...an] });
  }

  const { data: ovRows, error: oErr } = await db.from("comm_recipient_overrides").select("id, assignment_id, email, attachment_paths").eq("campaign_id", campaign_id);
  if (oErr) throw oErr;
  const ovNachKey = new Map<string, any>();
  for (const o of ovRows ?? []) ovNachKey.set(`${o.assignment_id}|${String(o.email ?? "").toLowerCase()}`, o);
  const kontaktNachZuordnung = new Map(mitEmail.map((r) => [r.assignment_id, r.contact_id]));
  for (const [k, paths] of neu) {
    const [assignment_id, email] = k.split("|");
    const vorhanden = ovNachKey.get(k);
    if (vorhanden) {
      const merged = [...(vorhanden.attachment_paths ?? [])];
      for (const p of paths) if (!merged.includes(p)) merged.push(p);
      const { error } = await db.from("comm_recipient_overrides").update({ attachment_paths: merged }).eq("id", vorhanden.id);
      if (error) throw new Error(`Anhang konnte nicht gespeichert werden: ${error.message}`);
    } else {
      let contact_id = kontaktNachZuordnung.get(assignment_id);
      if (!contact_id) {
        const { data: z } = await db.from("contact_building_assignments").select("contact_id").eq("id", assignment_id).maybeSingle();
        contact_id = z?.contact_id;
      }
      if (!contact_id) throw new Error(`Zuordnung ${assignment_id} nicht gefunden`);
      const { error } = await db.from("comm_recipient_overrides").insert({ campaign_id, contact_id, assignment_id, email, attachment_paths: paths });
      if (error) throw new Error(`Anhang konnte nicht gespeichert werden: ${error.message}`);
    }
  }

  if (keys.length !== keysVorher || allgemein.length !== allgemeinVorher) {
    const { error } = await db.from("comm_campaigns")
      .update({ attachment_paths: allgemein, recipient_filter: { ...filter, recipient_keys: keys }, recipient_count: keys.length })
      .eq("id", campaign_id).eq("status", "draft");
    if (error) throw new Error(`Rundmail konnte nicht aktualisiert werden: ${error.message}`);
  }

  const { data: nachher } = await db.from("comm_recipient_overrides").select("email, attachment_paths").eq("campaign_id", campaign_id);
  const mitAnhang = new Set((nachher ?? []).filter((o: any) => (o.attachment_paths ?? []).length > 0).map((o: any) => String(o.email ?? "").toLowerCase()));
  const ausgewaehlt = [...new Set(keys.map((k) => k.split("|")[1]).filter(Boolean))];
  const ohne = ausgewaehlt.filter((e) => !mitAnhang.has(e));
  return {
    zugeordnet: ergebnisse.filter((x) => x.ok).length,
    fehlgeschlagen: ergebnisse.filter((x) => !x.ok).length,
    ergebnisse,
    ausgewaehlte_empfaenger: ausgewaehlt.length,
    mit_persoenlichem_anhang: ausgewaehlt.length - ohne.length,
    ohne_persoenlichen_anhang: ohne,
    allgemeine_anhaenge: allgemein.map((p) => (p.split("/").pop() ?? p).replace(/^\d{13}_/, "")),
  };
}

/**
 * Entfernt persönliche Anhänge einer Rundmail, deren Dateiname zum Muster passt
 * (z. B. ältere Einladungen, bevor neue angehängt werden), und löscht die Dateien.
 */
export async function rundmailPersoenlicheAnhaengeEntfernen(db: any, campaign_id: string, muster: RegExp): Promise<string[]> {
  await rundmailEntwurfLaden(db, campaign_id);
  const { data: rows, error } = await db.from("comm_recipient_overrides").select("id, attachment_paths, subject, body_html").eq("campaign_id", campaign_id);
  if (error) throw error;
  const entfernt = new Set<string>();
  for (const o of rows ?? []) {
    const alt: string[] = o.attachment_paths ?? [];
    const treffer = (p: string) => p.includes("/personal/") && muster.test((p.split("/").pop() ?? "").replace(/^\d{13}_/, ""));
    const bleibt = alt.filter((p) => !treffer(p));
    if (bleibt.length === alt.length) continue;
    alt.filter(treffer).forEach((p) => entfernt.add(p));
    if (!bleibt.length && !o.subject && !o.body_html) {
      await db.from("comm_recipient_overrides").delete().eq("id", o.id);
    } else {
      await db.from("comm_recipient_overrides").update({ attachment_paths: bleibt }).eq("id", o.id);
    }
  }
  const pfade = [...entfernt].filter((p) => p.startsWith(`campaigns/${campaign_id}/`));
  if (pfade.length) await db.storage.from("comm-assets").remove(pfade);
  return pfade;
}
