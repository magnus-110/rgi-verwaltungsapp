// Verwaltervertrag direkt aus der Vertragsansicht unterschreiben.
//
// Der Vertrag verweist über `dms_file_id` auf das PDF im DMS des Objekts.
// Die unterschriebene Fassung landet im selben Ordner; auf Wunsch wird sie
// danach als Vertragsdokument hinterlegt.

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Link2, Loader2, Mail, PenLine } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SignPdfDialog } from "@/components/documents/SignPdfDialog";
import { saveSignedBuildingFile, type BuildingFileLike } from "@/lib/documentSigning";
import { getFileBucket } from "@/components/buildings/documents/types";
import { useComposeEmail } from "@/contexts/ComposeEmailContext";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface Props {
  contractId: string;
  dmsFileId: string;
}

export function ContractSignButton({ contractId, dmsFileId }: Props) {
  const qc = useQueryClient();
  const { openCompose } = useComposeEmail();
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<(BuildingFileLike & { mime_type?: string | null }) | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [signedFileId, setSignedFileId] = useState<string | null>(null);
  const [linked, setLinked] = useState(false);

  const openDoc = async (mode: "sign" | "view") => {
    setLoading(true);
    try {
      const { data, error } = await db.from("building_files").select("*").eq("id", dmsFileId).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Das hinterlegte Dokument wurde nicht gefunden.");
      const bucket = getFileBucket(data.source, data.storage_bucket);
      const { data: signed, error: urlErr } = await supabase.storage.from(bucket).createSignedUrl(data.file_path, 600);
      if (urlErr) throw urlErr;
      if (mode === "view") {
        window.open(signed.signedUrl, "_blank", "noopener,noreferrer");
        return;
      }
      const isPdf = (data.mime_type || "").includes("pdf") || /\.pdf$/i.test(data.display_name || data.file_path);
      if (!isPdf) throw new Error("Nur PDF-Dokumente können unterschrieben werden.");
      setFile(data);
      setSignedFileId(null);
      setLinked(false);
      setUrl(signed.signedUrl);
    } catch (e: any) {
      toast.error(e?.message || "Dokument konnte nicht geöffnet werden");
    } finally {
      setLoading(false);
    }
  };

  const linkSignedToContract = async () => {
    if (!signedFileId) return;
    const { error } = await db.from("management_contracts").update({ dms_file_id: signedFileId }).eq("id", contractId);
    if (error) {
      toast.error("Konnte nicht hinterlegt werden: " + error.message);
      return;
    }
    setLinked(true);
    qc.invalidateQueries({ queryKey: ["rgi", "contracts"] });
    toast.success("Unterschriebene Fassung ist jetzt das Vertragsdokument");
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openDoc("view")} disabled={loading}>
          Dokument öffnen
        </Button>
        <Button size="sm" className="gap-1.5" onClick={() => openDoc("sign")} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PenLine className="h-3.5 w-3.5" />}
          Vertrag unterschreiben
        </Button>
      </div>

      <SignPdfDialog
        open={!!url}
        onOpenChange={(o) => {
          if (!o) {
            setUrl(null);
            setFile(null);
          }
        }}
        sourceUrl={url}
        fileName={file?.display_name ?? "Vertrag.pdf"}
        savedHint="Die unterschriebene Fassung liegt jetzt im DMS des Objekts neben dem Original."
        onSave={async ({ blob, fileName, items }) => {
          if (!file) return;
          const res = await saveSignedBuildingFile({
            file,
            sourceBucket: getFileBucket(file.source, file.storage_bucket),
            fileName,
            blob,
            items,
            context: "contract",
            contractId,
          });
          setSignedFileId(res.fileId);
        }}
        renderDone={({ blob, fileName, close }) => (
          <>
            <Button onClick={linkSignedToContract} disabled={!signedFileId || linked}>
              <Link2 className="h-4 w-4 mr-1.5" />
              {linked ? "Als Vertragsdokument hinterlegt" : "Als Vertragsdokument hinterlegen"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                close();
                openCompose({ attachments: [new File([blob], fileName, { type: "application/pdf" })] });
              }}
            >
              <Mail className="h-4 w-4 mr-1.5" /> Per E-Mail senden
            </Button>
          </>
        )}
      />
    </>
  );
}
