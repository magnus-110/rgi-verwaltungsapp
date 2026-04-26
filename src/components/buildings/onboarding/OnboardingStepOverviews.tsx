import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  User, Home, Building2, Wrench, Sparkles, AlertTriangle, CheckCircle2,
  TrendingUp, MapPin, Star, Flame, Users,
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

  // Owner assignments incl. names
  const { data: assignments = [] } = useQuery({
    queryKey: ["onb-overview-assignments", buildingId],
    queryFn: async () => {
      const { data } = await supabase
        .from("contact_building_assignments")
        .select(`
          id, contact_id, unit_number, area_sqm_override,
          address_street_override, address_zip_override, address_city_override,
          phones_override, emails_override, primary_contact_self, primary_contact_other,
          expectations_override, is_cash_auditor,
          contact:contacts(id, salutation, first_name, last_name, company_name, user_id, address_street, address_zip, address_city)
        `)
        .eq("building_id", buildingId)
        .eq("is_active", true)
        .in("role_in_building", ["eigentuemer", "beirat"]);
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

  // Map user_id → assignment / display name
  const assignmentByUser = useMemo(() => {
    const m = new Map<string, any>();
    assignments.forEach((a: any) => {
      if (a.contact?.user_id) m.set(a.contact.user_id, a);
    });
    return m;
  }, [assignments]);

  const nameOf = (userId: string) => {
    const a = assignmentByUser.get(userId);
    if (!a?.contact) return userId.slice(0, 8);
    const c = a.contact;
    if (c.company_name) return c.company_name;
    return [c.first_name, c.last_name].filter(Boolean).join(" ") || userId.slice(0, 8);
  };

  // Submissions sind in der DB nach `category` gruppiert (es gibt kein `step`-Feld).
  // Mapping: wohnungsdaten=Step2, gebaeudeinformationen=Step3, dienstleister=Step4, bewertung=Step5.
  // Dedupe: pro Eigentümer (user_id) + Kategorie nur die NEUESTE Einreichung anzeigen.
  // (submissions ist bereits nach created_at DESC sortiert.)
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

  // ---- STEP 2: Wohnungsdaten ----
  const step2Submissions = dedupeLatestPerUser(
    submissions.filter((s: any) => s.category === "wohnungsdaten")
  );
  const parseNum = (v: any): number => {
    if (v == null || v === "") return NaN;
    const n = parseFloat(String(v).replace(",", "."));
    return isNaN(n) ? NaN : n;
  };
  const meaSum = useMemo(() => {
    return step2Submissions.reduce((sum: number, s: any) => {
      const v = parseNum(s.payload?.mea_share ?? s.payload?.mea);
      return sum + (isNaN(v) ? 0 : v);
    }, 0);
  }, [step2Submissions]);

  // ---- STEP 3: Gebäudezustand ----
  const step3Subs = dedupeLatestPerUser(submissions.filter((s: any) => s.category === "gebaeudeinformationen"));
  const ratings = [
    ...assessments,
    ...step3Subs.map((s: any) => ({
      condition_rating: s.payload?.condition_rating,
      problem_areas: s.payload?.problem_areas || [],
      user_id: s.user_id,
    })),
  ].filter((r: any) => r.condition_rating != null || (r.problem_areas && r.problem_areas.length > 0));
  const ratedOnly = ratings.filter((r: any) => r.condition_rating != null);
  const avgRating = ratedOnly.length
    ? ratedOnly.reduce((s: number, r: any) => s + Number(r.condition_rating), 0) / ratedOnly.length
    : null;
  const problemFreq: Record<string, number> = {};
  ratings.forEach((r: any) => {
    (r.problem_areas || []).forEach((p: string) => {
      problemFreq[p] = (problemFreq[p] || 0) + 1;
    });
  });
  const sortedProblems = Object.entries(problemFreq).sort((a, b) => b[1] - a[1]);

  // ---- STEP 4: Dienstleister (consensus) ----
  // Payload-Struktur: { selections: { trade: [contactId, ...] }, custom: [{ trade, category, name }] }
  const step4Subs = dedupeLatestPerUser(submissions.filter((s: any) => s.category === "dienstleister"));

  // Lookup für Kontakt-Namen (aus Step-4 Selections referenziert)
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

  // Lookup of already-approved providers (case-insensitive name+category match)
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
    submission_id: string;        // first submission this came from (for apply button)
    applied_in_submission: boolean;
    already_approved: boolean;
  };
  const providerCounts = useMemo<ProviderRow[]>(() => {
    const m = new Map<string, ProviderRow>();
    const bump = (key: string, name: string, category: string, userId: string, sub: any) => {
      const existing = m.get(key);
      const appliedKey = `provider:${category}:${name.toLowerCase()}`;
      const appliedInSub = Array.isArray(sub.applied_fields) && sub.applied_fields.includes(appliedKey);
      if (existing) {
        existing.count += 1;
        if (!existing.mentioned_by.includes(userId)) existing.mentioned_by.push(userId);
        existing.applied_in_submission = existing.applied_in_submission || appliedInSub;
      } else {
        m.set(key, {
          name, category, count: 1, mentioned_by: [userId],
          submission_id: sub.id,
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
        bump(`custom:${name.toLowerCase()}|${cat}`, name, cat, s.user_id, s);
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
                <Badge variant="secondary">{step2Submissions.length} Eingaben</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-xs text-muted-foreground mb-3">
                MEA-Anteile, Wohnfläche und Hausgeld pro Wohneinheit.
                {meaSum > 0 && (
                  <span className={`ml-2 font-medium ${Math.abs(meaSum - 1000) < 1 || Math.abs(meaSum - 1) < 0.001 ? "text-success" : "text-warning"}`}>
                    Summe MEA: {meaSum.toFixed(2)}
                    {Math.abs(meaSum - 1000) < 1 ? " ✓ (passt zu 1000/1000)" : Math.abs(meaSum - 1) < 0.001 ? " ✓ (passt zu 1.0)" : " ⚠ Plausibilität prüfen"}
                  </span>
                )}
              </p>
              {step2Submissions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Noch keine Eingaben.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Eigentümer</TableHead>
                      <TableHead>Einheit</TableHead>
                      <TableHead className="text-right">m²</TableHead>
                      <TableHead className="text-right">MEA</TableHead>
                      <TableHead className="text-right">Hausgeld</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {step2Submissions.map((s: any) => {
                      const p = s.payload || {};
                      const a = assignmentByUser.get(s.user_id);
                      return (
                        <TableRow key={s.id} className={s.status === "pending" ? "cursor-pointer" : ""} onClick={() => s.status === "pending" && onOpenSubmission?.(s)}>
                          <TableCell className="font-medium">{nameOf(s.user_id)}</TableCell>
                          <TableCell>{a?.unit_number || "—"}</TableCell>
                          <TableCell className="text-right">{p.square_meters ?? p.qm ?? "—"}</TableCell>
                          <TableCell className="text-right">{p.mea_share ?? p.mea ?? "—"}</TableCell>
                          <TableCell className="text-right">{(p.monthly_fee ?? p.hausgeld) ? `${p.monthly_fee ?? p.hausgeld} €` : "—"}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant={s.status === "approved" ? "default" : s.status === "rejected" ? "destructive" : "secondary"}>
                              {s.status === "pending" ? "Offen" : s.status === "approved" ? "Übernommen" : "Abgelehnt"}
                            </Badge>
                          </TableCell>
                        </TableRow>
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
                  {heatingCounts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Keine Angabe.</p>
                  ) : (
                    <div className="space-y-1">
                      {heatingCounts.slice(0, 5).map(([h, count]) => (
                        <div key={h} className="flex items-center justify-between text-xs">
                          <span className="capitalize truncate">{h}</span>
                          <Badge variant="outline">{count}×</Badge>
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
                  {sortedProblems.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Keine Probleme gemeldet.</p>
                  ) : (
                    <div className="space-y-1">
                      {sortedProblems.slice(0, 5).map(([area, count]) => (
                        <div key={area} className="flex items-center justify-between text-xs">
                          <span>{PROBLEM_AREA_LABELS[area] || area}</span>
                          <Badge variant="outline">{count}× genannt</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {sortedProblems.length > 0 && sortedProblems[0][1] >= 2 && (
                <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
                  <div className="flex items-start gap-2">
                    <TrendingUp className="h-4 w-4 text-warning mt-0.5" />
                    <div>
                      <p className="font-medium">Empfehlung</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Mehrere Eigentümer melden Probleme im Bereich <b>{PROBLEM_AREA_LABELS[sortedProblems[0][0]] || sortedProblems[0][0]}</b>. Prüfen Sie eine Inspektion oder Wartungsmaßnahme.
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
                    return (
                      <div key={`${p.name}-${p.category}`} className={`rounded-md border p-3 ${high ? "border-success/40 bg-success/5" : ""}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium text-sm">{p.name}</div>
                            <div className="text-xs text-muted-foreground">{p.category}</div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <Badge variant={high ? "default" : "outline"}>
                              {p.count}× genannt
                            </Badge>
                            {high && (
                              <div className="text-xs text-success mt-1 flex items-center gap-1 justify-end">
                                <CheckCircle2 className="h-3 w-3" />
                                Konsens ({Math.round(consensusPct)}%)
                              </div>
                            )}
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
                    <div className="space-y-1">
                      {etvLocations.map(([loc, count]) => (
                        <div key={loc} className="flex items-center justify-between text-xs">
                          <span className="truncate">{loc}</span>
                          <Badge variant="outline">{count}×</Badge>
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
                    <div className="space-y-1">
                      {cashAuditors.map(({ user_id }) => (
                        <div key={user_id} className="text-xs flex items-center gap-1.5">
                          <Badge variant="default" className="text-[10px]">✓</Badge>
                          {nameOf(user_id)}
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
                    <div className="space-y-1">
                      {beiratMembers.map(({ user_id }) => (
                        <div key={user_id} className="text-xs flex items-center gap-1.5">
                          <Badge variant="default" className="text-[10px]">✓</Badge>
                          {nameOf(user_id)}
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
