import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Trash2, Loader2, ImageIcon } from "lucide-react";

/**
 * Bilder je Umfrage-Punkt verwalten (nur Verwaltung) – MEHRERE Bilder pro Punkt.
 * Speicher: Bucket 'survey-images', privat → Anzeige über signierte URLs.
 * Bilder werden vor dem Upload auf ~1200 px / JPEG verkleinert.
 */

interface Img { id: string; path: string; url: string | null; position: number }
interface ItemRow { id: string; title: string; position: number; images: Img[] }

async function resizeToJpeg(file: File, maxW = 1200, quality = 0.8): Promise<Blob> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, maxW / img.width);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/jpeg", quality));
}

export default function SurveyImageManager({ surveyId }: { surveyId: string }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["survey-images-manager", surveyId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("survey_items")
        .select("id, title, position, survey_item_images(id, storage_path, position)")
        .eq("survey_id", surveyId)
        .order("position", { ascending: true });

      const rows = (data || []) as any[];
      const paths = rows.flatMap((r) => (r.survey_item_images || []).map((im: any) => im.storage_path));
      const signed: Record<string, string> = {};
      if (paths.length) {
        const { data: urls } = await supabase.storage.from("survey-images").createSignedUrls(paths, 3600);
        (urls || []).forEach((u) => { if (u.path && u.signedUrl) signed[u.path] = u.signedUrl; });
      }
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        position: r.position,
        images: ((r.survey_item_images || []) as any[])
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
          .map((im) => ({ id: im.id, path: im.storage_path, url: signed[im.storage_path] ?? null, position: im.position ?? 0 })),
      })) as ItemRow[];
    },
  });

  const refetch = () => qc.invalidateQueries({ queryKey: ["survey-images-manager", surveyId] });

  // mehrere Dateien auf einmal hochladen
  const handleUpload = async (item: ItemRow, files: FileList) => {
    setBusy(item.id);
    try {
      let pos = item.images.length;
      for (const file of Array.from(files)) {
        const blob = await resizeToJpeg(file);
        const path = `${surveyId}/${item.id}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage.from("survey-images").upload(path, blob, {
          contentType: "image/jpeg", upsert: true,
        });
        if (upErr) throw upErr;
        const { error: dbErr } = await (supabase as any).from("survey_item_images").insert({
          item_id: item.id, storage_path: path, position: pos++,
        });
        if (dbErr) throw dbErr;
      }
      refetch();
    } catch (e: any) {
      alert("Upload fehlgeschlagen: " + (e?.message ?? e));
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (img: Img, itemId: string) => {
    if (!confirm("Bild wirklich entfernen?")) return;
    setBusy(itemId);
    try {
      await supabase.storage.from("survey-images").remove([img.path]);
      await (supabase as any).from("survey_item_images").delete().eq("id", img.id);
      refetch();
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) return <div className="p-4 text-muted-foreground">Lädt …</div>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Pro Punkt können <b>mehrere Fotos</b> hochgeladen werden (werden automatisch verkleinert). Ohne Foto zeigt die Umfrage einen Platzhalter.
      </p>
      {items.map((it) => (
        <Card key={it.id}><CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium min-w-0 truncate">{it.position}. {it.title}</div>
            <div className="text-xs text-muted-foreground shrink-0">{it.images.length} Foto(s)</div>
          </div>

          <div className="flex flex-wrap gap-3">
            {it.images.map((im) => (
              <div key={im.id} className="relative h-24 w-32 rounded-md border bg-muted overflow-hidden group">
                {im.url
                  ? <img src={im.url} alt={it.title} className="h-full w-full object-cover" />
                  : <div className="flex h-full w-full items-center justify-center"><ImageIcon className="h-5 w-5 text-muted-foreground" /></div>}
                <button
                  onClick={() => handleDelete(im, it.id)} disabled={busy === it.id}
                  className="absolute top-1 right-1 rounded-full bg-white/90 p-1 shadow hover:bg-white"
                  title="Bild entfernen">
                  <Trash2 className="h-3.5 w-3.5 text-red-600" />
                </button>
              </div>
            ))}

            <input
              ref={(el) => (inputs.current[it.id] = el)}
              type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { const fs = e.target.files; if (fs && fs.length) handleUpload(it, fs); e.target.value = ""; }}
            />
            <button
              onClick={() => inputs.current[it.id]?.click()} disabled={busy === it.id}
              className="flex h-24 w-32 flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed text-muted-foreground hover:bg-muted/50 disabled:opacity-50">
              {busy === it.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
              <span className="text-xs">Bilder hinzufügen</span>
            </button>
          </div>
        </CardContent></Card>
      ))}
    </div>
  );
}
