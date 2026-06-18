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
  return `Sehr geehrte/r ${ln},`;
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
    .select("id, contact_id, unit_number, role_in_building, is_active, parent_assignment_id, address_as_separate_letter, salutation_override, first_name_override, last_name_override, company_name_override, address_street_override, address_zip_override, address_city_override, unit_kind, contact_building_shares(share_type, share_value)")
    .eq("building_id", buildingId)
    .or("is_active.is.null,is_active.eq.true");

  const { data: assigns, error: aErr } = await q;
  if (aErr) throw aErr;

  let assignments = (assigns || []);
  // Mit-Eigentümer-Map (parent_assignment_id -> co-owner rows). Wird gleich befüllt,
  // unabhängig von Filtern: ein Filter auf den Haupt-Eigentümer soll dessen
  // Mit-Eigentümer automatisch mit einbeziehen.
  const allAssignmentsById = new Map<string, any>(assignments.map((a: any) => [a.id, a]));
  const coOwnersByParent = new Map<string, any[]>();
  for (const a of assignments) {
    if (a.parent_assignment_id && allAssignmentsById.has(a.parent_assignment_id)) {
      const arr = coOwnersByParent.get(a.parent_assignment_id) || [];
      arr.push(a);
      coOwnersByParent.set(a.parent_assignment_id, arr);
    }
  }
  // Für die Empfänger-Erzeugung: nur "Haupt"-Zuordnungen iterieren (kein parent).
  // Co-Owner werden weiter unten pro Haupt-Zuordnung entweder mit-adressiert
  // oder als eigener Empfänger emittiert.
  assignments = assignments.filter((a: any) => !a.parent_assignment_id);

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

  // Contact-IDs sammeln — inkl. Mit-Eigentümer-Kontakte
  const contactIdSet = new Set<string>();
  for (const a of assignments) {
    contactIdSet.add(a.contact_id);
    for (const co of coOwnersByParent.get(a.id) || []) contactIdSet.add(co.contact_id);
  }
  const contactIds = Array.from(contactIdSet);

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
  // Zusätzlich: Mit-Eigentümer mit address_as_separate_letter != false bekommen
  // eine eigene Gruppe (eigener Empfänger). Mit-Eigentümer mit
  // address_as_separate_letter === false werden weiter unten in die Adresse des
  // Haupt-Eigentümers mit hineingeschrieben.
  type Group = {
    contact_id: string;
    assignments: any[];
    /** Mit-Eigentümer, deren Namen in adresse_block/anrede_brief mit aufgenommen werden */
    mergedCoOwnerAssignments?: any[];
    /** Wenn true, ist diese Gruppe ein Mit-Eigentümer-Empfänger (eigene Adresse) */
    isCoOwnerAddressee?: boolean;
  };
  const groups: Group[] = [];
  const addMergedCoOwners = (parentAssignmentId: string): any[] =>
    (coOwnersByParent.get(parentAssignmentId) || []).filter(
      (co: any) => co.address_as_separate_letter === false,
    );
  if (filter.group_by_contact) {
    const byContact = new Map<string, any[]>();
    for (const a of assignments) {
      const arr = byContact.get(a.contact_id) || [];
      arr.push(a);
      byContact.set(a.contact_id, arr);
    }
    for (const [contact_id, arr] of byContact.entries()) {
      const merged: any[] = [];
      for (const ag of arr) merged.push(...addMergedCoOwners(ag.id));
      groups.push({ contact_id, assignments: arr, mergedCoOwnerAssignments: merged });
    }
  } else {
    for (const a of assignments) {
      groups.push({
        contact_id: a.contact_id,
        assignments: [a],
        mergedCoOwnerAssignments: addMergedCoOwners(a.id),
      });
    }
  }
  // Separate Mit-Eigentümer als eigene Gruppen anhängen
  for (const a of assignments) {
    const seps = (coOwnersByParent.get(a.id) || []).filter(
      (co: any) => co.address_as_separate_letter !== false,
    );
    for (const co of seps) {
      groups.push({
        contact_id: co.contact_id,
        assignments: [co],
        isCoOwnerAddressee: true,
      });
    }
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

    // Override-Helfer: pro Assignment dürfen Name/Adresse gebäudespezifisch überschrieben sein
    const ov = (val: any) => (val == null || val === "" ? null : val);
    const overrideFirst = ov(a.first_name_override);
    const overrideLast = ov(a.last_name_override);
    const overrideSal = ov(a.salutation_override);
    const overrideCompany = ov(a.company_name_override);
    const overrideStreet = ov(a.address_street_override);
    const overrideZip = ov(a.address_zip_override);
    const overrideCity = ov(a.address_city_override);

    for (const pair of pairs) {
      const personForVars = pair.person || primaryPerson;
      const firstName = overrideFirst || personForVars?.first_name || c.first_name || "";
      const lastName = overrideLast || personForVars?.last_name || c.last_name || "";
      const salutation = overrideSal || personForVars?.salutation || c.salutation || "";
      const titel = personForVars?.position || "";
      const vollname = [firstName, lastName].filter(Boolean).join(" ").trim();
      const email = pair.email || null;

      if (filter.require_email && !email) continue;

      const telefon = personForVars?.phone || "";
      const firma = overrideCompany || c.company_name || "";
      const strasse = overrideStreet || c.address_street || "";
      const plz = overrideZip || c.address_zip || "";
      const ort = overrideCity || c.address_city || "";

      // Mit-Eigentümer-Namen (nur für die "Haupt"-Gruppe relevant; bei
      // separater Mit-Eigentümer-Gruppe ist mergedCoOwnerAssignments leer).
      const mergedCoOwners = group.mergedCoOwnerAssignments || [];
      const coOwnerLines: string[] = [];
      const coOwnerLastNames: string[] = [];
      for (const co of mergedCoOwners) {
        const cc = contactMap.get(co.contact_id);
        if (!cc) continue;
        const coPersons = personsByContact.get(co.contact_id) || [];
        const coPrim = coPersons.find((p: any) => p.is_primary) || coPersons[0] || null;
        const coFn = ov(co.first_name_override) || coPrim?.first_name || cc.first_name || "";
        const coLn = ov(co.last_name_override) || coPrim?.last_name || cc.last_name || "";
        const coSal = ov(co.salutation_override) || coPrim?.salutation || cc.salutation || "";
        const coCompany = ov(co.company_name_override) || cc.company_name || "";
        const coFull = coCompany || [coSal, coFn, coLn].filter(Boolean).join(" ").trim();
        if (coFull) coOwnerLines.push(coFull);
        if (coLn) coOwnerLastNames.push(coLn);
      }

      // adresse_block: Haupt-Empfänger + mit-adressierte Mit-Eigentümer (jeder in eigener Zeile)
      const primaryAdresseeLine = firma || vollname || "";
      const adresseLines: string[] = [];
      if (firma) adresseLines.push(firma);
      if (vollname && vollname !== firma) adresseLines.push(vollname);
      for (const line of coOwnerLines) adresseLines.push(line);
      if (strasse) adresseLines.push(strasse);
      const ortLine = [plz, ort].filter(Boolean).join(" ").trim();
      if (ortLine) adresseLines.push(ortLine);
      const adresseBlock = adresseLines.join("\n");

      // anrede_brief: Haupt + Mit-Eigentümer in einer Anrede zusammenfassen
      let anredeBrief = makeAnredeBrief(salutation, lastName);
      if (coOwnerLines.length > 0) {
        const parts = [makeAnredeBrief(salutation, lastName).replace(/,$/, "")];
        for (const co of mergedCoOwners) {
          const coPersons = personsByContact.get(co.contact_id) || [];
          const coPrim = coPersons.find((p: any) => p.is_primary) || coPersons[0] || null;
          const coLn = ov(co.last_name_override) || coPrim?.last_name || contactMap.get(co.contact_id)?.last_name || "";
          const coSal = ov(co.salutation_override) || coPrim?.salutation || contactMap.get(co.contact_id)?.salutation || "";
          parts.push(makeAnredeBrief(coSal, coLn).replace(/,$/, ""));
        }
        anredeBrief = parts.join(", ") + ",";
      }

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
        gebaeude_plz: "",
        gebaeude_ort: "",
        einheit: einheitVar,
        mea: meaVar,
        einheiten: einheitenStr,
        einheiten_count: String(group.assignments.length),
        mea_summe: meaSumStr,
        einheiten_liste,
        rolle: a.role_in_building || "",
        mit_eigentuemer_namen: coOwnerLines.join(", "),
        mit_eigentuemer_anrede: coOwnerLines.length > 0 ? anredeBrief : "",
        verwalter_name: managerDisplayName || building.manager_name || "",
        verwalter_email: managerProfile?.email || "",
        verwalter_telefon: managerProfile?.phone || "",
        datum_heute: formatDateLong(today),
        ort_datum: `Pfronten, ${formatDateShort(today)}`,
        ...freeVars,
      };

      recipients.push({
        contact_id: group.contact_id,
        person_id: personForVars?.id || null,
        building_id: buildingId,
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
