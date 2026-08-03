// Shared helpers for the Communication module: building recipients + variable resolution.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { firstValidEmail, extractEmails } from "./sanitize-email.ts";

export type RecipientFilter = {
  roles?: string[]; // e.g. ["eigentuemer","mieter"]
  contact_ids?: string[]; // explicit contact selection (legacy)
  assignment_ids?: string[]; // explicit assignment selection (preferred — allows multi-unit owners to be deselected individually)
  unit_numbers?: string[];
  require_email?: boolean;
  /** If true, emit one recipient per distinct email address on the contact
   *  (contact_emails + every contact_persons.email). Used for Rundmails. */
  expand_all_emails?: boolean;
  /** Rundmails: explizite Auswahl auf Adress-Ebene. Schlüsselformat
   *  `${assignment_id}|${email_lowercase}`. Wenn gesetzt, werden nur diese
   *  Kombinationen zu Empfängern. */
  recipient_keys?: string[];
  /** Rundmails: Anzeige-Label für `einheit`/`einheiten` je Schlüssel, wenn eine
   *  Adresse mehrere Einheiten abdeckt (z. B. "0003, 0007"). */
  unit_labels?: Record<string, string>;

  /** If true, alle Assignments (= Wohneinheiten) desselben Eigentümers im
   *  Gebäude werden zu EINEM Empfänger zusammengefasst. Variablen `einheit`/`mea`
   *  enthalten dann die Komma-Liste bzw. die Summe; zusätzlich werden
   *  `einheiten`, `einheiten_count`, `mea_summe` und das Loop-Array
   *  `einheiten_liste` befüllt. */
  group_by_contact?: boolean;
};

export type ResolvedRecipient = {
  contact_id: string;
  person_id: string | null;
  building_id: string;
  display_name: string;
  email: string | null;
  /** Primäre Gebäude-Zuordnung (Einheit) des Empfängers — für persönliche Anhänge. */
  assignment_id?: string | null;
  unit_number?: string | null;
  vars: Record<string, any>;
};


const monthsDe = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];

export function formatDateLong(d = new Date()): string {
  return `${d.getDate()}. ${monthsDe[d.getMonth()]} ${d.getFullYear()}`;
}
export function formatDateShort(d = new Date()): string {
  const dd = String(d.getDate()).padStart(2,"0");
  const mm = String(d.getMonth()+1).padStart(2,"0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

export function makeAnredeBrief(salutation: string | null, lastName: string | null): string {
  const ln = (lastName || "").trim();
  const sal = (salutation || "").trim().toLowerCase();
  if (!ln) return "Sehr geehrte Damen und Herren,";
  if (sal === "herr") return `Sehr geehrter Herr ${ln},`;
  if (sal === "frau") return `Sehr geehrte Frau ${ln},`;
  if (sal.includes("familie") || sal === "fam" || sal === "fam.") return `Sehr geehrte Familie ${ln},`;
  if (sal.includes("eheleute")) return `Sehr geehrte Eheleute ${ln},`;
  // "Herr und Frau", "Frau und Herr" u. ä.
  if (sal.includes("herr") && sal.includes("frau")) {
    return `Sehr geehrte Frau ${ln}, sehr geehrter Herr ${ln},`;
  }
  if (sal.includes("firma")) return "Sehr geehrte Damen und Herren,";
  // Unbekannte/leere Anrede: neutral statt "Sehr geehrte/r Nachname,"
  return "Sehr geehrte Damen und Herren,";
}

/** Verbindet eine Liste von Strings mit Komma + abschließendem " und ". */
function joinUnd(parts: string[]): string {
  const arr = parts.filter((p) => p && p.trim().length > 0);
  if (arr.length === 0) return "";
  if (arr.length === 1) return arr[0];
  if (arr.length === 2) return `${arr[0]} und ${arr[1]}`;
  return `${arr.slice(0, -1).join(", ")} und ${arr[arr.length - 1]}`;
}

/**
 * Kombiniert mehrere Personen eines Kontakts zu Anrede-/Namensvariablen.
 * Bei nur einer Person bleibt das Verhalten identisch zum Singleton-Fall.
 */
export function combinePersons(
  persons: Array<{ salutation?: string | null; first_name?: string | null; last_name?: string | null }>,
): { vorname: string; nachname: string; vollname: string; anrede: string; anrede_brief: string } {
  const valid = persons.filter((p) => (p.first_name || p.last_name));
  if (valid.length === 0) {
    return { vorname: "", nachname: "", vollname: "", anrede: "", anrede_brief: "Sehr geehrte Damen und Herren," };
  }
  if (valid.length === 1) {
    const p = valid[0];
    const fn = (p.first_name || "").trim();
    const ln = (p.last_name || "").trim();
    return {
      vorname: fn,
      nachname: ln,
      vollname: [fn, ln].filter(Boolean).join(" "),
      anrede: (p.salutation || "").trim(),
      anrede_brief: makeAnredeBrief(p.salutation || "", ln),
    };
  }

  const firstNames = valid.map((p) => (p.first_name || "").trim()).filter(Boolean);
  const lastNamesAll = valid.map((p) => (p.last_name || "").trim());
  const uniqueLast = Array.from(new Set(lastNamesAll.filter(Boolean)));

  let vollname = "";
  if (uniqueLast.length === 1) {
    vollname = `${joinUnd(firstNames)} ${uniqueLast[0]}`.trim();
  } else {
    vollname = joinUnd(valid.map((p) => [p.first_name, p.last_name].filter(Boolean).join(" ").trim()));
  }

  const sals = valid.map((p) => (p.salutation || "").trim().toLowerCase());
  const uniqueSals = Array.from(new Set(sals));
  let anredeBrief = "";
  if (
    uniqueLast.length === 1 && valid.length === 2 &&
    uniqueSals.includes("herr") && uniqueSals.includes("frau")
  ) {
    // Ehepaar / Paar mit gleichem Nachnamen: korrekte Doppel-Anrede (Dame zuerst)
    anredeBrief = `Sehr geehrte Frau ${uniqueLast[0]}, sehr geehrter Herr ${uniqueLast[0]},`;
  } else if (uniqueLast.length === 1 && uniqueSals.length === 1 && (uniqueSals[0] === "frau" || uniqueSals[0] === "herr")) {
    const plural = uniqueSals[0] === "frau" ? "Sehr geehrte Frauen" : "Sehr geehrte Herren";
    anredeBrief = `${plural} ${uniqueLast[0]},`;
  } else {
    const parts = valid.map((p, idx) => {
      const single = makeAnredeBrief(p.salutation || "", p.last_name || "").replace(/,$/, "");
      return idx === 0 ? single : single.charAt(0).toLowerCase() + single.slice(1);
    });
    anredeBrief = `${parts.join(", ")},`;
  }

  return {
    vorname: joinUnd(firstNames),
    nachname: joinUnd(uniqueLast),
    vollname,
    anrede: uniqueSals.length === 1 ? valid[0].salutation || "" : "",
    anrede_brief: anredeBrief,
  };
}

export function makeAdresseBlock(parts: {
  firma?: string | null; vollname?: string | null; strasse?: string | null;
  plz?: string | null; ort?: string | null;
}): string {
  const lines: string[] = [];
  if (parts.firma) lines.push(parts.firma);
  if (parts.vollname) lines.push(parts.vollname);
  if (parts.strasse) lines.push(parts.strasse);
  const ortLine = [parts.plz, parts.ort].filter(Boolean).join(" ").trim();
  if (ortLine) lines.push(ortLine);
  return lines.join("\n");
}

/** Load recipients for a building applying the given filter. */
export async function loadRecipients(
  admin: SupabaseClient,
  buildingId: string,
  filter: RecipientFilter,
  freeVars: Record<string, string> = {},
): Promise<ResolvedRecipient[]> {
  // Building info
  const { data: building, error: bErr } = await admin
    .from("buildings").select("*").eq("id", buildingId).single();
  if (bErr || !building) throw new Error("Building not found");

  // Optional: first manager profile
  const { data: managerRows } = await admin
    .from("building_managers").select("user_id").eq("building_id", buildingId).limit(1);
  let managerProfile: any = null;
  if (managerRows && managerRows.length > 0) {
    const { data: prof } = await admin
      .from("profiles").select("first_name, last_name, email, phone, username")
      .eq("user_id", managerRows[0].user_id).maybeSingle();
    managerProfile = prof;
  }
  const managerDisplayName = managerProfile
    ? ([managerProfile.first_name, managerProfile.last_name].filter(Boolean).join(" ").trim()
       || managerProfile.username
       || "")
    : "";

  // Building -> contact assignments
  let q = admin
    .from("contact_building_assignments")
    .select("id, contact_id, unit_number, role_in_building, is_active, contact_building_shares(share_type, share_value)")
    .eq("building_id", buildingId)
    .or("is_active.is.null,is_active.eq.true");

  const { data: assigns, error: aErr } = await q;
  if (aErr) throw aErr;

  let assignments = (assigns || []);
  if (filter.roles && filter.roles.length > 0) {
    assignments = assignments.filter((a: any) => a.role_in_building && filter.roles!.includes(a.role_in_building));
  }
  if (filter.unit_numbers && filter.unit_numbers.length > 0) {
    assignments = assignments.filter((a: any) => a.unit_number && filter.unit_numbers!.includes(a.unit_number));
  }
  // Bevorzugt: pro Zuordnung filtern (erlaubt das Abwählen einzelner Einheiten
  // bei Eigentümern, die mehrfach im Gebäude vorkommen).
  const explicitAssignmentIds = (filter.assignment_ids || []).filter((x) => x !== "__none__");
  const wantsNone = (filter.assignment_ids || []).includes("__none__");
  if (wantsNone) {
    assignments = [];
  } else if (explicitAssignmentIds.length > 0) {
    assignments = assignments.filter((a: any) => explicitAssignmentIds.includes(a.id));
  } else if (filter.contact_ids && filter.contact_ids.length > 0) {
    // Legacy-Fallback: contact-basierte Filterung
    assignments = assignments.filter((a: any) => filter.contact_ids!.includes(a.contact_id));
  }

  if (assignments.length === 0) return [];

  const contactIds = Array.from(new Set(assignments.map((a: any) => a.contact_id)));

  // Load contacts, persons, emails in batch
  const [{ data: contacts }, { data: persons }, { data: emails }] = await Promise.all([
    admin.from("contacts").select("*").in("id", contactIds),
    admin.from("contact_persons").select("*").in("contact_id", contactIds),
    admin.from("contact_emails").select("*").in("contact_id", contactIds),
  ]);

  const contactMap = new Map<string, any>((contacts || []).map((c: any) => [c.id, c]));
  const personsByContact = new Map<string, any[]>();
  for (const p of persons || []) {
    const arr = personsByContact.get(p.contact_id) || [];
    arr.push(p);
    personsByContact.set(p.contact_id, arr);
  }
  const emailsByContact = new Map<string, any[]>();
  for (const e of emails || []) {
    const arr = emailsByContact.get(e.contact_id) || [];
    arr.push(e);
    emailsByContact.set(e.contact_id, arr);
  }

  const recipients: ResolvedRecipient[] = [];

  // Helper: MEA value (as number) for an assignment
  const meaValueOf = (a: any): number => {
    const shares = (a as any).contact_building_shares || [];
    const m = shares.find((s: any) => s.share_type === "mea");
    if (!m || m.share_value == null) return 0;
    const v = Number(m.share_value);
    return Number.isFinite(v) ? v : 0;
  };
  const formatMea = (v: number): string =>
    v > 0 ? v.toLocaleString("de-DE", { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : "";

  // Build iteration groups: one group of assignments per recipient.
  // - group_by_contact = true  → 1 Gruppe pro contact_id (alle Einheiten zusammen)
  // - sonst                    → 1 Gruppe pro Assignment (Legacy-Verhalten)
  type Group = { contact_id: string; assignments: any[] };
  const groups: Group[] = [];
  if (filter.group_by_contact) {
    const byContact = new Map<string, any[]>();
    for (const a of assignments) {
      const arr = byContact.get(a.contact_id) || [];
      arr.push(a);
      byContact.set(a.contact_id, arr);
    }
    for (const [contact_id, arr] of byContact.entries()) {
      groups.push({ contact_id, assignments: arr });
    }
  } else {
    for (const a of assignments) groups.push({ contact_id: a.contact_id, assignments: [a] });
  }

  for (const group of groups) {
    const a = group.assignments[0]; // primary assignment (für Kontakt-Bezug)
    const c = contactMap.get(group.contact_id);
    if (!c) continue;

    const personList = personsByContact.get(group.contact_id) || [];
    const primaryPerson = personList.find((p) => p.is_primary) || personList[0] || null;

    // Build list of (email, person) candidates. Person is the one whose
    // contact_persons.email matched; null if it came from contact_emails.
    type EmailCandidate = { email: string; person: any | null };
    const candidates: EmailCandidate[] = [];
    const seen = new Set<string>();
    const pushUnique = (raw: string | null | undefined, person: any | null) => {
      for (const e of extractEmails(raw)) {
        const key = e.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push({ email: e, person });
      }
    };
    // contact_emails first (primary first)
    const eList = emailsByContact.get(group.contact_id) || [];
    const sortedEmails = [...eList].sort((x, y) => Number(!!y.is_primary) - Number(!!x.is_primary));
    for (const row of sortedEmails) pushUnique(row?.email, null);
    // person emails (primary first)
    const personSorted = [...personList].sort((x, y) => Number(!!y.is_primary) - Number(!!x.is_primary));
    for (const p of personSorted) pushUnique(p?.email, p);

    // Heuristic: link contact_emails-only candidates to person by exact match on
    // local-part vs first/last name — purely cosmetic for vars.vorname.
    if (filter.expand_all_emails) {
      for (const cand of candidates) {
        if (cand.person) continue;
        const local = cand.email.split("@")[0]?.toLowerCase() || "";
        const match = personList.find((p) => {
          const fn = (p.first_name || "").toLowerCase();
          const ln = (p.last_name || "").toLowerCase();
          return (fn && local.includes(fn)) || (ln && local.includes(ln));
        });
        if (match) cand.person = match;
      }
    }

    // Decide which (email, person) pairs become recipients
    let pairs: EmailCandidate[];
    if (filter.expand_all_emails) {
      pairs = candidates.length > 0 ? candidates : [{ email: "", person: primaryPerson }];
    } else {
      pairs = [{ email: candidates[0]?.email || "", person: primaryPerson }];
    }

    // Aggregierte Einheiten-Infos (sinnvoll auch für Single-Gruppen)
    const einheiten_liste = group.assignments.map((ag) => ({
      einheit: ag.unit_number || "",
      mea: formatMea(meaValueOf(ag)),
      rolle: ag.role_in_building || "",
    }));
    const einheitenStr = einheiten_liste.map((e) => e.einheit).filter(Boolean).join(", ");
    const meaSumStr = formatMea(group.assignments.reduce((s, ag) => s + meaValueOf(ag), 0));

    for (const pair of pairs) {
      const personForVars = pair.person || primaryPerson;

      // Bei "ein Empfänger pro Kontakt" (Briefe, Standard-Rundmails) alle Personen
      // gemeinsam adressieren: "Christina und Sandra Bronold" / "Sehr geehrte Frauen Bronold,".
      // Bei expand_all_emails (eine Mail pro E-Mail-Adresse) bleibt eine Person pro Empfänger.
      const useCombined = !filter.expand_all_emails && personList.length > 1;
      const combined = useCombined
        ? combinePersons(personList)
        : null;

      const firstName = combined?.vorname || personForVars?.first_name || c.first_name || "";
      const lastName = combined?.nachname || personForVars?.last_name || c.last_name || "";
      const salutation = combined?.anrede ?? (personForVars?.salutation || c.salutation || "");
      const titel = personForVars?.position || "";
      const vollname = combined?.vollname || [firstName, lastName].filter(Boolean).join(" ").trim();
      // "Familie"/"Eheleute" wird häufig im Vornamen-Feld gepflegt — dann als Anrede behandeln.
      const effectiveSalutation =
        salutation || (/^(familie|fam\.?|eheleute)$/i.test(firstName.trim()) ? firstName.trim() : "");
      const anredeBrief = combined?.anrede_brief || makeAnredeBrief(effectiveSalutation, lastName);
      const email = pair.email || null;

      if (filter.require_email && !email) continue;

      // Adress-genaue Auswahl (Rundmails)
      if (filter.recipient_keys && filter.recipient_keys.length > 0) {
        const key = `${a.id}|${(email || "").toLowerCase()}`;
        if (!filter.recipient_keys.includes(key)) continue;
      }


      const telefon = personForVars?.phone || "";
      const firma = c.company_name || "";
      const strasse = c.address_street || "";
      const plz = c.address_zip || "";
      const ort = c.address_city || "";
      const adresseBlock = makeAdresseBlock({ firma, vollname, strasse, plz, ort });
      const today = new Date();

      // Bei Gruppierung: einheit/mea als Komma-Liste / Summe ausgeben, damit
      // alte Vorlagen mit {{einheit}} / {{mea}} weiterhin funktionieren.
      const einheitVar = filter.group_by_contact && group.assignments.length > 1
        ? einheitenStr
        : (a.unit_number || "");
      const meaVar = filter.group_by_contact && group.assignments.length > 1
        ? meaSumStr
        : formatMea(meaValueOf(a));

      const vars: Record<string, any> = {
        anrede: salutation || "",
        anrede_brief: anredeBrief,
        vorname: firstName,
        nachname: lastName,
        vollname,
        titel,
        firma,
        strasse,
        plz,
        ort,
        adresse_block: adresseBlock,
        email: email || "",
        telefon,
        gebaeude_name: building.name || "",
        gebaeude_strasse: building.address || "",
        gebaeude_plz: (building as any).postal_code || "",
        gebaeude_ort: (building as any).city || "",
        einheit: einheitVar,
        mea: meaVar,
        einheiten: einheitenStr,
        einheiten_count: String(group.assignments.length),
        mea_summe: meaSumStr,
        einheiten_liste,
        rolle: a.role_in_building || "",
        verwalter_name: managerDisplayName || building.manager_name || "",
        verwalter_email: managerProfile?.email || "",
        verwalter_telefon: managerProfile?.phone || "",
        datum_heute: formatDateLong(today),
        ort_datum: `Pfronten, ${formatDateShort(today)}`,
        ...freeVars,
      };

      // Rundmails: Adresse deckt mehrere Einheiten ab -> Label aus dem Filter.
      const unitLabel = filter.unit_labels?.[`${a.id}|${(email || "").toLowerCase()}`];
      if (unitLabel) {
        vars.einheit = unitLabel;
        vars.einheiten = unitLabel;
      }


      recipients.push({
        contact_id: group.contact_id,
        person_id: personForVars?.id || null,
        building_id: buildingId,
        assignment_id: a.id,
        unit_number: a.unit_number || null,
        display_name: vollname || firma || "(ohne Name)",

        email,
        vars,
      });
    }
  }

  return recipients;
}

/** Replace {{var}} placeholders in a plain string. Unknown vars keep their {{name}}. */
export function renderString(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => {
    return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k] ?? "") : `{{${k}}}`;
  });
}

export { createClient };
