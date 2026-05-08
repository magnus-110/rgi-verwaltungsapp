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
import { Download, PenLine, ArrowLeft, CheckCircle2, Copy, ExternalLink, Info } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";


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
          buildings(name, address),
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

  const saveProgress = useCallback(async (newProgress: Record<string, any>) => {
    try {
      if (tokenMode && token) {
        await supabase.rpc("update_audit_by_token", {
          p_token: token,
          p_progress: newProgress as any,
          p_status: "in_progress",
        });
      } else {
        await supabase
          .from("cash_audits")
          .update({ progress: newProgress as any, status: "in_progress", updated_at: new Date().toISOString() })
          .eq("id", auditId);
      }
    } catch (err) {
      console.error("Failed to save progress", err);
    }
  }, [auditId, tokenMode, token]);

  const handleProgressChange = (newProgress: Record<string, any>) => {
    setLocalProgress(newProgress);
    // Debounce save
    clearTimeout((window as any).__auditSaveTimer);
    (window as any).__auditSaveTimer = setTimeout(() => saveProgress(newProgress), 1500);
  };

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
  const auditorName = tokenMode
    ? (auditorContact?.persons?.[0] ? `${auditorContact.persons[0].first_name} ${auditorContact.persons[0].last_name}` : auditorContact?.company_name)
    : (auditorContact?.contact_persons?.filter((p: any) => p.is_primary)?.[0]
      ? `${auditorContact.contact_persons.filter((p: any) => p.is_primary)[0].first_name} ${auditorContact.contact_persons.filter((p: any) => p.is_primary)[0].last_name}`
      : auditorContact?.company_name || "–");

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
          <Button variant="ghost" size="icon" onClick={onBack} className="mt-0.5">
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
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Prüfer: {auditorName} · {building?.address}
          </p>
          <Progress value={progressPercent} className="mt-2 h-1.5" />
        </div>
      </div>

      {/* Hinweise vom Verwalter */}
      {adminNotes.length > 0 && (
        <Alert className="border-amber-200 bg-amber-50/60">
          <Info className="h-4 w-4 text-amber-700" />
          <AlertTitle className="text-amber-900">Hinweise vom Verwalter</AlertTitle>
          <AlertDescription>
            <div className="space-y-3 mt-2">
              {adminNotes.map((n: any) => (
                <div key={n.id} className="bg-white/70 rounded p-3 border border-amber-200">
                  <p className="font-medium text-sm text-amber-900">{n.title}</p>
                  <p className="text-sm text-foreground/80 whitespace-pre-wrap mt-1">{n.body}</p>
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList variant="underline" className="w-full justify-start">
          <TabsTrigger variant="underline" value="konten">Kontenblätter</TabsTrigger>
          <TabsTrigger variant="underline" value="journal">Buchungsjournal</TabsTrigger>
          <TabsTrigger variant="underline" value="dokumente">Dokumente</TabsTrigger>
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
      </Tabs>

      {/* Footer actions */}
      {!isCompleted && (
        <div className="flex gap-2 pt-2 border-t">
          <Button variant="outline" className="gap-1.5" onClick={() => toast.info("Export wird in einer zukünftigen Version verfügbar sein.")}>
            <Download className="h-4 w-4" /> Export
          </Button>
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
