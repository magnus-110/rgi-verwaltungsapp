/**
 * „Dokument unterschreiben“ — PDF in der App anzeigen, Unterschrift,
 * Datum, Ort, Text oder Haken an die richtige Stelle setzen und als neue
 * Datei speichern. Gedacht für Tablet (Finger/Stift) und PC.
 *
 * Wo gespeichert wird, entscheidet der Aufrufer (`onSave`). Das Original
 * bleibt immer unverändert.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertCircle, Calendar, Check, CheckCircle2, ChevronDown, Download, Loader2, MapPin, PenLine,
  Trash2, Type, X, ZoomIn, ZoomOut, Minus, Plus,
} from "lucide-react";
import { toast } from "sonner";
import { pdfjs } from "react-pdf";
import { loadPdfLib, signedFileName, stampPdf, TEXT_LINE_HEIGHT, type SignItem } from "@/lib/pdfSign";
import { useMySignature } from "@/lib/documentSigning";
import { SignatureDrawDialog } from "./SignatureDrawDialog";

const PdfDocument = lazy(() => import("react-pdf").then((m) => ({ default: m.Document })));
const PdfPage = lazy(() => import("react-pdf").then((m) => ({ default: m.Page })));
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const PLACE_KEY = "rgi-sign-place";
const FONT_FAMILY = "Helvetica, Arial, sans-serif";

const readPlace = () => {
  try {
    return localStorage.getItem(PLACE_KEY) || "Pfronten";
  } catch {
    return "Pfronten";
  }
};
const writePlace = (v: string) => {
  try {
    localStorage.setItem(PLACE_KEY, v);
  } catch {
    /* egal */
  }
};

const today = () => new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

let measureCtx: CanvasRenderingContext2D | null = null;
/** Breite eines Textes in PDF-Punkten bei gegebener Schriftgröße. */
const measureText = (text: string, fontSize: number) => {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * fontSize * 0.55;
  measureCtx.font = `${fontSize}px ${FONT_FAMILY}`;
  return Math.max(fontSize, measureCtx.measureText(text || " ").width);
};

type Pending =
  | { kind: "image"; dataUrl: string; aspect: number; label: string }
  | { kind: "text"; text: string; label: string }
  | { kind: "check"; label: string };

type DragState = {
  id: string;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  orig: SignItem;
};

export interface SignPdfDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Adresse der Original-PDF (signierter Speicher-Link) */
  sourceUrl: string | null;
  fileName: string;
  /** Speichert die fertige Datei dort, wo sie hingehört. */
  onSave: (result: { blob: Blob; fileName: string; items: SignItem[] }) => Promise<void>;
  /** Hinweis im Fertig-Bildschirm, z. B. „Liegt jetzt neben dem Original.“ */
  savedHint?: string;
  /** Zusätzliche Knöpfe im Fertig-Bildschirm (z. B. „Zurücksenden“). */
  renderDone?: (ctx: { blob: Blob; fileName: string; close: () => void }) => ReactNode;
}

export function SignPdfDialog({ open, onOpenChange, sourceUrl, fileName, onSave, savedHint, renderDone }: SignPdfDialogProps) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageSizes, setPageSizes] = useState<{ w: number; h: number }[]>([]);
  const [items, setItems] = useState<SignItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [zoom, setZoom] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const [drawOpen, setDrawOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ blob: Blob; fileName: string; url: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);
  const { data: mySignature } = useMySignature();

  // ---------- Laden ----------
  useEffect(() => {
    if (!open || !sourceUrl) return;
    let cancelled = false;
    let createdUrl: string | null = null;
    setBytes(null);
    setBlobUrl(null);
    setLoadError(null);
    setPageSizes([]);
    setItems([]);
    setSelectedId(null);
    setPending(null);
    setZoom(1);
    setDone(null);
    (async () => {
      try {
        const res = await fetch(sourceUrl);
        if (!res.ok) throw new Error(`Datei konnte nicht geladen werden (HTTP ${res.status})`);
        const buf = new Uint8Array(await res.arrayBuffer());
        if (!(buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46)) {
          throw new Error("Die Datei ist kein PDF.");
        }
        if (cancelled) return;
        createdUrl = URL.createObjectURL(new Blob([buf], { type: "application/pdf" }));
        setBytes(buf);
        setBlobUrl(createdUrl);
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message || "Datei konnte nicht geladen werden");
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [open, sourceUrl]);

  useEffect(() => () => {
    if (done?.url) URL.revokeObjectURL(done.url);
  }, [done]);

  // Breite des Anzeigebereichs verfolgen (Tablet drehen, Fenster ändern)
  const resizeObsRef = useRef<ResizeObserver | null>(null);
  const setScrollEl = useCallback((el: HTMLDivElement | null) => {
    resizeObsRef.current?.disconnect();
    resizeObsRef.current = null;
    scrollRef.current = el;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth));
    ro.observe(el);
    resizeObsRef.current = ro;
    setContainerWidth(el.clientWidth);
  }, []);

  const maxPageWidth = useMemo(() => Math.max(1, ...pageSizes.map((p) => p.w)), [pageSizes]);
  const baseScale = containerWidth > 0 ? Math.min(2, (containerWidth - 24) / maxPageWidth) : 1;
  const scale = Math.max(0.2, baseScale * zoom);

  const onDocLoad = async (pdf: any) => {
    try {
      const sizes: { w: number; h: number }[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        sizes.push({ w: vp.width, h: vp.height });
      }
      setPageSizes(sizes);
    } catch (e: any) {
      setLoadError(e?.message || "PDF konnte nicht gelesen werden");
    }
  };

  // ---------- Elemente ----------
  const selected = items.find((i) => i.id === selectedId) || null;

  const updateItem = (id: string, patch: Partial<SignItem>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? ({ ...i, ...patch } as SignItem) : i)));

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const setText = (id: string, text: string) => {
    const it = items.find((i) => i.id === id);
    if (!it || it.kind !== "text") return;
    updateItem(id, { text, w: measureText(text, it.fontSize) } as Partial<SignItem>);
  };

  const setFontSize = (id: string, fontSize: number) => {
    const it = items.find((i) => i.id === id);
    if (!it || it.kind !== "text") return;
    const fs = Math.min(48, Math.max(6, fontSize));
    updateItem(id, { fontSize: fs, w: measureText(it.text, fs), h: fs * TEXT_LINE_HEIGHT } as Partial<SignItem>);
  };

  const placeAt = (page: number, px: number, py: number) => {
    if (!pending) return;
    const size = pageSizes[page];
    if (!size) return;
    const id = crypto.randomUUID();
    let item: SignItem;
    if (pending.kind === "image") {
      const w = Math.min(170, size.w * 0.4);
      const h = w / pending.aspect;
      item = { id, page, kind: "image", dataUrl: pending.dataUrl, w, h, x: px - w / 2, y: py - h / 2 };
    } else if (pending.kind === "text") {
      const fontSize = 11;
      const w = measureText(pending.text, fontSize);
      const h = fontSize * TEXT_LINE_HEIGHT;
      item = { id, page, kind: "text", text: pending.text, fontSize, w, h, x: px - Math.min(w, 20) / 2, y: py - h / 2 };
    } else {
      const s = 14;
      item = { id, page, kind: "check", w: s, h: s, x: px - s / 2, y: py - s / 2 };
    }
    // innerhalb der Seite halten
    item.x = Math.max(0, Math.min(size.w - item.w, item.x));
    item.y = Math.max(0, Math.min(size.h - item.h, item.y));
    setItems((prev) => [...prev, item]);
    setSelectedId(id);
    const wasEmptyText = pending.kind === "text" && !pending.text;
    setPending(null);
    if (wasEmptyText) setTimeout(() => textInputRef.current?.focus(), 50);
  };

  // ---------- Ziehen & Größe ändern ----------
  const onItemPointerDown = (e: React.PointerEvent, item: SignItem, mode: "move" | "resize") => {
    if (pending) return; // im Platzier-Modus nicht ziehen
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(item.id);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* egal */
    }
    dragRef.current = { id: item.id, mode, startX: e.clientX, startY: e.clientY, orig: { ...item } };
  };

  const onItemPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    e.preventDefault();
    const dx = (e.clientX - d.startX) / scale;
    const dy = (e.clientY - d.startY) / scale;
    const size = pageSizes[d.orig.page];
    if (!size) return;
    const o = d.orig;
    if (d.mode === "move") {
      updateItem(d.id, {
        x: Math.max(-o.w * 0.5, Math.min(size.w - o.w * 0.5, o.x + dx)),
        y: Math.max(-o.h * 0.5, Math.min(size.h - o.h * 0.5, o.y + dy)),
      });
    } else if (o.kind === "image") {
      const aspect = o.w / o.h;
      const w = Math.max(24, Math.min(size.w, o.w + dx));
      updateItem(d.id, { w, h: w / aspect });
    } else if (o.kind === "text") {
      const fs = Math.min(48, Math.max(6, o.fontSize * ((o.w + dx) / o.w)));
      updateItem(d.id, { fontSize: fs, w: measureText(o.text, fs), h: fs * TEXT_LINE_HEIGHT } as Partial<SignItem>);
    } else {
      const s = Math.max(8, Math.min(80, o.w + Math.max(dx, dy)));
      updateItem(d.id, { w: s, h: s });
    }
  };

  const onItemPointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* egal */
    }
    dragRef.current = null;
  };

  // ---------- Werkzeuge ----------
  const startSignature = (dataUrl: string) => {
    const img = new Image();
    img.onload = () =>
      setPending({ kind: "image", dataUrl, aspect: img.naturalWidth / Math.max(1, img.naturalHeight), label: "die Unterschrift" });
    img.src = dataUrl;
  };

  const onSignatureClick = () => {
    if (mySignature) startSignature(mySignature);
    else setDrawOpen(true);
  };

  // ---------- Speichern ----------
  const handleSave = async () => {
    if (!bytes) return;
    if (items.length === 0) {
      toast.error("Bitte zuerst eine Unterschrift oder einen Text ins Dokument setzen.");
      return;
    }
    const emptyText = items.find((i) => i.kind === "text" && !i.text.trim());
    if (emptyText) {
      setSelectedId(emptyText.id);
      toast.error("Ein Textfeld ist noch leer — bitte ausfüllen oder entfernen.");
      return;
    }
    const placeItem = items.find((i) => i.kind === "text" && /^[^,]+, \d{2}\.\d{2}\.\d{4}$/.test(i.text));
    if (placeItem && placeItem.kind === "text") writePlace(placeItem.text.split(",")[0].trim());

    setSaving(true);
    try {
      const lib = await loadPdfLib();
      const out = await stampPdf(lib, bytes.slice(), items);
      const blob = new Blob([out], { type: "application/pdf" });
      const name = signedFileName(fileName);
      await onSave({ blob, fileName: name, items });
      setDone({ blob, fileName: name, url: URL.createObjectURL(blob) });
      setSelectedId(null);
    } catch (e: any) {
      console.error(e);
      toast.error("Speichern fehlgeschlagen: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const close = () => onOpenChange(false);

  const handleOpenChange = (next: boolean) => {
    if (!next && !done && items.length > 0 && !saving) {
      if (!window.confirm("Das Dokument ist noch nicht gespeichert. Trotzdem schließen?")) return;
    }
    if (!next && saving) return;
    onOpenChange(next);
  };

  // ---------- Darstellung ----------
  const toolbar = (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="flex items-center">
        <Button size="sm" onClick={onSignatureClick} className="rounded-r-none gap-1.5" disabled={!pageSizes.length}>
          <PenLine className="h-4 w-4" />
          Unterschrift
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="rounded-l-none border-l border-primary-foreground/20 px-2" disabled={!pageSizes.length}>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {mySignature && (
              <DropdownMenuItem onClick={() => startSignature(mySignature)}>
                <img src={mySignature} alt="" className="h-6 max-w-[120px] object-contain mr-2 bg-white rounded" />
                Hinterlegte Unterschrift
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => setDrawOpen(true)}>
              <PenLine className="h-4 w-4 mr-2" />
              {mySignature ? "Neu zeichnen" : "Unterschrift zeichnen"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Button
        size="sm" variant="outline" className="gap-1.5" disabled={!pageSizes.length}
        onClick={() => setPending({ kind: "text", text: `${readPlace()}, ${today()}`, label: "Ort und Datum" })}
      >
        <MapPin className="h-4 w-4" />
        <span className="hidden sm:inline">Ort, Datum</span>
      </Button>
      <Button
        size="sm" variant="outline" className="gap-1.5" disabled={!pageSizes.length}
        onClick={() => setPending({ kind: "text", text: today(), label: "das Datum" })}
      >
        <Calendar className="h-4 w-4" />
        <span className="hidden sm:inline">Datum</span>
      </Button>
      <Button
        size="sm" variant="outline" className="gap-1.5" disabled={!pageSizes.length}
        onClick={() => setPending({ kind: "text", text: "", label: "den Text" })}
      >
        <Type className="h-4 w-4" />
        <span className="hidden sm:inline">Text</span>
      </Button>
      <Button
        size="sm" variant="outline" className="gap-1.5" disabled={!pageSizes.length}
        onClick={() => setPending({ kind: "check", label: "den Haken" })}
      >
        <Check className="h-4 w-4" />
        <span className="hidden sm:inline">Haken</span>
      </Button>
      <div className="flex items-center gap-0.5 ml-1">
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} title="Verkleinern">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground w-10 text-center">{Math.round(zoom * 100)}%</span>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} title="Vergrößern">
          <ZoomIn className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="max-w-none w-screen h-[100dvh] sm:w-[96vw] sm:h-[96vh] sm:max-w-6xl p-0 gap-0 flex flex-col overflow-hidden"
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Kopfzeile */}
          <div className="border-b px-3 sm:px-4 py-2.5 pr-12 space-y-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <PenLine className="h-4 w-4 text-primary shrink-0" />
              <DialogTitle className="text-sm font-semibold truncate">{fileName}</DialogTitle>
              <DialogDescription className="sr-only">Dokument unterschreiben</DialogDescription>
            </div>
            {!done && toolbar}
          </div>

          {/* Hinweis- und Bearbeitungsleiste — immer gleich hoch, damit das
              Dokument beim Antippen der Werkzeuge nicht verrutscht. */}
          {!done && (
            <div
              className={`flex flex-wrap items-center gap-2 border-b px-4 py-1.5 min-h-[46px] text-sm shrink-0 ${
                pending ? "bg-primary/10 border-primary/20" : "bg-muted/60"
              }`}
            >
              {pending ? (
                <>
                  <span className="font-medium text-primary">Tippe auf die Stelle im Dokument, wo {pending.label} hin soll.</span>
                  <Button size="sm" variant="ghost" className="ml-auto h-8" onClick={() => setPending(null)}>
                    Abbrechen
                  </Button>
                </>
              ) : selected ? (
                <>
                  {selected.kind === "text" ? (
                    <>
                      <span className="text-muted-foreground">Text:</span>
                      <Input
                        ref={textInputRef}
                        value={selected.text}
                        onChange={(e) => setText(selected.id, e.target.value)}
                        placeholder="Text eingeben …"
                        className="h-8 w-48 sm:w-72"
                      />
                      <div className="flex items-center gap-0.5">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setFontSize(selected.id, selected.fontSize - 1)} title="Kleiner">
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="text-xs w-10 text-center">{Math.round(selected.fontSize)} pt</span>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setFontSize(selected.id, selected.fontSize + 1)} title="Größer">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      Verschieben: mit dem Finger ziehen · Größe: am runden Punkt unten rechts ziehen
                    </span>
                  )}
                  <Button size="sm" variant="ghost" className="ml-auto h-8 text-destructive gap-1.5" onClick={() => removeItem(selected.id)}>
                    <Trash2 className="h-4 w-4" /> Entfernen
                  </Button>
                </>
              ) : (
                <span className="text-muted-foreground">
                  {items.length === 0
                    ? "Oben auswählen, was eingesetzt werden soll — dann auf die Stelle im Dokument tippen."
                    : "Ein eingesetztes Element antippen, um es zu verschieben, zu ändern oder zu entfernen."}
                </span>
              )}
            </div>
          )}

          {/* Inhalt */}
          {done ? (
            <div className="flex-1 overflow-auto flex flex-col items-center justify-center gap-4 p-6 text-center">
              <CheckCircle2 className="h-14 w-14 text-green-600" />
              <div className="space-y-1">
                <p className="text-lg font-semibold">Unterschrieben und gespeichert</p>
                <p className="text-sm text-muted-foreground">
                  {savedHint || "Die unterschriebene Fassung liegt jetzt neben dem Original."}
                </p>
                <p className="text-xs text-muted-foreground">Datei: {done.fileName}</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {renderDone?.({ blob: done.blob, fileName: done.fileName, close })}
                <Button variant="outline" asChild>
                  <a href={done.url} download={done.fileName}>
                    <Download className="h-4 w-4 mr-1.5" /> Herunterladen
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <a href={done.url} target="_blank" rel="noopener noreferrer">Ansehen</a>
                </Button>
                <Button variant="ghost" onClick={close}>Schließen</Button>
              </div>
            </div>
          ) : (
            <div ref={setScrollEl} className="flex-1 overflow-auto bg-muted/40" onClick={() => !pending && setSelectedId(null)}>
              {loadError ? (
                <div className="flex flex-col items-center justify-center gap-3 py-20 text-center px-6">
                  <AlertCircle className="h-10 w-10 text-destructive" />
                  <p className="text-sm font-medium">Das Dokument kann nicht unterschrieben werden</p>
                  <p className="text-xs text-muted-foreground max-w-sm">{loadError}</p>
                </div>
              ) : !blobUrl ? (
                <div className="flex items-center justify-center py-24 gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" /> Dokument wird geladen …
                </div>
              ) : (
                <Suspense fallback={<div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
                  <PdfDocument
                    file={blobUrl}
                    onLoadSuccess={onDocLoad}
                    onLoadError={(e: Error) => setLoadError(e?.message || "PDF konnte nicht gelesen werden")}
                    loading={<div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
                    className="flex flex-col items-center gap-4 py-4 px-3"
                  >
                    {pageSizes.map((size, idx) => (
                      <div key={idx} className="flex flex-col items-center gap-1">
                        <div className="relative" style={{ width: size.w * scale, height: size.h * scale }}>
                        <LazyPage width={size.w * scale} height={size.h * scale} rootEl={scrollRef.current}>
                          <PdfPage
                            pageNumber={idx + 1}
                            width={size.w * scale}
                            renderTextLayer={false}
                            renderAnnotationLayer={false}
                            loading={<div style={{ width: size.w * scale, height: size.h * scale }} className="bg-white" />}
                          />
                        </LazyPage>
                        {/* Ebene für Unterschrift & Co. */}
                        <div
                          data-sign-page={idx}
                          className={`absolute inset-0 ${pending ? "cursor-crosshair" : ""}`}
                          onClick={(e) => {
                            // „click“ statt „pointerdown“: beim Wischen/Scrollen auf dem Tablet
                            // wird so nicht versehentlich etwas gesetzt.
                            if (!pending) return;
                            e.stopPropagation();
                            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            placeAt(idx, (e.clientX - r.left) / scale, (e.clientY - r.top) / scale);
                          }}
                        >
                          {pending && <div className="absolute inset-0 ring-2 ring-primary/40 ring-inset pointer-events-none" />}
                          {items.filter((it) => it.page === idx).map((it) => (
                            <PlacedItem
                              key={it.id}
                              item={it}
                              scale={scale}
                              selected={it.id === selectedId}
                              onPointerDown={onItemPointerDown}
                              onPointerMove={onItemPointerMove}
                              onPointerUp={onItemPointerUp}
                              onRemove={() => removeItem(it.id)}
                            />
                          ))}
                        </div>
                        </div>
                        <span className="text-[11px] text-muted-foreground">Seite {idx + 1} von {pageSizes.length}</span>
                      </div>
                    ))}
                  </PdfDocument>
                </Suspense>
              )}
            </div>
          )}

          {/* Fußzeile */}
          {!done && (
            <div className="border-t px-3 sm:px-4 py-2.5 flex items-center gap-2 shrink-0 bg-background">
              <span className="text-xs text-muted-foreground hidden sm:inline">
                Das Original bleibt unverändert — es wird eine neue Datei „…_unterschrieben.pdf“ angelegt.
              </span>
              <div className="ml-auto flex gap-2">
                <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
                  Abbrechen
                </Button>
                <Button onClick={handleSave} disabled={saving || !bytes || items.length === 0} className="gap-1.5">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Unterschreiben &amp; speichern
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <SignatureDrawDialog open={drawOpen} onOpenChange={setDrawOpen} onDone={(sig) => startSignature(sig.dataUrl)} />
    </>
  );
}

/** Ein gesetztes Element (Unterschrift, Text, Haken) auf der Seite. */
function PlacedItem({
  item, scale, selected, onPointerDown, onPointerMove, onPointerUp, onRemove,
}: {
  item: SignItem;
  scale: number;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent, item: SignItem, mode: "move" | "resize") => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={`absolute select-none touch-none ${selected ? "outline outline-2 outline-primary outline-offset-2 rounded-sm" : "hover:outline hover:outline-1 hover:outline-primary/50"}`}
      style={{ left: item.x * scale, top: item.y * scale, width: item.w * scale, height: item.h * scale, cursor: "move" }}
      onPointerDown={(e) => onPointerDown(e, item, "move")}
      onClick={(e) => e.stopPropagation()}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {item.kind === "image" && (
        <img src={item.dataUrl} alt="Unterschrift" draggable={false} className="w-full h-full pointer-events-none" />
      )}
      {item.kind === "text" && (
        <div
          className="whitespace-pre pointer-events-none"
          style={{
            fontSize: item.fontSize * scale,
            lineHeight: TEXT_LINE_HEIGHT,
            fontFamily: FONT_FAMILY,
            color: "#0a0a1f",
          }}
        >
          {item.text || <span className="text-muted-foreground italic">Text …</span>}
        </div>
      )}
      {item.kind === "check" && (
        <svg viewBox="0 0 100 100" className="w-full h-full pointer-events-none">
          <polyline
            points="12,50 40,82 90,15"
            fill="none"
            stroke="#0a0a1f"
            strokeWidth={12}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {selected && (
        <>
          <button
            type="button"
            className="absolute -top-3 -right-3 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            title="Entfernen"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <div
            className="absolute -bottom-3 -right-3 h-6 w-6 rounded-full bg-primary border-2 border-white shadow touch-none"
            style={{ cursor: "nwse-resize" }}
            onPointerDown={(e) => onPointerDown(e, item, "resize")}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            title="Größe ändern"
          />
        </>
      )}
    </div>
  );
}

/** Rendert eine Seite erst, wenn sie in die Nähe des sichtbaren Bereichs kommt. */
function LazyPage({ width, height, rootEl, children }: { width: number; height: number; rootEl: HTMLElement | null; children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((en) => en.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { root: rootEl, rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootEl, visible]);
  return (
    <div ref={ref} className="bg-white shadow-md" style={{ width, height, overflow: "hidden" }}>
      {visible ? children : null}
    </div>
  );
}
