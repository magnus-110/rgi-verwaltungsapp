import { useEffect, useRef, useState } from "react";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { ArrowDown, ArrowUp, FileText, GripVertical, ImagePlus, Loader2, Star, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Rueckfrage } from "./MaklerUi";
import { useBrokerAccess, useBrokerDocuments, useBrokerImages, useMaklerNeuLaden } from "@/hooks/useMakler";
import {
  FOTO_BUCKET,
  UNTERLAGEN_BUCKET,
  UNTERLAGEN_KATEGORIEN,
  bildVerkleinern,
  datum,
  dateinameBereinigen,
  db,
  fehler,
  fotoUrl,
  type BrokerDocument,
  type BrokerImage,
} from "@/lib/makler";
import { cn } from "@/lib/utils";

export function FotosUnterlagen({ propertyId }: { propertyId: string }) {
  return (
    <div className="space-y-6">
      <Fotos propertyId={propertyId} />
      <Unterlagen propertyId={propertyId} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fotos
// ---------------------------------------------------------------------------
function Fotos({ propertyId }: { propertyId: string }) {
  const { userId } = useBrokerAccess();
  const neuLaden = useMaklerNeuLaden();
  const { data: server, isLoading } = useBrokerImages(propertyId);
  const [bilder, setBilder] = useState<BrokerImage[]>([]);
  const [hochladen, setHochladen] = useState<{ fertig: number; gesamt: number } | null>(null);
  const [loeschen, setLoeschen] = useState<BrokerImage | null>(null);
  const eingabe = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (server) setBilder(server);
  }, [server]);

  const dateienHochladen = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const liste = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (liste.length < files.length) toast.error("Nur Bilder können als Fotos hochgeladen werden.");
    if (liste.length === 0) return;
    setHochladen({ fertig: 0, gesamt: liste.length });
    let naechste = bilder.reduce((m, b) => Math.max(m, b.sort_order), -1) + 1;
    let ok = 0;
    for (const file of liste) {
      try {
        const { blob, width, height } = await bildVerkleinern(file);
        const pfad = `${propertyId}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await db.storage.from(FOTO_BUCKET).upload(pfad, blob, { contentType: "image/jpeg", upsert: false });
        if (upErr) throw upErr;
        const { error } = await db.from("broker_property_images").insert({
          property_id: propertyId,
          storage_path: pfad,
          sort_order: naechste++,
          width,
          height,
          created_by: userId,
        });
        if (error) {
          await db.storage.from(FOTO_BUCKET).remove([pfad]);
          throw error;
        }
        ok++;
      } catch (e) {
        fehler(`„${file.name}" konnte nicht hochgeladen werden`, e);
      }
      setHochladen((h) => (h ? { ...h, fertig: h.fertig + 1 } : h));
    }
    setHochladen(null);
    if (eingabe.current) eingabe.current.value = "";
    if (ok) toast.success(ok === 1 ? "Foto hochgeladen" : `${ok} Fotos hochgeladen`);
    neuLaden();
  };

  const reihenfolgeSpeichern = async (neu: BrokerImage[]) => {
    const vorher = bilder;
    setBilder(neu);
    const geaendert = neu.map((b, i) => ({ b, i })).filter(({ b, i }) => b.sort_order !== i);
    const ergebnisse = await Promise.all(
      geaendert.map(({ b, i }) => db.from("broker_property_images").update({ sort_order: i }).eq("id", b.id)),
    );
    const err = ergebnisse.find((r) => r.error)?.error;
    if (err) {
      setBilder(vorher);
      fehler("Reihenfolge konnte nicht gespeichert werden", err);
    }
    neuLaden();
  };

  const verschieben = (von: number, nach: number) => {
    if (nach < 0 || nach >= bilder.length || von === nach) return;
    const neu = [...bilder];
    const [b] = neu.splice(von, 1);
    neu.splice(nach, 0, b);
    void reihenfolgeSpeichern(neu);
  };

  const onDragEnd = (r: DropResult) => {
    if (!r.destination) return;
    verschieben(r.source.index, r.destination.index);
  };

  const beschriftung = async (b: BrokerImage, text: string) => {
    const caption = text.trim() || null;
    if (caption === (b.caption ?? null)) return;
    const { error } = await db.from("broker_property_images").update({ caption }).eq("id", b.id);
    if (error) return fehler("Bildunterschrift konnte nicht gespeichert werden", error);
    neuLaden();
  };

  const entfernen = async (b: BrokerImage) => {
    setLoeschen(null);
    const { error } = await db.from("broker_property_images").delete().eq("id", b.id);
    if (error) return fehler("Foto konnte nicht gelöscht werden", error);
    const { error: e2 } = await db.storage.from(FOTO_BUCKET).remove([b.storage_path]);
    if (e2) fehler("Die Bilddatei konnte nicht entfernt werden", e2);
    toast.success("Foto gelöscht");
    neuLaden();
  };

  return (
    <section className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h2 className="font-display text-base font-semibold">Fotos</h2>
          <p className="text-xs text-muted-foreground">Das erste Foto ist das Titelbild. Zum Sortieren ziehen oder die Pfeile nutzen.</p>
        </div>
        <Button className="h-11" onClick={() => eingabe.current?.click()} disabled={!!hochladen}>
          {hochladen ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ImagePlus className="h-4 w-4 mr-2" />}
          {hochladen ? `Lädt hoch… ${hochladen.fertig}/${hochladen.gesamt}` : "Fotos hinzufügen"}
        </Button>
        <input ref={eingabe} type="file" accept="image/*" multiple className="hidden" onChange={(e) => dateienHochladen(e.target.files)} />
      </div>

      {isLoading ? (
        <div className="h-24 flex items-center justify-center text-sm text-muted-foreground">Wird geladen…</div>
      ) : bilder.length === 0 ? (
        <button
          type="button"
          onClick={() => eingabe.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); void dateienHochladen(e.dataTransfer.files); }}
          className="w-full rounded-xl border-2 border-dashed p-10 text-center text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
        >
          <Upload className="h-8 w-8 mx-auto mb-2 opacity-60" />
          <span className="block font-medium">Noch keine Fotos</span>
          <span className="block text-sm">Tippen zum Auswählen oder Bilder hierher ziehen</span>
        </button>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="fotos">
            {(prov) => (
              <ul ref={prov.innerRef} {...prov.droppableProps} className="space-y-2">
                {bilder.map((b, i) => (
                  <Draggable key={b.id} draggableId={b.id} index={i}>
                    {(drag, snap) => (
                      <li
                        ref={drag.innerRef}
                        {...drag.draggableProps}
                        className={cn("flex items-center gap-2 sm:gap-3 rounded-lg border bg-background p-2", snap.isDragging && "shadow-lg")}
                      >
                        <span {...drag.dragHandleProps} className="flex h-11 w-7 items-center justify-center text-muted-foreground cursor-grab" aria-label="Ziehen zum Sortieren">
                          <GripVertical className="h-4 w-4" />
                        </span>
                        <a href={fotoUrl(b.storage_path)} target="_blank" rel="noreferrer" className="relative h-16 w-24 sm:h-20 sm:w-28 shrink-0 overflow-hidden rounded-md bg-muted">
                          <img src={fotoUrl(b.storage_path)} alt={b.caption ?? ""} className="h-full w-full object-cover" loading="lazy" />
                          {i === 0 && (
                            <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                              <Star className="h-2.5 w-2.5" />Titelbild
                            </span>
                          )}
                        </a>
                        <Bildunterschrift b={b} onSave={(t) => beschriftung(b, t)} />
                        <div className="flex shrink-0 flex-col sm:flex-row">
                          <Button variant="ghost" size="icon" className="h-11 w-11 hidden sm:inline-flex" disabled={i === 0} onClick={() => verschieben(i, i - 1)} aria-label="Nach oben">
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-11 w-11 hidden sm:inline-flex" disabled={i === bilder.length - 1} onClick={() => verschieben(i, i + 1)} aria-label="Nach unten">
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          {i !== 0 && (
                            <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => verschieben(i, 0)} aria-label="Als Titelbild" title="Als Titelbild">
                              <Star className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-11 w-11 text-destructive hover:text-destructive" onClick={() => setLoeschen(b)} aria-label="Foto löschen">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </li>
                    )}
                  </Draggable>
                ))}
                {prov.placeholder}
              </ul>
            )}
          </Droppable>
        </DragDropContext>
      )}

      <Rueckfrage
        open={!!loeschen}
        onOpenChange={(o) => !o && setLoeschen(null)}
        titel="Foto löschen?"
        text="Das Foto wird endgültig entfernt – auch von der Website."
        onJa={() => loeschen && entfernen(loeschen)}
      />
    </section>
  );
}

function Bildunterschrift({ b, onSave }: { b: BrokerImage; onSave: (t: string) => void }) {
  const [t, setT] = useState(b.caption ?? "");
  useEffect(() => setT(b.caption ?? ""), [b.caption]);
  return (
    <Input
      className="h-11 min-w-0 flex-1"
      value={t}
      placeholder="Bildunterschrift (optional)"
      onChange={(e) => setT(e.target.value)}
      onBlur={() => onSave(t)}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
    />
  );
}

// ---------------------------------------------------------------------------
// Unterlagen
// ---------------------------------------------------------------------------
function Unterlagen({ propertyId }: { propertyId: string }) {
  const { userId } = useBrokerAccess();
  const neuLaden = useMaklerNeuLaden();
  const { data: docs = [], isLoading } = useBrokerDocuments(propertyId);
  const [kategorie, setKategorie] = useState("expose");
  const [laeuft, setLaeuft] = useState(false);
  const [loeschen, setLoeschen] = useState<BrokerDocument | null>(null);
  const eingabe = useRef<HTMLInputElement>(null);

  const hochladen = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setLaeuft(true);
    let ok = 0;
    for (const file of Array.from(files)) {
      const name = dateinameBereinigen(file.name);
      const pfad = `${propertyId}/${crypto.randomUUID()}-${name}`;
      try {
        const { error: upErr } = await db.storage.from(UNTERLAGEN_BUCKET).upload(pfad, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
        if (upErr) throw upErr;
        const { error } = await db.from("broker_property_documents").insert({
          property_id: propertyId,
          category: kategorie,
          file_name: file.name,
          storage_path: pfad,
          mime_type: file.type || null,
          size_bytes: file.size,
          created_by: userId,
        });
        if (error) {
          await db.storage.from(UNTERLAGEN_BUCKET).remove([pfad]);
          throw error;
        }
        ok++;
      } catch (e) {
        fehler(`„${file.name}" konnte nicht hochgeladen werden`, e);
      }
    }
    setLaeuft(false);
    if (eingabe.current) eingabe.current.value = "";
    if (ok) toast.success(ok === 1 ? "Unterlage hochgeladen" : `${ok} Unterlagen hochgeladen`);
    neuLaden();
  };

  const oeffnen = async (d: BrokerDocument) => {
    // Fenster sofort öffnen (sonst blockiert Safari das Pop-up nach dem Warten).
    const fenster = window.open("", "_blank");
    const { data, error } = await db.storage.from(UNTERLAGEN_BUCKET).createSignedUrl(d.storage_path, 300);
    if (error || !data?.signedUrl) {
      fenster?.close();
      return fehler("Unterlage konnte nicht geöffnet werden", error);
    }
    if (fenster) fenster.location.href = data.signedUrl;
    else window.location.href = data.signedUrl;
  };

  const entfernen = async (d: BrokerDocument) => {
    setLoeschen(null);
    const { error } = await db.from("broker_property_documents").delete().eq("id", d.id);
    if (error) return fehler("Unterlage konnte nicht gelöscht werden", error);
    const { error: e2 } = await db.storage.from(UNTERLAGEN_BUCKET).remove([d.storage_path]);
    if (e2) fehler("Die Datei konnte nicht entfernt werden", e2);
    toast.success("Unterlage gelöscht");
    neuLaden();
  };

  const groesse = (b: number | null) => (b == null ? "" : b > 1_048_576 ? `${(b / 1_048_576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

  return (
    <section className="rounded-xl border bg-card p-4 sm:p-5" id="unterlagen">
      <div className="mb-4">
        <h2 className="font-display text-base font-semibold">Unterlagen</h2>
        <p className="text-xs text-muted-foreground">Nur intern sichtbar – nicht auf der Website.</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row mb-5">
        <Select value={kategorie} onValueChange={setKategorie}>
          <SelectTrigger className="h-11 sm:w-56" aria-label="Art der Unterlage"><SelectValue /></SelectTrigger>
          <SelectContent>
            {UNTERLAGEN_KATEGORIEN.map((k) => <SelectItem key={k.key} value={k.key} className="min-h-10">{k.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button className="h-11" onClick={() => eingabe.current?.click()} disabled={laeuft}>
          {laeuft ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
          Datei hochladen
        </Button>
        <input ref={eingabe} type="file" multiple className="hidden" onChange={(e) => hochladen(e.target.files)} />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Wird geladen…</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Unterlagen hochgeladen.</p>
      ) : (
        <div className="space-y-4">
          {UNTERLAGEN_KATEGORIEN.filter((k) => docs.some((d) => d.category === k.key)).map((k) => (
            <div key={k.key}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{k.label}</h3>
              <ul className="rounded-lg border divide-y">
                {docs.filter((d) => d.category === k.key).map((d) => (
                  <li key={d.id} className="flex items-center gap-2 pl-3">
                    <button type="button" onClick={() => oeffnen(d)} className="flex min-h-12 min-w-0 flex-1 items-center gap-2 text-left hover:text-primary">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{d.file_name}</span>
                        <span className="block text-xs text-muted-foreground">{datum(d.created_at)}{d.size_bytes ? ` · ${groesse(d.size_bytes)}` : ""}</span>
                      </span>
                    </button>
                    <Button variant="ghost" size="icon" className="h-11 w-11 text-destructive hover:text-destructive" onClick={() => setLoeschen(d)} aria-label="Unterlage löschen">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {docs.some((d) => !UNTERLAGEN_KATEGORIEN.some((k) => k.key === d.category)) && (
            <ul className="rounded-lg border divide-y">
              {docs.filter((d) => !UNTERLAGEN_KATEGORIEN.some((k) => k.key === d.category)).map((d) => (
                <li key={d.id} className="flex items-center gap-2 pl-3">
                  <button type="button" onClick={() => oeffnen(d)} className="flex min-h-12 flex-1 items-center gap-2 text-left text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground" />{d.file_name}
                  </button>
                  <Button variant="ghost" size="icon" className="h-11 w-11 text-destructive" onClick={() => setLoeschen(d)} aria-label="Unterlage löschen">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Rueckfrage
        open={!!loeschen}
        onOpenChange={(o) => !o && setLoeschen(null)}
        titel="Unterlage löschen?"
        text={loeschen ? `„${loeschen.file_name}" wird endgültig gelöscht.` : undefined}
        onJa={() => loeschen && entfernen(loeschen)}
      />
    </section>
  );
}
