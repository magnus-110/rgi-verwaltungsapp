import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PlaceholderStats = Record<string, { filled: number; total: number }>;

/**
 * Sample recipients of the building and compute, for each placeholder,
 * how many recipients have a non-empty value. Used to mark empty placeholders
 * in the variable palette.
 */
export function usePlaceholderStats(buildingId: string, contactIds?: string[]) {
  return useQuery({
    queryKey: ["placeholder-stats", buildingId, (contactIds || []).slice().sort().join(",")],
    queryFn: async (): Promise<PlaceholderStats> => {
      const { data: building } = await supabase
        .from("buildings")
        .select("id, name, address, manager_name")
        .eq("id", buildingId)
        .maybeSingle();

      let q = supabase
        .from("contact_building_assignments")
        .select("contact_id, unit_number, role_in_building")
        .eq("building_id", buildingId)
        .or("is_active.is.null,is_active.eq.true");
      const { data: assigns = [] } = await q;

      let useAssigns = assigns || [];
      const filtered = (contactIds && contactIds.length > 0 && !contactIds.includes("__none__"))
        ? useAssigns.filter((a: any) => contactIds.includes(a.contact_id))
        : useAssigns;
      const target = filtered.length > 0 ? filtered : useAssigns;

      if (target.length === 0) {
        return {};
      }

      const ids = Array.from(new Set(target.map((a: any) => a.contact_id)));

      const [{ data: contacts = [] }, { data: persons = [] }, { data: emails = [] }] = await Promise.all([
        supabase.from("contacts").select("id, salutation, first_name, last_name, company_name, address_street, address_zip, address_city").in("id", ids),
        supabase.from("contact_persons").select("contact_id, is_primary, salutation, first_name, last_name, position, phone, email").in("contact_id", ids),
        supabase.from("contact_emails").select("contact_id, email, is_primary").in("contact_id", ids),
      ]);

      const cMap = new Map<string, any>((contacts || []).map((c: any) => [c.id, c]));
      const pMap = new Map<string, any[]>();
      for (const p of persons || []) {
        const arr = pMap.get(p.contact_id) || [];
        arr.push(p); pMap.set(p.contact_id, arr);
      }
      const eMap = new Map<string, any[]>();
      for (const e of emails || []) {
        const arr = eMap.get(e.contact_id) || [];
        arr.push(e); eMap.set(e.contact_id, arr);
      }

      const stats: PlaceholderStats = {};
      const bump = (key: string, ok: boolean, total: number) => {
        const cur = stats[key] || { filled: 0, total };
        cur.total = total;
        if (ok) cur.filled += 1;
        stats[key] = cur;
      };

      const total = target.length;

      for (const a of target) {
        const c = cMap.get(a.contact_id) || {};
        const personList = pMap.get(a.contact_id) || [];
        const primary = personList.find((p) => p.is_primary) || personList[0] || {};
        const eList = eMap.get(a.contact_id) || [];
        const primaryEmail = eList.find((e) => e.is_primary) || eList[0];

        const firstName = primary.first_name || c.first_name || "";
        const lastName = primary.last_name || c.last_name || "";
        const sal = primary.salutation || c.salutation || "";

        bump("anrede", !!sal, total);
        bump("anrede_brief", !!lastName, total);
        bump("vorname", !!firstName, total);
        bump("nachname", !!lastName, total);
        bump("vollname", !!(firstName || lastName), total);
        bump("titel", !!primary.position, total);

        bump("firma", !!c.company_name, total);
        bump("strasse", !!c.address_street, total);
        bump("plz", !!c.address_zip, total);
        bump("ort", !!c.address_city, total);
        bump("adresse_block", !!(c.address_street || c.address_city), total);

        bump("email", !!(primaryEmail?.email || primary.email), total);
        bump("telefon", !!primary.phone, total);

        bump("gebaeude_name", !!building?.name, total);
        bump("gebaeude_strasse", !!building?.address, total);
        bump("einheit", !!a.unit_number, total);
        bump("rolle", !!a.role_in_building, total);
        bump("mea", false, total); // not stored on assignment record currently

        bump("verwalter_name", !!building?.manager_name, total);
        bump("verwalter_email", false, total);
        bump("verwalter_telefon", false, total);
        bump("datum_heute", true, total);
        bump("ort_datum", true, total);
      }

      return stats;
    },
    enabled: !!buildingId,
    staleTime: 30_000,
  });
}
