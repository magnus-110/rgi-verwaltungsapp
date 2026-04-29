import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, Mail, BellRing, Building2, AlertTriangle, ChevronDown, ChevronUp, Siren } from "lucide-react";
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
  const [open, setOpen] = useState(true);
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
    <Card className="border-orange-500/30 bg-orange-500/5 shadow-sm">
      <CardContent className="p-4 md:p-6 space-y-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-2 text-left"
        >
          <div className="flex items-center gap-2">
            <Siren className="h-5 w-5 text-orange-600" />
            <h2 className="text-lg font-semibold text-foreground">Notfall- und Wichtige Kontakte</h2>
          </div>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {open && (
          <>
            {/* Hinweistext */}
            <div className="rounded-md bg-orange-500/10 border border-orange-500/30 p-3 flex gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs md:text-sm text-foreground">{PROPERTY_MANAGER_HINT}</p>
            </div>

            {/* Hausverwaltung */}
            <div className="rounded-md border bg-background p-3">
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm">Hausverwaltung</span>
                <Badge variant="secondary" className="text-[10px]">Erste Anlaufstelle</Badge>
              </div>
              <p className="text-sm font-medium">{PROPERTY_MANAGER_FALLBACK.name}</p>
              <p className="text-xs text-muted-foreground mb-3">
                Für alle Schäden am Gemeinschaftseigentum während der Bürozeiten.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" className="gap-1">
                  <a href={`tel:${PROPERTY_MANAGER_FALLBACK.phone.replace(/\s+/g, "")}`}>
                    <Phone className="h-3.5 w-3.5" /> {PROPERTY_MANAGER_FALLBACK.phone}
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline" className="gap-1">
                  <a href={`mailto:${PROPERTY_MANAGER_FALLBACK.email}`}>
                    <Mail className="h-3.5 w-3.5" /> E-Mail
                  </a>
                </Button>
              </div>
            </div>

            {/* Externe Notfallkontakte */}
            {loading ? (
              <p className="text-xs text-muted-foreground">Lade Notfallkontakte...</p>
            ) : sortedCategories.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Externe Handwerksbetriebe (nur wenn HV nicht erreichbar)
                </p>
                {sortedCategories.map((cat) => {
                  const list = grouped[cat];
                  const hint = getCategoryHint(cat);
                  return (
                    <div key={cat} className="rounded-md border bg-background p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <BellRing className="h-3.5 w-3.5 text-orange-600" />
                        <span className="font-semibold text-sm">{cat}</span>
                      </div>
                      {hint && <p className="text-xs text-muted-foreground mb-2">{hint}</p>}
                      <div className="space-y-2">
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
                                <p className="text-sm font-medium truncate">{getName(c)}</p>
                                {a.emergency_note && (
                                  <p className="text-xs text-muted-foreground">{a.emergency_note}</p>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-1.5 flex-shrink-0">
                                {phone && (
                                  <Button asChild size="sm" className="h-8 gap-1">
                                    <a href={`tel:${phone.phone_number.replace(/\s+/g, "")}`}>
                                      <Phone className="h-3.5 w-3.5" /> Anrufen
                                    </a>
                                  </Button>
                                )}
                                {email && (
                                  <Button asChild size="sm" variant="outline" className="h-8 gap-1">
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
            ) : null}

            {/* Öffentliche Notrufe */}
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Siren className="h-4 w-4 text-destructive" />
                <span className="font-semibold text-sm text-destructive">Öffentliche Notrufe</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {PUBLIC_EMERGENCY_NUMBERS.map((n, idx) => (
                  <a
                    key={idx}
                    href={`tel:${n.number}`}
                    className="flex flex-col items-start gap-1 rounded-md bg-background border border-destructive/30 p-2 hover:bg-destructive/10 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-destructive" />
                      <span className="font-bold text-base text-destructive">{n.number}</span>
                      <span className="text-sm font-medium">{n.label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{n.whenToCall}</span>
                  </a>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
