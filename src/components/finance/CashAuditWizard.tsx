import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CashAuditAccountSheet } from "./CashAuditAccountSheet";
import { CashAuditJournal } from "./CashAuditJournal";
import { CashAuditDocuments } from "./CashAuditDocuments";
import { CashAuditSignature } from "./CashAuditSignature";
import { PenLine, ArrowLeft, CheckCircle2, Copy, ExternalLink, Info, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CashAuditIntroDialog } from "./CashAuditIntroDialog";


interface CashAuditWizardProps {
  auditId: string;
  onBack?: () => void;
  tokenMode?: boolean;
  token?: string;
}

export function CashAuditWizard({ auditId, onBack, tokenMode, token }: CashAuditWizardProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("konten");
  const [showSignature, setShowSignature] = useState(false);
  const [saving, setSaving] = useState(false);
  const introKey = `cash-audit-intro-seen-${auditId}`;
  const [showIntro, setShowIntro] = useState(() => {
    try { return !localStorage.getItem(introKey); } catch { return true; }
  });

  const { data: audit, isLoading } = useQuery({
    queryKey: ["cash-audit", auditId],
    queryFn: async () => {
      if (tokenMode && token) {
        const { data } = await supabase.rpc("get_audit_by_token", { p_token: token });
        return data as any;
      }
      const { data, error } = await supabase
        .from("cash_audits")
        .select(`
          *,
          buildings(name, address, postal_code, city),
          billing_periods(fiscal_year, period_from, period_to),
          contacts!cash_audits_auditor_contact_id_fkey(
            id, company_name,
            contact_persons(first_name, last_name, is_primary)
          )
        `)
        .eq("id", auditId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: adminNotes = [] } = useQuery({
    queryKey: ["cash-audit-notes", auditId, tokenMode ? token : "auth"],
    queryFn: async () => {
      if (tokenMode && token) {
        const { data } = await supabase.rpc("get_audit_notes_by_token", { p_token: token });
        return (data as any[]) || [];
      }
      const { data } = await supabase
        .from("cash_audit_notes")
        .select("id, title, body, sort_order")
        .eq("cash_audit_id", auditId)
        .order("sort_order");
      return data || [];
    },
  });

  const [localProgress, setLocalProgress] = useState<Record<string, any> | null>(null);
  const progress = localProgress ?? (audit?.progress as Record<string, any>) ?? {};

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingProgressRef = useRef<Record<string, any> | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "saving" | "error" | "saved">("idle");
  const lsKey = `cash-audit-${auditId}`;

  // Restore from localStorage if newer than DB
  useEffect(() => {
    if (!audit) return;
    try {
      const raw = localStorage.getItem(lsKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const dbUpdated = audit.updated_at ? new Date(audit.updated_at).getTime() : 0;
      if (parsed?.savedAt && parsed.savedAt > dbUpdated && parsed?.progress) {
        const dbCount = Object.keys((audit.progress as any)?.bookingFlags || {}).length
          + Object.keys((audit.progress as any)?.accountFlags || {}).length;
        const lsCount = Object.keys(parsed.progress.bookingFlags || {}).length
          + Object.keys(parsed.progress.accountFlags || {}).length;
        if (lsCount > dbCount) {
          setLocalProgress(parsed.progress);
          toast.info(`Lokale Sicherung wiederhergestellt (${lsCount} Markierungen). Wird gespeichert…`);
          // trigger save
          pendingProgressRef.current = parsed.progress;
          void doSave(parsed.progress);
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audit?.id]);

  const doSave = useCallback(async (newProgress: Record<string, any>, attempt = 0): Promise<boolean> => {
    setSaveState("saving");
    try {
      if (tokenMode && token) {
        const { error } = await supabase.rpc("update_audit_by_token", {
          p_token: token,
          p_progress: newProgress as any,
          p_status: "in_progress",
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("cash_audits")
          .update({ progress: newProgress as any, status: "in_progress", updated_at: new Date().toISOString() })
          .eq("id", auditId);
        if (error) throw error;
      }
      pendingProgressRef.current = null;
      setSaveState("saved");
      try { localStorage.removeItem(lsKey); } catch {}
      return true;
    } catch (err: any) {
      console.error("Failed to save progress", err);
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
        return doSave(newProgress, attempt + 1);
      }
      setSaveState("error");
      toast.error("Speichern fehlgeschlagen — bitte erneut versuchen.");
      return false;
    }
  }, [auditId, tokenMode, token, lsKey]);

  const flushPendingSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pending = pendingProgressRef.current;
    if (pending) {
      await doSave(pending);
    }
  }, [doSave]);

  const handleProgressChange = (updater: Record<string, any> | ((prev: Record<string, any>) => Record<string, any>)) => {
    setLocalProgress((prev) => {
      const base = prev ?? (audit?.progress as Record<string, any>) ?? {};
      const next = typeof updater === "function" ? (updater as any)(base) : updater;
      pendingProgressRef.current = next;
      // localStorage backup immediately
      try { localStorage.setItem(lsKey, JSON.stringify({ savedAt: Date.now(), progress: next })); } catch {}
      setSaveState("dirty");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const p = pendingProgressRef.current;
        if (p) void doSave(p);
      }, 800);
      return next;
    });
  };

  // Flush on unmount / page unload / tab hide
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingProgressRef.current) {
        // best-effort sync save attempt; also warn user
        void doSave(pendingProgressRef.current);
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && pendingProgressRef.current) {
        void doSave(pendingProgressRef.current);
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (pendingProgressRef.current) void doSave(pendingProgressRef.current);
    };
  }, [doSave]);

  const handleBack = useCallback(async () => {
    await flushPendingSave();
    onBack?.();
  }, [flushPendingSave, onBack]);

  const handleComplete = async (signatureData: string, notes: string) => {
    setSaving(true);
    try {
      if (tokenMode && token) {
        await supabase.rpc("update_audit_by_token", {
          p_token: token,
          p_progress: progress as any,
          p_notes: notes,
          p_status: "completed",
          p_signature_data: signatureData,
        });
      } else {
        await supabase
          .from("cash_audits")
          .update({
            status: "completed",
            signature_data: signatureData,
            signed_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            notes,
            progress: progress as any,
          })
          .eq("id", auditId);
      }
      toast.success("Kassenprüfung erfolgreich abgeschlossen!");
      setShowSignature(false);
      queryClient.invalidateQueries({ queryKey: ["cash-audit", auditId] });
      queryClient.invalidateQueries({ queryKey: ["cash-audits"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <div className="py-12 text-center text-muted-foreground">Lade Kassenprüfung...</div>;
  }

  if (!audit) {
    return <div className="py-12 text-center text-muted-foreground">Kassenprüfung nicht gefunden.</div>;
  }

  const building = tokenMode ? audit.building : audit.buildings;
  const period = tokenMode ? audit.billing_period : audit.billing_periods;
  const auditorContact = tokenMode ? audit.auditor : audit.contacts;
  const auditorContactName = tokenMode
    ? (auditorContact?.persons?.[0] ? `${auditorContact.persons[0].first_name} ${auditorContact.persons[0].last_name}` : auditorContact?.company_name)
    : (auditorContact?.contact_persons?.filter((p: any) => p.is_primary)?.[0]
      ? `${auditorContact.contact_persons.filter((p: any) => p.is_primary)[0].first_name} ${auditorContact.contact_persons.filter((p: any) => p.is_primary)[0].last_name}`
      : auditorContact?.company_name || "–");
  const auditorName = (audit as any).auditor_name_override?.trim() || auditorContactName;

  const isCompleted = audit.status === "completed";
  const fiscalYear = period?.fiscal_year || audit.fiscal_year;

  // Progress stats
  const checkedCount = Object.values(progress?.checkedAccounts || {}).filter(Boolean).length;
  const flaggedOk = Object.values(progress?.bookingFlags || {}).filter((v) => v === "ok").length;
  const totalChecks = checkedCount + flaggedOk;
  const progressPercent = totalChecks > 0 ? Math.min(100, totalChecks * 5) : 0; // rough progress

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={handleBack} className="mt-0.5">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold">Kassenprüfung: {building?.name || "–"}</h2>
            <Badge variant={isCompleted ? "default" : "secondary"}>
              {fiscalYear}
            </Badge>
            {isCompleted && (
              <Badge className="bg-green-100 text-green-800 gap-1">
                <CheckCircle2 className="h-3 w-3" /> Abgeschlossen
              </Badge>
            )}
            {!isCompleted && saveState === "saving" && (
              <Badge variant="secondary" className="text-xs">Speichere…</Badge>
            )}
            {!isCompleted && saveState === "dirty" && (
              <Badge variant="secondary" className="text-xs">Ungespeicherte Änderungen</Badge>
            )}
            {!isCompleted && saveState === "saved" && (
              <Badge className="bg-green-100 text-green-800 text-xs">Gespeichert</Badge>
            )}
            {!isCompleted && saveState === "error" && (
              <Badge variant="destructive" className="text-xs cursor-pointer" onClick={() => pendingProgressRef.current && doSave(pendingProgressRef.current)}>
                Fehler — erneut versuchen
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Prüfer: {auditorName} · {[building?.address, (building as any)?.city].filter(Boolean).join(", ")}
          </p>
          <Progress value={progressPercent} className="mt-2 h-1.5" />
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setShowIntro(true)}>
          <HelpCircle className="h-4 w-4" /> Anleitung
        </Button>
      </div>

      <CashAuditIntroDialog
        open={showIntro}
        onClose={(dontShow) => {
          setShowIntro(false);
          if (dontShow) { try { localStorage.setItem(introKey, "1"); } catch {} }
        }}
        buildingName={building?.name}
        fiscalYear={fiscalYear}
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList variant="underline" className="w-full justify-start">
          <TabsTrigger variant="underline" value="konten">Kontenblätter</TabsTrigger>
          <TabsTrigger variant="underline" value="journal">Buchungsjournal</TabsTrigger>
          <TabsTrigger variant="underline" value="dokumente">Dokumente</TabsTrigger>
          <TabsTrigger variant="underline" value="hinweise">
            Hinweise
          </TabsTrigger>
        </TabsList>

        <TabsContent value="konten">
          <CashAuditAccountSheet
            buildingId={audit.building_id}
            fiscalYear={fiscalYear}
            progress={progress}
            onProgressChange={handleProgressChange}
            readOnly={isCompleted}
            tokenMode={tokenMode}
            token={token}
          />
        </TabsContent>

        <TabsContent value="journal">
          <CashAuditJournal
            buildingId={audit.building_id}
            fiscalYear={fiscalYear}
            progress={progress}
            onProgressChange={handleProgressChange}
            readOnly={isCompleted}
            tokenMode={tokenMode}
            token={token}
          />
        </TabsContent>

        <TabsContent value="dokumente">
          <CashAuditDocuments
            buildingId={audit.building_id}
            fiscalYear={fiscalYear}
            billingPeriodId={audit.billing_period_id}
            auditId={audit.id}
            tokenMode={tokenMode}
            token={token}
          />
        </TabsContent>

        <TabsContent value="hinweise">
          {adminNotes.length > 0 ? (
            <div className="space-y-3 mt-4">
              {adminNotes.map((n: any) => (
                <div key={n.id} className="rounded-lg p-4 border bg-card">
                  <p className="font-medium text-sm">{n.title}</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">{n.body}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mt-4">Keine Hinweise vom Verwalter hinterlegt.</p>
          )}
        </TabsContent>
      </Tabs>

      {/* Footer actions */}
      {!isCompleted && (
        <div className="flex gap-2 pt-2 border-t">
          <Button className="gap-1.5 ml-auto" onClick={() => setShowSignature(true)}>
            <PenLine className="h-4 w-4" /> Prüfung abschließen
          </Button>
        </div>
      )}

      {isCompleted && audit.signature_data && (
        <Card className="border-green-200 bg-green-50/30">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div>
                <p className="font-medium text-sm">Prüfung abgeschlossen</p>
                <p className="text-xs text-muted-foreground">
                  Unterschrieben am {audit.signed_at ? new Date(audit.signed_at).toLocaleDateString("de-DE") : "–"}
                </p>
              </div>
            </div>
            {audit.notes && <p className="text-sm mt-2 text-muted-foreground">{audit.notes}</p>}
            <img src={audit.signature_data} alt="Unterschrift" className="mt-3 h-16 border rounded bg-white p-1" />
          </CardContent>
        </Card>
      )}

      <CashAuditSignature
        open={showSignature}
        onOpenChange={setShowSignature}
        progress={progress}
        notes={audit.notes || ""}
        onComplete={handleComplete}
        saving={saving}
      />
    </div>
  );
}
