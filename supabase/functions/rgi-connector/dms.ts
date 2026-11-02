// DMS-Verwaltung für den Konnektor: Ordner anlegen, Dokumente verschieben,
// Dokumente in den Papierkorb legen und wiederherstellen.
// Löschen = Papierkorb wie in der App (building_files.deleted_at), die Datei bleibt im Speicher.

type Deps = {
  db: any;
  log: (tool: string, d: Record<string, unknown>) => Promise<void>;
  uploaderId: (email?: string) => Promise<string>;
};

const S = (props: Record<string, any>, required: string[] = []) => ({ type: "object", properties: props, required, additionalProperties: false });
const str = (d: string) => ({ type: "string", description: d });
const uuid = (d: string) => ({ type: "string", format: "uuid", description: d });
const idListe = (d: string) => ({ type: "array", items: { type: "string", format: "uuid" }, minItems: 1, maxItems: 100, description: d });

export function dmsTools({ db, log, uploaderId }: Deps) {
  // DMS-Ordner eines Gebäudes mit Pfad. Objektbezogene Ordner unabhängig vom Verwaltungsmodus
  // (wie im Ordnerbaum der App), allgemeine Kategorien passend zum Modus des Gebäudes.
  async function ordnerListe(building_id: string) {
    const { data: g } = await db.from("buildings").select("management_mode").eq("id", building_id).maybeSingle();
    const felder = "id, name, parent_id, building_id, slug, sort_order";
    const { data: eigene, error: e1 } = await db.from("building_file_categories").select(felder).eq("building_id", building_id).is("archived_at", null);
    if (e1) throw e1;
    let qa = db.from("building_file_categories").select(felder).is("building_id", null).is("archived_at", null).eq("is_company", false);
    if (g?.management_mode) qa = qa.or(`management_mode.is.null,management_mode.eq.${g.management_mode}`);
    const { data: allg, error: e2 } = await qa;
    if (e2) throw e2;
    const alle = [...(eigene ?? []), ...(allg ?? [])] as any[];
    const byId = new Map(alle.map((c) => [c.id, c]));
    const pfad = (c: any): string[] => { const out: string[] = []; let x = c; let i = 0; while (x && i++ < 10) { out.unshift(x.name); x = x.parent_id ? byId.get(x.parent_id) : null; } return out; };
    const sortKey = (c: any): string => { const out: string[] = []; let x = c; let i = 0; while (x && i++ < 10) { out.unshift(String(x.sort_order ?? 0).padStart(5, "0") + x.name); x = x.parent_id ? byId.get(x.parent_id) : null; } return (c.building_id ? "0" : "1") + out.join("/"); };
    return alle.sort((a, b) => sortKey(a).localeCompare(sortKey(b))).map((c) => ({
      id: c.id, name: c.name, pfad: pfad(c).join(" › "), parent_id: c.parent_id, objektbezogen: !!c.building_id, slug: c.slug,
    }));
  }

  // Dokumente mit Gebäude- und Ordnerangabe für Vorschau/Ergebnis
  async function dokumenteLaden(ids: string[], geloescht: boolean) {
    let q = db.from("building_files").select("id, building_id, display_name, category_id, created_at, deleted_at, source, buildings(name)").in("id", ids);
    q = geloescht ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
    const { data, error } = await q;
    if (error) throw error;
    const files = (data ?? []) as any[];
    const pfade = new Map<string, string>();
    for (const b of new Set(files.map((f) => f.building_id))) {
      for (const o of await ordnerListe(b as string)) pfade.set(o.id, o.pfad);
    }
    return files.map((f) => ({
      id: f.id, building_id: f.building_id, gebaeude: f.buildings?.name ?? null, anzeigename: f.display_name,
      ordner: f.category_id ? pfade.get(f.category_id) ?? null : null, category_id: f.category_id,
      angelegt_am: f.created_at, geloescht_am: f.deleted_at, quelle: f.source,
    }));
  }

  return [
    {
      name: "dms_ordner_anlegen",
      description: "Legt im DMS eines Gebäudes einen neuen Ordner an – als Unterordner (parent_id aus dms_kategorien, nur objektbezogene Ordner) oder auf oberster Ebene. Gibt es unter demselben Ordner schon einen gleichnamigen, wird dieser zurückgegeben statt doppelt angelegt. Symbol und Farbe werden vom übergeordneten Ordner übernommen.",
      inputSchema: S({
        building_id: uuid("Gebäude"),
        name: str("Ordnername, z. B. 'Kontaktlisten / Ansprechpartner'"),
        parent_id: uuid("Übergeordneter Ordner (optional, sonst oberste Ebene)"),
        mitarbeiter_email: str("optional, für das Protokoll"),
      }, ["building_id", "name"]),
      run: async ({ building_id, name, parent_id, mitarbeiter_email }: any) => {
        const n = String(name ?? "").trim().replace(/\s+/g, " ");
        if (!n) throw new Error("Bitte einen Ordnernamen angeben");
        if (n.length > 120) throw new Error("Ordnername zu lang (max. 120 Zeichen)");
        const { data: geb } = await db.from("buildings").select("id, name, management_mode").eq("id", building_id).maybeSingle();
        if (!geb) throw new Error("Gebäude nicht gefunden");
        let parent: any = null;
        if (parent_id) {
          const { data } = await db.from("building_file_categories").select("id, name, building_id, management_mode, icon, color, archived_at").eq("id", parent_id).maybeSingle();
          if (!data || data.archived_at) throw new Error("Übergeordneter Ordner nicht gefunden");
          if (data.building_id !== building_id) throw new Error("Unterordner können nur unter objektbezogenen Ordnern dieses Gebäudes angelegt werden (siehe dms_kategorien, building_id gesetzt)");
          parent = data;
        }
        let gleiche = db.from("building_file_categories").select("id, name").eq("building_id", building_id).is("archived_at", null).ilike("name", n);
        gleiche = parent ? gleiche.eq("parent_id", parent.id) : gleiche.is("parent_id", null);
        const { data: vorhanden } = await gleiche.limit(1);
        const pfadVon = async (id: string) => (await ordnerListe(building_id)).find((o) => o.id === id)?.pfad ?? n;
        if (vorhanden?.length) return { angelegt: false, hinweis: "Ordner gibt es bereits", id: vorhanden[0].id, name: vorhanden[0].name, pfad: await pfadVon(vorhanden[0].id) };
        let geschwister = db.from("building_file_categories").select("sort_order").eq("building_id", building_id);
        geschwister = parent ? geschwister.eq("parent_id", parent.id) : geschwister.is("parent_id", null);
        const { data: sib } = await geschwister;
        const nextSort = (sib ?? []).reduce((m: number, c: any) => Math.max(m, c.sort_order || 0), 0) + 10;
        const row: Record<string, unknown> = {
          name: n, parent_id: parent?.id ?? null, building_id,
          management_mode: parent?.management_mode ?? geb.management_mode ?? "weg",
          sort_order: nextSort, is_recommended: false, auto_rag_enabled: false,
        };
        if (parent?.icon) row.icon = parent.icon;
        if (parent?.color) row.color = parent.color;
        const { data: neu, error } = await db.from("building_file_categories").insert(row).select("id, name").single();
        if (error) throw new Error(`Ordner anlegen fehlgeschlagen: ${error.message}`);
        await log("dms_ordner_anlegen", { building_id, id: neu.id, name: n, parent_id: parent?.id ?? null, mitarbeiter: mitarbeiter_email ?? null });
        return { angelegt: true, id: neu.id, name: neu.name, gebaeude: geb.name, pfad: await pfadVon(neu.id) };
      },
    },
    {
      name: "dms_dokumente_verschieben",
      description: "Verschiebt DMS-Dokumente in einen anderen Ordner (kategorie_id aus dms_kategorien) und kann bei einem einzelnen Dokument zusätzlich Anzeigename und Beschreibung ändern. Nur innerhalb desselben Gebäudes.",
      inputSchema: S({
        file_ids: idListe("building_files.id"),
        kategorie_id: uuid("Zielordner"),
        anzeigename: str("optional, nur bei genau einem Dokument"),
        beschreibung: str("optional, nur bei genau einem Dokument"),
        mitarbeiter_email: str("optional, für das Protokoll"),
      }, ["file_ids", "kategorie_id"]),
      run: async ({ file_ids, kategorie_id, anzeigename, beschreibung, mitarbeiter_email }: any) => {
        const ids = [...new Set(file_ids as string[])];
        if ((anzeigename || beschreibung) && ids.length !== 1) throw new Error("Anzeigename/Beschreibung nur bei genau einem Dokument ändern");
        const { data: kat } = await db.from("building_file_categories").select("id, name, building_id, archived_at").eq("id", kategorie_id).maybeSingle();
        if (!kat || kat.archived_at) throw new Error("Zielordner nicht gefunden");
        const { data: files, error: fErr } = await db.from("building_files").select("id, building_id, display_name, category_id").in("id", ids).is("deleted_at", null);
        if (fErr) throw fErr;
        if ((files ?? []).length !== ids.length) throw new Error("Mindestens ein Dokument wurde nicht gefunden");
        const gebs = new Set((files ?? []).map((f: any) => f.building_id));
        if (gebs.size !== 1) throw new Error("Bitte nur Dokumente eines Gebäudes gemeinsam verschieben");
        const building_id = [...gebs][0] as string;
        if (kat.building_id && kat.building_id !== building_id) throw new Error("Zielordner gehört zu einem anderen Gebäude");
        const upd: Record<string, unknown> = { category_id: kategorie_id };
        if (anzeigename) upd.display_name = String(anzeigename).trim();
        if (beschreibung !== undefined && beschreibung !== null && beschreibung !== "") upd.description = beschreibung;
        const { error } = await db.from("building_files").update(upd).in("id", ids);
        if (error) throw new Error(`Verschieben fehlgeschlagen: ${error.message}`);
        const user_id = await uploaderId(mitarbeiter_email);
        await db.from("building_file_activity").insert((files ?? []).map((f: any) => ({ file_id: f.id, user_id, action: "move", details: { via: "claude-connector", von: f.category_id, nach: kategorie_id } }))).then(() => {}, () => {});
        await log("dms_dokumente_verschieben", { building_id, anzahl: ids.length, kategorie_id, mitarbeiter: mitarbeiter_email ?? null });
        const pfad = (await ordnerListe(building_id)).find((o) => o.id === kategorie_id)?.pfad ?? kat.name;
        return { verschoben: ids.length, ordner: pfad, dokumente: (files ?? []).map((f: any) => ({ id: f.id, anzeigename: ids.length === 1 && anzeigename ? upd.display_name : f.display_name })) };
      },
    },
    {
      name: "dms_dokumente_loeschen",
      description: "Legt DMS-Dokumente in den Papierkorb (wie 'Löschen' in der App; mit dms_dokumente_wiederherstellen rückgängig zu machen). WICHTIG: Zuerst ohne bestaetigt aufrufen – das liefert nur eine Vorschau (Name, Gebäude, Ordner). Diese dem Nutzer zeigen und erst nach seiner ausdrücklichen Zustimmung mit bestaetigt=true erneut aufrufen.",
      inputSchema: S({
        file_ids: idListe("building_files.id (aus dms_suchen)"),
        bestaetigt: { type: "boolean", description: "Erst true nach ausdrücklicher Zustimmung des Nutzers (Standard: false = nur Vorschau)" },
        grund: str("optional, z. B. 'ersetzt durch neuen VS-Schein' – wird im Protokoll vermerkt"),
        mitarbeiter_email: str("optional, für das Protokoll"),
      }, ["file_ids"]),
      annotations: { destructiveHint: true },
      run: async ({ file_ids, bestaetigt, grund, mitarbeiter_email }: any) => {
        const ids = [...new Set(file_ids as string[])];
        const docs = await dokumenteLaden(ids, false);
        const fehlend = ids.filter((id) => !docs.some((d) => d.id === id));
        if (!bestaetigt) {
          return {
            status: "VORSCHAU – nichts gelöscht",
            in_papierkorb: docs.map(({ id, gebaeude, ordner, anzeigename, angelegt_am }) => ({ id, gebaeude, ordner, anzeigename, angelegt_am })),
            nicht_gefunden: fehlend,
            hinweis: "Dem Nutzer zeigen und nur nach ausdrücklicher Zustimmung mit bestaetigt=true erneut aufrufen.",
          };
        }
        if (!docs.length) throw new Error("Keine der angegebenen Dokumente gefunden (bereits gelöscht?)");
        const jetzt = new Date().toISOString();
        const treffer = docs.map((d) => d.id);
        const { error } = await db.from("building_files").update({ deleted_at: jetzt }).in("id", treffer).is("deleted_at", null);
        if (error) throw new Error(`Löschen fehlgeschlagen: ${error.message}`);
        const user_id = await uploaderId(mitarbeiter_email);
        await db.from("building_file_activity").insert(treffer.map((id) => ({ file_id: id, user_id, action: "deleted", details: { via: "claude-connector", grund: grund ?? null } }))).then(() => {}, () => {});
        await log("dms_dokumente_loeschen", { file_ids: treffer, anzahl: treffer.length, grund: grund ?? null, mitarbeiter: mitarbeiter_email ?? null });
        return {
          status: "IN DEN PAPIERKORB VERSCHOBEN",
          geloescht: docs.map(({ id, gebaeude, ordner, anzeigename }) => ({ id, gebaeude, ordner, anzeigename })),
          nicht_gefunden: fehlend,
          hinweis: "Rückgängig mit dms_dokumente_wiederherstellen (file_ids).",
        };
      },
    },
    {
      name: "dms_dokumente_wiederherstellen",
      description: "Holt DMS-Dokumente aus dem Papierkorb zurück (hebt dms_dokumente_loeschen bzw. 'Löschen' in der App auf). Ohne file_ids, aber mit building_id: listet die Dokumente im Papierkorb des Gebäudes.",
      inputSchema: S({
        file_ids: { type: "array", items: { type: "string", format: "uuid" }, maxItems: 100, description: "building_files.id" },
        building_id: uuid("optional: Papierkorb dieses Gebäudes auflisten"),
        mitarbeiter_email: str("optional, für das Protokoll"),
      }),
      run: async ({ file_ids, building_id, mitarbeiter_email }: any) => {
        const ids = [...new Set((file_ids ?? []) as string[])];
        if (!ids.length) {
          if (!building_id) throw new Error("Bitte file_ids oder building_id angeben");
          const { data, error } = await db.from("building_files").select("id, display_name, category_id, deleted_at").eq("building_id", building_id).not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(100);
          if (error) throw error;
          return { papierkorb: data ?? [] };
        }
        const docs = await dokumenteLaden(ids, true);
        if (!docs.length) throw new Error("Keine der angegebenen Dokumente liegt im Papierkorb");
        const treffer = docs.map((d) => d.id);
        const { error } = await db.from("building_files").update({ deleted_at: null }).in("id", treffer);
        if (error) throw new Error(`Wiederherstellen fehlgeschlagen: ${error.message}`);
        const user_id = await uploaderId(mitarbeiter_email);
        await db.from("building_file_activity").insert(treffer.map((id) => ({ file_id: id, user_id, action: "restored", details: { via: "claude-connector" } }))).then(() => {}, () => {});
        await log("dms_dokumente_wiederherstellen", { file_ids: treffer, mitarbeiter: mitarbeiter_email ?? null });
        return {
          wiederhergestellt: docs.map(({ id, gebaeude, ordner, anzeigename }) => ({ id, gebaeude, ordner, anzeigename })),
          nicht_im_papierkorb: ids.filter((id) => !treffer.includes(id)),
        };
      },
    },
  ];
}
