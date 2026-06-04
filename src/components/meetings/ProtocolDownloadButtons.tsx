import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FileDown, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function ProtocolDownloadButtons({ meetingId }: { meetingId: string }) {
  const [pendingFormat, setPendingFormat] = useState<"pdf" | "docx" | null>(null);

  async function download(output_format: "pdf" | "docx") {
    setPendingFormat(output_format);
    try {
      const { data, error } = await supabase.functions.invoke("etv-render-protocol", {
        body: { meeting_id: meetingId, output_format },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const url: string | undefined = data?.signed_url;
      const path: string | undefined = data?.storage_path;
      if (!url) throw new Error("Keine Download-URL erhalten");

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Download fehlgeschlagen (${res.status})`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = path?.split("/").pop() || `Protokoll.${output_format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      toast.success(`${output_format.toUpperCase()} heruntergeladen`);
    } catch (e: any) {
      toast.error(e?.message || "Fehler beim Generieren");
    } finally {
      setPendingFormat(null);
    }
  }

  return (
    <>
      <Button onClick={() => download("pdf")} disabled={!!pendingFormat} variant="outline" className="gap-2">
        {pendingFormat === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
        Als PDF
      </Button>
      <Button onClick={() => download("docx")} disabled={!!pendingFormat} variant="outline" className="gap-2">
        {pendingFormat === "docx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
        Als DOCX
      </Button>
    </>
  );
}
