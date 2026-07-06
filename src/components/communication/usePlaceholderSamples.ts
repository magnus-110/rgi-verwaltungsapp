import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PlaceholderSamples = Record<string, string>;

const FALLBACK: PlaceholderSamples = {
  anrede: "Herr",
  anrede_brief: "Sehr geehrter Herr Mustermann,",
  vorname: "Max",
  nachname: "Mustermann",
  vollname: "Max Mustermann",
  titel: "Eigentümer",
  firma: "Musterfirma GmbH",
  strasse: "Musterstraße 1",
  plz: "12345",
  ort: "Musterstadt",
  adresse_block: "Max Mustermann\nMusterstraße 1\n12345 Musterstadt",
  email: "max@beispiel.de",
  telefon: "+49 123 4567890",
  gebaeude_name: "Liegenschaft",
  gebaeude_strasse: "Hauptstraße 10, 12345 Musterstadt",
  einheit: "WE 03",
  rolle: "Eigentümer",
  mea: "100/1000",
  verwalter_name: "Verwaltung",
  verwalter_email: "info@verwaltung.de",
  verwalter_telefon: "+49 123 4567890",
  datum_heute: new Date().toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" }),
  ort_datum: `Musterstadt, ${new Date().toLocaleDateString("de-DE")}`,
};

function buildSalutation(sal?: string, lastName?: string): string {
  const s = (sal || "").trim().toLowerCase();
  if (!lastName) return "Sehr geehrte Damen und Herren,";
  if (s === "herr") return `Sehr geehrter Herr ${lastName},`;
  if (s === "frau") return `Sehr geehrte Frau ${lastName},`;
  if (s.includes("familie") || s === "fam" || s === "fam.") return `Sehr geehrte Familie ${lastName},`;
  if (s.includes("eheleute")) return `Sehr geehrte Eheleute ${lastName},`;
  if (s.includes("herr") && s.includes("frau")) return `Sehr geehrte Frau ${lastName}, sehr geehrter Herr ${lastName},`;
  return "Sehr geehrte Damen und Herren,";
}

/**
 * Returns concrete sample values for each placeholder, taken from the FIRST selected recipient
 * (or first contact in the building). Used to render friendly previews and palette cards.
 */
export function usePlaceholderSamples(buildingId: string, contactIds?: string[]) {
  return useQuery({
    queryKey: ["placeholder-samples", buildingId, (contactIds || []).slice().sort().join(",")],
    queryFn: async (): Promise<PlaceholderSamples> => {
      const { data: building } = await supabase
        .from("buildings")
        .select("id, name, address, manager_name")
        .eq("id", buildingId)
        .maybeSingle();

      const { data: assigns = [] } = await supabase
        .from("contact_building_assignments")
        .select("contact_id, unit_number, role_in_building")
        .eq("building_id", buildingId)
        .or("is_active.is.null,is_active.eq.true");

      const filtered = (contactIds && contactIds.length > 0 && !contactIds.includes("__none__"))
        ? (assigns || []).filter((a: any) => contactIds.includes(a.contact_id))
        : (assigns || []);
      const target = filtered.length > 0 ? filtered : (assigns || []);

      const samples: PlaceholderSamples = { ...FALLBACK };
      if (building?.name) samples.gebaeude_name = building.name;
      if (building?.address) samples.gebaeude_strasse = building.address;
      if (building?.manager_name) samples.verwalter_name = building.manager_name;

      if (target.length === 0) return samples;

      const a: any = target[0];
      const [{ data: c }, { data: persons = [] }, { data: emails = [] }] = await Promise.all([
        supabase.from("contacts").select("id, salutation, first_name, last_name, company_name, address_street, address_zip, address_city").eq("id", a.contact_id).maybeSingle(),
        supabase.from("contact_persons").select("contact_id, is_primary, salutation, first_name, last_name, position, phone, email").eq("contact_id", a.contact_id),
        supabase.from("contact_emails").select("contact_id, email, is_primary").eq("contact_id", a.contact_id),
      ]);

      const personList = persons || [];
      const primary: any = personList.find((p: any) => p.is_primary) || personList[0] || {};
      const eList = emails || [];
      const primaryEmail: any = eList.find((e: any) => e.is_primary) || eList[0];

      const firstName = primary.first_name || (c as any)?.first_name || "";
      const lastName = primary.last_name || (c as any)?.last_name || "";
      const sal = primary.salutation || (c as any)?.salutation || "";

      if (sal) samples.anrede = sal;
      samples.anrede_brief = buildSalutation(sal, lastName);
      if (firstName) samples.vorname = firstName;
      if (lastName) samples.nachname = lastName;
      if (firstName || lastName) samples.vollname = `${firstName} ${lastName}`.trim();
      if (primary.position) samples.titel = primary.position;

      if ((c as any)?.company_name) samples.firma = (c as any).company_name;
      if ((c as any)?.address_street) samples.strasse = (c as any).address_street;
      if ((c as any)?.address_zip) samples.plz = (c as any).address_zip;
      if ((c as any)?.address_city) samples.ort = (c as any).address_city;
      const addrLines = [
        `${firstName} ${lastName}`.trim(),
        (c as any)?.company_name,
        (c as any)?.address_street,
        [(c as any)?.address_zip, (c as any)?.address_city].filter(Boolean).join(" "),
      ].filter(Boolean);
      if (addrLines.length > 0) samples.adresse_block = addrLines.join("\n");

      const mail = primaryEmail?.email || primary.email;
      if (mail) samples.email = mail;
      if (primary.phone) samples.telefon = primary.phone;

      if (a.unit_number) samples.einheit = a.unit_number;
      if (a.role_in_building) samples.rolle = a.role_in_building;

      samples.datum_heute = new Date().toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
      samples.ort_datum = `${(c as any)?.address_city || "Ort"}, ${new Date().toLocaleDateString("de-DE")}`;

      return samples;
    },
    enabled: !!buildingId,
    staleTime: 30_000,
  });
}

