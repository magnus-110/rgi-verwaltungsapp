import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ChevronDown,
  ShieldAlert,
  Building2,
  Wrench,
  Siren,
  AlertTriangle,
  Phone,
} from "lucide-react";
import {
  PROPERTY_MANAGER_FALLBACK,
  PUBLIC_EMERGENCY_NUMBERS,
  getCategoryHint,
} from "@/lib/emergencyContactInfo";
import { ListRow } from "@/components/dashboard/owner/ListRow";
import { cn } from "@/lib/utils";

interface Props {
  buildingIds: string[];
}

interface EmergencyAssignment {
  id: string;
  building_id: string;
  service_category: string | null;
  emergency_note: string | null;
  emergency_sort_order: number | null;
  contact: {
    id: string;
    company_name: string | null;
    first_name: string | null;
    last_name: string | null;
    contact_phones: { phone_number: string; label: string | null }[];
    contact_emails: { email: string; label: string | null; is_primary: boolean | null }[];
  } | null;
}

interface EntryRow {
  key: string;
  title: string;
  phone?: string;
  hint?: string | null;
}

const SectionHeading = ({ children }: { children: React.ReactNode }) => (
  <div className="font-display text-[11px] font-semibold uppercase tracking-[0.6px] text-muted-foreground/80 px-4 pt-4 pb-1">
    {children}
  </div>
);

function ContactEntry({
  row,
  iconBg,
  iconColor,
  icon: Icon,
}: {
  row: EntryRow;
  iconBg: string;
  iconColor: string;
  icon: typeof Phone;
}) {
  const subtitle = [row.phone, row.hint].filter(Boolean).join(" · ");
  return (
    <ListRow
      icon={Icon}
      iconBg={iconBg}
      iconColor={iconColor}
      title={row.title}
      subtitle={subtitle}
      href={row.phone ? `tel:${row.phone.replace(/\s+/g, "")}` : undefined}
      showChevron={!!row.phone}
    />
  );
}

export function EmergencyContactsWidget({ buildingIds }: Props) {
  const [open, setOpen] = useState(false);
  const [assignments, setAssignments] = useState<EmergencyAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!buildingIds || buildingIds.length === 0) {
        setAssignments([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data: aData } = await supabase
        .from("contact_building_assignments")
        .select(`
          id, building_id, service_category, emergency_note, emergency_sort_order,
          contact:contacts(
            id, company_name, first_name, last_name,
            contact_phones(phone_number, label),
            contact_emails(email, label, is_primary)
          )
        `)
        .in("building_id", buildingIds)
        .eq("is_active", true)
        .eq("is_emergency_contact", true);
      setAssignments((aData || []) as any[]);
      setLoading(false);
    };
    load();
  }, [JSON.stringify(buildingIds)]);

  const getName = (c: EmergencyAssignment["contact"]) =>
    c?.company_name || [c?.first_name, c?.last_name].filter(Boolean).join(" ") || "Dienstleister";

  const isVerwaltung = (cat: string) => cat.toLowerCase().includes("hausmeister");
  const sortedAssignments = [...assignments].sort(
    (x, y) => (x.emergency_sort_order ?? 999) - (y.emergency_sort_order ?? 999)
  );
  const verwaltungAssignments = sortedAssignments.filter(
    (a) => a.service_category && isVerwaltung(a.service_category)
  );
  const technischAssignments = sortedAssignments.filter(
    (a) => a.service_category && !isVerwaltung(a.service_category)
  );

  const buildRow = (a: EmergencyAssignment, fallbackCat: string): EntryRow | null => {
    const c = a.contact;
    if (!c) return null;
    const phone = (c.contact_phones || [])[0]?.phone_number;
    const cat = a.service_category || fallbackCat;
    return {
      key: a.id,
      title: `${cat} – ${getName(c)}`,
      phone,
      hint: a.emergency_note || getCategoryHint(cat),
    };
  };

  const verwaltungRows: EntryRow[] = [
    {
      key: "hv",
      title: "Hausverwaltung",
      phone: PROPERTY_MANAGER_FALLBACK.phone,
      hint: "Mo–Fr 10:00–15:00 · Gemeinschaftseigentum",
    },
    ...verwaltungAssignments
      .map((a) => buildRow(a, "Hausmeister"))
      .filter((r): r is EntryRow => r !== null),
  ];

  const technischRows: EntryRow[] = technischAssignments
    .map((a) => buildRow(a, "Sonstiges"))
    .filter((r): r is EntryRow => r !== null);

  const notrufRows: EntryRow[] = PUBLIC_EMERGENCY_NUMBERS.map((n, idx) => ({
    key: `notruf-${idx}`,
    title: n.label,
    phone: n.number,
    hint: n.whenToCall,
  }));

  const totalCount =
    verwaltungRows.length + technischRows.length + notrufRows.length;

  return (
    <div className="bg-card rounded-[14px] border border-border/60 overflow-hidden shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-4 px-4 py-3.5 text-left min-h-[64px] transition-colors hover:bg-muted/40 active:bg-muted/60"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500/10">
          <ShieldAlert className="h-5 w-5 text-orange-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display text-[15px] font-medium text-foreground leading-tight tracking-tight">
            Notfall-Nummern
          </div>
          <div className="text-[13px] text-muted-foreground mt-0.5 leading-snug">
            Verwaltung, Technik &amp; öffentliche Notrufe
          </div>
        </div>
        <ChevronDown
          className={cn(
            "h-5 w-5 text-muted-foreground/60 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div>
          <div className="h-px bg-foreground/[0.055]" />

          {loading ? (
            <div className="px-4 py-6 text-[13px] text-muted-foreground">Lade…</div>
          ) : (
            <>
              {/* Hinweis */}
              <div className="flex items-start gap-3 px-4 py-3.5">
                <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  Bitte immer zuerst die Hausverwaltung kontaktieren. Externe
                  Handwerker nur, wenn diese nicht erreichbar ist.
                </p>
              </div>

              {/* Verwaltung */}
              <div className="h-px bg-foreground/[0.055]" />
              <SectionHeading>
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="h-3 w-3" />
                  Verwaltung &amp; Betreuung
                </span>
              </SectionHeading>
              {verwaltungRows.map((row, idx) => (
                <div key={row.key}>
                  {idx > 0 && <div className="h-px bg-foreground/[0.055] ml-[60px]" />}
                  <ContactEntry
                    row={row}
                    icon={Phone}
                    iconBg="bg-orange-500/10"
                    iconColor="text-orange-600"
                  />
                </div>
              ))}

              {/* Technik */}
              <div className="h-px bg-foreground/[0.055]" />
              <SectionHeading>
                <span className="inline-flex items-center gap-1.5">
                  <Wrench className="h-3 w-3" />
                  Technische Betreuung
                </span>
              </SectionHeading>
              {technischRows.length === 0 ? (
                <div className="px-4 py-3.5 text-[13px] text-muted-foreground">
                  Keine Handwerksbetriebe als Notfallkontakt freigeschaltet.
                </div>
              ) : (
                technischRows.map((row, idx) => (
                  <div key={row.key}>
                    {idx > 0 && <div className="h-px bg-foreground/[0.055] ml-[60px]" />}
                    <ContactEntry
                      row={row}
                      icon={Phone}
                      iconBg="bg-orange-500/10"
                      iconColor="text-orange-600"
                    />
                  </div>
                ))
              )}

              {/* Öffentliche Notrufe */}
              <div className="h-px bg-foreground/[0.055]" />
              <SectionHeading>
                <span className="inline-flex items-center gap-1.5">
                  <Siren className="h-3 w-3" />
                  Öffentliche Notrufe
                </span>
              </SectionHeading>
              {notrufRows.map((row, idx) => (
                <div key={row.key}>
                  {idx > 0 && <div className="h-px bg-foreground/[0.055] ml-[60px]" />}
                  <ContactEntry
                    row={row}
                    icon={Phone}
                    iconBg="bg-red-500/10"
                    iconColor="text-red-600"
                  />
                </div>
              ))}
              <div className="pb-2" />
            </>
          )}
        </div>
      )}
    </div>
  );
}
