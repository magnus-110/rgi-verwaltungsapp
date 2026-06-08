import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ChevronDown,
  ShieldAlert,
  Wrench,
  Siren,
  AlertTriangle,
  Phone,
  Mail,
  Info,
} from "lucide-react";
import {
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
  email?: string;
  hint?: string | null;
  category?: string;
}

const SectionHeading = ({ children }: { children: React.ReactNode }) => (
  <div className="font-display text-[11px] font-semibold uppercase tracking-[0.6px] text-muted-foreground/80 px-4 pt-4 pb-1">
    {children}
  </div>
);

function ServiceProviderEntry({
  row,
  iconBg,
  iconColor,
  expanded,
  onToggle,
}: {
  row: EntryRow;
  iconBg: string;
  iconColor: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <ListRow
        icon={Phone}
        iconBg={iconBg}
        iconColor={iconColor}
        title={row.title}
        subtitle={row.category}
        onClick={onToggle}
        right={
          <ChevronDown
            className={cn(
              "h-5 w-5 text-muted-foreground/60 transition-transform duration-200 shrink-0",
              expanded && "rotate-180"
            )}
          />
        }
      />
      {expanded && (
        <div className="bg-muted/30 px-4 py-3 space-y-2 border-t border-foreground/[0.055]">
          {row.phone && (
            <a
              href={`tel:${row.phone.replace(/\s+/g, "")}`}
              className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-background transition-colors"
            >
              <Phone className="h-4 w-4 text-orange-600 shrink-0" />
              <span className="text-[14px] font-medium text-foreground tabular-nums">{row.phone}</span>
            </a>
          )}
          {row.email && (
            <a
              href={`mailto:${row.email}`}
              className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-background transition-colors"
            >
              <Mail className="h-4 w-4 text-primary shrink-0" />
              <span className="text-[14px] text-foreground truncate">{row.email}</span>
            </a>
          )}
          {row.hint && (
            <div className="flex items-start gap-3 px-2 py-2">
              <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <span className="text-[13px] text-muted-foreground leading-relaxed">{row.hint}</span>
            </div>
          )}
          {!row.phone && !row.email && !row.hint && (
            <div className="text-[13px] text-muted-foreground px-2 py-1">
              Keine weiteren Kontaktdaten hinterlegt.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PublicEmergencyEntry({
  row,
  iconBg,
  iconColor,
  expanded,
  onToggle,
}: {
  row: EntryRow;
  iconBg: string;
  iconColor: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <ListRow
        icon={Phone}
        iconBg={iconBg}
        iconColor={iconColor}
        title={row.title}
        subtitle={row.phone}
        onClick={onToggle}
        right={
          <ChevronDown
            className={cn(
              "h-5 w-5 text-muted-foreground/60 transition-transform duration-200 shrink-0",
              expanded && "rotate-180"
            )}
          />
        }
      />
      {expanded && (
        <div className="bg-muted/30 px-4 py-3 space-y-2 border-t border-foreground/[0.055]">
          {row.phone && (
            <a
              href={`tel:${row.phone.replace(/\s+/g, "")}`}
              className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-background transition-colors"
            >
              <Phone className="h-4 w-4 text-red-600 shrink-0" />
              <span className="text-[14px] font-medium text-foreground tabular-nums">{row.phone}</span>
            </a>
          )}
          {row.hint && (
            <div className="flex items-start gap-3 px-2 py-2">
              <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <span className="text-[13px] text-muted-foreground leading-relaxed">{row.hint}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function EmergencyContactsWidget({ buildingIds }: Props) {
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
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

  const sortedAssignments = [...assignments].sort(
    (x, y) => (x.emergency_sort_order ?? 999) - (y.emergency_sort_order ?? 999)
  );

  const buildRow = (a: EmergencyAssignment, fallbackCat: string): EntryRow | null => {
    const c = a.contact;
    if (!c) return null;
    const phone = (c.contact_phones || [])[0]?.phone_number;
    const primaryEmail =
      (c.contact_emails || []).find((e) => e.is_primary)?.email ||
      (c.contact_emails || [])[0]?.email;
    const cat = a.service_category || fallbackCat;
    return {
      key: a.id,
      title: getName(c),
      category: cat,
      phone,
      email: primaryEmail,
      hint: a.emergency_note || getCategoryHint(cat),
    };
  };

  const dienstleisterRows: EntryRow[] = sortedAssignments
    .map((a) => buildRow(a, "Sonstiges"))
    .filter((r): r is EntryRow => r !== null);

  const notrufRows: EntryRow[] = PUBLIC_EMERGENCY_NUMBERS.map((n, idx) => ({
    key: `notruf-${idx}`,
    title: n.label,
    phone: n.number,
    hint: n.whenToCall,
  }));

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
            Dienstleister &amp; öffentliche Notrufe
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

              {/* Dienstleister */}
              <div className="h-px bg-foreground/[0.055]" />
              <SectionHeading>
                <span className="inline-flex items-center gap-1.5">
                  <Wrench className="h-3 w-3" />
                  Dienstleister
                </span>
              </SectionHeading>
              {dienstleisterRows.length === 0 ? (
                <div className="px-4 py-3.5 text-[13px] text-muted-foreground">
                  Keine Dienstleister als Notfallkontakt freigeschaltet.
                </div>
              ) : (
                dienstleisterRows.map((row, idx) => (
                  <div key={row.key}>
                    {idx > 0 && <div className="h-px bg-foreground/[0.055] ml-[60px]" />}
                    <ServiceProviderEntry
                      row={row}
                      iconBg="bg-orange-500/10"
                      iconColor="text-orange-600"
                      expanded={expandedId === row.key}
                      onToggle={() =>
                        setExpandedId((cur) => (cur === row.key ? null : row.key))
                      }
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
                  <PublicEmergencyEntry
                    row={row}
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
