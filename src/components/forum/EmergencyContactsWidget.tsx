import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Phone, Mail, ChevronDown, ShieldAlert, Building2, Wrench, Siren, AlertTriangle } from "lucide-react";
import {
  PROPERTY_MANAGER_FALLBACK,
  PUBLIC_EMERGENCY_NUMBERS,
  getCategoryHint,
} from "@/lib/emergencyContactInfo";
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

type SectionKey = "verwaltung" | "technisch" | "notrufe";
type Accent = "orange" | "destructive";

interface EntryRow {
  key: string;
  label: string;
  value: string;
  hint?: string | null;
  phoneHref?: string;
}

function Entry({ row, accent }: { row: EntryRow; accent: Accent }) {
  const linkColor =
    accent === "orange"
      ? "hover:text-rgi-orange"
      : "hover:text-destructive";
  return (
    <div className="space-y-0.5">
      <div className="text-sm leading-snug">
        <span className="font-semibold text-foreground">{row.label}:</span>{" "}
        {row.phoneHref ? (
          <a
            href={row.phoneHref}
            className={cn("text-foreground transition-colors font-medium tabular-nums", linkColor)}
          >
            {row.value}
          </a>
        ) : (
          <span className="text-foreground font-medium tabular-nums">{row.value}</span>
        )}
      </div>
      {row.hint && (
        <p className="text-xs italic text-muted-foreground leading-relaxed">{row.hint}</p>
      )}
    </div>
  );
}

interface SectionCardProps {
  sectionKey: SectionKey;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: Accent;
  expanded: boolean;
  onToggle: () => void;
  rows: EntryRow[];
  emptyText?: string;
}

function SectionCard({
  title,
  icon: Icon,
  accent,
  expanded,
  onToggle,
  rows,
  emptyText,
}: SectionCardProps) {
  const accentBar = accent === "orange" ? "bg-rgi-orange" : "bg-destructive";
  const iconBg =
    accent === "orange"
      ? "bg-rgi-orange/10 text-rgi-orange"
      : "bg-destructive/10 text-destructive";

  return (
    <div className="bg-card rounded-[16px] border border-border/50 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className={cn("h-1", accentBar)} />
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/30 transition-colors"
      >
        <div className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-full", iconBg)}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="flex-1 text-sm font-semibold text-foreground">{title}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-180"
          )}
        />
      </button>
      {expanded && (
        <div className="border-t border-border/50 px-5 py-4 space-y-3 animate-accordion-down">
          {rows.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              {emptyText || "Keine Einträge hinterlegt."}
            </p>
          ) : (
            rows.map((row) => <Entry key={row.key} row={row} accent={accent} />)
          )}
        </div>
      )}
    </div>
  );
}

export function EmergencyContactsWidget({ buildingIds }: Props) {
  const [open, setOpen] = useState(false);
  const [expandedSection, setExpandedSection] = useState<SectionKey | null>(null);
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

  const toggleSection = (key: SectionKey) =>
    setExpandedSection((prev) => (prev === key ? null : key));

  const getName = (c: EmergencyAssignment["contact"]) =>
    c?.company_name || [c?.first_name, c?.last_name].filter(Boolean).join(" ") || "Dienstleister";

  // Split into Verwaltung (Hausmeister) and Technisch (rest)
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
    const phone = (c.contact_phones || [])[0];
    const cat = a.service_category || fallbackCat;
    const value = phone ? `${getName(c)} ${phone.phone_number}` : getName(c);
    return {
      key: a.id,
      label: cat,
      value,
      phoneHref: phone ? `tel:${phone.phone_number.replace(/\s+/g, "")}` : undefined,
      hint: a.emergency_note || getCategoryHint(cat),
    };
  };

  // Verwaltung rows: Hausverwaltung first (fix), then assigned Hausmeister
  const verwaltungRows: EntryRow[] = [
    {
      key: "hv",
      label: "Hausverwaltung",
      value: PROPERTY_MANAGER_FALLBACK.phone,
      phoneHref: `tel:${PROPERTY_MANAGER_FALLBACK.phone.replace(/\s+/g, "")}`,
      hint: "Für alle Schäden am Gemeinschaftseigentum während der Bürozeiten.",
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
    label: n.label,
    value: n.number,
    phoneHref: `tel:${n.number}`,
    hint: n.whenToCall,
  }));

  return (
    <Card className="border-border/60 shadow-sm overflow-hidden">
      <CardContent className="p-0">
        {/* Outer header / toggle */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-muted/40 transition-colors"
          aria-expanded={open}
        >
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-rgi-orange/10 flex items-center justify-center">
              <ShieldAlert className="h-4 w-4 text-rgi-orange" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground leading-tight">Notfall-Nummern</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Verwaltung, Technische Betreuung und öffentliche Notrufe
              </p>
            </div>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        </button>

        {open && (
          <div className="border-t border-border/60 bg-background">
            {loading ? (
              <p className="text-xs text-muted-foreground px-6 py-6">Lade…</p>
            ) : (
              <div className="px-5 sm:px-6 py-5 space-y-3">
                {/* WICHTIG hint */}
                <div className="flex gap-3 rounded-[14px] bg-rgi-orange/[0.06] border border-rgi-orange/20 px-4 py-3">
                  <AlertTriangle className="h-4 w-4 text-rgi-orange shrink-0 mt-0.5" />
                  <p className="text-sm leading-relaxed text-foreground">
                    <span className="font-bold text-rgi-orange-dark">WICHTIG:</span> Bitte
                    kontaktieren Sie in jedem Fall zuerst die Hausverwaltung. Externe
                    Handwerksbetriebe dürfen nur dann eigenständig beauftragt werden, wenn die
                    Hausverwaltung nicht erreichbar ist.
                  </p>
                </div>

                {/* Section cards */}
                <SectionCard
                  sectionKey="verwaltung"
                  title="Verwaltung & Betreuung"
                  icon={Building2}
                  accent="orange"
                  expanded={expandedSection === "verwaltung"}
                  onToggle={() => toggleSection("verwaltung")}
                  rows={verwaltungRows}
                />
                <SectionCard
                  sectionKey="technisch"
                  title="Technische Betreuung"
                  icon={Wrench}
                  accent="orange"
                  expanded={expandedSection === "technisch"}
                  onToggle={() => toggleSection("technisch")}
                  rows={technischRows}
                  emptyText="Aktuell sind keine Handwerksbetriebe als Notfallkontakt freigeschaltet."
                />
                <SectionCard
                  sectionKey="notrufe"
                  title="Öffentliche Notrufe"
                  icon={Siren}
                  accent="destructive"
                  expanded={expandedSection === "notrufe"}
                  onToggle={() => toggleSection("notrufe")}
                  rows={notrufRows}
                />

                {/* Footer contact bar */}
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-3 px-1 text-xs text-muted-foreground">
                  <a
                    href={`tel:${PROPERTY_MANAGER_FALLBACK.phone.replace(/\s+/g, "")}`}
                    className="inline-flex items-center gap-2 hover:text-rgi-orange transition-colors"
                  >
                    <Phone className="h-3.5 w-3.5 text-rgi-orange" />
                    <span className="tabular-nums">{PROPERTY_MANAGER_FALLBACK.phone}</span>
                  </a>
                  <a
                    href={`mailto:${PROPERTY_MANAGER_FALLBACK.email}`}
                    className="inline-flex items-center gap-2 hover:text-rgi-orange transition-colors"
                  >
                    <Mail className="h-3.5 w-3.5 text-rgi-orange" />
                    <span>{PROPERTY_MANAGER_FALLBACK.email}</span>
                  </a>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
