import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildSearchText, type ContactCard } from "@/lib/contactInsert";

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
      const [cRes, eRes, pRes, apRes, aRes] = await Promise.all([
        supabase
          .from("contacts")
          .select("id, first_name, last_name, company_name, short_name, salutation, address_street, address_zip, address_city, service_provider_categories"),
        supabase.from("contact_emails").select("contact_id, email, label, is_primary, person_id"),
        supabase.from("contact_phones").select("contact_id, phone_number, label, note, person_id"),
        supabase.from("contact_persons").select("id, contact_id, first_name, last_name, salutation, position, phone, email, is_primary, sort_order"),
        supabase
          .from("contact_building_assignments")
          .select("contact_id, role_in_building, unit_number, buildings(name)")
          .eq("is_active", true),
      ]);
      if (cRes.error) throw cRes.error;

      const group = <T extends { contact_id: string }>(rows: T[] | null) => {
        const m = new Map<string, T[]>();
        for (const r of rows || []) {
          const l = m.get(r.contact_id);
          if (l) l.push(r);
          else m.set(r.contact_id, [r]);
        }
        return m;
      };
      const emails = group(eRes.data);
      const phones = group(pRes.data);
      const persons = group(apRes.data);
      const assigns = group((aRes.data || []) as Array<{ contact_id: string; role_in_building: string | null; unit_number: string | null; buildings: { name: string } | null }>);

      return (cRes.data || []).map((c) => {
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

        const em = (emails.get(c.id) || [])
          .filter((e) => !e.person_id)
          .sort((a, b) => Number(!!b.is_primary) - Number(!!a.is_primary))
          .map((e) => ({ email: e.email, label: e.label }));
        const ph = (phones.get(c.id) || [])
          .filter((p) => !p.person_id)
          .map((p) => ({ number: p.phone_number, label: p.label, note: p.note }));

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
