import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FileDown, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function ProtocolDownloadButtons({ meetingId }: { meetingId: string }) {
  const render = useMutation({
    mutationFn: async (output_format: "docx" | "pdf") => {
      const { data, error } = await supabase.functions.invoke("etv-render-protocol", {
        body: { meeting_id: meetingId, output_format },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { signed_url: string };
    },
    onSuccess: (d) => {
      if (d.signed_url) window.open(d.signed_url, "_blank");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const pending = render.isPending;

  return (
    <>
      <Button onClick={() => render.mutate("pdf")} disabled={pending} variant="outline" className="gap-2">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
        Als PDF
      </Button>
      <Button onClick={() => render.mutate("docx")} disabled={pending} variant="outline" className="gap-2">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
        Als DOCX
      </Button>
    </>
  );
}
