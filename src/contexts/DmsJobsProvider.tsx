/**
 * DmsJobsProvider — globale Hintergrund-Queue für die DMS-Ablage von
 * generierten Abrechnungs-/Wirtschaftsplan-Dokumenten.
 *
 * Lebt im AdminLayout (also über allen Routen), damit Jobs weiterlaufen,
 * wenn der Nutzer die Abrechnungs-Seite verlässt.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { uploadGeneratedPdfToDms } from "@/components/finance/lib/uploadGeneratedPdfToDms";
import type { DmsFolderKey } from "@/components/finance/lib/resolveDmsFolder";
import { toast } from "sonner";

export type DmsEdgeFn = "generate-billing-document" | "generate-35a-docx";

export interface DmsJobItem {
  title: string;
  edgeFn: DmsEdgeFn;
  body: any;
  displayName: string;
  folderKey: DmsFolderKey;
  visibility: "alle" | "eigentuemer_only";
  contactId?: string | null;
  buildingId: string;
  periodId?: string | null;
  managementMode: "weg" | "rent";
  fiscalYear?: number | null;
}

export interface DmsJob {
  id: string;
  label: string;
  status: "queued" | "running" | "done" | "error";
  total: number;
  completed: number;
  failed: number;
  errors: string[];
  items: DmsJobItem[];
  createdAt: number;
}

interface Ctx {
  jobs: DmsJob[];
  enqueue: (label: string, items: DmsJobItem[]) => string;
  clearDone: () => void;
  remove: (id: string) => void;
  activeCount: number;
}

const DmsJobsContext = createContext<Ctx | null>(null);

export function useDmsJobs() {
  const c = useContext(DmsJobsContext);
  if (!c) throw new Error("useDmsJobs muss innerhalb von DmsJobsProvider verwendet werden");
  return c;
}

async function callEdgeFn(fn: DmsEdgeFn, body: any, accessToken: string): Promise<Blob> {
  const projectId = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID;
  const resp = await fetch(
    `https://${projectId}.supabase.co/functions/v1/${fn}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    },
  );
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(txt || `Export fehlgeschlagen (${resp.status})`);
  }
  return await resp.blob();
}

export function DmsJobsProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<DmsJob[]>([]);
  const runningRef = useRef(false);
  const queueRef = useRef<string[]>([]);

  const updateJob = useCallback((id: string, patch: Partial<DmsJob>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }, []);

  const runJob = useCallback(async (jobId: string) => {
    const job = jobsRefGet(jobsRef, jobId);
    if (!job) return;
    updateJob(jobId, { status: "running" });

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      updateJob(jobId, { status: "error", errors: ["Nicht angemeldet"] });
      return;
    }

    let completed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < job.items.length; i++) {
      const it = job.items[i];
      try {
        const bytes = await callEdgeFn(it.edgeFn, it.body, accessToken);
        await uploadGeneratedPdfToDms({
          bytes,
          displayName: it.displayName,
          buildingId: it.buildingId,
          periodId: it.periodId ?? null,
          contactId: it.contactId ?? null,
          folderKey: it.folderKey,
          visibility: it.visibility,
          managementMode: it.managementMode,
          fiscalYear: it.fiscalYear ?? null,
        });
        completed++;
      } catch (e: any) {
        failed++;
        errors.push(`${it.title}: ${e?.message || e}`);
      }
      updateJob(jobId, { completed, failed, errors: [...errors] });
    }

    updateJob(jobId, {
      status: errors.length && completed === 0 ? "error" : "done",
    });
    window.dispatchEvent(new CustomEvent("dms:refresh"));

    if (errors.length === 0) {
      toast.success(`${job.label}: ${completed} Dokument(e) ins DMS abgelegt`);
    } else if (completed > 0) {
      toast.warning(`${job.label}: ${completed} ok, ${failed} Fehler`);
    } else {
      toast.error(`${job.label}: alle ${failed} Dokumente fehlgeschlagen`);
    }
  }, [updateJob]);

  // Wir brauchen einen Ref auf den aktuellen jobs-State, weil runJob in einer
  // langen async Schleife läuft.
  const jobsRef = useRef<DmsJob[]>([]);
  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  const pump = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      while (queueRef.current.length > 0) {
        const id = queueRef.current.shift()!;
        await runJob(id);
      }
    } finally {
      runningRef.current = false;
    }
  }, [runJob]);

  const enqueue = useCallback(
    (label: string, items: DmsJobItem[]) => {
      const id = crypto.randomUUID();
      const job: DmsJob = {
        id,
        label,
        status: "queued",
        total: items.length,
        completed: 0,
        failed: 0,
        errors: [],
        items,
        createdAt: Date.now(),
      };
      setJobs((prev) => [job, ...prev]);
      queueRef.current.push(id);
      // Kick off (microtask-deferred, damit der State-Update durch ist)
      setTimeout(() => { pump(); }, 0);
      toast.message(`${label}: läuft im Hintergrund (${items.length} Dokumente)…`);
      return id;
    },
    [pump],
  );

  const clearDone = useCallback(() => {
    setJobs((prev) => prev.filter((j) => j.status === "running" || j.status === "queued"));
  }, []);

  const remove = useCallback((id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }, []);

  // Warnung beim Tab-Schließen wenn Jobs laufen
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const active = jobsRef.current.some((j) => j.status === "running" || j.status === "queued");
      if (active) {
        e.preventDefault();
        e.returnValue = "Es werden noch Dokumente erzeugt. Trotzdem schließen?";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const activeCount = jobs.filter((j) => j.status === "running" || j.status === "queued").length;

  return (
    <DmsJobsContext.Provider value={{ jobs, enqueue, clearDone, remove, activeCount }}>
      {children}
    </DmsJobsContext.Provider>
  );
}

function jobsRefGet(ref: React.MutableRefObject<DmsJob[]>, id: string): DmsJob | undefined {
  return ref.current.find((j) => j.id === id);
}
