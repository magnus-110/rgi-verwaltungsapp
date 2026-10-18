import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, CircleDot, Loader2, MoreHorizontal, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { MaklerGuard, Rueckfrage, StatusBadge } from "@/components/broker/MaklerUi";
import { ObjektFormular, formAus, payloadAus, type ObjektForm } from "@/components/broker/ObjektFormular";
import { ObjektSeitenleiste } from "@/components/broker/ObjektSeitenleiste";
import { FotosUnterlagen } from "@/components/broker/FotosUnterlagen";
import { ObjektInteressenten, ObjektVerlauf } from "@/components/broker/ObjektTabs";
import { useBrokerLeads, useBrokerProperty, useMaklerNeuLaden } from "@/hooks/useMakler";
import { ExposeHochladenKnopf } from "@/components/broker/ExposeHochladen";
import {
  FOTO_BUCKET,
  OBJEKT_STATUS,
  STATUS_LABEL,
  UNTERLAGEN_BUCKET,
  artLabel,
  db,
  fehler,
  objektAendern,
  type BrokerProperty,
  type ObjektStatus,
} from "@/lib/makler";
import { cn } from "@/lib/utils";

export default function MaklerObjekt() {
  return (
    <MaklerGuard>
      <Inhalt />
    </MaklerGuard>
  );
}

const TABS = ["uebersicht", "fotos", "interessenten", "verlauf"] as const;
type Tab = (typeof TABS)[number];

function Inhalt() {
  const { id } = useParams<{ id: string }>();
  const { data: p, isLoading } = useBrokerProperty(id);

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto space-y-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }
  if (!p) {
    return (
      <div className="max-w-md mx-auto mt-16 rounded-xl border bg-card p-8 text-center">
        <h1 className="font-display text-xl font-semibold mb-2">Objekt nicht gefunden</h1>
        <p className="text-sm text-muted-foreground mb-6">Es wurde gelöscht, oder Sie haben keinen Zugriff darauf.</p>
        <Button asChild className="h-11"><Link to="/makler/objekte">Zu den Objekten</Link></Button>
      </div>
    );
  }
  return <Detail key={p.id} p={p} />;
}

function Detail({ p }: { p: BrokerProperty }) {
  const navigate = useNavigate();
  const neuLaden = useMaklerNeuLaden();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.includes(params.get("tab") as Tab) ? params.get("tab") : "uebersicht") as Tab;
  const setTab = (t: string) => {
    const next = new URLSearchParams(params);
    if (t === "uebersicht") next.delete("tab");
    else next.set("tab", t);
    setParams(next, { replace: true });
  };
  const { data: leads = [] } = useBrokerLeads(p.id);

  // --- Ein Formular-Zustand je Objekt -------------------------------------
  const [form, setForm] = useState<ObjektForm>(() => formAus(p));
  const [basis, setBasis] = useState<ObjektForm>(() => formAus(p));
  const dirty = JSON.stringify(form) !== JSON.stringify(basis);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const [speichert, setSpeichert] = useState(false);

  // Neue Daten vom Server übernehmen – aber nur, wenn nichts ungespeichert ist.
  useEffect(() => {
    if (dirtyRef.current) return;
    const neu = formAus(p);
    setForm(neu);
    setBasis(neu);
  }, [p.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const setFeld = useCallback(<K extends keyof ObjektForm>(k: K, v: ObjektForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warnen = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warnen);
    return () => window.removeEventListener("beforeunload", warnen);
  }, [dirty]);

  const speichern = async () => {
    let payload: Record<string, unknown>;
    try {
      payload = payloadAus(form);
    } catch (e) {
      return fehler("Bitte prüfen", e);
    }
    setSpeichert(true);
    try {
      await objektAendern(p.id, payload);
      setBasis(form);
      dirtyRef.current = false;
      toast.success("Gespeichert");
      neuLaden();
    } catch (e) {
      fehler("Speichern hat nicht geklappt", e);
    } finally {
      setSpeichert(false);
    }
  };

  // --- Stand ---------------------------------------------------------------
  const [referenzFrage, setReferenzFrage] = useState(false);
  const statusSetzen = async (neu: ObjektStatus) => {
    if (neu === p.status) return;
    const patch: Record<string, unknown> = { status: neu, is_active: neu === "vermarktung" || neu === "reserviert" };
    if (neu === "abgeschlossen") {
      patch.website_state = p.listing_type === "sale" ? "verkauft" : "vermietet";
      patch.closed_at = new Date().toISOString();
    } else {
      patch.closed_at = null;
      if (neu === "vermarktung") patch.website_state = "aktiv";
      if (neu === "reserviert") patch.website_state = "reserviert";
    }
    try {
      await objektAendern(p.id, patch);
      toast.success(`Stand: ${STATUS_LABEL[neu]}`);
      neuLaden();
      if (neu === "abgeschlossen" && !p.is_reference) setReferenzFrage(true);
    } catch (e) {
      fehler("Stand konnte nicht geändert werden", e);
    }
  };

  // --- Löschen und Zurück ---------------------------------------------------
  const [loeschFrage, setLoeschFrage] = useState(false);
  const [verwerfenFrage, setVerwerfenFrage] = useState(false);

  const loeschen = async () => {
    setLoeschFrage(false);
    const [bilder, docs] = await Promise.all([
      db.from("broker_property_images").select("storage_path").eq("property_id", p.id),
      db.from("broker_property_documents").select("storage_path").eq("property_id", p.id),
    ]);
    const { data, error } = await db.from("broker_properties").delete().eq("id", p.id).select("id");
    if (error) return fehler("Objekt konnte nicht gelöscht werden", error);
    if (!data || data.length === 0) {
      return void toast.error("Objekt konnte nicht gelöscht werden", {
        description: "Löschen dürfen Administratoren – oder wer einen eigenen Entwurf angelegt hat.",
      });
    }
    const fotoPfade = ((bilder.data ?? []) as { storage_path: string }[]).map((b) => b.storage_path);
    const docPfade = ((docs.data ?? []) as { storage_path: string }[]).map((d) => d.storage_path);
    if (fotoPfade.length) {
      const { error: e } = await db.storage.from(FOTO_BUCKET).remove(fotoPfade);
      if (e) fehler("Fotos konnten nicht vollständig entfernt werden", e);
    }
    if (docPfade.length) {
      const { error: e } = await db.storage.from(UNTERLAGEN_BUCKET).remove(docPfade);
      if (e) fehler("Unterlagen konnten nicht vollständig entfernt werden", e);
    }
    dirtyRef.current = false;
    toast.success("Objekt gelöscht");
    neuLaden();
    navigate("/makler/objekte", { replace: true });
  };

  const zurueck = () => {
    if (dirty) setVerwerfenFrage(true);
    else navigate("/makler/objekte");
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Kopf */}
      <div className="mb-4">
        <button type="button" onClick={zurueck} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground min-h-11 -ml-1 px-1">
          <ArrowLeft className="h-4 w-4" />Alle Objekte
        </button>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold tracking-tight break-words">{p.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <StatusBadge status={p.status} />
              <span>{artLabel(p.listing_type)}</span>
              {p.city && <span>· {[p.postal_code, p.city].filter(Boolean).join(" ")}</span>}
              <span className={cn("inline-flex items-center gap-1", dirty ? "text-amber-700" : "text-emerald-700")}>
                · {dirty ? <CircleDot className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                {dirty ? "Änderungen nicht gespeichert" : "Alles gespeichert"}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={p.status} onValueChange={(v) => statusSetzen(v as ObjektStatus)}>
              <SelectTrigger className="h-11 w-[180px]" aria-label="Stand"><SelectValue /></SelectTrigger>
              <SelectContent>
                {OBJEKT_STATUS.map((s) => <SelectItem key={s} value={s} className="min-h-10">{STATUS_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
            <ExposeHochladenKnopf propertyId={p.id} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-11 w-11" aria-label="Weitere Aktionen">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="min-h-11 text-destructive focus:text-destructive" onClick={() => setLoeschFrage(true)}>
                  <Trash2 className="h-4 w-4 mr-2" />Objekt löschen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="-mx-3 px-3 overflow-x-auto mb-4">
          <TabsList variant="segment" className="w-max">
            <TabsTrigger value="uebersicht" className="h-9 px-3 rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm">Übersicht</TabsTrigger>
            <TabsTrigger value="fotos" className="h-9 px-3 rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm">Fotos & Unterlagen</TabsTrigger>
            <TabsTrigger value="interessenten" className="h-9 px-3 rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm">Interessenten ({leads.length})</TabsTrigger>
            <TabsTrigger value="verlauf" className="h-9 px-3 rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm">Verlauf & E-Mails</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="uebersicht" className="mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">
            <div className="min-w-0">
              <ObjektFormular form={form} setFeld={setFeld} />
              <div className="sticky bottom-0 z-10 -mx-3 lg:mx-0 mt-4 border-t lg:border lg:rounded-xl bg-background/95 backdrop-blur px-3 py-3 flex items-center justify-between gap-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
                <span className={cn("text-sm", dirty ? "text-amber-700 font-medium" : "text-muted-foreground")}>
                  {dirty ? "Änderungen nicht gespeichert" : "Alles gespeichert"}
                </span>
                <div className="flex gap-2">
                  {dirty && (
                    <Button variant="ghost" className="h-11" onClick={() => setForm(basis)} disabled={speichert}>Verwerfen</Button>
                  )}
                  <Button className="h-11 min-w-[130px]" onClick={speichern} disabled={!dirty || speichert}>
                    {speichert ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Speichern
                  </Button>
                </div>
              </div>
            </div>
            <ObjektSeitenleiste p={p} onUnterlagen={() => setTab("fotos")} />
          </div>
        </TabsContent>
        <TabsContent value="fotos" className="mt-0">
          <FotosUnterlagen propertyId={p.id} />
        </TabsContent>
        <TabsContent value="interessenten" className="mt-0">
          <ObjektInteressenten propertyId={p.id} />
        </TabsContent>
        <TabsContent value="verlauf" className="mt-0">
          <ObjektVerlauf propertyId={p.id} />
        </TabsContent>
      </Tabs>

      <Rueckfrage
        open={loeschFrage}
        onOpenChange={setLoeschFrage}
        titel="Objekt löschen?"
        text="Das Objekt wird mit allen Fotos, Unterlagen, Notizen und Interessenten endgültig gelöscht."
        ja="Endgültig löschen"
        onJa={loeschen}
      />
      <Rueckfrage
        open={referenzFrage}
        onOpenChange={setReferenzFrage}
        titel="Als Referenz zeigen?"
        text="Soll das abgeschlossene Objekt auf der Website als Referenz erscheinen?"
        ja="Ja, als Referenz zeigen"
        nein="Nein"
        gefaehrlich={false}
        onJa={async () => {
          setReferenzFrage(false);
          try {
            await objektAendern(p.id, { is_reference: true });
            toast.success("Wird als Referenz gezeigt");
            neuLaden();
          } catch (e) {
            fehler("Konnte nicht gespeichert werden", e);
          }
        }}
      />
      <Rueckfrage
        open={verwerfenFrage}
        onOpenChange={setVerwerfenFrage}
        titel="Änderungen verwerfen?"
        text="Sie haben Änderungen, die noch nicht gespeichert sind."
        ja="Verwerfen"
        nein="Weiter bearbeiten"
        onJa={() => {
          dirtyRef.current = false;
          setVerwerfenFrage(false);
          navigate("/makler/objekte");
        }}
      />
    </div>
  );
}
