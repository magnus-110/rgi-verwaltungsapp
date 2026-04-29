import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, Mail, Building2, ChevronDown, ChevronUp, ShieldAlert } from "lucide-react";
import {
  PROPERTY_MANAGER_HINT,
  PROPERTY_MANAGER_FALLBACK,
  PUBLIC_EMERGENCY_NUMBERS,
  getCategoryHint,
} from "@/lib/emergencyContactInfo";

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

interface BuildingInfo {
  id: string;
  name: string;
  manager_name: string | null;
}

export function EmergencyContactsWidget({ buildingIds }: Props) {
  const [open, setOpen] = useState(false);
  const [assignments, setAssignments] = useState<EmergencyAssignment[]>([]);
  const [buildings, setBuildings] = useState<BuildingInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!buildingIds || buildingIds.length === 0) {
        setAssignments([]);
        setBuildings([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const [{ data: aData }, { data: bData }] = await Promise.all([
        supabase
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
          .eq("is_emergency_contact", true),
        supabase
          .from("buildings")
          .select("id, name, manager_name")
          .in("id", buildingIds),
      ]);
      setAssignments((aData || []) as any[]);
      setBuildings((bData || []) as any[]);
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

  return (
    <Card className="border-border/60 shadow-sm">
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-muted/40 transition-colors rounded-lg"
          aria-expanded={open}
        >
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center">
              <ShieldAlert className="h-4 w-4 text-foreground" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground leading-tight">Notfallkontakte</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Hausverwaltung, Handwerksbetriebe und öffentliche Notrufe
              </p>
            </div>
          </div>
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {open && (
          <div className="px-5 pb-5 pt-1 space-y-5 border-t border-border/60">
            {/* Eskalations-Hinweis */}
            <p className="text-xs text-muted-foreground leading-relaxed pt-4">
              {PROPERTY_MANAGER_HINT}
            </p>

            {/* Hausverwaltung */}
            <section className="space-y-2">
              <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Hausverwaltung
              </h3>
              <div className="rounded-md border border-border/60 bg-card p-4">
                <div className="flex items-start gap-3">
                  <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{PROPERTY_MANAGER_FALLBACK.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Erste Anlaufstelle für alle Schäden am Gemeinschaftseigentum während der Bürozeiten.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Button asChild size="sm" variant="outline" className="h-8 gap-1.5">
                        <a href={`tel:${PROPERTY_MANAGER_FALLBACK.phone.replace(/\s+/g, "")}`}>
                          <Phone className="h-3.5 w-3.5" /> {PROPERTY_MANAGER_FALLBACK.phone}
                        </a>
                      </Button>
                      <Button asChild size="sm" variant="outline" className="h-8 gap-1.5">
                        <a href={`mailto:${PROPERTY_MANAGER_FALLBACK.email}`}>
                          <Mail className="h-3.5 w-3.5" /> {PROPERTY_MANAGER_FALLBACK.email}
                        </a>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Externe Handwerksbetriebe */}
            {loading ? (
              <p className="text-xs text-muted-foreground">Lade…</p>
            ) : sortedCategories.length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Handwerksbetriebe
                </h3>
                <div className="rounded-md border border-border/60 bg-card divide-y divide-border/60">
                  {sortedCategories.map((cat) => {
                    const list = grouped[cat];
                    const hint = getCategoryHint(cat);
                    return (
                      <div key={cat} className="p-4">
                        <p className="text-sm font-medium text-foreground">{cat}</p>
                        {hint && (
                          <p className="text-xs text-muted-foreground mt-1">{hint}</p>
                        )}
                        <div className="space-y-2 mt-3">
                          {list.map((a) => {
                            const c = a.contact;
                            if (!c) return null;
                            const phone = (c.contact_phones || [])[0];
                            const email =
                              (c.contact_emails || []).find((e) => e.is_primary) ||
                              (c.contact_emails || [])[0];
                            return (
                              <div
                                key={a.id}
                                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                              >
                                <div className="min-w-0">
                                  <p className="text-sm text-foreground truncate">{getName(c)}</p>
                                  {a.emergency_note && (
                                    <p className="text-xs text-muted-foreground">{a.emergency_note}</p>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-1.5 flex-shrink-0">
                                  {phone && (
                                    <Button asChild size="sm" variant="outline" className="h-8 gap-1.5">
                                      <a href={`tel:${phone.phone_number.replace(/\s+/g, "")}`}>
                                        <Phone className="h-3.5 w-3.5" /> {phone.phone_number}
                                      </a>
                                    </Button>
                                  )}
                                  {email && (
                                    <Button asChild size="sm" variant="ghost" className="h-8 gap-1.5">
                                      <a href={`mailto:${email.email}`}>
                                        <Mail className="h-3.5 w-3.5" /> E-Mail
                                      </a>
                                    </Button>
                                  )}
                                </div>
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
            <section className="space-y-2">
              <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Öffentliche Notrufe
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {PUBLIC_EMERGENCY_NUMBERS.map((n, idx) => (
                  <a
                    key={idx}
                    href={`tel:${n.number}`}
                    className="rounded-md border border-border/60 bg-card p-3 hover:bg-muted/40 transition-colors group"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold text-base text-foreground tabular-nums">{n.number}</span>
                      <span className="text-sm text-foreground">{n.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{n.whenToCall}</p>
                  </a>
                ))}
              </div>
            </section>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
