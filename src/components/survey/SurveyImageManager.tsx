import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Trash2, Loader2, ImageIcon } from "lucide-react";

/**
 * Bilder je Umfrage-Punkt hochladen/entfernen (nur Verwaltung).
 * Speicher: Bucket 'survey-images', privat → Anzeige über signierte URLs.
 * Bilder werden vor dem Upload auf ~1200 px / JPEG verkleinert.
 */

interface ItemRow {
  id: string;
  title: string;
  position: number;
  images: { id: string; path: string; url: string | null }[];
}

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
        .select("id, title, position, survey_item_images(id, storage_path)")
        .eq("survey_id", surveyId)
        .order("position", { ascending: true });

      const rows = (data || []) as any[];
      const paths = rows.flatMap((r) => (r.survey_item_images || []).map((im: any) => im.storage_path));
      let signed: Record<string, string> = {};
      if (paths.length) {
        const { data: urls } = await supabase.storage.from("survey-images").createSignedUrls(paths, 3600);
        (urls || []).forEach((u) => { if (u.path && u.signedUrl) signed[u.path] = u.signedUrl; });
      }
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        position: r.position,
        images: (r.survey_item_images || []).map((im: any) => ({ id: im.id, path: im.storage_path, url: signed[im.storage_path] ?? null })),
      })) as ItemRow[];
    },
  });

  const refetch = () => qc.invalidateQueries({ queryKey: ["survey-images-manager", surveyId] });

  const handleUpload = async (itemId: string, file: File) => {
    setBusy(itemId);
    try {
      const blob = await resizeToJpeg(file);
      const path = `${surveyId}/${itemId}/${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage.from("survey-images").upload(path, blob, {
        contentType: "image/jpeg", upsert: true,
      });
      if (upErr) throw upErr;
      const { error: dbErr } = await (supabase as any).from("survey_item_images").insert({
        item_id: itemId, storage_path: path, position: 0,
      });
      if (dbErr) throw dbErr;
      refetch();
    } catch (e: any) {
      alert("Upload fehlgeschlagen: " + (e?.message ?? e));
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (imageId: string, path: string, itemId: string) => {
    if (!confirm("Bild wirklich entfernen?")) return;
    setBusy(itemId);
    try {
      await supabase.storage.from("survey-images").remove([path]);
      await (supabase as any).from("survey_item_images").delete().eq("id", imageId);
      refetch();
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) return <div className="p-4 text-muted-foreground">Lädt …</div>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Pro Punkt ein Foto hochladen (wird automatisch verkleinert). Ohne Foto zeigt die Umfrage einen Platzhalter.
      </p>
      {items.map((it) => (
        <Card key={it.id}><CardContent className="p-4 flex items-center gap-4">
          <div className="h-20 w-28 shrink-0 rounded-md border bg-muted flex items-center justify-center overflow-hidden">
            {it.images[0]?.url
              ? <img src={it.images[0].url} alt={it.title} className="h-full w-full object-cover" />
              : <ImageIcon className="h-6 w-6 text-muted-foreground" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{it.position}. {it.title}</div>
            <div className="text-xs text-muted-foreground">{it.images.length ? "Foto vorhanden" : "Kein Foto"}</div>
          </div>
          <input
            ref={(el) => (inputs.current[it.id] = el)}
            type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(it.id, f); e.target.value = ""; }}
          />
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={busy === it.id}
              onClick={() => inputs.current[it.id]?.click()}>
              {busy === it.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              <span className="ml-1">{it.images.length ? "Ersetzen" : "Hochladen"}</span>
            </Button>
            {it.images[0] && (
              <Button variant="ghost" size="sm" disabled={busy === it.id}
                onClick={() => handleDelete(it.images[0].id, it.images[0].path, it.id)}>
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            )}
          </div>
        </CardContent></Card>
      ))}
    </div>
  );
}
