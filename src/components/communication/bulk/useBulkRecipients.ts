import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { extractEmails } from "@/lib/extractEmails";

export type BulkRecipient = {
  /** `${assignment_id}|${email_lowercase}` — Schlüssel für Auswahl + Anhänge */
  key: string;
  assignmentId: string;
  contactId: string;
  unitNumber: string | null;
  /** normalisierte Einheitennummer (führende Nullen entfernt) für Datei-Matching */
  unitKey: string | null;
  role: string | null;
  name: string;
  /** leer, wenn keine verwertbare Adresse hinterlegt ist */
  email: string;
  hasEmail: boolean;
  source: "kontakt" | "person" | "keine";
};

export const normalizeUnit = (u: string | null | undefined): string | null => {
  if (!u) return null;
  const digits = String(u).match(/\d+/)?.[0];
  return digits ? String(Number(digits)) : String(u).trim().toLowerCase();
};

export const useBulkRecipients = (buildingId: string | null, excludeRoles: string[] = ["dienstleister"]) =>
  useQuery({
    queryKey: ["bulk-recipients", buildingId],
    enabled: !!buildingId,
    queryFn: async (): Promise<BulkRecipient[]> => {
      const { data: assigns, error } = await supabase
        .from("contact_building_assignments")
        .select("id, contact_id, unit_number, role_in_building, contacts(id, first_name, last_name, company_name)")
        .eq("building_id", buildingId!)
        .or("is_active.is.null,is_active.eq.true");
      if (error) throw error;

      const ex = new Set(excludeRoles.map((r) => r.toLowerCase()));
      const rows = (assigns || []).filter(
        (a: any) => !a.role_in_building || !ex.has(String(a.role_in_building).toLowerCase()),
      );
      const contactIds = Array.from(new Set(rows.map((a: any) => a.contact_id)));
      if (contactIds.length === 0) return [];

      const [{ data: ce }, { data: cp }] = await Promise.all([
        supabase.from("contact_emails").select("contact_id, email, is_primary").in("contact_id", contactIds),
        supabase
          .from("contact_persons")
          .select("contact_id, email, first_name, last_name, is_primary")
          .in("contact_id", contactIds),
      ]);

      type Cand = { email: string; label: string | null; source: "kontakt" | "person"; primary: boolean };
      const byContact = new Map<string, Cand[]>();
      const push = (contactId: string, cand: Cand) => {
        const arr = byContact.get(contactId) || [];
        if (!arr.some((c) => c.email.toLowerCase() === cand.email.toLowerCase())) arr.push(cand);
        byContact.set(contactId, arr);
      };
      (ce || [])
        .sort((a: any, b: any) => Number(!!b.is_primary) - Number(!!a.is_primary))
        .forEach((r: any) =>
          extractEmails(r.email).forEach((e) =>
            push(r.contact_id, { email: e, label: null, source: "kontakt", primary: !!r.is_primary }),
          ),
        );
      (cp || [])
        .sort((a: any, b: any) => Number(!!b.is_primary) - Number(!!a.is_primary))
        .forEach((p: any) =>
          extractEmails(p.email).forEach((e) =>
            push(p.contact_id, {
              email: e,
              label: [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || null,
              source: "person",
              primary: !!p.is_primary,
            }),
          ),
        );

      const out: BulkRecipient[] = [];
      for (const a of rows as any[]) {
        const c = a.contacts;
        const baseName = c?.company_name || `${c?.first_name || ""} ${c?.last_name || ""}`.trim() || "(ohne Name)";
        const cands = byContact.get(a.contact_id) || [];
        if (cands.length === 0) {
          // Zuordnung ohne verwertbare E-Mail: trotzdem als (nicht wählbare)
          // Karte ausgeben, damit niemand unsichtbar aus der Liste fällt.
          out.push({
            key: `${a.id}|`,
            assignmentId: a.id,
            contactId: a.contact_id,
            unitNumber: a.unit_number || null,
            unitKey: normalizeUnit(a.unit_number),
            role: a.role_in_building || null,
            name: baseName,
            email: "",
            hasEmail: false,
            source: "keine",
          });
          continue;
        }
        for (const cand of cands) {
          out.push({
            key: `${a.id}|${cand.email.toLowerCase()}`,
            assignmentId: a.id,
            contactId: a.contact_id,
            unitNumber: a.unit_number || null,
            unitKey: normalizeUnit(a.unit_number),
            role: a.role_in_building || null,
            name: cand.label && cand.label !== baseName ? `${baseName} (${cand.label})` : baseName,
            email: cand.email,
            hasEmail: true,
            source: cand.source,
          });
        }
      }

      // Diagnose: jede aktive Zuordnung muss mindestens eine Karte erzeugen.
      const covered = new Set(out.map((r) => r.assignmentId));
      const missing = (rows as any[]).filter((a) => !covered.has(a.id));
      if (missing.length > 0) {
        console.warn(
          "[bulk-recipients] Zuordnungen ohne Empfänger-Karte:",
          missing.map((a) => ({ id: a.id, unit: a.unit_number, contact: a.contact_id })),
        );
      }
      console.debug(
        `[bulk-recipients] building=${buildingId} zuordnungen=${rows.length} karten=${out.length} ohne_email=${out.filter((r) => !r.hasEmail).length}`,
      );

      return out.sort((x, y) => {
        const xu = x.unitNumber || "zzz";
        const yu = y.unitNumber || "zzz";
        const c = xu.localeCompare(yu, undefined, { numeric: true });
        return c !== 0 ? c : x.name.localeCompare(y.name);
      });
    },
  });
