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

  for (const a of assignments) {
    const c = contactMap.get(a.contact_id);
    if (!c) continue;

    const personList = personsByContact.get(a.contact_id) || [];
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
    const eList = emailsByContact.get(a.contact_id) || [];
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

    for (const pair of pairs) {
      const personForVars = pair.person || primaryPerson;
      const firstName = personForVars?.first_name || c.first_name || "";
      const lastName = personForVars?.last_name || c.last_name || "";
      const salutation = personForVars?.salutation || c.salutation || "";
      const titel = personForVars?.position || "";
      const vollname = [firstName, lastName].filter(Boolean).join(" ").trim();
      const email = pair.email || null;

      if (filter.require_email && !email) continue;

      const telefon = personForVars?.phone || "";
      const firma = c.company_name || "";
      const strasse = c.address_street || "";
      const plz = c.address_zip || "";
      const ort = c.address_city || "";
      const adresseBlock = makeAdresseBlock({ firma, vollname, strasse, plz, ort });
      const today = new Date();

      const vars: Record<string, string> = {
        anrede: salutation || "",
        anrede_brief: makeAnredeBrief(salutation, lastName),
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
        einheit: a.unit_number || "",
        mea: (() => {
          const shares = (a as any).contact_building_shares || [];
          const m = shares.find((s: any) => s.share_type === "mea");
          if (!m || m.share_value == null) return "";
          const v = Number(m.share_value);
          return Number.isFinite(v) ? v.toLocaleString("de-DE", { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : String(m.share_value);
        })(),
        rolle: a.role_in_building || "",
        verwalter_name: managerDisplayName || building.manager_name || "",
        verwalter_email: managerProfile?.email || "",
        verwalter_telefon: managerProfile?.phone || "",
        datum_heute: formatDateLong(today),
        ort_datum: `Pfronten, ${formatDateShort(today)}`,
        ...freeVars,
      };

      recipients.push({
        contact_id: a.contact_id,
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
