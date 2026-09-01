import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Home, Building2, Wrench, Sparkles, AlertTriangle, CheckCircle2,
  TrendingUp, MapPin, Star, Flame, Users, ParkingSquare,
} from "lucide-react";
import { ApplyFieldButton } from "./ApplyFieldButton";
import { SERVICE_PROVIDER_CATEGORIES } from "@/lib/serviceProviderCategories";

const TRADE_LABEL = (id: string) =>
  SERVICE_PROVIDER_CATEGORIES.find((c) => c.id === id)?.label || id;

interface Props {
  buildingId: string;
  onOpenSubmission?: (s: any) => void;
}

const PROBLEM_AREA_LABELS: Record<string, string> = {
  dach: "Dach", fassade: "Fassade", keller: "Keller", treppenhaus: "Treppenhaus",
  heizung: "Heizung", elektrik: "Elektrik", sanitaer: "Sanitär", aussenanlagen: "Außenanlagen",
  fenster: "Fenster", aufzug: "Aufzug",
};

const UNIT_KIND_LABELS: Record<string, string> = {
  parking_garage: "Tiefgaragen-Stellplatz",
  parking_outdoor: "Außenstellplatz",
  cellar: "Keller",
  attic: "Speicher/Dachboden",
  garden: "Gartenanteil",
  storage: "Abstellraum",
  other: "Sonstige Einheit",
};

export const OnboardingStepOverviews = ({ buildingId, onOpenSubmission }: Props) => {
  // All submissions (any status) for this building
  const { data: submissions = [] } = useQuery({
    queryKey: ["onb-overview-submissions", buildingId],
    queryFn: async () => {
      const { data } = await supabase
        .from("onboarding_submissions" as any)
        .select("*")
        .eq("building_id", buildingId)
        .order("created_at", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  // Owner assignments (top-level units only) incl. names
  const { data: assignments = [] } = useQuery({
    queryKey: ["onb-overview-assignments", buildingId],
    queryFn: async () => {
      const { data } = await supabase
        .from("contact_building_assignments")
        .select(`
          id, contact_id, unit_number, parent_assignment_id,
          contact:contacts(id, salutation, first_name, last_name, company_name, user_id)
        `)
        .eq("building_id", buildingId)
        .eq("is_active", true)
        .is("parent_assignment_id", null)
        .eq("role_in_building", "eigentuemer");
      return (data ?? []) as any[];
    },
  });

  // Existing service providers (already approved)
  const { data: providers = [] } = useQuery({
    queryKey: ["onb-overview-providers", buildingId],
    queryFn: async () => {
      const { data } = await supabase
        .from("building_service_providers" as any)
        .select("*")
        .eq("building_id", buildingId);
      return (data ?? []) as any[];
    },
  });

  // Existing assessments
  const { data: assessments = [] } = useQuery({
    queryKey: ["onb-overview-assessments", buildingId],
    queryFn: async () => {
      const { data } = await supabase
        .from("building_assessments" as any)
        .select("*")
        .eq("building_id", buildingId);
      return (data ?? []) as any[];
    },
  });

  // Lookup maps
  const assignmentById = useMemo(() => {
    const m = new Map<string, any>();
    assignments.forEach((a: any) => m.set(a.id, a));
    return m;
  }, [assignments]);

  const assignmentByUser = useMemo(() => {
    const m = new Map<string, any>();
    assignments.forEach((a: any) => {
      if (a.contact?.user_id) m.set(a.contact.user_id, a);
    });
    return m;
  }, [assignments]);

  const contactById = useMemo(() => {
    const m = new Map<string, any>();
    assignments.forEach((a: any) => {
      if (a.contact?.id) m.set(a.contact.id, a.contact);
    });
    return m;
  }, [assignments]);

  const formatContactName = (c: any) => {
    if (!c) return null;
    if (c.company_name) return c.company_name;
    return [c.first_name, c.last_name].filter(Boolean).join(" ") || null;
  };

  // Resolve owner display name from a submission row using multiple fallbacks.
  const nameOf = (sub: any): string => {
    // 1) via assignment_id → unique unit's contact
    const a1 = sub?.assignment_id ? assignmentById.get(sub.assignment_id) : null;
    const n1 = formatContactName(a1?.contact);
    if (n1) return n1;
    // 2) via contact_id
    const c2 = sub?.contact_id ? contactById.get(sub.contact_id) : null;
    const n2 = formatContactName(c2);
    if (n2) return n2;
    // 3) via user_id
    const a3 = sub?.user_id ? assignmentByUser.get(sub.user_id) : null;
    const n3 = formatContactName(a3?.contact);
    if (n3) return n3;
    return "Unbekannter Eigentümer";
  };

  // Backwards-compat helper for sections that only have a user_id (Step 5)
  const nameByUserId = (userId: string): string => {
    const a = assignmentByUser.get(userId);
    return formatContactName(a?.contact) || "Unbekannter Eigentümer";
  };

  // Submissions sind in der DB nach `category` gruppiert.
  // Step 2 wird per (user_id, assignment_id) dedupliziert (latest gewinnt),
  // alle anderen Kategorien per user_id.
  const dedupeLatestPerUser = (rows: any[]) => {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const r of rows) {
      const key = r.user_id || r.contact_id || r.id;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
    return out;
  };

  const dedupeLatestPerUserAndUnit = (rows: any[]) => {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const r of rows) {
      const key = `${r.user_id || r.contact_id || r.id}|${r.assignment_id || "_"}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
    return out;
  };

  const parseNum = (v: any): number => {
    if (v == null || v === "") return NaN;
    const n = parseFloat(String(v).replace(",", "."));
    return isNaN(n) ? NaN : n;
  };

  // ---- STEP 2: Wohnungsdaten (per Einheit) ----
  type UnitRow = {
    submissionId: string;
    submission: any;
    assignmentId: string | null;
    ownerName: string;
    unitLabel: string;
    qm: any;
    mea: any;
    hg: any;
    secondaryUnits: any[];
  };

  const step2RawSubs = submissions.filter((s: any) => s.category === "wohnungsdaten");

  // Expand each submission into one or more rows (assignment_id present → 1 row,
  // legacy per_unit payload → N rows)
  const step2Rows = useMemo<UnitRow[]>(() => {
    const expanded: UnitRow[] = [];
    const subs = dedupeLatestPerUserAndUnit(step2RawSubs);

    // For legacy rows (no assignment_id, no per_unit), keep one entry
    subs.forEach((s: any) => {
      const ownerName = nameOf(s);
      if (s.payload?.per_unit && typeof s.payload.per_unit === "object") {
        Object.entries(s.payload.per_unit).forEach(([aid, p]: [string, any]) => {
          const a = assignmentById.get(aid);
          expanded.push({
            submissionId: s.id,
            submission: s,
            assignmentId: aid,
            ownerName,
            unitLabel: a?.unit_number || aid.slice(0, 8),
            qm: p?.square_meters ?? p?.qm,
            mea: p?.mea_share ?? p?.mea,
            hg: p?.monthly_fee ?? p?.hausgeld,
            secondaryUnits: Array.isArray(p?.secondary_units) ? p.secondary_units : [],
          });
        });
      } else {
        const aid = s.assignment_id || null;
        const a = aid ? assignmentById.get(aid) : null;
        expanded.push({
          submissionId: s.id,
          submission: s,
          assignmentId: aid,
          ownerName,
          unitLabel: a?.unit_number || (aid ? aid.slice(0, 8) : "—"),
          qm: s.payload?.square_meters ?? s.payload?.qm,
          mea: s.payload?.mea_share ?? s.payload?.mea,
          hg: s.payload?.monthly_fee ?? s.payload?.hausgeld,
          secondaryUnits: Array.isArray(s.payload?.secondary_units) ? s.payload.secondary_units : [],
        });
      }
    });

    // Sort by ownerName, then unitLabel
    expanded.sort((a, b) => {
      const c = a.ownerName.localeCompare(b.ownerName);
      if (c !== 0) return c;
      return String(a.unitLabel).localeCompare(String(b.unitLabel));
    });
    return expanded;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step2RawSubs, assignmentById, contactById, assignmentByUser]);

  const meaSum = useMemo(() => {
    return step2Rows.reduce((sum, r) => {
      const v = parseNum(r.mea);
      return sum + (isNaN(v) ? 0 : v);
    }, 0);
  }, [step2Rows]);

  // ---- STEP 3: Gebäudezustand ----
  const step3Subs = dedupeLatestPerUser(submissions.filter((s: any) => s.category === "gebaeudeinformationen"));
  const ratings = [
    ...assessments,
    ...step3Subs.map((s: any) => ({
      condition_rating: s.payload?.condition_rating ?? s.payload?.general_impression_score,
      problem_areas: s.payload?.problem_areas || [],
      problem_notes: s.payload?.problem_notes || {},
      refill_contact: s.payload?.refill_contact,
      user_id: s.user_id,
      submission_id: s.id,
      applied_fields: s.applied_fields || [],
    })),
  ].filter((r: any) => r.condition_rating != null || (r.problem_areas && r.problem_areas.length > 0));
  const ratedOnly = ratings.filter((r: any) => r.condition_rating != null);
  const avgRating = ratedOnly.length
    ? ratedOnly.reduce((s: number, r: any) => s + Number(r.condition_rating), 0) / ratedOnly.length
    : null;
  // Problem-Aggregation mit Notizen
  type ProblemRow = { area: string; count: number; notes: { name: string; note: string; submission_id: string; applied: boolean }[] };
  const problemAggregation = useMemo<ProblemRow[]>(() => {
    const m = new Map<string, ProblemRow>();
    step3Subs.forEach((s: any) => {
      const af: string[] = Array.isArray(s.applied_fields) ? s.applied_fields : [];
      const areas: string[] = Array.isArray(s.payload?.problem_areas) ? s.payload.problem_areas : [];
      const notes: Record<string, string> = s.payload?.problem_notes || {};
      areas.forEach((area) => {
        const row = m.get(area) || { area, count: 0, notes: [] };
        row.count += 1;
        const note = notes[area];
        if (note) {
          row.notes.push({
            name: nameByUserId(s.user_id),
            note: String(note),
            submission_id: s.id,
            applied: af.includes(`problem_area:${area}`),
          });
        }
        m.set(area, row);
      });
    });
    return Array.from(m.values()).sort((a, b) => b.count - a.count);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step3Subs, assignmentByUser, contactById]);

  // Refill-Contact-Vorschläge
  const refillContacts = useMemo(() => {
    return step3Subs
      .filter((s: any) => s.payload?.refill_contact)
      .map((s: any) => ({
        name: nameByUserId(s.user_id),
        suggestion: String(s.payload.refill_contact),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step3Subs, assignmentByUser]);

  // ---- STEP 4: Dienstleister (consensus) ----
  const step4Subs = dedupeLatestPerUser(submissions.filter((s: any) => s.category === "dienstleister"));

  const referencedContactIds = useMemo(() => {
    const ids = new Set<string>();
    step4Subs.forEach((s: any) => {
      const sel = s.payload?.selections || {};
      Object.values(sel).forEach((arr: any) => {
        if (Array.isArray(arr)) arr.forEach((id: string) => id && ids.add(id));
      });
    });
    return Array.from(ids);
  }, [step4Subs]);

  const { data: providerContacts = [] } = useQuery({
    queryKey: ["onb-overview-provider-contacts", referencedContactIds.sort().join(",")],
    enabled: referencedContactIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, company_name")
        .in("id", referencedContactIds);
      return data ?? [];
    },
  });
  const contactNameById = useMemo(() => {
    const m = new Map<string, string>();
    (providerContacts as any[]).forEach((c: any) => {
      const name = c.company_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || c.id.slice(0, 8);
      m.set(c.id, name);
    });
    return m;
  }, [providerContacts]);

  const approvedProviderSet = useMemo(() => {
    const s = new Set<string>();
    (providers as any[]).forEach((p: any) => {
      s.add(`${String(p.category || "").toLowerCase()}|${String(p.name || "").toLowerCase()}`);
    });
    return s;
  }, [providers]);

  type ProviderRow = {
    name: string;
    category: string;
    count: number;
    mentioned_by: string[];
    submission_id: string;
    phone?: string | null;
    email?: string | null;
    applied_in_submission: boolean;
    already_approved: boolean;
  };
  const providerCounts = useMemo<ProviderRow[]>(() => {
    const m = new Map<string, ProviderRow>();
    const bump = (key: string, name: string, category: string, userId: string, sub: any, extras?: { phone?: string | null; email?: string | null }) => {
      const existing = m.get(key);
      const appliedKey = `provider:${category}:${name.toLowerCase()}`;
      const appliedInSub = Array.isArray(sub.applied_fields) && sub.applied_fields.includes(appliedKey);
      if (existing) {
        existing.count += 1;
        if (!existing.mentioned_by.includes(userId)) existing.mentioned_by.push(userId);
        existing.applied_in_submission = existing.applied_in_submission || appliedInSub;
        if (!existing.phone && extras?.phone) existing.phone = extras.phone;
        if (!existing.email && extras?.email) existing.email = extras.email;
      } else {
        m.set(key, {
          name, category, count: 1, mentioned_by: [userId],
          submission_id: sub.id,
          phone: extras?.phone ?? null,
          email: extras?.email ?? null,
          applied_in_submission: appliedInSub,
          already_approved: approvedProviderSet.has(`${category.toLowerCase()}|${name.toLowerCase()}`),
        });
      }
    };
    step4Subs.forEach((s: any) => {
      const sel = s.payload?.selections || {};
      Object.entries(sel).forEach(([trade, arr]: [string, any]) => {
        if (!Array.isArray(arr)) return;
        arr.forEach((cid: string) => {
          const name = contactNameById.get(cid) || cid.slice(0, 8);
          bump(`${cid}|${trade}`, name, trade, s.user_id, s);
        });
      });
      const customs = Array.isArray(s.payload?.custom) ? s.payload.custom : [];
      customs.forEach((c: any) => {
        const name = String(c?.name || "").trim();
        if (!name) return;
        const cat = c?.category || c?.trade || "sonstige";
        bump(`custom:${name.toLowerCase()}|${cat}`, name, cat, s.user_id, s, {
          phone: c?.phone || null,
          email: c?.email || null,
        });
      });
    });
    return Array.from(m.values()).sort((a, b) => b.count - a.count);
  }, [step4Subs, contactNameById, approvedProviderSet]);

  // ---- STEP 3 extra: Heizungs-Aggregation ----
  const HEATING_LABELS: Record<string, string> = {
    gas: "Gas", oel: "Öl", fernwaerme: "Fernwärme", waermepumpe: "Wärmepumpe",
    pellets: "Pellets", strom: "Strom",
  };
  type HeatingRow = { label: string; raw: string; count: number; submission_id: string; applied: boolean };
  const heatingRows = useMemo<HeatingRow[]>(() => {
    const m = new Map<string, HeatingRow>();
    step3Subs.forEach((s: any) => {
      const list: string[] = Array.isArray(s.payload?.heating_types) && s.payload.heating_types.length
        ? s.payload.heating_types
        : s.payload?.heating_type ? [s.payload.heating_type] : [];
      list.forEach((raw: string) => {
        const r = String(raw || "").trim();
        if (!r) return;
        let label = r;
        if (r === "sonstiges" && s.payload?.heating_other) label = s.payload.heating_other;
        else if (HEATING_LABELS[r]) label = HEATING_LABELS[r];
        const key = label.toLowerCase();
        const existing = m.get(key);
        const appliedKey = `heating_type:${r}`;
        const applied = Array.isArray(s.applied_fields) && s.applied_fields.includes(appliedKey);
        if (existing) {
          existing.count += 1;
          existing.applied = existing.applied || applied;
        } else {
          m.set(key, { label, raw: r, count: 1, submission_id: s.id, applied });
        }
      });
    });
    return Array.from(m.values()).sort((a, b) => b.count - a.count);
  }, [step3Subs]);

  // ---- STEP 5: Einschätzung ----
  const step5Subs = dedupeLatestPerUser(submissions.filter((s: any) => s.category === "bewertung"));
  type EtvRow = { location: string; count: number; submission_id: string; applied: boolean };
  const etvLocations = useMemo<EtvRow[]>(() => {
    const m = new Map<string, EtvRow>();
    step5Subs.forEach((s: any) => {
      const loc = String(s.payload?.etv_location || "").trim();
      if (!loc) return;
      const key = loc.toLowerCase();
      const appliedKey = `etv_location:${key}`;
      const applied = Array.isArray(s.applied_fields) && s.applied_fields.includes(appliedKey);
      const existing = m.get(key);
      if (existing) {
        existing.count += 1;
        existing.applied = existing.applied || applied;
      } else {
        m.set(key, { location: loc, count: 1, submission_id: s.id, applied });
      }
    });
    return Array.from(m.values()).sort((a, b) => b.count - a.count);
  }, [step5Subs]);
  const cashAuditors = useMemo(() => {
    return step5Subs
      .filter((s: any) => s.payload?.willing_cash_audit === true)
      .map((s: any) => ({
        user_id: s.user_id,
        submission_id: s.id,
        applied: Array.isArray(s.applied_fields) && s.applied_fields.includes("cash_auditor"),
      }));
  }, [step5Subs]);
  const beiratMembers = useMemo(() => {
    return step5Subs
      .filter((s: any) => (s.payload?.is_beirat_member ?? s.payload?.willing_beirat) === true)
      .map((s: any) => ({
        user_id: s.user_id,
        submission_id: s.id,
        applied: Array.isArray(s.applied_fields) && s.applied_fields.includes("beirat_member"),
      }));
  }, [step5Subs]);

  const totalOwners = assignments.length;
  const totalParticipants = new Set(submissions.map((s: any) => s.user_id)).size;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Eigentümer-Auswertung & Empfehlungen
        </CardTitle>
        <CardDescription>
          Aggregierte Antworten aus allen 5 Onboarding-Schritten ({totalParticipants} von {totalOwners} Eigentümern haben teilgenommen).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" className="w-full">
          <AccordionItem value="step2">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <Home className="h-4 w-4" />
                <span className="font-medium">Schritt 2: Wohnungsdaten</span>
                <Badge variant="secondary">{step2Rows.length} Einheiten</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-xs text-muted-foreground mb-3">
                MEA-Anteile, Wohnfläche und Hausgeld pro Wohneinheit. Multi-Unit-Eigentümer
                erscheinen mit einer eigenen Zeile pro Einheit.
                {meaSum > 0 && (
                  <span className={`ml-2 font-medium ${Math.abs(meaSum - 1000) < 1 || Math.abs(meaSum - 1) < 0.001 ? "text-success" : "text-warning"}`}>
                    Summe MEA: {meaSum.toFixed(2)}
                    {Math.abs(meaSum - 1000) < 1 ? " ✓ (passt zu 1000/1000)" : Math.abs(meaSum - 1) < 0.001 ? " ✓ (passt zu 1.0)" : " ⚠ Plausibilität prüfen"}
                  </span>
                )}
              </p>
              {step2Rows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Noch keine Eingaben.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Eigentümer</TableHead>
                      <TableHead>Einheit</TableHead>
                      <TableHead>m²</TableHead>
                      <TableHead>MEA</TableHead>
                      <TableHead>Hausgeld</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {step2Rows.map((r) => {
                      const af: string[] = Array.isArray(r.submission.applied_fields) ? r.submission.applied_fields : [];
                      const aid = r.assignmentId;
                      // Per-unit applied keys, plus legacy single-unit keys
                      const isApplied = (field: "qm" | "mea" | "hausgeld") =>
                        (aid && af.includes(`${field}:${aid}`)) || af.includes(field);

                      const cell = (val: any, suffix: string, field: "qm" | "mea" | "hausgeld") => {
                        if (val == null || val === "") return <span className="text-muted-foreground">—</span>;
                        const applied = isApplied(field);
                        return (
                          <div className={`flex items-center gap-2 rounded-md px-1.5 py-1 ${applied ? "bg-success/10 border border-success/30" : ""}`}>
                            <span className="font-medium">{val}{suffix}</span>
                            <ApplyFieldButton
                              submissionId={r.submissionId}
                              field={field}
                              value={aid ? { assignment_id: aid } : undefined}
                              applied={applied}
                              buildingId={buildingId}
                              label="Übernehmen"
                            />
                          </div>
                        );
                      };
                      return (
                        <React.Fragment key={`${r.submissionId}-${aid ?? "main"}`}>
                          <TableRow>
                            <TableCell className="font-medium">{r.ownerName}</TableCell>
                            <TableCell>
                              <span className="font-mono text-xs">{r.unitLabel}</span>
                            </TableCell>
                            <TableCell>{cell(r.qm, " m²", "qm")}</TableCell>
                            <TableCell>{cell(r.mea, "", "mea")}</TableCell>
                            <TableCell>{cell(r.hg, " €", "hausgeld")}</TableCell>
                          </TableRow>
                          {/* Sub-units (Tiefgarage, Stellplatz, Keller …) */}
                          {r.secondaryUnits.length > 0 && r.secondaryUnits.map((su: any, idx: number) => {
                            const appliedKey = aid ? `secondary_unit:${aid}:${idx}` : null;
                            const applied = appliedKey ? af.includes(appliedKey) : false;
                            const label = UNIT_KIND_LABELS[su.unit_kind] || su.unit_kind || "Nebeneinheit";
                            const subUnitLabel = [label, su.unit_number].filter(Boolean).join(" · ");
                            return (
                              <TableRow key={`${r.submissionId}-${aid ?? "main"}-su-${idx}`} className="bg-muted/20">
                                <TableCell />
                                <TableCell>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground pl-3">
                                    <ParkingSquare className="h-3.5 w-3.5" />
                                    <span>{subUnitLabel}</span>
                                  </div>
                                </TableCell>
                                <TableCell />
                                <TableCell>
                                  {su.mea_share && String(su.mea_share).trim() !== "" ? (
                                    <span className="text-xs">{su.mea_share}</span>
                                  ) : <span className="text-muted-foreground text-xs">—</span>}
                                </TableCell>
                                <TableCell>
                                  <div className={`flex items-center gap-2 rounded-md px-1.5 py-1 ${applied ? "bg-success/10 border border-success/30" : ""}`}>
                                    {su.monthly_fee && String(su.monthly_fee).trim() !== "" ? (
                                      <span className="text-xs font-medium">{su.monthly_fee} €</span>
                                    ) : <span className="text-muted-foreground text-xs">—</span>}
                                    <ApplyFieldButton
                                      submissionId={r.submissionId}
                                      field="secondary_unit"
                                      value={{ index: idx, assignment_id: aid }}
                                      applied={applied}
                                      buildingId={buildingId}
                                      label="Anlegen"
                                      appliedLabel="Angelegt"
                                    />
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="step3">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                <span className="font-medium">Schritt 3: Gebäudezustand</span>
                <Badge variant="secondary">{ratings.length} Bewertungen</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid sm:grid-cols-3 gap-4 mb-4">
                <div className="rounded-md border p-3">
                  <div className="flex items-center gap-2 text-sm font-medium mb-1">
                    <Star className="h-4 w-4 text-warning" />
                    Durchschnittliche Bewertung
                  </div>
                  <div className="text-2xl font-bold">
                    {avgRating != null ? `${avgRating.toFixed(1)} / 5` : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {ratings.length} {ratings.length === 1 ? "Eigentümer" : "Eigentümer"} haben bewertet
                  </div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="flex items-center gap-2 text-sm font-medium mb-2">
                    <Flame className="h-4 w-4 text-warning" />
                    Heizungsart (genannt)
                  </div>
                  {heatingRows.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Keine Angabe.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {heatingRows.slice(0, 5).map((h) => (
                        <div key={h.label} className={`flex items-center justify-between gap-2 text-xs rounded px-1.5 py-1 ${h.applied ? "bg-success/10 border border-success/30" : ""}`}>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="capitalize truncate">{h.label}</span>
                            <Badge variant="outline" className="text-[10px] flex-shrink-0">{h.count}×</Badge>
                          </div>
                          <ApplyFieldButton
                            submissionId={h.submission_id}
                            field="heating_type"
                            value={{ raw: h.raw }}
                            applied={h.applied}
                            buildingId={buildingId}
                            label="Übernehmen"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="rounded-md border p-3">
                  <div className="flex items-center gap-2 text-sm font-medium mb-2">
                    <AlertTriangle className="h-4 w-4 text-warning" />
                    Häufigste Problembereiche
                  </div>
                  {problemAggregation.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Keine Probleme gemeldet.</p>
                  ) : (
                    <div className="space-y-1">
                      {problemAggregation.slice(0, 5).map((p) => (
                        <div key={p.area} className="flex items-center justify-between text-xs">
                          <span>{PROBLEM_AREA_LABELS[p.area] || p.area}</span>
                          <Badge variant="outline">{p.count}× genannt</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Detail-Notizen je Problembereich */}
              {problemAggregation.some((p) => p.notes.length > 0) && (
                <div className="rounded-md border p-3 mb-3">
                  <div className="text-sm font-medium mb-2">Detail-Notizen der Eigentümer</div>
                  <div className="space-y-3">
                    {problemAggregation.filter((p) => p.notes.length > 0).map((p) => (
                      <div key={p.area}>
                        <div className="text-xs font-medium text-muted-foreground mb-1">
                          {PROBLEM_AREA_LABELS[p.area] || p.area}
                        </div>
                        <div className="space-y-1.5">
                          {p.notes.map((n, i) => (
                            <div key={i} className={`flex items-start justify-between gap-2 text-xs rounded px-2 py-1.5 border ${n.applied ? "bg-success/10 border-success/30" : "bg-muted/30"}`}>
                              <div className="min-w-0">
                                <div className="font-medium">{n.name}</div>
                                <div className="text-muted-foreground">{n.note}</div>
                              </div>
                              <ApplyFieldButton
                                submissionId={n.submission_id}
                                field="problem_area"
                                value={{ area: p.area }}
                                applied={n.applied}
                                buildingId={buildingId}
                                label="Übernehmen"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Heizöl-Nachfüllkontakte */}
              {refillContacts.length > 0 && (
                <div className="rounded-md border p-3 mb-3">
                  <div className="text-sm font-medium mb-2">Heizöl-Nachfüllkontakt (Vorschläge)</div>
                  <div className="space-y-1.5">
                    {refillContacts.map((rc, i) => (
                      <div key={i} className="text-xs flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{rc.name}</Badge>
                        <span>{rc.suggestion}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {problemAggregation.length > 0 && problemAggregation[0].count >= 2 && (
                <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
                  <div className="flex items-start gap-2">
                    <TrendingUp className="h-4 w-4 text-warning mt-0.5" />
                    <div>
                      <p className="font-medium">Empfehlung</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Mehrere Eigentümer melden Probleme im Bereich <b>{PROBLEM_AREA_LABELS[problemAggregation[0].area] || problemAggregation[0].area}</b>. Prüfen Sie eine Inspektion oder Wartungsmaßnahme.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="step4">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4" />
                <span className="font-medium">Schritt 4: Dienstleister</span>
                <Badge variant="secondary">{providerCounts.length} Vorschläge</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-xs text-muted-foreground mb-3">
                Dienstleister-Vorschläge der Eigentümer. Übereinstimmungen indizieren Konsens.
              </p>
              {providerCounts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Noch keine Vorschläge.</p>
              ) : (
                <div className="space-y-2">
                  {providerCounts.map((p) => {
                    const consensusPct = totalParticipants > 0 ? (p.count / totalParticipants) * 100 : 0;
                    const high = consensusPct >= 50;
                    const isApplied = p.applied_in_submission || p.already_approved;
                    return (
                      <div
                        key={`${p.name}-${p.category}`}
                        className={`rounded-md border p-3 ${
                          isApplied
                            ? "border-success/40 bg-success/10"
                            : high
                            ? "border-success/40 bg-success/5"
                            : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium text-sm">{p.name}</div>
                            <div className="text-xs text-muted-foreground">{TRADE_LABEL(p.category)}</div>
                            {(p.phone || p.email) && (
                              <div className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                                {p.phone && <span>📞 {p.phone}</span>}
                                {p.email && <span>✉ {p.email}</span>}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                            <Badge variant={high ? "default" : "outline"}>
                              {p.count}× genannt
                            </Badge>
                            {high && !isApplied && (
                              <div className="text-xs text-success flex items-center gap-1 justify-end">
                                <CheckCircle2 className="h-3 w-3" />
                                Konsens ({Math.round(consensusPct)}%)
                              </div>
                            )}
                            <ApplyFieldButton
                              submissionId={p.submission_id}
                              field="provider"
                              value={{ name: p.name, category: p.category, trade: p.category, phone: p.phone, email: p.email }}
                              applied={isApplied}
                              buildingId={buildingId}
                              label="Übernehmen"
                              appliedLabel="Übernommen"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {providers.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <div className="text-xs font-medium text-muted-foreground mb-2">
                    Bereits übernommene Dienstleister ({providers.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {providers.map((p: any) => (
                      <Badge key={p.id} variant="secondary" className="text-xs">
                        {p.name} <span className="ml-1 opacity-60">· {p.category}</span>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="step5">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                <span className="font-medium">Schritt 5: Einschätzung & Bereitschaft</span>
                <Badge variant="secondary">{step5Subs.length} Eingaben</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="rounded-md border p-3">
                  <div className="flex items-center gap-2 text-sm font-medium mb-2">
                    <MapPin className="h-4 w-4" />
                    Vorgeschlagene ETV-Orte
                  </div>
                  {etvLocations.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Keine Vorschläge.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {etvLocations.map((e) => (
                        <div key={e.location} className={`flex items-center justify-between gap-2 text-xs rounded px-1.5 py-1 ${e.applied ? "bg-success/10 border border-success/30" : ""}`}>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="truncate">{e.location}</span>
                            <Badge variant="outline" className="text-[10px] flex-shrink-0">{e.count}×</Badge>
                          </div>
                          <ApplyFieldButton
                            submissionId={e.submission_id}
                            field="etv_location"
                            value={{ location: e.location }}
                            applied={e.applied}
                            buildingId={buildingId}
                            label="Übernehmen"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="rounded-md border p-3">
                  <div className="flex items-center gap-2 text-sm font-medium mb-2">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    Freiwillige Kassenprüfer
                  </div>
                  {cashAuditors.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Noch niemand benannt.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {cashAuditors.map(({ user_id, submission_id, applied }) => (
                        <div key={user_id} className={`flex items-center justify-between gap-2 text-xs rounded px-1.5 py-1 ${applied ? "bg-success/10 border border-success/30" : ""}`}>
                          <span className="truncate">{nameByUserId(user_id)}</span>
                          <ApplyFieldButton
                            submissionId={submission_id}
                            field="cash_auditor"
                            applied={applied}
                            buildingId={buildingId}
                            label="Als Kassenprüfer"
                            appliedLabel="Übernommen"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="rounded-md border p-3">
                  <div className="flex items-center gap-2 text-sm font-medium mb-2">
                    <Users className="h-4 w-4 text-primary" />
                    Mitglieder des Verwaltungsbeirats
                  </div>
                  {beiratMembers.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Noch niemand benannt.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {beiratMembers.map(({ user_id, submission_id, applied }) => (
                        <div key={user_id} className={`flex items-center justify-between gap-2 text-xs rounded px-1.5 py-1 ${applied ? "bg-success/10 border border-success/30" : ""}`}>
                          <span className="truncate">{nameByUserId(user_id)}</span>
                          <ApplyFieldButton
                            submissionId={submission_id}
                            field="beirat_member"
                            applied={applied}
                            buildingId={buildingId}
                            label="Als Beirat"
                            appliedLabel="Übernommen"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
};
