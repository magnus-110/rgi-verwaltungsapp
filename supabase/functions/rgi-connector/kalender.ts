// Kalender der VerwaltungsApp über den Claude-Konnektor – gleiche Tabellen wie der Kalender der App
// (calendar_events mit Teilnehmern und Gebäuden; Aufgaben mit Fälligkeit erscheinen dort ebenfalls).
//   kalender_optionen   Mitarbeiter und Kategorien für Termine
//   kalender_lesen      Termine (und auf Wunsch fällige Aufgaben) eines Zeitraums
//   termin_speichern    Termin anlegen oder ändern – Zeiten immer deutsche Ortszeit (Europe/Berlin)

type Tool = { name: string; description: string; inputSchema: any; annotations?: any; run: (a: any) => Promise<unknown> };
type Deps = {
  db: any;
  log: (tool: string, d: Record<string, unknown>) => Promise<void>;
  uploaderId: (email?: string) => Promise<string>;
};

const S = (props: Record<string, any>, required: string[] = []) => ({ type: "object", properties: props, required, additionalProperties: false });
const str = (d: string) => ({ type: "string", description: d });
const uuid = (d: string) => ({ type: "string", format: "uuid", description: d });
const datum = (d: string) => ({ type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: `${d} (JJJJ-MM-TT)` });
const zeit = (d: string) => ({ type: "string", pattern: "^\\d{1,2}:\\d{2}$", description: `${d} (HH:MM, deutsche Ortszeit)` });

const TZ = "Europe/Berlin";
const PRIO: Record<string, string> = { low: "niedrig", medium: "mittel", high: "hoch", urgent: "dringend" };

/** Abstand Berlin–UTC in Minuten zu einem Zeitpunkt (Sommer-/Winterzeit) */
function berlinOffset(ms: number): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ms) / 60000;
}
/** Datum + Uhrzeit in Berliner Ortszeit → UTC-Zeitpunkt */
export function berlinZeitpunkt(tag: string, uhrzeit = "00:00"): Date {
  const [y, m, d] = tag.split("-").map(Number);
  const [h, mi] = uhrzeit.split(":").map(Number);
  if (!y || !m || !d || h > 23 || mi > 59) throw new Error(`Ungültige Angabe: ${tag} ${uhrzeit}`);
  const lokal = Date.UTC(y, m - 1, d, h, mi);
  let ms = lokal - berlinOffset(lokal) * 60000;
  ms = lokal - berlinOffset(ms) * 60000; // Umstellungstag
  return new Date(ms);
}
const anzeige = (iso: string | null, mitZeit = true) => iso
  ? new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", ...(mitZeit ? { hour: "2-digit", minute: "2-digit" } : {}) }).format(new Date(iso))
  : null;
const heute = () => new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
const plusTage = (tag: string, n: number) => { const d = new Date(`${tag}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const name = (p: any) => [p?.first_name, p?.last_name].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

export function kalenderTools(d: Deps): Tool[] {
  const { db, log } = d;

  async function team() {
    const { data, error } = await db.from("profiles").select("user_id, first_name, last_name, email, role").in("role", ["admin", "employee"]);
    if (error) throw error;
    return data ?? [];
  }
  async function nutzerIds(emails: string[]): Promise<string[]> {
    const t = await team();
    return emails.map((e) => {
      const p = t.find((x: any) => String(x.email ?? "").toLowerCase() === e.trim().toLowerCase());
      if (!p) throw new Error(`Kein Mitarbeiter mit der E-Mail ${e} (siehe kalender_optionen)`);
      return p.user_id;
    });
  }
  async function kategorieId(k?: string): Promise<string | null | undefined> {
    if (k === undefined) return undefined;
    if (!k) return null;
    const { data } = await db.from("todo_categories").select("id, name");
    const treffer = (data ?? []).find((c: any) => c.id === k || c.name.toLowerCase() === k.trim().toLowerCase());
    if (!treffer) throw new Error(`Kategorie „${k}“ nicht gefunden (siehe kalender_optionen)`);
    return treffer.id;
  }

  const FELDER = "id, title, description, start_datetime, end_datetime, is_all_day, todo_id, category:todo_categories(name), assignees:calendar_event_assignees(user:profiles(user_id, first_name, last_name, email)), buildings:calendar_event_buildings(building:buildings(id, name)), todo:todos(task_number)";

  async function termineLesen(von: Date, bis: Date) {
    const { data, error } = await db.from("calendar_events")
      .select(FELDER)
      .gte("start_datetime", von.toISOString()).lte("start_datetime", bis.toISOString()).order("start_datetime");
    if (error) throw error;
    return data ?? [];
  }

  function terminAusgabe(e: any) {
    return {
      termin_id: e.id, titel: e.title,
      beginn: anzeige(e.start_datetime, !e.is_all_day), ende: e.is_all_day ? null : anzeige(e.end_datetime),
      ganztaegig: e.is_all_day, beschreibung: e.description || undefined, kategorie: e.category?.name ?? undefined,
      teilnehmer: (e.assignees ?? []).map((a: any) => name(a.user)).filter(Boolean),
      gebaeude: (e.buildings ?? []).map((b: any) => b.building?.name).filter(Boolean),
      aufgabe: e.todo?.task_number ?? undefined,
    };
  }

  return [
    {
      name: "kalender_optionen",
      description: "Listet die Mitarbeiter (Name, E-Mail) und Kategorien, die für Termine im Kalender der App verwendet werden können.",
      inputSchema: S({}),
      annotations: { readOnlyHint: true },
      run: async () => {
        const { data: kat } = await db.from("todo_categories").select("name").order("name");
        return {
          mitarbeiter: (await team()).map((p: any) => ({ name: name(p), email: p.email })),
          kategorien: (kat ?? []).map((c: any) => c.name),
        };
      },
    },
    {
      name: "kalender_lesen",
      description: "Liefert die Termine aus dem Kalender der App für einen Zeitraum (Standard: heute bis 14 Tage), optional nur für einen Mitarbeiter oder ein Gebäude. Wie im App-Kalender kommen offene Aufgaben mit Fälligkeit dazu (aufgaben=false blendet sie aus). Zeiten in deutscher Ortszeit.",
      inputSchema: S({
        von: datum("Beginn (Standard heute)"),
        bis: datum("Ende einschließlich (Standard von + 14 Tage)"),
        mitarbeiter_email: str("optional: nur Termine/Aufgaben dieses Mitarbeiters"),
        building_id: uuid("optional: nur Termine/Aufgaben zu diesem Gebäude"),
        aufgaben: { type: "boolean", description: "fällige Aufgaben mit anzeigen (Standard true)" },
      }),
      annotations: { readOnlyHint: true },
      run: async (a) => {
        const von = a.von ?? heute();
        const bis = a.bis ?? plusTage(von, 14);
        if (bis < von) throw new Error("bis liegt vor von");
        const uid = a.mitarbeiter_email ? (await nutzerIds([a.mitarbeiter_email]))[0] : null;

        let termine = await termineLesen(berlinZeitpunkt(von), berlinZeitpunkt(plusTage(bis, 1)));
        termine = termine.filter((e: any) => new Date(e.start_datetime) < berlinZeitpunkt(plusTage(bis, 1)));
        if (uid) termine = termine.filter((e: any) => (e.assignees ?? []).some((x: any) => x.user?.user_id === uid));
        if (a.building_id) termine = termine.filter((e: any) => (e.buildings ?? []).some((x: any) => x.building?.id === a.building_id));

        let aufgaben: any[] = [];
        if (a.aufgaben !== false) {
          const { data, error } = await db.from("todos")
            .select("id, task_number, title, due_date, calendar_start_time, calendar_end_time, priority, status, assignees:todo_assignees(user:profiles(user_id, first_name, last_name)), buildings:todo_buildings(building:buildings(id, name))")
            .gte("due_date", von).lte("due_date", bis).neq("status", "done").order("due_date");
          if (error) throw error;
          aufgaben = (data ?? [])
            .filter((t: any) => !uid || (t.assignees ?? []).some((x: any) => x.user?.user_id === uid))
            .filter((t: any) => !a.building_id || (t.buildings ?? []).some((x: any) => x.building?.id === a.building_id))
            // Aufgaben, die schon als Termin im Kalender stehen, nicht doppelt zeigen
            .filter((t: any) => !termine.some((e: any) => e.todo_id === t.id))
            .map((t: any) => ({
              aufgabe: t.task_number, titel: t.title,
              faellig: anzeige(t.calendar_start_time ? berlinZeitpunkt(t.due_date, t.calendar_start_time.slice(0, 5)).toISOString() : `${t.due_date}T12:00:00Z`, !!t.calendar_start_time),
              bis: t.calendar_end_time ? t.calendar_end_time.slice(0, 5) : undefined,
              prioritaet: PRIO[t.priority] ?? t.priority,
              zustaendig: (t.assignees ?? []).map((x: any) => name(x.user)).filter(Boolean),
              gebaeude: (t.buildings ?? []).map((x: any) => x.building?.name).filter(Boolean),
            }));
        }
        return { zeitraum: `${anzeige(`${von}T12:00:00Z`, false)} – ${anzeige(`${bis}T12:00:00Z`, false)}`, termine: termine.map(terminAusgabe), aufgaben: a.aufgaben === false ? undefined : aufgaben };
      },
    },
    {
      name: "termin_speichern",
      description:
        "Legt einen Termin im Kalender der App an (ohne termin_id) oder ändert ihn (mit termin_id – nur übergebene Felder ändern sich; teilnehmer/building_ids ersetzen die bisherigen). Zeiten in deutscher Ortszeit. Ganztägige Termine ohne Uhrzeit. Ohne ende dauert ein Termin eine Stunde. Teilnehmer per Mitarbeiter-E-Mail (kalender_optionen). Ein Ort wird in die Beschreibung übernommen. Es geht keine Einladung per E-Mail raus.",
      inputSchema: S({
        termin_id: uuid("optional: vorhandenen Termin ändern"),
        titel: str("Titel (Pflicht bei neuen Terminen)"),
        datum: datum("Tag des Termins (Pflicht bei neuen Terminen)"),
        beginn: zeit("Beginn"),
        ende: zeit("Ende"),
        ganztaegig: { type: "boolean", description: "ganztägiger Termin" },
        ort: str("optional: Ort, wird in die Beschreibung geschrieben"),
        beschreibung: str("optional"),
        kategorie: str("optional: Name der Kategorie, z. B. 'Eigentümerversammlung'"),
        teilnehmer: { type: "array", items: { type: "string" }, description: "Mitarbeiter-E-Mails" },
        building_ids: { type: "array", items: { type: "string", format: "uuid" }, description: "zugeordnete Gebäude" },
        mitarbeiter_email: str("optional: wer den Termin anlegt (Standard: Inhaber des Konnektors)"),
      }),
      run: async (a) => {
        let alt: any = null;
        if (a.termin_id) {
          const { data } = await db.from("calendar_events").select("id, title, description, start_datetime, end_datetime, is_all_day").eq("id", a.termin_id).maybeSingle();
          if (!data) throw new Error("Termin nicht gefunden");
          alt = data;
        } else if (!a.titel?.trim() || !a.datum) throw new Error("Für einen neuen Termin titel und datum angeben");
        if (!a.ganztaegig && !alt && !a.beginn) throw new Error("beginn angeben oder ganztaegig=true setzen");
        if (a.ganztaegig === false && alt?.is_all_day && !a.beginn) throw new Error("Für einen Termin mit Uhrzeit beginn angeben");

        // Zeiten: fehlende Angaben aus dem bisherigen Termin übernehmen
        const ganz = a.ganztaegig ?? alt?.is_all_day ?? false;
        const altTag = alt ? new Date(alt.start_datetime).toLocaleDateString("sv-SE", { timeZone: TZ }) : null;
        const altZeit = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }) : null;
        const tag = a.datum ?? altTag!;
        const beginn = ganz ? "00:00" : (a.beginn ?? altZeit(alt?.start_datetime) ?? "00:00");
        const start = berlinZeitpunkt(tag, beginn);
        let ende: Date | null = null;
        if (!ganz) {
          const endeZeit = a.ende ?? (a.beginn || a.datum ? null : altZeit(alt?.end_datetime));
          ende = endeZeit ? berlinZeitpunkt(tag, endeZeit) : new Date(start.getTime() + 60 * 60000);
          if (ende <= start) throw new Error("ende muss nach beginn liegen");
        }

        let beschreibung: string | null | undefined = a.beschreibung !== undefined ? (a.beschreibung.trim() || null) : undefined;
        if (a.ort?.trim()) {
          const basis = (beschreibung ?? alt?.description ?? "").replace(/^Ort: .*(\n|$)/, "").trim();
          beschreibung = [`Ort: ${a.ort.trim()}`, basis].filter(Boolean).join("\n");
        }

        const zeile: Record<string, unknown> = { start_datetime: start.toISOString(), end_datetime: ende?.toISOString() ?? null, is_all_day: ganz };
        if (a.titel !== undefined) zeile.title = a.titel.trim();
        if (beschreibung !== undefined) zeile.description = beschreibung;
        const kat = await kategorieId(a.kategorie);
        if (kat !== undefined) zeile.category_id = kat;
        const teilnehmer = a.teilnehmer ? await nutzerIds(a.teilnehmer) : null;
        if (a.building_ids?.length) {
          const { data: g } = await db.from("buildings").select("id").in("id", a.building_ids);
          if ((g ?? []).length !== new Set(a.building_ids).size) throw new Error("Mindestens ein Gebäude wurde nicht gefunden");
        }

        let id = alt?.id as string | undefined;
        if (id) {
          const { error } = await db.from("calendar_events").update(zeile).eq("id", id);
          if (error) throw error;
        } else {
          const { data, error } = await db.from("calendar_events").insert({ ...zeile, created_by: await d.uploaderId(a.mitarbeiter_email) }).select("id").single();
          if (error) throw error;
          id = data.id;
        }
        if (teilnehmer) {
          await db.from("calendar_event_assignees").delete().eq("event_id", id);
          if (teilnehmer.length) {
            const { error } = await db.from("calendar_event_assignees").insert([...new Set(teilnehmer)].map((u) => ({ event_id: id, user_id: u })));
            if (error) throw error;
          }
        }
        if (a.building_ids) {
          await db.from("calendar_event_buildings").delete().eq("event_id", id);
          if (a.building_ids.length) {
            const { error } = await db.from("calendar_event_buildings").insert([...new Set(a.building_ids as string[])].map((b) => ({ event_id: id, building_id: b })));
            if (error) throw error;
          }
        }

        // Ergebnis + Überschneidungen am selben Tag (gleiche Teilnehmer)
        const { data: termin, error: lErr } = await db.from("calendar_events").select(FELDER).eq("id", id).single();
        if (lErr) throw lErr;
        const tagTermine = await termineLesen(berlinZeitpunkt(tag), berlinZeitpunkt(plusTage(tag, 1)));
        const meine = new Set((termin?.assignees ?? []).map((x: any) => x.user?.user_id));
        const ueberschneidungen = tagTermine
          .filter((e: any) => e.id !== id && (e.assignees ?? []).some((x: any) => meine.has(x.user?.user_id)))
          .filter((e: any) => {
            const s = new Date(e.start_datetime).getTime(), en = e.end_datetime ? new Date(e.end_datetime).getTime() : s + 3600000;
            return ganz || e.is_all_day || (s < (ende?.getTime() ?? 0) && en > start.getTime());
          })
          .map((e: any) => `${e.title} (${anzeige(e.start_datetime, !e.is_all_day)}; ${(e.assignees ?? []).map((x: any) => name(x.user)).join(", ")})`);

        await log("termin_speichern", { termin_id: id, neu: !alt, titel: termin?.title, beginn: start.toISOString(), mitarbeiter: a.mitarbeiter_email ?? null });
        return {
          status: alt ? "TERMIN GEÄNDERT" : "TERMIN ANGELEGT",
          ...terminAusgabe(termin),
          ueberschneidungen: ueberschneidungen.length ? ueberschneidungen : undefined,
        };
      },
    },
  ];
}
