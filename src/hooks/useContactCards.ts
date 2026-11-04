import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildSearchText, type ContactCard } from "@/lib/contactInsert";

// Supabase liefert max. 1000 Zeilen je Abfrage – daher seitenweise laden.
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await build(from, from + size - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < size) break;
  }
  return out;
}

const geschaeftlichZuerst = (a: string | null, b: string | null) =>
  Number(/gesch/i.test(b || "")) - Number(/gesch/i.test(a || ""));

const ROLLE: Record<string, string> = {
  eigentuemer: "Eigentümer",
  mieter: "Mieter",
  dienstleister: "Dienstleister",
  verwalter: "Verwalter",
};

/** Alle Kontakte mit Telefon, E-Mail, Ansprechpartnern – für das Einfügen per "#" im Mailtext. */
export function useContactCards(enabled = true) {
  return useQuery({
    queryKey: ["contact-cards-insert"],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ContactCard[]> => {
      const [contacts, emailRows, phoneRows, personRows, assignRows] = await Promise.all([
        fetchAll((a, b) =>
          supabase
            .from("contacts")
            .select("id, first_name, last_name, company_name, short_name, salutation, address_street, address_zip, address_city, service_provider_categories")
            .order("id")
            .range(a, b),
        ),
        fetchAll((a, b) => supabase.from("contact_emails").select("contact_id, email, label, is_primary, person_id").order("id").range(a, b)),
        fetchAll((a, b) => supabase.from("contact_phones").select("contact_id, phone_number, label, note, person_id").order("id").range(a, b)),
        fetchAll((a, b) =>
          supabase
            .from("contact_persons")
            .select("id, contact_id, first_name, last_name, salutation, position, phone, email, is_primary, sort_order")
            .order("id")
            .range(a, b),
        ),
        fetchAll((a, b) =>
          supabase
            .from("contact_building_assignments")
            .select("contact_id, role_in_building, unit_number, buildings(name)")
            .eq("is_active", true)
            .order("id")
            .range(a, b),
        ),
      ]);

      const group = <T extends { contact_id: string }>(rows: T[] | null) => {
        const m = new Map<string, T[]>();
        for (const r of rows || []) {
          const l = m.get(r.contact_id);
          if (l) l.push(r);
          else m.set(r.contact_id, [r]);
        }
        return m;
      };
      const emails = group(emailRows);
      const phones = group(phoneRows);
      const persons = group(personRows);
      const assigns = group(assignRows as unknown as Array<{ contact_id: string; role_in_building: string | null; unit_number: string | null; buildings: { name: string } | null }>);

      return contacts.map((c) => {
        const personName = [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || null;
        const companyName = c.company_name?.trim() || null;
        const displayName = companyName || personName || c.short_name || "Unbenannt";
        const address = c.address_street
          ? [c.address_street, [c.address_zip, c.address_city].filter(Boolean).join(" ")].filter(Boolean).join(", ")
          : null;

        const roles = (assigns.get(c.id) || []).map((a) =>
          [ROLLE[a.role_in_building || ""] || a.role_in_building, a.buildings?.name, a.unit_number].filter(Boolean).join(" "),
        );
        const cats = (c.service_provider_categories || []).filter(Boolean);
        const subtitle = [cats.length ? cats.join(", ") : null, roles.slice(0, 2).join(" · ") || null]
          .filter(Boolean)
          .join(" · ");

        const ps = (persons.get(c.id) || [])
          .slice()
          .sort((a, b) => Number(!!b.is_primary) - Number(!!a.is_primary) || (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((p) => ({
            id: p.id,
            name: [p.salutation, p.first_name, p.last_name].filter(Boolean).join(" ").trim(),
            position: p.position,
            phone: p.phone,
            email: p.email,
          }))
          .filter((p) => p.name);

        // Telefon/E-Mail hängen meist an der Person (person_id) – alle übernehmen
        const nameById = new Map(ps.map((p) => [p.id, p.name]));
        const multi = ps.length > 1;
        const em: ContactCard["emails"] = [];
        const seenMail = new Set<string>();
        for (const e of (emails.get(c.id) || [])
          .slice()
          .sort((x, y) => Number(!!y.is_primary) - Number(!!x.is_primary) || geschaeftlichZuerst(x.label, y.label))) {
          const k = e.email.trim().toLowerCase();
          if (!k || seenMail.has(k)) continue;
          seenMail.add(k);
          em.push({ email: e.email.trim(), label: e.label, owner: multi && e.person_id ? nameById.get(e.person_id) : null });
        }
        const ph: ContactCard["phones"] = [];
        const seenTel = new Set<string>();
        for (const p of phones.get(c.id) || []) {
          const k = p.phone_number.replace(/\D/g, "");
          if (!k || seenTel.has(k)) continue;
          seenTel.add(k);
          ph.push({ number: p.phone_number.trim(), label: p.label, note: p.note, owner: multi && p.person_id ? nameById.get(p.person_id) : null });
        }
        // Altdaten: Telefon/E-Mail direkt am Ansprechpartner
        for (const p of ps) {
          if (p.phone && !seenTel.has(p.phone.replace(/\D/g, ""))) {
            seenTel.add(p.phone.replace(/\D/g, ""));
            ph.push({ number: p.phone.trim(), label: null, note: null, owner: multi ? p.name : null });
          }
          if (p.email && !seenMail.has(p.email.trim().toLowerCase())) {
            seenMail.add(p.email.trim().toLowerCase());
            em.push({ email: p.email.trim(), label: null, owner: multi ? p.name : null });
          }
        }

        return {
          id: c.id,
          displayName,
          subtitle,
          companyName,
          personName,
          address,
          phones: ph,
          emails: em,
          persons: ps,
          searchText: buildSearchText([
            displayName,
            personName,
            companyName,
            c.short_name,
            ...cats,
            ...ps.map((p) => p.name),
            ...em.map((e) => e.email),
          ]),
        } satisfies ContactCard;
      });
    },
  });
}
