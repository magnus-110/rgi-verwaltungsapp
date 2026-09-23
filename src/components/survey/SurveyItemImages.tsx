import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Plus, X } from "lucide-react";

/**
 * Die Fotos einer einzelnen Frage — direkt in der Zeile der Frage.
 *
 * Vorher lagen die Bilder in einem eigenen Reiter, der dieselbe Liste noch
 * einmal zeigte. Jetzt hängen sie dort, wo die Frage steht.
 *
 * Die Bilder aller Fragen einer Umfrage werden in einer Abfrage geladen und
 * signiert (der Bucket ist privat); React Query fasst die Aufrufe der
 * einzelnen Zeilen zu einer Abfrage zusammen.
 */

export interface ItemBild {
  id: string;
  item_id: string;
  path: string;
  url: string | null;
  position: number;
}

export function useSurveyItemImages(surveyId: string) {
  return useQuery({
    queryKey: ["survey-item-images", surveyId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("survey_items")
        .select("id, survey_item_images(id, storage_path, position)")
        .eq("survey_id", surveyId);

      const rows = (data || []) as any[];
      const paths = rows.flatMap((r) => (r.survey_item_images || []).map((im: any) => im.storage_path));
      const signed: Record<string, string> = {};
      if (paths.length) {
        const { data: urls } = await supabase.storage.from("survey-images").createSignedUrls(paths, 3600);
        (urls || []).forEach((u) => { if (u.path && u.signedUrl) signed[u.path] = u.signedUrl; });
      }

      const proItem: Record<string, ItemBild[]> = {};
      rows.forEach((r) => {
        proItem[r.id] = ((r.survey_item_images || []) as any[])
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
          .map((im) => ({
            id: im.id,
            item_id: r.id,
            path: im.storage_path,
            url: signed[im.storage_path] ?? null,
            position: im.position ?? 0,
          }));
      });
      return proItem;
    },
  });
}

/** Vor dem Hochladen auf ~1200 px verkleinern und als JPEG speichern. */
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

export default function SurveyItemImages({ surveyId, itemId }: { surveyId: string; itemId: string }) {
  const qc = useQueryClient();
  const { data: proItem = {} } = useSurveyItemImages(surveyId);
  const bilder = proItem[itemId] ?? [];
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["survey-item-images", surveyId] });
    qc.invalidateQueries({ queryKey: ["owner-survey"] });
  };

  const hochladen = async (files: FileList) => {
    setBusy(true);
    try {
      let pos = bilder.length;
      for (const file of Array.from(files)) {
        const blob = await resizeToJpeg(file);
        const path = `${surveyId}/${itemId}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage.from("survey-images").upload(path, blob, {
          contentType: "image/jpeg", upsert: true,
        });
        if (upErr) throw upErr;
        const { error: dbErr } = await (supabase as any).from("survey_item_images").insert({
          item_id: itemId, storage_path: path, position: pos++,
        });
        if (dbErr) throw dbErr;
      }
      refresh();
    } catch (e: any) {
      alert("Upload fehlgeschlagen: " + (e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const entfernen = async (bild: ItemBild) => {
    if (!confirm("Foto wirklich entfernen?")) return;
    setBusy(true);
    try {
      await supabase.storage.from("survey-images").remove([bild.path]);
      await (supabase as any).from("survey_item_images").delete().eq("id", bild.id);
      refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      {bilder.map((b) => (
        <div key={b.id} className="group relative h-12 w-16 shrink-0 overflow-hidden rounded-md border bg-muted">
          {b.url
            ? <img src={b.url} alt="" className="h-full w-full object-cover" />
            : <div className="h-full w-full animate-pulse bg-muted" />}
          <button
            type="button" onClick={() => entfernen(b)} disabled={busy}
            title="Foto entfernen"
            className="absolute right-0.5 top-0.5 hidden rounded-full bg-background/90 p-0.5 shadow group-hover:block">
            <X className="h-3 w-3 text-red-600" />
          </button>
        </div>
      ))}

      <input
        ref={input} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { const fs = e.target.files; if (fs && fs.length) hochladen(fs); e.target.value = ""; }}
      />
      <button
        type="button" onClick={() => input.current?.click()} disabled={busy}
        title="Foto hinzufügen"
        className="flex h-12 w-16 shrink-0 items-center justify-center rounded-md border border-dashed text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      </button>
    </div>
  );
}
