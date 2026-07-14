import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Loader2, Printer, Download } from "lucide-react";
import { format as formatDate } from "date-fns";
import { de } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import DOMPurify from "dompurify";

interface EmailLite {
  id: string;
  subject: string | null;
  from_address: string | null;
  from_name: string | null;
  to_addresses: any;
  cc_addresses: any;
  date: string | null;
  body_html: string | null;
  body_text: string | null;
  ai_summary?: string | null;
  thread_id?: string | null;
  account_id?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: EmailLite | null;
}

const formatAddrList = (val: any): string => {
  if (!val) return "";
  if (Array.isArray(val)) {
    return val
      .map((v) => (typeof v === "string" ? v : v?.address || v?.email || ""))
      .filter(Boolean)
      .join(", ");
  }
  if (typeof val === "string") return val;
  return "";
};

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );

async function resolveInlineImages(html: string, emailId: string): Promise<string> {
  const { data: atts } = await supabase
    .from("email_attachments")
    .select("content_id, file_path")
    .eq("email_id", emailId)
    .eq("is_inline", true);
  if (!atts?.length) return html;
  let processed = html;
  for (const att of atts) {
    if (!att.content_id || !att.file_path) continue;
    const { data } = await supabase.storage
      .from("email-attachments")
      .createSignedUrl(att.file_path, 3600);
    if (!data?.signedUrl) continue;
    const cid = att.content_id.replace(/^<|>$/g, "");
    processed = processed.replace(
      new RegExp(`cid:${cid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gi"),
      data.signedUrl
    );
  }
  return processed;
}

async function renderEmailHtml(email: EmailLite): Promise<string> {
  const dt = email.date
    ? formatDate(new Date(email.date), "dd.MM.yyyy HH:mm", { locale: de })
    : "";
  const to = formatAddrList(email.to_addresses);
  const cc = formatAddrList(email.cc_addresses);
  const fromLabel = email.from_name
    ? `${escapeHtml(email.from_name)} &lt;${escapeHtml(email.from_address || "")}&gt;`
    : escapeHtml(email.from_address || "");

  let bodyHtml = "";
  if (email.body_html) {
    const resolved = await resolveInlineImages(email.body_html, email.id);
    // SECURITY: sanitize untrusted (received) email HTML to strip <script>,
    // inline event handlers (onerror/onload) etc. before it is inserted via
    // innerHTML or written into the print window. Prevents stored/DOM XSS.
    bodyHtml = DOMPurify.sanitize(resolved, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ["style"],
      ADD_ATTR: ["target"],
    });
  } else {
    bodyHtml = `<pre style="white-space:pre-wrap;font-family:inherit;margin:0;">${escapeHtml(
      email.body_text || ""
    )}</pre>`;
  }

  const summary = email.ai_summary
    ? `<div style="background:#f5f5f4;border-left:3px solid #ea580c;padding:8px 12px;margin:8px 0 12px;font-size:11px;color:#44403c;">
         <div style="font-weight:600;margin-bottom:2px;">KI-Zusammenfassung</div>
         <div style="white-space:pre-wrap;">${escapeHtml(email.ai_summary)}</div>
       </div>`
    : "";

  return `
    <div style="margin-bottom:24px;page-break-inside:avoid;">
      <div style="border-bottom:2px solid #ea580c;padding-bottom:6px;margin-bottom:8px;">
        <h2 style="font-family:'Century Gothic','Work Sans',sans-serif;font-size:16px;margin:0 0 4px 0;color:#1c1917;">
          ${escapeHtml(email.subject || "(Kein Betreff)")}
        </h2>
        <table style="font-size:11px;color:#44403c;border-collapse:collapse;width:100%;">
          <tr><td style="padding:1px 8px 1px 0;color:#78716c;width:60px;">Von:</td><td>${fromLabel}</td></tr>
          ${to ? `<tr><td style="padding:1px 8px 1px 0;color:#78716c;">An:</td><td>${escapeHtml(to)}</td></tr>` : ""}
          ${cc ? `<tr><td style="padding:1px 8px 1px 0;color:#78716c;">CC:</td><td>${escapeHtml(cc)}</td></tr>` : ""}
          ${dt ? `<tr><td style="padding:1px 8px 1px 0;color:#78716c;">Datum:</td><td>${dt}</td></tr>` : ""}
        </table>
      </div>
      ${summary}
      <div style="font-size:12px;line-height:1.5;color:#1c1917;">${bodyHtml}</div>
    </div>
  `;
}

async function buildPrintHtml(emails: EmailLite[]): Promise<string> {
  const parts = await Promise.all(emails.map(renderEmailHtml));
  return `
    <div style="font-family:'Work Sans','Helvetica Neue',Arial,sans-serif;color:#1c1917;padding:8px;background:#fff;width:794px;box-sizing:border-box;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:16px;border-bottom:1px solid #e7e5e4;padding-bottom:8px;">
        <div style="font-family:'Century Gothic','Work Sans',sans-serif;font-weight:700;font-size:14px;color:#ea580c;letter-spacing:0.5px;">RGI Immobilien</div>
        <div style="font-size:10px;color:#78716c;">Gedruckt am ${formatDate(new Date(), "dd.MM.yyyy HH:mm", { locale: de })}</div>
      </div>
      ${parts.join('<div style="height:1px;background:#e7e5e4;margin:16px 0;"></div>')}
    </div>
  `;
}

export const PrintEmailDialog = ({ open, onOpenChange, email }: Props) => {
  const { toast } = useToast();
  const [mode, setMode] = useState<"single" | "thread">("single");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setMode("single");
  }, [open]);

  const { data: threadEmails = [] } = useQuery({
    queryKey: ["print-thread", email?.thread_id, email?.account_id],
    queryFn: async () => {
      if (!email?.thread_id || !email?.account_id) return [];
      const { data, error } = await supabase
        .from("emails")
        .select(
          "id, subject, from_address, from_name, to_addresses, cc_addresses, date, body_html, body_text, ai_summary, thread_id, account_id"
        )
        .eq("thread_id", email.thread_id)
        .eq("account_id", email.account_id)
        .order("date", { ascending: true });
      if (error) throw error;
      return (data || []) as EmailLite[];
    },
    enabled: open && !!email?.thread_id && !!email?.account_id,
  });

  const threadCount = threadEmails.length;
  const hasThread = threadCount > 1;

  const getEmails = async (): Promise<EmailLite[]> => {
    if (mode === "thread" && hasThread) return threadEmails;
    if (!email) return [];
    if (email.body_html || email.body_text) return [email];
    const { data } = await supabase
      .from("emails")
      .select(
        "id, subject, from_address, from_name, to_addresses, cc_addresses, date, body_html, body_text, ai_summary, thread_id, account_id"
      )
      .eq("id", email.id)
      .maybeSingle();
    return data ? [data as EmailLite] : [email];
  };

  const renderToContainer = async (): Promise<HTMLDivElement> => {
    const emails = await getEmails();
    const html = await buildPrintHtml(emails);
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "-10000px";
    container.style.top = "0";
    container.style.width = "794px";
    container.style.background = "#fff";
    container.innerHTML = html;
    document.body.appendChild(container);
    // Wait for images
    const imgs = Array.from(container.querySelectorAll("img"));
    await Promise.all(
      imgs.map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) return resolve();
            img.onload = () => resolve();
            img.onerror = () => resolve();
          })
      )
    );
    return container;
  };

  const handleDownload = async () => {
    if (!email) return;
    setBusy(true);
    let container: HTMLDivElement | null = null;
    try {
      container = await renderToContainer();
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const marginX = 18;
      const marginFirstTop = 20;
      const marginRest = 32; // gilt für: unten Seite 1 + oben & unten ab Seite 2
      const imgW = pageW - marginX * 2;
      const pxPerMm = canvas.width / imgW;

      // Hilfs-Canvas zum Schneiden der Seitenstücke
      const sliceCanvas = document.createElement("canvas");
      const sliceCtx = sliceCanvas.getContext("2d")!;
      sliceCanvas.width = canvas.width;

      const totalPx = canvas.height;
      let sourceY = 0;
      let isFirst = true;

      while (sourceY < totalPx) {
        const usableMm = isFirst
          ? pageH - marginFirstTop - marginRest
          : pageH - marginRest - marginRest;
        const topMm = isFirst ? marginFirstTop : marginRest;
        const wantedPx = Math.floor(usableMm * pxPerMm);
        const slicePx = Math.min(wantedPx, totalPx - sourceY);

        sliceCanvas.height = slicePx;
        sliceCtx.fillStyle = "#ffffff";
        sliceCtx.fillRect(0, 0, sliceCanvas.width, slicePx);
        sliceCtx.drawImage(
          canvas,
          0, sourceY, canvas.width, slicePx,
          0, 0, canvas.width, slicePx
        );
        const sliceData = sliceCanvas.toDataURL("image/jpeg", 0.92);
        const sliceMm = slicePx / pxPerMm;

        if (!isFirst) pdf.addPage();
        pdf.addImage(sliceData, "JPEG", marginX, topMm, imgW, sliceMm);

        sourceY += slicePx;
        isFirst = false;
      }
      const filename = `${(email.subject || "Email").replace(/[^a-z0-9-_ äöüÄÖÜß]/gi, "_").slice(0, 60)}.pdf`;
      pdf.save(filename);
      toast({ title: "PDF erstellt" });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Fehler beim Erstellen", description: e.message, variant: "destructive" });
    } finally {
      if (container) document.body.removeChild(container);
      setBusy(false);
    }
  };

  const handlePrint = async () => {
    if (!email) return;
    setBusy(true);
    try {
      const emails = await getEmails();
      const html = await buildPrintHtml(emails);
      const w = window.open("", "_blank", "width=900,height=1100");
      if (!w) {
        toast({ title: "Popup blockiert", description: "Bitte Popups erlauben.", variant: "destructive" });
        return;
      }
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(email.subject || "E-Mail")}</title>
        <style>@page{size:A4;margin:32mm 18mm;}@page :first{margin-top:20mm;}body{margin:0;}</style></head><body>${html}</body></html>`);
      w.document.close();
      // Wait for images
      const imgs = Array.from(w.document.images);
      await Promise.all(
        imgs.map(
          (img) =>
            new Promise<void>((resolve) => {
              if (img.complete) return resolve();
              img.onload = () => resolve();
              img.onerror = () => resolve();
            })
        )
      );
      w.focus();
      w.print();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-4 w-4" /> E-Mail drucken / als PDF
          </DialogTitle>
          <DialogDescription>Wählen Sie, was gedruckt werden soll.</DialogDescription>
        </DialogHeader>
        <RadioGroup value={mode} onValueChange={(v) => setMode(v as any)} className="space-y-2 py-2">
          <div className="flex items-start gap-3 rounded-md border p-3 hover:bg-muted/40">
            <RadioGroupItem value="single" id="print-single" className="mt-0.5" />
            <Label htmlFor="print-single" className="flex-1 cursor-pointer font-normal">
              <div className="font-medium text-sm">Nur diese E-Mail</div>
              <div className="text-xs text-muted-foreground">Nur die aktuell geöffnete Nachricht</div>
            </Label>
          </div>
          <div className={`flex items-start gap-3 rounded-md border p-3 ${hasThread ? "hover:bg-muted/40" : "opacity-60"}`}>
            <RadioGroupItem value="thread" id="print-thread" className="mt-0.5" disabled={!hasThread} />
            <Label htmlFor="print-thread" className={`flex-1 ${hasThread ? "cursor-pointer" : "cursor-not-allowed"} font-normal`}>
              <div className="font-medium text-sm">Gesamter Verlauf</div>
              <div className="text-xs text-muted-foreground">
                {hasThread ? `${threadCount} Nachrichten in diesem Thread` : "Keine weiteren Nachrichten im Thread"}
              </div>
            </Label>
          </div>
        </RadioGroup>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Abbrechen</Button>
          <Button variant="outline" onClick={handlePrint} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} Drucken
          </Button>
          <Button onClick={handleDownload} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
