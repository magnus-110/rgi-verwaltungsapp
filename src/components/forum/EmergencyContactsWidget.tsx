import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Phone, Mail, Building2, ChevronDown, ShieldAlert, Flame, Stethoscope, Shield } from "lucide-react";
import {
  PROPERTY_MANAGER_HINT,
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

const HANDWERKER_INTRO =
  "Bitte nur kontaktieren, wenn die Hausverwaltung außerhalb der Bürozeiten nicht erreichbar ist. Tippen Sie auf das passende Gewerk, um Telefonnummer und Hinweise zu sehen.";

const NOTRUF_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Feuerwehr: Flame,
  Rettungsdienst: Stethoscope,
  Polizei: Shield,
};

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

  // Group assignments by service_category
  const grouped: Record<string, EmergencyAssignment[]> = {};
  for (const a of assignments) {
    const key = a.service_category || "Sonstiges";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(a);
  }
  Object.values(grouped).forEach((list) =>
    list.sort((x, y) => (x.emergency_sort_order ?? 999) - (y.emergency_sort_order ?? 999))
  );

  const sortedCategories = Object.keys(grouped).sort();

  const getName = (c: EmergencyAssignment["contact"]) =>
    c?.company_name || [c?.first_name, c?.last_name].filter(Boolean).join(" ") || "Dienstleister";

  const toggle = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  return (
    <Card className="border-border/60 shadow-sm overflow-hidden">
      <CardContent className="p-0">
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
              <h2 className="text-sm font-semibold text-foreground leading-tight">Notfallkontakte</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Hausverwaltung, Handwerksbetriebe und öffentliche Notrufe
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
          <div className="px-5 pb-5 pt-1 space-y-6 border-t border-border/60 bg-gradient-to-b from-rgi-orange/[0.02] to-transparent">
            {/* Eskalations-Hinweis */}
            <p className="text-xs text-muted-foreground leading-relaxed pt-4">
              {PROPERTY_MANAGER_HINT}
            </p>

            {/* Hausverwaltung */}
            <section className="space-y-2.5">
              <SectionTitle>Hausverwaltung</SectionTitle>
              <div className="rounded-lg border border-rgi-orange/30 bg-rgi-orange/[0.04] p-4 border-l-4 border-l-rgi-orange">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-md bg-rgi-orange/15 flex items-center justify-center flex-shrink-0">
                    <Building2 className="h-4 w-4 text-rgi-orange" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{PROPERTY_MANAGER_FALLBACK.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Erste Anlaufstelle für alle Schäden am Gemeinschaftseigentum während der Bürozeiten.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <a
                        href={`tel:${PROPERTY_MANAGER_FALLBACK.phone.replace(/\s+/g, "")}`}
                        className="inline-flex items-center gap-1.5 rounded-full bg-rgi-orange text-white px-3 py-1.5 text-xs font-medium hover:bg-rgi-orange-dark transition-colors"
                      >
                        <Phone className="h-3.5 w-3.5" /> {PROPERTY_MANAGER_FALLBACK.phone}
                      </a>
                      <a
                        href={`mailto:${PROPERTY_MANAGER_FALLBACK.email}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-rgi-orange/40 text-rgi-orange-dark px-3 py-1.5 text-xs font-medium hover:bg-rgi-orange/10 transition-colors"
                      >
                        <Mail className="h-3.5 w-3.5" /> E-Mail
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Externe Handwerksbetriebe */}
            {loading ? (
              <p className="text-xs text-muted-foreground">Lade…</p>
            ) : sortedCategories.length > 0 ? (
              <section className="space-y-2.5">
                <SectionTitle>Handwerksbetriebe</SectionTitle>
                <p className="text-xs text-muted-foreground leading-relaxed">{HANDWERKER_INTRO}</p>
                <div className="space-y-4 mt-2">
                  {sortedCategories.map((cat) => {
                    const list = grouped[cat];
                    const hint = getCategoryHint(cat);
                    return (
                      <div key={cat} className="space-y-2">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-foreground">{cat}</p>
                          {hint && (
                            <p className="text-xs text-muted-foreground">— {hint}</p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {list.map((a) => {
                            const c = a.contact;
                            if (!c) return null;
                            const isOpen = expandedId === a.id;
                            const phone = (c.contact_phones || [])[0];
                            const email =
                              (c.contact_emails || []).find((e) => e.is_primary) ||
                              (c.contact_emails || [])[0];
                            return (
                              <div key={a.id} className="w-full">
                                <button
                                  type="button"
                                  onClick={() => toggle(a.id)}
                                  aria-expanded={isOpen}
                                  className={cn(
                                    "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all",
                                    isOpen
                                      ? "bg-rgi-orange text-white border-rgi-orange shadow-sm"
                                      : "bg-rgi-orange/10 text-rgi-orange-dark border-rgi-orange/30 hover:bg-rgi-orange/20"
                                  )}
                                >
                                  <Phone className="h-3.5 w-3.5" />
                                  <span className="truncate max-w-[220px]">{getName(c)}</span>
                                  <ChevronDown
                                    className={cn(
                                      "h-3.5 w-3.5 transition-transform duration-200",
                                      isOpen && "rotate-180"
                                    )}
                                  />
                                </button>
                                {isOpen && (
                                  <div className="mt-2 ml-1 rounded-lg border border-rgi-orange/30 bg-card p-3 animate-accordion-down">
                                    {phone && (
                                      <a
                                        href={`tel:${phone.phone_number.replace(/\s+/g, "")}`}
                                        className="inline-flex items-center gap-2 rounded-md bg-rgi-orange/10 hover:bg-rgi-orange/20 transition-colors px-3 py-2 text-sm font-semibold text-rgi-orange-dark tabular-nums"
                                      >
                                        <Phone className="h-4 w-4" /> {phone.phone_number}
                                      </a>
                                    )}
                                    {email && (
                                      <div className="mt-2">
                                        <a
                                          href={`mailto:${email.email}`}
                                          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                          <Mail className="h-3 w-3" /> {email.email}
                                        </a>
                                      </div>
                                    )}
                                    {a.emergency_note && (
                                      <p className="text-xs text-muted-foreground leading-relaxed mt-2 pt-2 border-t border-border/60">
                                        {a.emergency_note}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {/* Öffentliche Notrufe */}
            <section className="space-y-2.5">
              <SectionTitle accent="red">Öffentliche Notrufe</SectionTitle>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Bei akuter Gefahr für Leben, Gesundheit oder Eigentum.
              </p>
              <div className="flex flex-wrap gap-2">
                {PUBLIC_EMERGENCY_NUMBERS.map((n, idx) => {
                  const id = `notruf-${idx}`;
                  const isOpen = expandedId === id;
                  const Icon = NOTRUF_ICONS[n.label] || ShieldAlert;
                  return (
                    <div key={id} className="w-full">
                      <button
                        type="button"
                        onClick={() => toggle(id)}
                        aria-expanded={isOpen}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all",
                          isOpen
                            ? "bg-destructive text-destructive-foreground border-destructive shadow-sm"
                            : "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span>{n.label}</span>
                        <span className="tabular-nums font-semibold">{n.number}</span>
                        <ChevronDown
                          className={cn(
                            "h-3.5 w-3.5 transition-transform duration-200",
                            isOpen && "rotate-180"
                          )}
                        />
                      </button>
                      {isOpen && (
                        <div className="mt-2 ml-1 rounded-lg border border-destructive/30 bg-card p-3 animate-accordion-down">
                          <a
                            href={`tel:${n.number}`}
                            className="inline-flex items-center gap-2 rounded-md bg-destructive/10 hover:bg-destructive/20 transition-colors px-3 py-2 text-base font-bold text-destructive tabular-nums"
                          >
                            <Phone className="h-4 w-4" /> {n.number}
                          </a>
                          <p className="text-xs text-muted-foreground leading-relaxed mt-2">
                            {n.whenToCall}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SectionTitle({
  children,
  accent = "orange",
}: {
  children: React.ReactNode;
  accent?: "orange" | "red";
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "h-3.5 w-1 rounded-full",
          accent === "orange" ? "bg-rgi-orange" : "bg-destructive"
        )}
      />
      <h3 className="text-[11px] font-semibold text-foreground uppercase tracking-wider">
        {children}
      </h3>
    </div>
  );
}
